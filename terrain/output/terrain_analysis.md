# 地形DXF解析・変換レポート / Terrain DXF Analysis & Conversion Report

- 生成日時 (UTC): 2026-07-10T12:15:35+00:00
- 入力ファイル / source: `04. Site boundary.dxf` (never modified)
- DXFバージョン: **AC1032 (R2018)**
- 単位 / INSUNITS: **6 (6 = meters)**
- DWGCODEPAGE (header): `ANSI_932`  ← 実データはUTF-8韓国語。ヘッダのコードページ表記と実エンコーディングは不一致だが、R2018 DXFはUTF-8のためezdxfで正しくデコードされ、韓国語レイヤー名は保持されている。
- ヘッダ図面範囲 EXTMIN/EXTMAX: (243343.516, 280868.83, -72.0) / (243931.077, 281309.651, 109.0)  （注: このヘッダ範囲は**古い/不正確**で全エンティティを包含しない。Z=-72は地形レイヤーには存在しない）
- モデル空間エンティティ数: 25969  / レイヤー数: 174

## 重要な発見: 2つの空間クラスタ / KEY FINDING: two spatial clusters

等高線と測量点は、同一標高帯（0〜68 m）を持ちながら**別々のXY位置**に配置されている。同一地形の二重配置（座標系/挿入基点の違い）と判断。

| Cluster | Layers | X range | Y range |
|---|---|---|---|
| A | 1m/5m 等高線, `구역계` 境界 | 243344–243928 | 280869–281309 |
| B | 測量点 `9-지형-POINT`, 標高文字 `9-지형-ELEv`, `1-측량범위` | 241191–241886 | 277813–278438 |

**影響:** (1) 変換の忠実性・可逆性のため全データに**単一原点**を適用する。(2) 確認用TINは等高線のみから生成し、~3.7 km離れた測量点は混在させない（不自然な三角形を回避）。

## レイヤー別エンティティ数 (主要) / Entity inventory (focus)

| layer | entities |
|---|---|
| `9-지형-등고선-1m` | {'POLYLINE': 58, 'LWPOLYLINE': 153, 'ARC': 4} |
| `9-지형-등고선-5m` | {'LWPOLYLINE': 33, 'TEXT': 29, 'ARC': 4, 'POLYLINE': 10} |
| `9-지형-POINT` | {'POINT': 1484} |
| `9-지형-ELEv` | {'TEXT': 3245} |
| `1-측량범위` | {'LINE': 22} |
| `구역계` | {'LWPOLYLINE': 2} |
| `9-지형-도곽` | {'LWPOLYLINE': 15, 'TEXT': 13} |
| `9-지형-변경도곽` | {'LINE': 22} |

## 標高 / Elevations

- 1m層の標高（採用）: [1.0, 2.0, 3.0, 4.0, 6.0, 7.0, 8.0, 9.0, 11.0, 12.0, 13.0, 14.0, 16.0, 17.0, 18.0, 19.0, 21.0, 22.0, 23.0, 24.0, 26.0, 27.0, 28.0, 29.0, 31.0, 32.0, 33.0, 34.0, 36.0, 37.0, 38.0, 39.0, 41.0, 42.0, 43.0, 44.0, 46.0, 47.0, 48.0, 49.0, 51.0, 52.0, 53.0, 54.0, 56.0, 57.0, 58.0, 59.0, 61.0, 62.0, 63.0, 64.0, 66.0, 67.0, 68.0]
- 5m層の標高（補助）: [0.0, 5.0, 10.0, 15.0, 20.0, 25.0, 30.0, 35.0, 40.0, 45.0, 50.0, 55.0, 60.0, 65.0]
- **相補関係**: 1m層は5の倍数を含まない中間等高線、5m層は5の倍数の主曲線。両者を合わせると1m間隔の完全なモデルになり、二重使用は発生しない。
- 1m/5m 標高の重複（二重使用の可能性）: []（空＝二重使用なし）

## クリーニング結果 / Cleaning

- exact_duplicates_removed_1m: 0
- exact_duplicates_removed_5m: 0
- short_fragments_separated_1m: 0
- short_fragments_separated_5m: 0
- endpoint_joins_1m: 14
- endpoint_joins_5m: 6
- self_intersecting_contours: 2
- same_elevation_crossings: 0
- join_tolerance_m: 0.02

## 未解決の等高線 / Unresolved contours

合計 7 本を `unresolved_contours.dxf` / `TERRAIN_UNRESOLVED` レイヤーへ分離。主因:
- 1m層で `elevation==0`（4×LWPOLYLINE + 3×ARC）: 0は5m主曲線の標高であり1m層に本来存在しないため、真の0m等高線か未設定かを判別不能 → 標高を推測せず分離。
- 長さ<0.05 m の断片。

| handle | type | elev | note |
|---|---|---|---|
| F250B | LWPOLYLINE | 0.0 | elevation==0 on 1m layer (ambiguous: 5m-major level absent here, likely unset) -> not guessed |
| F26ED | LWPOLYLINE | 0.0 | elevation==0 on 1m layer (ambiguous: 5m-major level absent here, likely unset) -> not guessed |
| F26F2 | LWPOLYLINE | 0.0 | elevation==0 on 1m layer (ambiguous: 5m-major level absent here, likely unset) -> not guessed |
| F486F | ARC | 0.0 | elevation==0 on 1m layer (ambiguous: 5m-major level absent here, likely unset) -> not guessed |
| F4FD4 | ARC | 0.0 | elevation==0 on 1m layer (ambiguous: 5m-major level absent here, likely unset) -> not guessed |
| F5243 | LWPOLYLINE | 0.0 | elevation==0 on 1m layer (ambiguous: 5m-major level absent here, likely unset) -> not guessed |
| F5244 | ARC | 0.0 | elevation==0 on 1m layer (ambiguous: 5m-major level absent here, likely unset) -> not guessed |

## 境界候補 / Boundary candidates

| layer | src | area (m²) | valid | simple | contour verts inside | survey pts inside |
|---|---|---|---|---|---|---|
| `구역계` | LWPOLYLINE EC597 | 82757.4 | True | True | 13635 | 0 |

**採用境界 / adopted:** {'layer': '구역계', 'area_m2': 82757.4, 'contour_verts_inside': 13635}
`구역계`（閉じた有効ポリゴン、面積約82,757 m²、等高線本体を内包）を敷地境界として採用。重複コピーは除去。`1-측량범위` は測量点クラスタ(B)側の範囲であり別クラスタ。

**除外した図面枠 / excluded drawing frames (도곽):** これらは座標グリッド/図面枠であり境界ではない。
| layer | kind | cells | typical cell area (m²) | bbox |
|---|---|---|---|---|
| `9-지형-변경도곽` | coordinate grid / drawing frame | 95 | 10000.0 | [241000.0, 277400.0, 241900.0, 278500.0] |

## 座標変換 / Coordinate transform

- 原点決定根拠: adopted site boundary (구역계) bbox lower-left
- origin = (243410.956, 280910.803, 0.000)
- local = original − origin（Z標高は不変）
- 逆変換: original = local + origin
- global bbox: {'min_x': 241192.24, 'min_y': 277832.908, 'min_z': -0.209, 'max_x': 243928.126, 'max_y': 281309.186, 'max_z': 68.217}
- local bbox: {'min_x': -2218.716, 'min_y': -3077.894, 'min_z': -0.209, 'max_x': 517.171, 'max_y': 398.383, 'max_z': 68.217}
- 完全な情報は `coordinate_transform.json` に保存（元座標へ完全復元可能）。

## TIN（確認用）/ Confirmation TIN

- status: ok
- n_vertices: 13838
- n_faces: 26527
- median_edge_m: 1.31
- max_edge_m: 10.0
- clipped_to_boundary: True
- survey_points_used: False
- note: Survey points are in a spatially disjoint cluster (~2.15 km W / ~3.04 km S of the contours) and are excluded from the TIN to avoid nonsensical geometry.

## 標高文字の照合 / ELEv text check

- n_numeric: 3245
- min: -0.31
- max: 68.22
- note: TEXT values used only to sanity-check the elevation range; text insertion Z is NOT used as ground elevation.

## 検証結果 / Validation

| metric | value |
|---|---|
| all_contour_vertices_have_Z | True |
| Z_constant_within_each_contour | True |
| count_contours_1m | 194 |
| count_contours_5m_supplement | 41 |
| count_contours_total | 235 |
| total_contour_vertices | 31926 |
| count_survey_points | 1484 |
| count_survey_point_outliers | 19 |
| exact_duplicates_removed | 0 |
| short_fragments_separated | 0 |
| endpoint_joins | 20 |
| unresolved_contours | 7 |
| self_intersecting_contours | 2 |
| same_elevation_crossings | 0 |
| elevation_min_m | 0.0 |
| elevation_max_m | 68.0 |
| contour_1m_double_use_overlap | 0 |
| contour_1m_non_integer_elevations | 0 |
| contour_5m_non_multiple_of_5_elevations | 0 |
| reversibility_max_xy_residual_m | 0.0 |
| z_local_equals_global | True |
| survey_points_inside_boundary | 0 |
| survey_points_outside_boundary | 1484 |
| local_origin_x | 243410.9555850938 |
| local_origin_y | 280910.8027183441 |
| tin_faces | 26527 |
| tin_status | ok |

自己交差した等高線 (最大50件表示): [('F0998', 21.0, '1M'), ('F277F+F55A3', 17.0, '1M')]
