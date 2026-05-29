// 距離計算とモック移動コスト推定
import type { TravelMode } from "@/types";

export interface LatLng {
  lat: number;
  lng: number;
}

/** 2点間の直線距離（km）ハバーサイン公式 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export interface Estimate {
  durationMin: number;
  cost: number;
  distanceKm: number;
  mode: TravelMode;
}

/**
 * Google APIキーが無い場合の移動推定。
 * 直線距離をもとに徒歩 / 公共交通を判定し所要時間と運賃を概算する。
 */
export function estimateLeg(a: LatLng, b: LatLng): Estimate {
  const straight = haversineKm(a, b);
  // 実移動は直線の約1.3倍とみなす
  const distanceKm = straight * 1.3;

  if (distanceKm < 1.2) {
    // 徒歩: 約12分/km、無料
    return {
      distanceKm,
      durationMin: Math.round(distanceKm * 12) + 1,
      cost: 0,
      mode: "walking",
    };
  }

  // 公共交通: 表定速度 ~28km/h + 乗換・待ち 12分、運賃は距離比例で下限あり
  const durationMin = Math.round((distanceKm / 28) * 60) + 12;
  const cost = Math.max(150, Math.round((distanceKm * 22) / 10) * 10);
  return { distanceKm, durationMin, cost, mode: "transit" };
}
