#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate_contours.py
====================
Build an interpolated elevation surface (DEM) from the survey DXF and generate
clean, presentation-grade **1 m interval contours** from it.

Purpose: reference data for architectural competition / site analysis / physical
models -- NOT for precise grading or detailed design. The surface is lightly
smoothed and areas without elevation data (NoData / voids / sea) are masked so
that no unnatural contours are drawn there.

Outputs (into --outdir):
    contours_1m_global.dxf   3D contours, Z = elevation, original survey coords
    contours_1m_local.dxf    same, shifted near the origin (Rhino friendly)
    contours_1m_preview.png  styled preview image
    README.txt               short description
    contours_1m_package.zip  all of the above zipped

Run:
    python generate_contours.py --input "../input/04. Site boundary.dxf" --outdir output
"""

import argparse
import json
import os
import zipfile
from datetime import datetime, timezone

import numpy as np
import ezdxf
from ezdxf import path as ezpath
import shapely
from shapely.geometry import MultiPoint, Polygon
from scipy.interpolate import griddata
from scipy.ndimage import gaussian_filter, distance_transform_edt

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.path import Path as MplPath

# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #
CONTOUR_LAYERS = [("9-지형-등고선-1m", False), ("9-지형-등고선-5m", True)]
BOUNDARY_LAYER = "구역계"

CELL = 1.5           # DEM grid cell size (m)
SMOOTH_SIGMA = 1.2   # gaussian smoothing (grid cells) for presentation contours
CONCAVE_RATIO = 0.06  # shapely concave-hull tightness (smaller = tighter footprint)
CONTOUR_INTERVAL = 1.0
INDEX_INTERVAL = 5.0  # bold "index" contours in the preview
DXF_VERSION = "R2013"

LAYER_1M = "CONTOURS_1M"
LAYER_5M = "CONTOURS_5M_INDEX"
LAYER_BND = "SITE_BOUNDARY"


def log(m):
    print(m, flush=True)


# --------------------------------------------------------------------------- #
# 1. Collect elevation samples (the "DEM") from the drafted contours
# --------------------------------------------------------------------------- #
def collect_samples(msp):
    xs, ys, zs = [], [], []
    for layer, allow_zero in CONTOUR_LAYERS:
        for e in msp.query(f'*[layer=="{layer}"]'):
            t = e.dxftype()
            if t == "LWPOLYLINE":
                elev = float(e.dxf.elevation)
            elif t == "POLYLINE":
                elev = (float(e.vertices[0].dxf.location.z) if e.is_3d_polyline
                        else float(e.dxf.elevation.z)) if len(e.vertices) else 0.0
            else:
                # ARCs on the contour layers are small survey symbols (r 3-5 m),
                # not real contour lines -> excluded so they don't spike the DEM.
                continue
            # skip ambiguous elevation==0 on the 1 m layer (see prior analysis)
            if abs(elev) < 1e-9 and not allow_zero:
                continue
            try:
                pts = list(ezpath.make_path(e).flattening(0.5))
            except Exception:
                continue
            for v in pts:
                xs.append(v.x)
                ys.append(v.y)
                zs.append(elev)
    return np.array(xs), np.array(ys), np.array(zs)


def get_boundary(msp):
    best = None
    for e in msp.query(f'*[layer=="{BOUNDARY_LAYER}"]'):
        if e.dxftype() == "LWPOLYLINE" and e.closed:
            pts = [(p[0], p[1]) for p in e.get_points()]
            if len(pts) >= 3:
                poly = Polygon(pts)
                if not poly.is_valid:
                    poly = poly.buffer(0)
                if poly.geom_type == "Polygon" and (best is None or poly.area > best.area):
                    best = poly
    return best


# --------------------------------------------------------------------------- #
# 2. Build the DEM grid with NoData masking
# --------------------------------------------------------------------------- #
def build_dem(x, y, z, cell=CELL):
    minx, maxx = x.min(), x.max()
    miny, maxy = y.min(), y.max()
    gx = np.arange(minx, maxx + cell, cell)
    gy = np.arange(miny, maxy + cell, cell)
    GX, GY = np.meshgrid(gx, gy)
    pts = np.column_stack([x, y])

    # linear (TIN) interpolation -> NaN outside the convex hull
    Z = griddata(pts, z, (GX, GY), method="linear")

    # concave-hull (alpha shape) footprint -> mask voids / bays / exterior (sea/NoData)
    footprint = shapely.concave_hull(MultiPoint(list(map(tuple, pts))), ratio=CONCAVE_RATIO)
    if footprint.geom_type == "Polygon":
        rings = [footprint]
    else:  # MultiPolygon
        rings = list(footprint.geoms)
    inside = np.zeros(GX.size, dtype=bool)
    flat = np.column_stack([GX.ravel(), GY.ravel()])
    for poly in rings:
        mp = MplPath(np.asarray(poly.exterior.coords))
        inside |= mp.contains_points(flat)
        for hole in poly.interiors:
            hp = MplPath(np.asarray(hole.coords))
            inside &= ~hp.contains_points(flat)
    inside = inside.reshape(GX.shape)
    Z = np.where(inside, Z, np.nan)

    # light smoothing for presentation-grade curves (fill NaN by nearest first,
    # smooth, then re-apply the mask so edges are not dragged inward)
    mask = np.isnan(Z)
    if mask.any():
        idx = distance_transform_edt(mask, return_distances=False, return_indices=True)
        filled = Z[tuple(idx)]
    else:
        filled = Z
    sm = gaussian_filter(filled, SMOOTH_SIGMA)
    Z = np.where(mask, np.nan, sm)
    return gx, gy, GX, GY, Z, footprint


# --------------------------------------------------------------------------- #
# 3. Extract contour polylines at 1 m
# --------------------------------------------------------------------------- #
def extract_contours(GX, GY, Z, levels):
    fig = plt.figure()
    ax = fig.add_subplot(111)
    cs = ax.contour(GX, GY, Z, levels=levels)
    from shapely.geometry import LineString as _LS
    out = {}  # level -> list of Nx2 arrays
    for lvl, segs in zip(cs.levels, cs.allsegs):
        keep = []
        for s in segs:
            if len(s) < 2:
                continue
            length = float(np.hypot(*(np.diff(s, axis=0).T)).sum())
            if length < 2.0:  # drop speckle artifacts
                continue
            # light simplification (0.2 m) -> smaller, CAD/Illustrator-friendly
            # files; invisible at presentation scale for 1 m contours.
            simp = _LS(s).simplify(0.2, preserve_topology=False)
            keep.append(np.asarray(simp.coords))
        if keep:
            out[round(float(lvl), 3)] = keep
    plt.close(fig)
    return out


# --------------------------------------------------------------------------- #
# 4. Write DXF
# --------------------------------------------------------------------------- #
def write_dxf(fname, contours, boundary, ox, oy, local):
    doc = ezdxf.new(DXF_VERSION, setup=True)
    doc.header["$INSUNITS"] = 6  # meters
    for name, col in [(LAYER_1M, 3), (LAYER_5M, 4), (LAYER_BND, 6)]:
        if name not in doc.layers:
            doc.layers.add(name, color=col)
    msp = doc.modelspace()
    for lvl, segs in contours.items():
        layer = LAYER_5M if abs(lvl % INDEX_INTERVAL) < 1e-6 else LAYER_1M
        for s in segs:
            pts = [(px - ox if local else px, py - oy if local else py, lvl) for px, py in s]
            msp.add_polyline3d(pts, dxfattribs={"layer": layer})
    if boundary is not None:
        ring = [(px - ox if local else px, py - oy if local else py, 0.0)
                for px, py in boundary.exterior.coords]
        msp.add_polyline3d(ring, close=True, dxfattribs={"layer": LAYER_BND})
    doc.saveas(fname)


# --------------------------------------------------------------------------- #
# 5. Preview PNG
# --------------------------------------------------------------------------- #
def write_preview(fname, gx, gy, Z, contours, boundary, zmin, zmax):
    fig, ax = plt.subplots(figsize=(12, 10))
    levels_fill = np.arange(np.floor(zmin), np.ceil(zmax) + 1, 1.0)
    cf = ax.contourf(gx, gy, Z, levels=levels_fill, cmap="terrain", alpha=0.85)
    # 1 m thin lines
    ones = [l for l in contours if abs(l % INDEX_INTERVAL) >= 1e-6]
    fives = [l for l in contours if abs(l % INDEX_INTERVAL) < 1e-6]
    c1 = ax.contour(gx, gy, Z, levels=sorted(ones), colors="#5b4a3a", linewidths=0.35, alpha=0.7)
    c5 = ax.contour(gx, gy, Z, levels=sorted(fives), colors="#3a2a1a", linewidths=0.9)
    ax.clabel(c5, inline=True, fontsize=7, fmt="%.0f")
    if boundary is not None:
        bx, by = boundary.exterior.xy
        ax.plot(bx, by, color="crimson", lw=1.8, label="site boundary (guyeokgye)")
        ax.legend(loc="upper right", fontsize=9)
    cbar = fig.colorbar(cf, ax=ax, shrink=0.75, pad=0.02)
    cbar.set_label("elevation (m)")
    ax.set_aspect("equal")
    ax.set_title("1 m contours (generated from DEM)  —  presentation reference data")
    ax.set_xlabel("X (m, survey coords)")
    ax.set_ylabel("Y (m, survey coords)")
    ax.grid(True, ls=":", lw=0.3, alpha=0.4)
    fig.tight_layout()
    fig.savefig(fname, dpi=150)
    plt.close(fig)


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default="../input/04. Site boundary.dxf")
    ap.add_argument("--outdir", default="output")
    args = ap.parse_args()
    os.makedirs(args.outdir, exist_ok=True)

    def op(n):
        return os.path.join(args.outdir, n)

    log(f"[1/6] Reading {args.input} ...")
    doc = ezdxf.readfile(args.input)
    msp = doc.modelspace()

    log("[2/6] Collecting elevation samples (DEM) ...")
    x, y, z = collect_samples(msp)
    boundary = get_boundary(msp)
    zmin, zmax = float(z.min()), float(z.max())
    log(f"      samples={len(x)}  Z={zmin:.1f}..{zmax:.1f}  "
        f"extent={np.ptp(x):.0f}x{np.ptp(y):.0f} m")

    log("[3/6] Building interpolated DEM grid + NoData mask ...")
    gx, gy, GX, GY, Z, footprint = build_dem(x, y, z)

    log("[4/6] Extracting 1 m contours ...")
    levels = np.arange(np.ceil(zmin), np.floor(zmax) + CONTOUR_INTERVAL, CONTOUR_INTERVAL)
    contours = extract_contours(GX, GY, Z, levels)
    n_lines = sum(len(v) for v in contours.values())
    log(f"      levels={len(contours)}  polylines={n_lines}")

    # local origin: reuse site-boundary lower-left (consistent with prior work)
    if boundary is not None:
        ox, oy = boundary.bounds[0], boundary.bounds[1]
        origin_src = "site boundary (구역계) bbox lower-left"
    else:
        ox, oy = float(x.min()), float(y.min())
        origin_src = "DEM sample bbox lower-left"

    log("[5/6] Writing DXF + PNG ...")
    write_dxf(op("contours_1m_global.dxf"), contours, boundary, ox, oy, local=False)
    write_dxf(op("contours_1m_local.dxf"), contours, boundary, ox, oy, local=True)
    write_preview(op("contours_1m_preview.png"), gx, gy, Z, contours, boundary, zmin, zmax)

    readme = f"""1 m CONTOURS — generated from DEM (presentation reference data)
================================================================
Generated (UTC): {datetime.now(timezone.utc).isoformat(timespec='seconds')}
Source DXF     : {os.path.basename(args.input)} (never modified)

WHAT THIS IS
  Clean 1 m interval contour lines produced by interpolating an elevation
  surface (DEM) from the survey contour data, lightly smoothing it, masking
  areas without elevation data (NoData / voids / sea), and re-contouring at
  1 m. Intended for architectural presentation, site understanding and model
  making — NOT for precise grading or detailed/implementation design.

FILES
  contours_1m_global.dxf  3D contours, Z = elevation, ORIGINAL survey coords
  contours_1m_local.dxf   same, shifted to origin ({ox:.3f}, {oy:.3f}) — Rhino friendly
  contours_1m_preview.png  styled preview image
  README.txt

DXF DETAILS
  Format  : AutoCAD {DXF_VERSION} ASCII (Rhino / QGIS / Illustrator via CAD import)
  Units   : meters (INSUNITS = 6)
  Layers  : {LAYER_1M} (1 m lines), {LAYER_5M} (5 m index lines), {LAYER_BND}
  Z value : every contour vertex carries its elevation as Z.

COORDINATES
  local  = original - origin      (origin from {origin_src})
  origin = ({ox:.4f}, {oy:.4f})    Z is never shifted.
  To restore survey coords in Rhino: Move the model by (+{ox:.3f}, +{oy:.3f}, 0).

GENERATION PARAMETERS
  grid cell = {CELL} m, smoothing sigma = {SMOOTH_SIGMA} cells,
  concave-hull ratio = {CONCAVE_RATIO}, interval = {CONTOUR_INTERVAL} m.
  Elevation range: {zmin:.1f} .. {zmax:.1f} m.

NOTE
  Because the surface is smoothed and interpolated, contour positions are
  approximate (reference quality). Areas outside the surveyed footprint are
  intentionally left blank to avoid unnatural contours.
"""
    with open(op("README.txt"), "w", encoding="utf-8") as f:
        f.write(readme)

    log("[6/6] Zipping ...")
    zpath = op("contours_1m_package.zip")
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as zf:
        for n in ["contours_1m_global.dxf", "contours_1m_local.dxf",
                  "contours_1m_preview.png", "README.txt"]:
            zf.write(op(n), n)

    log("\n================ SUMMARY ================")
    log(f"DEM samples used         : {len(x)}")
    log(f"elevation range (m)      : {zmin:.1f} .. {zmax:.1f}")
    log(f"contour levels (1 m)     : {len(contours)}")
    log(f"contour polylines        : {n_lines}")
    log(f"local origin             : ({ox:.3f}, {oy:.3f})")
    log(f"ZIP                      : {zpath}")
    log("=========================================")


if __name__ == "__main__":
    main()
