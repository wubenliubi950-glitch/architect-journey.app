# 地形DXF → Rhino 3D地形変換 / Terrain DXF → Rhino conversion

測量DXF（`04. Site boundary.dxf`, AutoCAD 2018）を解析し、Rhinoで山の地形
（`Patch` / `MeshPatch` / `Drape` / TIN）を作成するための、標高付き3D等高線・
測量点・境界・座標変換・確認用TINへ変換します。**元ファイルは一切変更しません。**

This pipeline parses a survey DXF and produces clean, elevation-tagged 3D
contours, spot-point CSVs, a site boundary, a coordinate transform, and a
confirmation TIN mesh, ready for terrain modelling in Rhino. The original input
file is never modified — every result is a new file.

---

## 1. インストール / Installation

```bash
cd terrain
python3 -m venv venv
source venv/bin/activate            # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

依存 / dependencies: `ezdxf`, `numpy`, `shapely`, `scipy`, `pandas`.
（`matplotlib` はプレビュー画像 `output/preview_terrain.png` を作った任意ツールで、処理には不要）

> 入力がDWGの場合 / If the input were DWG: ezdxf は DWG を直接読めません。
> ODA File Converter などで DWG→DXF(R2013 ASCII) に変換してから実行してください。
> 本タスクの入力は DXF なのでそのまま処理します。

## 2. 実行 / Run

```bash
python process_terrain.py --input "input/04. Site boundary.dxf" --outdir output
```

- `--input`  入力DXFのパス（既定 `input/04. Site boundary.dxf`）
- `--outdir` 出力先フォルダ（既定 `output`）

エラーが起きても全体は停止せず、問題のエンティティは `TERRAIN_UNRESOLVED` /
`unresolved_contours.dxf` に分離して処理を続けます。

## 3. 出力ファイル / Output files (`output/`)

| ファイル | 内容 |
|---|---|
| `terrain_contours_global_3d.dxf` | 全1m等高線（+5m補助・境界・測量点・未解決）。**元の測量座標** |
| `terrain_contours_local_3d.dxf` | 同上を **ローカル座標**（原点付近）に移動した版 |
| `terrain_contours_clipped_global_3d.dxf` | 採用境界でクリップした等高線（グローバル） |
| `terrain_contours_clipped_local_3d.dxf` | 採用境界でクリップした等高線（ローカル） |
| `terrain_boundary_global.dxf` / `_local.dxf` | 採用した敷地境界（`구역계`） |
| `boundary_candidates.dxf` | 境界候補（図面枠グリッドは除外済み） |
| `unresolved_contours.dxf` | 標高が確定できなかった線（推測せず分離） |
| `terrain_spot_points_global.csv` | 測量点（元座標 + ローカル座標 + `is_outlier`） |
| `terrain_spot_points_local.csv` | 測量点（ローカル座標中心） |
| `coordinate_transform.json` | 座標変換情報（完全に元へ戻せる） |
| `terrain_tin_local.obj` / `terrain_tin_local.dxf` | 確認用TIN地形メッシュ（ローカル座標） |
| `terrain_analysis.md` | 解析・判断・検証レポート |
| `terrain_validation.csv` | 検証項目と結果 |
| `preview_terrain.png` | 目視確認用プレビュー（任意） |

各DXFには次のレイヤーを作成します:
`TERRAIN_CONTOUR_1M`, `TERRAIN_CONTOUR_5M_SUPPLEMENT`, `TERRAIN_SPOT_POINTS`,
`TERRAIN_BOUNDARY`, `TERRAIN_UNRESOLVED`。DXFは Rhino 互換の **AutoCAD R2013 ASCII**。

## 4. データについて重要な発見 / Key data findings

- **単位はメートル**（INSUNITS=6）。DXF は R2018（UTF-8）で、ヘッダの
  `DWGCODEPAGE=ANSI_932` は実データと不一致だが、ezdxf が正しく韓国語を復号し
  レイヤー名を保持。
- **1m層と5m層は相補的**: 1m層は5の倍数を含まない中間等高線、5m層は5の倍数の
  主曲線。両者を合わせて初めて 0〜68 m の完全な1m間隔になる（二重使用なし）。
- **等高線と測量点は別々のXY位置にある**（同一標高帯だが約 2.15 km 西 / 3.04 km
  南に離れた2クラスタ）。忠実性・可逆性のため全データに **単一原点** を適用。
  確認用TINは等高線のみから作成（遠く離れた測量点は混在させない）。
- 1m層の `elevation==0`（4×LWPOLYLINE + 3×ARC）は標高が確定できないため
  推測せず `TERRAIN_UNRESOLVED` に分離。詳細は `terrain_analysis.md`。

## 5. 座標変換の戻し方 / Reversing the coordinate transform

`coordinate_transform.json` に原点とオフセットが入っています。

```
local_x = original_x - origin_x
local_y = original_y - origin_y
local_z = original_z                     # Z標高は変更しない

original_x = local_x + origin_x          # ← 元へ戻す
original_y = local_y + origin_y
original_z = local_z
```

例（本データ）: `origin = (243410.9556, 280910.8027, 0)`。
Rhinoでローカル版を作業後にグローバル座標へ戻すには、モデル全体を
`(+origin_x, +origin_y, 0)` だけ移動（Rhino `Move`）します。CSVには
`original_*` と `local_*` の両方が入っているので突き合わせ可能です。

## 6. Rhinoへの読み込み / Importing into Rhino

1. Rhinoの単位を **メートル** に設定（`Options > Units > Model units = Meters`）。
2. `File > Import` で `terrain_contours_local_3d.dxf` を読み込む
   （大きな測量座標を避けるためローカル版を推奨）。
3. インポート時、DXFの単位をメートルとして読み込む。
4. レイヤーで `TERRAIN_CONTOUR_1M`（+必要なら `TERRAIN_CONTOUR_5M_SUPPLEMENT`）
   を表示、`TERRAIN_SPOT_POINTS` は必要に応じて表示（測量点は別クラスタ位置）。

## 7. Rhinoでの推奨地形作成手順 / Recommended terrain workflow

1. Rhinoの単位を **メートル** に設定する。
2. `terrain_contours_local_3d.dxf` を読み込む。
3. 等高線のZ値を確認する（`What` / `List`、または `_Elevation`）。1本の等高線内で
   Zが一定・整数mであることを確認。
4. `Rebuild` は使わず、**元曲線をそのまま保持**する（形状を改変しない）。
5. `Patch` または `MeshPatch` で地形サーフェス／メッシュを作成する。
   （`Drape` を使う場合は上面からの投影で作成）
6. `terrain_boundary_local.dxf` の境界線を使って `Split` / `Trim` し、
   敷地内に地形を限定する。あるいは最初から `..._clipped_local_3d.dxf` を使う。
7. 必要に応じて測量点（`TERRAIN_SPOT_POINTS`）を地形生成に追加する
   （※測量点は等高線と別位置にあるため、統合する場合は座標整合を確認）。
8. 確認用に `terrain_tin_local.dxf`（TINメッシュ）を重ねて形状を検証できる。
9. 作業完了後、必要ならモデルを `(+origin_x, +origin_y, 0)` 移動して
   元の測量座標へ戻す（§5）。

## 8. 再現性 / Reproducibility

`process_terrain.py` は決定論的で、同じ入力から同じ出力を再生成します。
主なパラメータ（スクリプト冒頭の定数）:

- `ARC_SAGITTA = 0.01 m` … 円弧/バルジのフラット化許容誤差（< 0.05 m）
- `JOIN_TOL = 0.02 m` … 端点結合の許容値（初期値。変更時はレポートに記録）
- `SHORT_LEN = 0.05 m` … これ未満の断片を分離
- `OUTLIER_SIGMA = 3.5` … 測量点Zのロバスト外れ値判定（MAD基準、削除はしない）
