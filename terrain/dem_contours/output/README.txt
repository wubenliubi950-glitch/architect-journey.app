1 m CONTOURS — generated from DEM (presentation reference data)
================================================================
Generated (UTC): 2026-07-10T12:47:49+00:00
Source DXF     : 04. Site boundary.dxf (never modified)

WHAT THIS IS
  Clean 1 m interval contour lines produced by interpolating an elevation
  surface (DEM) from the survey contour data, lightly smoothing it, masking
  areas without elevation data (NoData / voids / sea), and re-contouring at
  1 m. Intended for architectural presentation, site understanding and model
  making — NOT for precise grading or detailed/implementation design.

FILES
  contours_1m_global.dxf  3D contours, Z = elevation, ORIGINAL survey coords
  contours_1m_local.dxf   same, shifted to origin (243410.956, 280910.803) — Rhino friendly
  contours_1m_preview.png  styled preview image
  README.txt

DXF DETAILS
  Format  : AutoCAD R2013 ASCII (Rhino / QGIS / Illustrator via CAD import)
  Units   : meters (INSUNITS = 6)
  Layers  : CONTOURS_1M (1 m lines), CONTOURS_5M_INDEX (5 m index lines), SITE_BOUNDARY
  Z value : every contour vertex carries its elevation as Z.

COORDINATES
  local  = original - origin      (origin from site boundary (구역계) bbox lower-left)
  origin = (243410.9556, 280910.8027)    Z is never shifted.
  To restore survey coords in Rhino: Move the model by (+243410.956, +280910.803, 0).

GENERATION PARAMETERS
  grid cell = 1.5 m, smoothing sigma = 1.2 cells,
  concave-hull ratio = 0.06, interval = 1.0 m.
  Elevation range: 0.0 .. 68.0 m.

NOTE
  Because the surface is smoothed and interpolated, contour positions are
  approximate (reference quality). Areas outside the surveyed footprint are
  intentionally left blank to avoid unnatural contours.
