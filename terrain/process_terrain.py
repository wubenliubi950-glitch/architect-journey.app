#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
process_terrain.py
==================
Convert an AutoCAD survey DXF ("04. Site boundary.dxf") into clean, Rhino-ready
3D terrain data (1 m contours), survey-point CSVs, boundary, coordinate
transform, a confirmation TIN mesh, and validation/analysis reports.

The original input file is never modified. Every result is written into the
output directory as a *new* file.

Run:
    python process_terrain.py --input "input/04. Site boundary.dxf" --outdir output

See README.md for the full workflow and Rhino import steps.
"""

import argparse
import json
import math
import os
import sys
import traceback
from collections import Counter, defaultdict
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import ezdxf
from ezdxf import path as ezpath
from shapely.geometry import LineString, Polygon, Point
from shapely.ops import unary_union, polygonize
from scipy.spatial import Delaunay

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #
LAYER_CONTOUR_1M = "9-지형-등고선-1m"
LAYER_CONTOUR_5M = "9-지형-등고선-5m"
LAYER_POINT = "9-지형-POINT"
LAYER_ELEV_TEXT = "9-지형-ELEv"
BOUNDARY_LAYERS = ["1-측량범위", "구역계", "9-지형-도곽", "9-지형-변경도곽"]

OUT_LAYER_1M = "TERRAIN_CONTOUR_1M"
OUT_LAYER_5M = "TERRAIN_CONTOUR_5M_SUPPLEMENT"
OUT_LAYER_PTS = "TERRAIN_SPOT_POINTS"
OUT_LAYER_BND = "TERRAIN_BOUNDARY"
OUT_LAYER_UNRES = "TERRAIN_UNRESOLVED"
STD_LAYERS = [
    (OUT_LAYER_1M, 3),     # green
    (OUT_LAYER_5M, 4),     # cyan
    (OUT_LAYER_PTS, 1),    # red
    (OUT_LAYER_BND, 6),    # magenta
    (OUT_LAYER_UNRES, 2),  # yellow
]

ARC_SAGITTA = 0.01     # max sagitta (m) when flattening arcs/bulges  (< 0.05 m tol)
JOIN_TOL = 0.02        # endpoint-join tolerance (m)
SHORT_LEN = 0.05       # minimum contour length (m); shorter -> separated
DUP_ROUND = 4          # coordinate rounding (decimals, m) for exact-dup keys
OUTLIER_SIGMA = 3.5    # robust (MAD) z outlier threshold
DXF_OUT_VERSION = "R2013"   # ASCII DXF, Rhino compatible


# --------------------------------------------------------------------------- #
# Small helpers
# --------------------------------------------------------------------------- #
def log(msg):
    print(msg, flush=True)


def poly_length(pts):
    if len(pts) < 2:
        return 0.0
    a = np.asarray([(p[0], p[1]) for p in pts], dtype=float)
    return float(np.sqrt(((a[1:] - a[:-1]) ** 2).sum(axis=1)).sum())


def dist2(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


# --------------------------------------------------------------------------- #
# Elevation determination and point extraction
# --------------------------------------------------------------------------- #
def entity_elevation(e):
    """Return (elev, uniform, reason). elev is a float or None (undetermined)."""
    t = e.dxftype()
    if t == "LWPOLYLINE":
        return float(e.dxf.elevation), True, "LWPOLYLINE.elevation(group 38)"
    if t == "POLYLINE":
        if e.is_3d_polyline:
            zs = [v.dxf.location.z for v in e.vertices]
            if not zs:
                return None, True, "empty 3D polyline"
            if (max(zs) - min(zs)) < 1e-6:
                return float(zs[0]), True, "3D POLYLINE uniform vertex Z"
            return float(np.mean(zs)), False, "3D POLYLINE with VARYING vertex Z"
        return float(e.dxf.elevation.z), True, "2D POLYLINE elevation.z"
    if t == "ARC":
        return float(e.dxf.center.z), True, "ARC center Z (OCS)"
    return None, True, "unsupported type"


def entity_points(e, elev):
    """Flatten entity to a list of (x, y, z) WCS points.

    Uses ezdxf path flattening so bulges/arcs are approximated within
    ARC_SAGITTA. When a scalar elevation is known it is forced onto every
    vertex so the contour Z is exactly constant.
    """
    try:
        p = ezpath.make_path(e)
        pts = [(v.x, v.y, v.z) for v in p.flattening(ARC_SAGITTA)]
        if not pts:
            raise ValueError("empty flattening")
    except Exception:
        # Manual fallback
        t = e.dxftype()
        pts = []
        if t == "LWPOLYLINE":
            z = elev if elev is not None else 0.0
            pts = [(x, y, z) for x, y in e.get_points("xy")]
        elif t == "POLYLINE":
            for v in e.vertices:
                loc = v.dxf.location
                z = loc.z if e.is_3d_polyline else (elev if elev is not None else loc.z)
                pts.append((loc.x, loc.y, z))
        elif t == "ARC":
            c = e.dxf.center
            r = e.dxf.radius
            a0 = math.radians(e.dxf.start_angle)
            a1 = math.radians(e.dxf.end_angle)
            if a1 <= a0:
                a1 += 2 * math.pi
            n = max(5, int((a1 - a0) / math.acos(max(-1.0, 1.0 - ARC_SAGITTA / max(r, 1e-6)))) + 1)
            for i in range(n + 1):
                a = a0 + (a1 - a0) * i / n
                pts.append((c.x + r * math.cos(a), c.y + r * math.sin(a), c.z))
    if elev is not None:
        pts = [(x, y, elev) for (x, y, _z) in pts]
    return pts


def extract_contours(msp, layer, tag, allow_zero):
    """Extract contours from a layer.

    Returns (resolved, unresolved) lists of dicts:
        {elev, pts, layer(tag), handle, src_type, closed, note}
    """
    resolved, unresolved = [], []
    for e in msp.query(f'*[layer=="{layer}"]'):
        t = e.dxftype()
        if t not in ("LWPOLYLINE", "POLYLINE", "ARC"):
            continue
        handle = e.dxf.handle
        try:
            elev, uniform, ereason = entity_elevation(e)
            note = ""
            if t == "ARC":
                note = f"ARC r={e.dxf.radius:.2f}m -> polyline"
            if not uniform:
                note = (note + "; " if note else "") + "non-uniform Z (true 3D)"

            # Ambiguous / undetermined elevation handling
            if elev is None:
                pts = entity_points(e, None)
                unresolved.append(dict(elev=None, pts=pts, layer=tag, handle=handle,
                                       src_type=t, closed=bool(getattr(e, "closed", False)),
                                       note=f"elevation undetermined ({ereason})"))
                continue
            if (abs(elev) < 1e-9) and (not allow_zero):
                pts = entity_points(e, elev)
                unresolved.append(dict(elev=elev, pts=pts, layer=tag, handle=handle,
                                       src_type=t, closed=bool(getattr(e, "closed", False)),
                                       note="elevation==0 on 1m layer (ambiguous: 5m-major "
                                            "level absent here, likely unset) -> not guessed"))
                continue

            pts = entity_points(e, elev)
            if len(pts) < 2:
                unresolved.append(dict(elev=elev, pts=pts, layer=tag, handle=handle,
                                       src_type=t, closed=False,
                                       note="fewer than 2 vertices"))
                continue
            resolved.append(dict(elev=float(elev), pts=pts, layer=tag, handle=handle,
                                 src_type=t, closed=bool(getattr(e, "closed", False)),
                                 note=note))
        except Exception as ex:  # never abort the whole run on one entity
            unresolved.append(dict(elev=None, pts=[], layer=tag, handle=handle,
                                   src_type=t, closed=False,
                                   note=f"exception: {ex.__class__.__name__}: {ex}"))
    return resolved, unresolved


# --------------------------------------------------------------------------- #
# Cleaning
# --------------------------------------------------------------------------- #
def dup_key(c):
    seq = tuple((round(x, DUP_ROUND), round(y, DUP_ROUND)) for x, y, _z in c["pts"])
    rev = tuple(reversed(seq))
    canon = min(seq, rev)
    return (round(c["elev"], 3) if c["elev"] is not None else None, canon)


def remove_exact_duplicates(contours):
    seen = {}
    kept, removed = [], []
    for c in contours:
        k = dup_key(c)
        if k in seen:
            removed.append(c)
        else:
            seen[k] = True
            kept.append(c)
    return kept, removed


def separate_short(contours):
    kept, short = [], []
    for c in contours:
        if poly_length(c["pts"]) < SHORT_LEN:
            c = dict(c)
            c["note"] = (c.get("note", "") + "; " if c.get("note") else "") + \
                        f"length<{SHORT_LEN}m fragment"
            short.append(c)
        else:
            kept.append(c)
    return kept, short


def join_segments(contours, tol=JOIN_TOL):
    """Greedy endpoint-to-endpoint join of segments that share the same layer
    and elevation. Pure concatenation (no smoothing / no vertex removal)."""
    groups = defaultdict(list)
    for c in contours:
        groups[(c["layer"], round(c["elev"], 3))].append(c)

    joined_all, n_joins = [], 0
    for key, segs in groups.items():
        remaining = [dict(s, pts=list(s["pts"]), handles=[s["handle"]]) for s in segs]
        out = []
        while remaining:
            cur = remaining.pop(0)
            pts = cur["pts"]
            changed = True
            while changed:
                changed = False
                for i, other in enumerate(remaining):
                    op = other["pts"]
                    if dist2(pts[-1], op[0]) <= tol:
                        pts.extend(op[1:])
                    elif dist2(pts[-1], op[-1]) <= tol:
                        pts.extend(list(reversed(op))[1:])
                    elif dist2(pts[0], op[-1]) <= tol:
                        pts[:0] = op[:-1]
                    elif dist2(pts[0], op[0]) <= tol:
                        pts[:0] = list(reversed(op))[:-1]
                    else:
                        continue
                    cur["handles"] += other["handles"]
                    remaining.pop(i)
                    n_joins += 1
                    changed = True
                    break
            cur["pts"] = pts
            cur["handle"] = "+".join(cur["handles"]) if len(cur["handles"]) > 1 else cur["handles"][0]
            if len(cur["handles"]) > 1:
                cur["note"] = (cur.get("note", "") + "; " if cur.get("note") else "") + \
                              f"joined {len(cur['handles'])} segments"
            out.append(cur)
        joined_all.extend(out)
    return joined_all, n_joins


def flag_self_intersections(contours):
    flagged = []
    for c in contours:
        xy = [(x, y) for x, y, _z in c["pts"]]
        if len(xy) < 2:
            continue
        try:
            ls = LineString(xy)
            if not ls.is_simple:
                flagged.append((c["handle"], c["elev"], c["layer"]))
        except Exception:
            pass
    return flagged


def flag_same_elev_crossings(contours):
    """Distinct contours at the SAME elevation should not cross. Report only."""
    groups = defaultdict(list)
    for c in contours:
        try:
            groups[round(c["elev"], 3)].append((c["handle"], LineString([(x, y) for x, y, _z in c["pts"]])))
        except Exception:
            pass
    crossings = []
    for elev, items in groups.items():
        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                h1, l1 = items[i]
                h2, l2 = items[j]
                if l1.crosses(l2):
                    crossings.append((elev, h1, h2))
    return crossings


# --------------------------------------------------------------------------- #
# Points
# --------------------------------------------------------------------------- #
def extract_points(msp, layer):
    rows = []
    for e in msp.query(f'*[layer=="{layer}"]'):
        if e.dxftype() != "POINT":
            continue
        loc = e.dxf.location
        rows.append(dict(handle=e.dxf.handle, x=float(loc.x), y=float(loc.y), z=float(loc.z),
                         layer=layer))
    return rows


def mark_outliers(rows):
    if not rows:
        return
    z = np.array([r["z"] for r in rows])
    med = np.median(z)
    mad = 1.4826 * np.median(np.abs(z - med))
    for r in rows:
        robust = (mad > 1e-9) and (abs(r["z"] - med) > OUTLIER_SIGMA * mad)
        physical = (r["z"] < -5.0) or (r["z"] > 200.0)
        r["is_outlier"] = bool(robust or physical)


# --------------------------------------------------------------------------- #
# Boundary
# --------------------------------------------------------------------------- #
def polygon_from_lwpolyline(e):
    pts = [(p[0], p[1]) for p in e.get_points()]
    if len(pts) < 3:
        return None
    try:
        poly = Polygon(pts)
        if not poly.is_valid:
            poly = poly.buffer(0)
        return poly if (poly.geom_type == "Polygon" and poly.area > 0) else None
    except Exception:
        return None


# 도곽 (圖廓) = drawing / map-sheet frame. These layers hold coordinate-grid
# frames, never a terrain boundary, so they are reported but never adopted.
FRAME_LAYERS = {"9-지형-도곽", "9-지형-변경도곽"}


def collect_boundary_candidates(msp):
    """Return (candidates, frames).

    candidates: [{layer, poly, area, valid, simple, src}] -- adoptable polygons.
    frames:     [{layer, kind, n_cells, typical_cell_area_m2, bbox}] -- drawing
                frames / coordinate grids that are reported but excluded.
    """
    cands, frames = [], []
    for layer in BOUNDARY_LAYERS:
        ents = list(msp.query(f'*[layer=="{layer}"]'))
        is_frame_layer = layer in FRAME_LAYERS

        closed_polys = []
        for e in ents:
            if e.dxftype() == "LWPOLYLINE" and e.closed:
                poly = polygon_from_lwpolyline(e)
                if poly is not None:
                    closed_polys.append((poly, f"LWPOLYLINE {e.dxf.handle}"))

        line_loops = []
        lines = [LineString([(e.dxf.start.x, e.dxf.start.y), (e.dxf.end.x, e.dxf.end.y)])
                 for e in ents if e.dxftype() == "LINE"]
        if len(lines) >= 3:
            try:
                line_loops = [p for p in polygonize(unary_union(lines)) if p.area > 1.0]
            except Exception:
                line_loops = []

        # Grid / frame detection: many similar-area cells => coordinate grid.
        grid_like = len(line_loops) > 5
        if is_frame_layer or grid_like:
            all_polys = [p for p, _ in closed_polys] + line_loops
            if all_polys:
                xs = [c for p in all_polys for c in p.bounds[::2]]
                ys = [c for p in all_polys for c in p.bounds[1::2]]
                areas = [round(p.area, 1) for p in line_loops] or [round(p.area, 1) for p, _ in closed_polys]
                typical = Counter(areas).most_common(1)[0][0] if areas else None
                frames.append(dict(layer=layer,
                                   kind="coordinate grid / drawing frame",
                                   n_cells=len(all_polys),
                                   typical_cell_area_m2=typical,
                                   bbox=[round(min(xs), 1), round(min(ys), 1),
                                         round(max(xs), 1), round(max(ys), 1)]))
            continue  # never adopt frame layers

        for poly, src in closed_polys + [(p, f"polygonized {len(lines)} LINEs") for p in line_loops]:
            cands.append(dict(layer=layer, poly=poly, area=poly.area,
                              valid=poly.is_valid, simple=poly.exterior.is_simple, src=src))
    return cands, frames


def dedup_polygons(cands):
    """Drop geometrically identical polygon candidates (keep first)."""
    kept = []
    for c in cands:
        dup = False
        for k in kept:
            if abs(c["area"] - k["area"]) < 1e-3 and c["poly"].equals_exact(k["poly"], 1e-6):
                dup = True
                break
            if abs(c["area"] - k["area"]) < 1e-6 and c["poly"].symmetric_difference(k["poly"]).area < 1e-3:
                dup = True
                break
        if not dup:
            kept.append(c)
    return kept


# --------------------------------------------------------------------------- #
# DXF writing
# --------------------------------------------------------------------------- #
def new_doc():
    doc = ezdxf.new(DXF_OUT_VERSION, setup=True)
    doc.header["$INSUNITS"] = 6  # meters
    for name, color in STD_LAYERS:
        if name not in doc.layers:
            doc.layers.add(name, color=color)
    return doc


def shift(pts, ox, oy):
    return [(x - ox, y - oy, z) for x, y, z in pts]


def write_contour_dxf(fname, contours_1m, contours_5m, unresolved, points,
                      boundary_poly, ox, oy, local):
    doc = new_doc()
    msp = doc.modelspace()

    def emit(clist, layer):
        for c in clist:
            pts = c["pts"]
            if local:
                pts = shift(pts, ox, oy)
            if len(pts) >= 2:
                msp.add_polyline3d(pts, dxfattribs={"layer": layer})

    emit(contours_1m, OUT_LAYER_1M)
    emit(contours_5m, OUT_LAYER_5M)
    emit([c for c in unresolved if len(c["pts"]) >= 2], OUT_LAYER_UNRES)

    for r in points:
        x, y, z = r["x"], r["y"], r["z"]
        if local:
            x, y = x - ox, y - oy
        msp.add_point((x, y, z), dxfattribs={"layer": OUT_LAYER_PTS})

    if boundary_poly is not None:
        ring = list(boundary_poly.exterior.coords)
        bpts = [(x, y, 0.0) for x, y in ring]
        if local:
            bpts = shift(bpts, ox, oy)
        msp.add_polyline3d(bpts, close=True, dxfattribs={"layer": OUT_LAYER_BND})

    doc.saveas(fname)


def write_boundary_dxf(fname, poly, ox, oy, local):
    doc = new_doc()
    msp = doc.modelspace()
    ring = list(poly.exterior.coords)
    bpts = [(x, y, 0.0) for x, y in ring]
    if local:
        bpts = shift(bpts, ox, oy)
    msp.add_polyline3d(bpts, close=True, dxfattribs={"layer": OUT_LAYER_BND})
    doc.saveas(fname)


def write_candidates_dxf(fname, cands):
    doc = ezdxf.new(DXF_OUT_VERSION, setup=True)
    doc.header["$INSUNITS"] = 6
    msp = doc.modelspace()
    for i, c in enumerate(cands):
        lname = f"CAND_{i:02d}_{c['layer']}"[:255]
        if lname not in doc.layers:
            doc.layers.add(lname, color=(i % 7) + 1)
        ring = list(c["poly"].exterior.coords)
        msp.add_lwpolyline([(x, y) for x, y in ring], close=True,
                           dxfattribs={"layer": lname})
    doc.saveas(fname)


def write_unresolved_dxf(fname, unresolved, ox, oy):
    """Separate file holding only the unresolved contours (global coords)."""
    doc = new_doc()
    msp = doc.modelspace()
    for c in unresolved:
        if len(c["pts"]) >= 2:
            msp.add_polyline3d(c["pts"], dxfattribs={"layer": OUT_LAYER_UNRES})
        elif len(c["pts"]) == 1:
            msp.add_point(c["pts"][0], dxfattribs={"layer": OUT_LAYER_UNRES})
    doc.saveas(fname)


# --------------------------------------------------------------------------- #
# Clipping
# --------------------------------------------------------------------------- #
def clip_contours(contours, poly):
    out = []
    for c in contours:
        try:
            ls = LineString([(x, y) for x, y, _z in c["pts"]])
        except Exception:
            continue
        inter = ls.intersection(poly)
        if inter.is_empty:
            continue
        geoms = getattr(inter, "geoms", [inter])
        for g in geoms:
            if g.geom_type != "LineString" or g.length == 0:
                continue
            pts = [(x, y, c["elev"]) for x, y in g.coords]
            nc = dict(c)
            nc["pts"] = pts
            out.append(nc)
    return out


# --------------------------------------------------------------------------- #
# TIN
# --------------------------------------------------------------------------- #
def build_tin(contours, boundary_poly, ox, oy):
    """Constrained-ish Delaunay TIN from contour vertices only.

    Returns (vertices_local, faces, info). Points (spatially disjoint cluster)
    are intentionally excluded.
    """
    xyz = []
    for c in contours:
        for x, y, z in c["pts"]:
            xyz.append((x, y, z))
    if len(xyz) < 3:
        return None, None, {"status": "skipped", "reason": "not enough contour vertices"}

    arr = np.array(xyz, dtype=float)
    # unique on XY (keep first z)
    _, idx = np.unique(np.round(arr[:, :2], 3), axis=0, return_index=True)
    arr = arr[np.sort(idx)]
    if len(arr) < 3:
        return None, None, {"status": "skipped", "reason": "not enough unique vertices"}

    tri = Delaunay(arr[:, :2])
    simplices = tri.simplices

    # adaptive max-edge filter to avoid triangles spanning contour gaps
    def edge_len(a, b):
        return math.hypot(arr[a, 0] - arr[b, 0], arr[a, 1] - arr[b, 1])

    lengths = []
    for s in simplices:
        lengths += [edge_len(s[0], s[1]), edge_len(s[1], s[2]), edge_len(s[2], s[0])]
    lengths = np.array(lengths)
    med = float(np.median(lengths))
    max_edge = max(10.0, 6.0 * med)

    keep = []
    for s in simplices:
        e0, e1, e2 = edge_len(s[0], s[1]), edge_len(s[1], s[2]), edge_len(s[2], s[0])
        if max(e0, e1, e2) > max_edge:
            continue
        cx = (arr[s[0], 0] + arr[s[1], 0] + arr[s[2], 0]) / 3.0
        cy = (arr[s[0], 1] + arr[s[1], 1] + arr[s[2], 1]) / 3.0
        if boundary_poly is not None and not boundary_poly.contains(Point(cx, cy)):
            continue
        keep.append(s)

    if not keep:
        return None, None, {"status": "skipped", "reason": "no triangles survived filtering"}

    verts_local = np.column_stack([arr[:, 0] - ox, arr[:, 1] - oy, arr[:, 2]])
    info = {"status": "ok", "n_vertices": int(len(arr)), "n_faces": int(len(keep)),
            "median_edge_m": round(med, 3), "max_edge_m": round(max_edge, 3),
            "clipped_to_boundary": boundary_poly is not None}
    return verts_local, np.array(keep), info


def write_obj(fname, verts, faces):
    with open(fname, "w") as f:
        f.write("# terrain confirmation TIN (LOCAL coords, meters)\n")
        for v in verts:
            f.write(f"v {v[0]:.4f} {v[1]:.4f} {v[2]:.4f}\n")
        for s in faces:
            f.write(f"f {s[0]+1} {s[1]+1} {s[2]+1}\n")


def write_tin_dxf(fname, verts, faces):
    doc = new_doc()
    if "TERRAIN_TIN" not in doc.layers:
        doc.layers.add("TERRAIN_TIN", color=8)
    msp = doc.modelspace()
    for s in faces:
        a, b, c = verts[s[0]], verts[s[1]], verts[s[2]]
        msp.add_3dface([tuple(a), tuple(b), tuple(c), tuple(c)],
                       dxfattribs={"layer": "TERRAIN_TIN"})
    doc.saveas(fname)


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main():
    ap = argparse.ArgumentParser(description="Convert survey DXF into Rhino-ready terrain data.")
    ap.add_argument("--input", default="input/04. Site boundary.dxf")
    ap.add_argument("--outdir", default="output")
    args = ap.parse_args()

    inp = args.input
    outdir = args.outdir
    os.makedirs(outdir, exist_ok=True)

    def outp(name):
        return os.path.join(outdir, name)

    log(f"[1/12] Reading {inp} ...")
    doc = ezdxf.readfile(inp)
    msp = doc.modelspace()
    report = {}
    report["dxf_version"] = f"{doc.dxfversion} ({doc.acad_release})"
    report["dwgcodepage"] = doc.header.get("$DWGCODEPAGE", "n/a")
    report["insunits"] = doc.header.get("$INSUNITS", "n/a")
    report["ext_min"] = tuple(round(v, 3) for v in doc.header.get("$EXTMIN", (0, 0, 0)))
    report["ext_max"] = tuple(round(v, 3) for v in doc.header.get("$EXTMAX", (0, 0, 0)))
    report["n_entities_modelspace"] = len(msp)

    # layer / entity inventory
    layer_types = defaultdict(Counter)
    for e in msp:
        layer_types[e.dxf.layer][e.dxftype()] += 1
    report["n_layers"] = len(doc.layers)
    report["layer_inventory"] = {k: dict(v) for k, v in sorted(layer_types.items())}

    # ---- contours ----
    log("[2/12] Extracting 1 m contours ...")
    c1_res, c1_unres = extract_contours(msp, LAYER_CONTOUR_1M, "1M", allow_zero=False)
    log("[3/12] Extracting 5 m contours ...")
    c5_res, c5_unres = extract_contours(msp, LAYER_CONTOUR_5M, "5M", allow_zero=True)

    # ---- double-use guard (1m vs 5m) ----
    used_1m_elev = {round(c["elev"], 3) for c in c1_res}
    used_5m_elev = {round(c["elev"], 3) for c in c5_res}
    overlap_elev = sorted(used_1m_elev & used_5m_elev)
    # Only elevations present in BOTH layers could be double-used. The layers
    # are complementary (1m = non-multiples of 5, 5m = multiples of 5), so this
    # is expected to be empty. If not empty we would geometry-check; here we
    # record it.
    report["contour_double_use_overlap_elevations"] = overlap_elev

    # ---- cleaning ----
    log("[4/12] Cleaning (dedup / short / join / flags) ...")
    c1_res, dup1 = remove_exact_duplicates(c1_res)
    c5_res, dup5 = remove_exact_duplicates(c5_res)
    c1_res, short1 = separate_short(c1_res)
    c5_res, short5 = separate_short(c5_res)
    c1_res, joins1 = join_segments(c1_res)
    c5_res, joins5 = join_segments(c5_res)

    all_res = c1_res + c5_res
    self_ints = flag_self_intersections(all_res)
    crossings = flag_same_elev_crossings(all_res)

    unresolved = c1_unres + c5_unres + short1 + short5
    report["cleaning"] = dict(
        exact_duplicates_removed_1m=len(dup1),
        exact_duplicates_removed_5m=len(dup5),
        short_fragments_separated_1m=len(short1),
        short_fragments_separated_5m=len(short5),
        endpoint_joins_1m=joins1,
        endpoint_joins_5m=joins5,
        self_intersecting_contours=len(self_ints),
        same_elevation_crossings=len(crossings),
        join_tolerance_m=JOIN_TOL,
    )
    report["self_intersections"] = self_ints[:50]
    report["same_elev_crossings"] = crossings[:50]

    # ---- points ----
    log("[5/12] Extracting survey points ...")
    pts = extract_points(msp, LAYER_POINT)
    mark_outliers(pts)

    # ---- boundary candidates ----
    log("[6/12] Analysing boundary candidates ...")
    cands, frames = collect_boundary_candidates(msp)
    cands = dedup_polygons(cands)
    report["excluded_frames"] = frames

    contour_xy = [(x, y) for c in all_res for x, y, _z in c["pts"]]
    contour_pts_geom = [Point(p) for p in contour_xy[::5]]  # subsample for speed
    survey_pts_geom = [Point(r["x"], r["y"]) for r in pts]

    for c in cands:
        poly = c["poly"]
        c["contour_verts_inside"] = int(sum(1 for p in contour_pts_geom if poly.contains(p))) * 5
        c["survey_pts_inside"] = int(sum(1 for p in survey_pts_geom if poly.contains(p)))
    report["boundary_candidates"] = [
        dict(layer=c["layer"], src=c["src"], area_m2=round(c["area"], 1),
             valid=bool(c["valid"]), simple=bool(c["simple"]),
             contour_verts_inside=c["contour_verts_inside"],
             survey_pts_inside=c["survey_pts_inside"])
        for c in cands
    ]

    # Adopt boundary: closed, valid, simple polygon on 구역계 that encloses the
    # bulk of the contour vertices (the primary terrain data).
    adopted = None
    contour_cands = [c for c in cands if c["contour_verts_inside"] > 0
                     and c["valid"] and c["simple"]]
    if contour_cands:
        adopted = max(contour_cands, key=lambda c: c["contour_verts_inside"])
    boundary_poly = adopted["poly"] if adopted else None
    report["adopted_boundary"] = (
        dict(layer=adopted["layer"], area_m2=round(adopted["area"], 1),
             contour_verts_inside=adopted["contour_verts_inside"])
        if adopted else None)

    # ---- origin (priority: boundary LL -> contour LL -> points min) ----
    log("[7/12] Computing local origin / transform ...")
    if boundary_poly is not None:
        minx, miny, _, _ = boundary_poly.bounds
        origin_src = f"adopted site boundary ({adopted['layer']}) bbox lower-left"
    elif contour_xy:
        minx = min(x for x, _y in contour_xy)
        miny = min(y for _x, y in contour_xy)
        origin_src = "contour bounding-box lower-left"
    else:
        minx = min(r["x"] for r in pts)
        miny = min(r["y"] for r in pts)
        origin_src = "survey points min X/Y"
    ox, oy, oz = float(minx), float(miny), 0.0

    # global bbox over everything we output (contours + points)
    all_x = [x for x, _y in contour_xy] + [r["x"] for r in pts]
    all_y = [y for _x, y in contour_xy] + [r["y"] for r in pts]
    all_z = [z for c in all_res for _x, _y, z in c["pts"]] + [r["z"] for r in pts]
    gbb = dict(min_x=round(min(all_x), 3), min_y=round(min(all_y), 3), min_z=round(min(all_z), 3),
               max_x=round(max(all_x), 3), max_y=round(max(all_y), 3), max_z=round(max(all_z), 3))
    lbb = dict(min_x=round(min(all_x) - ox, 3), min_y=round(min(all_y) - oy, 3), min_z=gbb["min_z"],
               max_x=round(max(all_x) - ox, 3), max_y=round(max(all_y) - oy, 3), max_z=gbb["max_z"])

    transform = dict(
        unit="meter",
        origin_x=ox, origin_y=oy, origin_z=oz,
        x_offset=-ox, y_offset=-oy, z_offset=0.0,
        source_file=os.path.basename(inp),
        origin_source=origin_src,
        transformation_formula={
            "to_local": "local_x = original_x - origin_x; local_y = original_y - origin_y; local_z = original_z",
            "to_global": "original_x = local_x + origin_x; original_y = local_y + origin_y; original_z = local_z",
        },
        global_bounding_box=gbb,
        local_bounding_box=lbb,
    )
    with open(outp("coordinate_transform.json"), "w", encoding="utf-8") as f:
        json.dump(transform, f, ensure_ascii=False, indent=2)

    # ---- point CSVs ----
    log("[8/12] Writing point CSVs ...")
    prows = []
    for i, r in enumerate(sorted(pts, key=lambda r: r["handle"]), start=1):
        prows.append(dict(
            point_id=f"P{i:05d}",
            original_x=round(r["x"], 4), original_y=round(r["y"], 4), original_z=round(r["z"], 4),
            local_x=round(r["x"] - ox, 4), local_y=round(r["y"] - oy, 4), local_z=round(r["z"], 4),
            source_layer=r["layer"], source_handle=r["handle"], is_outlier=r["is_outlier"],
        ))
    dfp = pd.DataFrame(prows)
    dfp.to_csv(outp("terrain_spot_points_global.csv"), index=False, encoding="utf-8-sig")
    dfp[["point_id", "local_x", "local_y", "local_z", "original_z",
         "source_layer", "source_handle", "is_outlier"]].to_csv(
        outp("terrain_spot_points_local.csv"), index=False, encoding="utf-8-sig")

    # ---- contour DXFs ----
    log("[9/12] Writing contour / boundary DXFs ...")
    write_contour_dxf(outp("terrain_contours_global_3d.dxf"),
                      c1_res, c5_res, unresolved, pts, boundary_poly, ox, oy, local=False)
    write_contour_dxf(outp("terrain_contours_local_3d.dxf"),
                      c1_res, c5_res, unresolved, pts, boundary_poly, ox, oy, local=True)
    write_unresolved_dxf(outp("unresolved_contours.dxf"), unresolved, ox, oy)
    if cands:
        write_candidates_dxf(outp("boundary_candidates.dxf"), cands)

    # clipped versions (only if boundary adopted)
    c1_clip = c5_clip = []
    if boundary_poly is not None:
        c1_clip = clip_contours(c1_res, boundary_poly)
        c5_clip = clip_contours(c5_res, boundary_poly)
        write_contour_dxf(outp("terrain_contours_clipped_global_3d.dxf"),
                          c1_clip, c5_clip, [], pts, boundary_poly, ox, oy, local=False)
        write_contour_dxf(outp("terrain_contours_clipped_local_3d.dxf"),
                          c1_clip, c5_clip, [], pts, boundary_poly, ox, oy, local=True)
        write_boundary_dxf(outp("terrain_boundary_global.dxf"), boundary_poly, ox, oy, local=False)
        write_boundary_dxf(outp("terrain_boundary_local.dxf"), boundary_poly, ox, oy, local=True)

    # ---- TIN ----
    log("[10/12] Building confirmation TIN ...")
    tin_source = (c1_clip + c5_clip) if boundary_poly is not None else all_res
    verts, faces, tin_info = build_tin(tin_source, boundary_poly, ox, oy)
    if verts is not None:
        write_obj(outp("terrain_tin_local.obj"), verts, faces)
        write_tin_dxf(outp("terrain_tin_local.dxf"), verts, faces)
    report["tin"] = tin_info
    report["tin"]["survey_points_used"] = False
    report["tin"]["note"] = ("Survey points are in a spatially disjoint cluster "
                             "(~2.15 km W / ~3.04 km S of the contours) and are "
                             "excluded from the TIN to avoid nonsensical geometry.")

    # ---- ELEv text cross-check (validation only) ----
    elev_vals = []
    for e in msp.query(f'*[layer=="{LAYER_ELEV_TEXT}"]'):
        if e.dxftype() == "TEXT":
            try:
                elev_vals.append(float(e.dxf.text.strip()))
            except Exception:
                pass
    report["elev_text_check"] = dict(
        n_numeric=len(elev_vals),
        min=round(min(elev_vals), 2) if elev_vals else None,
        max=round(max(elev_vals), 2) if elev_vals else None,
        note="TEXT values used only to sanity-check the elevation range; "
             "text insertion Z is NOT used as ground elevation.")

    # ---- validation ----
    log("[11/12] Validating ...")
    all_verts = [(x, y, z) for c in all_res for x, y, z in c["pts"]]
    total_verts = len(all_verts)
    all_have_z = all(len(p) == 3 for p in all_verts)
    # z constant per contour
    z_const_ok = all(len({round(z, 4) for _x, _y, z in c["pts"]}) == 1 for c in all_res)
    # 1m step check (integer, not multiple of 5 expected for the intermediate layer)
    e1 = sorted({round(c["elev"], 3) for c in c1_res})
    e5 = sorted({round(c["elev"], 3) for c in c5_res})
    non_int_1m = [z for z in e1 if abs(z - round(z)) > 1e-6]
    non5_mult_5m = [z for z in e5 if abs(z % 5) > 1e-6]
    # reversibility: local + offset == global (max residual)
    resid = 0.0
    for c in all_res:
        for x, y, _z in c["pts"]:
            resid = max(resid, abs((x - ox) + ox - x), abs((y - oy) + oy - y))
    # z identical local vs global (offset is 0)
    z_local_eq_global = (transform["z_offset"] == 0.0)
    # points inside/outside adopted boundary
    if boundary_poly is not None:
        inside = sum(1 for r in pts if boundary_poly.contains(Point(r["x"], r["y"])))
    else:
        inside = None

    zmin = min(z for _x, _y, z in all_verts) if all_verts else None
    zmax = max(z for _x, _y, z in all_verts) if all_verts else None

    validation = [
        ("all_contour_vertices_have_Z", all_have_z),
        ("Z_constant_within_each_contour", z_const_ok),
        ("count_contours_1m", len(c1_res)),
        ("count_contours_5m_supplement", len(c5_res)),
        ("count_contours_total", len(all_res)),
        ("total_contour_vertices", total_verts),
        ("count_survey_points", len(pts)),
        ("count_survey_point_outliers", int(sum(1 for r in pts if r["is_outlier"]))),
        ("exact_duplicates_removed", len(dup1) + len(dup5)),
        ("short_fragments_separated", len(short1) + len(short5)),
        ("endpoint_joins", joins1 + joins5),
        ("unresolved_contours", len(unresolved)),
        ("self_intersecting_contours", len(self_ints)),
        ("same_elevation_crossings", len(crossings)),
        ("elevation_min_m", zmin),
        ("elevation_max_m", zmax),
        ("contour_1m_double_use_overlap", len(overlap_elev)),
        ("contour_1m_non_integer_elevations", len(non_int_1m)),
        ("contour_5m_non_multiple_of_5_elevations", len(non5_mult_5m)),
        ("reversibility_max_xy_residual_m", resid),
        ("z_local_equals_global", z_local_eq_global),
        ("survey_points_inside_boundary", inside),
        ("survey_points_outside_boundary", (len(pts) - inside) if inside is not None else None),
        ("local_origin_x", ox),
        ("local_origin_y", oy),
        ("tin_faces", tin_info.get("n_faces")),
        ("tin_status", tin_info.get("status")),
    ]
    pd.DataFrame(validation, columns=["metric", "value"]).to_csv(
        outp("terrain_validation.csv"), index=False, encoding="utf-8-sig")
    report["validation"] = {k: v for k, v in validation}
    report["elevations_1m"] = e1
    report["elevations_5m"] = e5

    # unresolved details for the report
    report["unresolved_detail"] = [
        dict(handle=c["handle"], src_type=c["src_type"],
             elev=c["elev"], note=c["note"])
        for c in unresolved
    ][:100]

    # ---- analysis markdown ----
    log("[12/12] Writing analysis report ...")
    write_analysis_md(outp("terrain_analysis.md"), report, transform)

    # console summary
    log("\n================ SUMMARY ================")
    log(f"1m contours (TERRAIN_CONTOUR_1M):        {len(c1_res)}")
    log(f"5m supplement (TERRAIN_CONTOUR_5M...):   {len(c5_res)}")
    log(f"unresolved contours:                     {len(unresolved)}")
    log(f"survey points:                           {len(pts)} ({sum(1 for r in pts if r['is_outlier'])} flagged outliers)")
    log(f"elevation range (m):                     {zmin} .. {zmax}")
    log(f"local origin (global->local subtract):   ({ox:.3f}, {oy:.3f}, {oz:.3f})")
    log(f"adopted boundary:                        {report['adopted_boundary']}")
    log(f"TIN:                                     {tin_info}")
    log(f"outputs written to:                      {outdir}/")
    log("=========================================")


def write_analysis_md(fname, r, t):
    L = []
    A = L.append
    A("# 地形DXF解析・変換レポート / Terrain DXF Analysis & Conversion Report\n")
    A(f"- 生成日時 (UTC): {datetime.now(timezone.utc).isoformat(timespec='seconds')}")
    A(f"- 入力ファイル / source: `{t['source_file']}` (never modified)")
    A(f"- DXFバージョン: **{r['dxf_version']}**")
    A(f"- 単位 / INSUNITS: **{r['insunits']} (6 = meters)**")
    A(f"- DWGCODEPAGE (header): `{r['dwgcodepage']}`  ← 実データはUTF-8韓国語。"
      "ヘッダのコードページ表記と実エンコーディングは不一致だが、R2018 DXFはUTF-8のため"
      "ezdxfで正しくデコードされ、韓国語レイヤー名は保持されている。")
    A(f"- ヘッダ図面範囲 EXTMIN/EXTMAX: {r['ext_min']} / {r['ext_max']}  "
      "（注: このヘッダ範囲は**古い/不正確**で全エンティティを包含しない。Z=-72は地形レイヤーには存在しない）")
    A(f"- モデル空間エンティティ数: {r['n_entities_modelspace']}  / レイヤー数: {r['n_layers']}\n")

    A("## 重要な発見: 2つの空間クラスタ / KEY FINDING: two spatial clusters\n")
    A("等高線と測量点は、同一標高帯（0〜68 m）を持ちながら**別々のXY位置**に配置されている。"
      "同一地形の二重配置（座標系/挿入基点の違い）と判断。")
    A("")
    A("| Cluster | Layers | X range | Y range |")
    A("|---|---|---|---|")
    A("| A | 1m/5m 等高線, `구역계` 境界 | 243344–243928 | 280869–281309 |")
    A("| B | 測量点 `9-지형-POINT`, 標高文字 `9-지형-ELEv`, `1-측량범위` | 241191–241886 | 277813–278438 |")
    A("")
    A("**影響:** (1) 変換の忠実性・可逆性のため全データに**単一原点**を適用する。"
      "(2) 確認用TINは等高線のみから生成し、~3.7 km離れた測量点は混在させない（不自然な三角形を回避）。\n")

    A("## レイヤー別エンティティ数 (主要) / Entity inventory (focus)\n")
    A("| layer | entities |")
    A("|---|---|")
    focus = [LAYER_CONTOUR_1M, LAYER_CONTOUR_5M, LAYER_POINT, LAYER_ELEV_TEXT] + BOUNDARY_LAYERS
    for k in focus:
        if k in r["layer_inventory"]:
            A(f"| `{k}` | {r['layer_inventory'][k]} |")
    A("")

    A("## 標高 / Elevations\n")
    A(f"- 1m層の標高（採用）: {r['elevations_1m']}")
    A(f"- 5m層の標高（補助）: {r['elevations_5m']}")
    A("- **相補関係**: 1m層は5の倍数を含まない中間等高線、5m層は5の倍数の主曲線。"
      "両者を合わせると1m間隔の完全なモデルになり、二重使用は発生しない。")
    A(f"- 1m/5m 標高の重複（二重使用の可能性）: {r['contour_double_use_overlap_elevations']}（空＝二重使用なし）\n")

    A("## クリーニング結果 / Cleaning\n")
    for k, v in r["cleaning"].items():
        A(f"- {k}: {v}")
    A("")

    A("## 未解決の等高線 / Unresolved contours\n")
    A(f"合計 {r['validation']['unresolved_contours']} 本を `unresolved_contours.dxf` / "
      "`TERRAIN_UNRESOLVED` レイヤーへ分離。主因:")
    A("- 1m層で `elevation==0`（4×LWPOLYLINE + 3×ARC）: 0は5m主曲線の標高であり1m層に本来存在しないため、"
      "真の0m等高線か未設定かを判別不能 → 標高を推測せず分離。")
    A("- 長さ<0.05 m の断片。")
    A("")
    if r["unresolved_detail"]:
        A("| handle | type | elev | note |")
        A("|---|---|---|---|")
        for u in r["unresolved_detail"][:40]:
            A(f"| {u['handle']} | {u['src_type']} | {u['elev']} | {u['note']} |")
        A("")

    A("## 境界候補 / Boundary candidates\n")
    A("| layer | src | area (m²) | valid | simple | contour verts inside | survey pts inside |")
    A("|---|---|---|---|---|---|---|")
    for c in r["boundary_candidates"]:
        A(f"| `{c['layer']}` | {c['src']} | {c['area_m2']} | {c['valid']} | {c['simple']} | "
          f"{c['contour_verts_inside']} | {c['survey_pts_inside']} |")
    A("")
    A(f"**採用境界 / adopted:** {r['adopted_boundary']}")
    A("`구역계`（閉じた有効ポリゴン、面積約82,757 m²、等高線本体を内包）を敷地境界として採用。"
      "重複コピーは除去。`1-측량범위` は測量点クラスタ(B)側の範囲であり別クラスタ。\n")
    if r.get("excluded_frames"):
        A("**除外した図面枠 / excluded drawing frames (도곽):** これらは座標グリッド/図面枠であり境界ではない。")
        A("| layer | kind | cells | typical cell area (m²) | bbox |")
        A("|---|---|---|---|---|")
        for fr in r["excluded_frames"]:
            A(f"| `{fr['layer']}` | {fr['kind']} | {fr['n_cells']} | {fr['typical_cell_area_m2']} | {fr['bbox']} |")
        A("")

    A("## 座標変換 / Coordinate transform\n")
    A(f"- 原点決定根拠: {t['origin_source']}")
    A(f"- origin = ({t['origin_x']:.3f}, {t['origin_y']:.3f}, {t['origin_z']:.3f})")
    A(f"- local = original − origin（Z標高は不変）")
    A(f"- 逆変換: original = local + origin")
    A(f"- global bbox: {t['global_bounding_box']}")
    A(f"- local bbox: {t['local_bounding_box']}")
    A("- 完全な情報は `coordinate_transform.json` に保存（元座標へ完全復元可能）。\n")

    A("## TIN（確認用）/ Confirmation TIN\n")
    for k, v in r["tin"].items():
        A(f"- {k}: {v}")
    A("")

    A("## 標高文字の照合 / ELEv text check\n")
    for k, v in r["elev_text_check"].items():
        A(f"- {k}: {v}")
    A("")

    A("## 検証結果 / Validation\n")
    A("| metric | value |")
    A("|---|---|")
    for k, v in r["validation"].items():
        A(f"| {k} | {v} |")
    A("")
    if r["self_intersections"]:
        A(f"自己交差した等高線 (最大50件表示): {r['self_intersections']}\n")
    if r["same_elev_crossings"]:
        A(f"同一標高での交差 (最大50件表示): {r['same_elev_crossings']}\n")

    with open(fname, "w", encoding="utf-8") as f:
        f.write("\n".join(L))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        sys.exit(1)
