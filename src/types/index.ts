// 建築巡り旅程プランナー — 共通データモデル

export type Category =
  | "museum"
  | "church"
  | "house"
  | "commercial"
  | "public"
  | "religious"
  | "station"
  | "other";

/** 拝観可否: 無料 / 有料 / 外観のみ */
export type Admission = "free" | "paid" | "exterior";

export interface Architecture {
  id: string;
  name: string;
  nameEn?: string;
  prefecture: string; // 例: "東京都"
  address: string;
  lat: number;
  lng: number;
  architect: string;
  year: number;
  category: Category;
  admission: Admission;
  /** 拝観料（円）。無料/外観のみは省略 */
  fee?: number;
  /** 想定滞在時間（分） */
  defaultStayMin: number;
  openingHours?: string;
  googlePlaceId?: string;
  description: string;
  imageUrl?: string;
}

export interface Origin {
  station: string;
  airport: string;
  /** 旅程の起点として使う座標（最寄り駅の位置） */
  lat?: number;
  lng?: number;
}

/** Places オートコンプリート候補 */
export interface PlaceSuggestion {
  description: string;
  placeId: string;
}

/** Places 詳細（座標解決後） */
export interface PlaceDetails {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export type TravelMode = "transit" | "walking" | "driving";

/** 区間の移動情報 */
export interface Leg {
  fromId: string; // スポットid または "origin" / "hotel"
  toId: string;
  mode: TravelMode;
  durationMin: number;
  cost: number; // 円
  distanceKm: number;
}

export interface ItineraryStop {
  spotId: string;
  arriveAt: string; // ISO
  departAt: string; // ISO
  stayMin: number;
  legToHere: Leg; // この地点に来るまでの移動
}

export interface ItineraryDay {
  date: string; // YYYY-MM-DD
  stops: ItineraryStop[];
}

export interface Hotel {
  id: string;
  name: string;
  pricePerNight: number; // 1泊あたり円
  rating?: number;
  address: string;
  lat?: number;
  lng?: number;
  thumbnailUrl?: string;
  bookingUrl?: string;
  provider: string; // "rakuten" | "agoda" | ...
}

export type LodgingType = "hotel" | "friend";

export interface Lodging {
  type: LodgingType;
  address?: string; // 知人宅の住所
  selectedHotel?: Hotel;
}

export interface Budget {
  transport: number;
  lodging: number;
  admission: number;
  total: number;
}

/** N+1 x N+1 の移動コスト行列（index 0 = origin, 1.. = spots の順） */
export interface RouteMatrix {
  ids: string[]; // 行/列に対応するid列（"origin" を含む）
  duration: number[][]; // 分
  cost: number[][]; // 円
  distance: number[][]; // km
  mode: TravelMode[][];
}

/** AIチャットによる調整内容 */
export interface Adjustments {
  /** スポットごとの滞在時間上書き（分） */
  stayOverrides?: Record<string, number>;
  /** 除外するスポットid */
  removeSpotIds?: string[];
  /** アシスタントの説明文 */
  note?: string;
}
