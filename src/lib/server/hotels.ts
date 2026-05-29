// ホテル検索 Provider（差し替え可能設計）
// 現状: 楽天トラベル。後で Agoda / Booking Provider を追加可能。
import type { Hotel } from "@/types";
import { config, isMockRakuten } from "@/lib/server/config";

export interface HotelQuery {
  lat: number;
  lng: number;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  budget: number; // 1泊あたり予算上限
}

export interface HotelProvider {
  readonly name: string;
  search(q: HotelQuery): Promise<Hotel[]>;
}

// --- 楽天トラベル空室検索 ---
class RakutenProvider implements HotelProvider {
  readonly name = "rakuten";

  async search(q: HotelQuery): Promise<Hotel[]> {
    const url = new URL(
      "https://app.rakuten.co.jp/services/api/Travel/VacantHotelSearch/20170426",
    );
    url.searchParams.set("applicationId", config.rakutenAppId);
    url.searchParams.set("format", "json");
    url.searchParams.set("latitude", String(q.lat));
    url.searchParams.set("longitude", String(q.lng));
    url.searchParams.set("datumType", "1"); // WGS84
    url.searchParams.set("searchRadius", "3");
    url.searchParams.set("checkinDate", q.checkIn);
    url.searchParams.set("checkoutDate", q.checkOut);
    url.searchParams.set("maxCharge", String(q.budget));
    url.searchParams.set("hits", "10");
    url.searchParams.set("sort", "+roomCharge");

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    const hotels: Hotel[] = (data.hotels ?? []).map(
      (h: { hotel: { hotelBasicInfo?: Record<string, unknown> }[] }) => {
        const basic = (h.hotel?.[0]?.hotelBasicInfo ?? {}) as Record<string, unknown>;
        return {
          id: `rakuten-${basic.hotelNo}`,
          name: String(basic.hotelName ?? ""),
          pricePerNight: Number(basic.hotelMinCharge ?? 0),
          rating: basic.reviewAverage ? Number(basic.reviewAverage) : undefined,
          address: `${basic.address1 ?? ""}${basic.address2 ?? ""}`,
          lat: basic.latitude ? Number(basic.latitude) : undefined,
          lng: basic.longitude ? Number(basic.longitude) : undefined,
          thumbnailUrl: basic.hotelThumbnailUrl ? String(basic.hotelThumbnailUrl) : undefined,
          bookingUrl: basic.hotelInformationUrl ? String(basic.hotelInformationUrl) : undefined,
          provider: this.name,
        };
      },
    );
    return pickThree(hotels.filter((h) => h.pricePerNight > 0));
  }
}

// --- モック Provider ---
class MockHotelProvider implements HotelProvider {
  readonly name = "mock";

  async search(q: HotelQuery): Promise<Hotel[]> {
    const tiers = [0.6, 0.85, 1.1];
    const names = ["コンフォートステイ", "シティホテル中央", "プレミアイン"];
    return tiers.map((t, i) => ({
      id: `mock-hotel-${i}`,
      name: `${names[i]}（駅近）`,
      pricePerNight: Math.round((q.budget * t) / 100) * 100,
      rating: 3.6 + i * 0.4,
      address: "中心部エリア",
      lat: q.lat + (i - 1) * 0.004,
      lng: q.lng + (i - 1) * 0.004,
      provider: this.name,
    }));
  }
}

/** 予算帯がばらけるよう安い/中間/高めの3件を選ぶ */
function pickThree(hotels: Hotel[]): Hotel[] {
  if (hotels.length <= 3) return hotels;
  const sorted = [...hotels].sort((a, b) => a.pricePerNight - b.pricePerNight);
  return [sorted[0], sorted[Math.floor(sorted.length / 2)], sorted[sorted.length - 1]];
}

export function getHotelProvider(): HotelProvider {
  return isMockRakuten() ? new MockHotelProvider() : new RakutenProvider();
}
