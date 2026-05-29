# 建築巡り | Architect Journey

建築学生・建築観光者のための旅程プランナー。行きたい都道府県と見たい名建築を選ぶだけで、
**最適な訪問順・交通費・滞在時間・宿泊候補・総予算**を自動算出し、AIチャットで微調整して、
最終スケジュールをビジュアルに表示します。スマホ最優先の PWA です。

## 機能（8ステップ・ウィザード）

1. 出発地登録（最寄り駅・空港 / Places オートコンプリート）
2. 都道府県選択（複数可）
3. 出発・帰宅の日時
4. 名建築の選択（設計者・竣工年・拝観可否つき）
5. 最適ルート＆交通費（最近傍法＋2-opt で訪問順を自動最適化、日割り）
6. 宿泊（ホテル予算別3候補 / 知人宅住所）
7. AIチャットで微調整（Claude）
8. 最終スケジュール＋予算内訳のビジュアル表示

旅程はブラウザ（localStorage）に保存され、再訪時に復元されます。

## 技術スタック

- Next.js 16 (App Router) + TypeScript / Tailwind CSS v4
- 状態管理: Zustand（persist）
- 外部API（すべてサーバー側 Route Handler 経由でキーを秘匿）
  - Google Maps Platform（Places / Distance Matrix）
  - 楽天トラベル 空室検索API（`HotelProvider` 抽象により Agoda / Booking を後追加可能）
  - Anthropic Claude API（プロンプトキャッシュ有効）

## セットアップ

```bash
npm install
cp .env.example .env.local   # キーを設定。未設定なら USE_MOCK=1 で全機能をモック動作
npm run dev
```

### 環境変数

| 変数 | 用途 |
| --- | --- |
| `GOOGLE_MAPS_SERVER_KEY` | サーバー側 Places / Distance Matrix |
| `NEXT_PUBLIC_GOOGLE_MAPS_JS_KEY` | 地図表示（リファラ制限必須） |
| `RAKUTEN_APP_ID` | 楽天トラベル空室検索 |
| `ANTHROPIC_API_KEY` | AIチャット調整 |
| `USE_MOCK` | `1` で全外部APIを強制モック（キー無しで全フロー動作確認可） |

キーが未設定の項目は自動的にモック応答へフォールバックします。

## 開発コマンド

```bash
npm run dev     # 開発サーバー
npm run build   # 本番ビルド
npm run lint    # ESLint
npm run test    # ルート最適化の単体テスト（vitest）
```

## ディレクトリ構成（要点）

```
src/
  app/api/            外部APIプロキシ（places / routes / hotels / chat）
  components/         ウィザードUI（steps/ 配下に各ステップ）
  data/architectures.json  名建築キュレーションDB
  lib/
    optimize.ts       ルート最適化（最近傍法＋2-opt＋日割り）
    geo.ts            距離計算・モック移動推定
    budget.ts         予算計算
    planner.ts        行列取得＋最適化のクライアント統合
    server/           Google / 楽天 / 設定（サーバー専用）
  store/tripStore.ts  Zustand ストア（localStorage 永続化）
  types/              共通データモデル
```
