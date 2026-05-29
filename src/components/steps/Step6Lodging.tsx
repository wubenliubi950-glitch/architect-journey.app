"use client";

import { useState } from "react";
import { getArchitectures } from "@/lib/architectures";
import { fetchHotels } from "@/lib/api";
import { Badge, Card, Spinner, StepTitle } from "@/components/ui";
import { yen } from "@/lib/format";
import { nightsFromItinerary } from "@/lib/budget";
import { useTripStore } from "@/store/tripStore";
import type { Hotel } from "@/types";

const BUDGETS = [8000, 12000, 20000, 35000];

export function Step6Lodging() {
  const store = useTripStore();
  const { lodging, setLodgingType, setFriendAddress, selectHotel, hotelBudget, setHotelBudget } = store;
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState("");

  const nights = nightsFromItinerary(store.itinerary);

  const search = async (budget: number) => {
    setHotelBudget(budget);
    setLoading(true);
    try {
      const spots = getArchitectures(store.selectedSpotIds);
      const lat = spots.reduce((s, a) => s + a.lat, 0) / Math.max(1, spots.length);
      const lng = spots.reduce((s, a) => s + a.lng, 0) / Math.max(1, spots.length);
      const checkIn = (store.departAt || "").slice(0, 10);
      const checkOut = (store.returnAt || "").slice(0, 10);
      const res = await fetchHotels({ lat, lng, checkIn, checkOut, budget });
      setHotels(res.hotels);
      setProvider(res.provider);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <StepTitle
        step={6}
        title="宿泊先を決める"
        subtitle={nights > 0 ? `${nights}泊の予定です。` : "日帰りの予定です。"}
      />

      <div className="mb-5 grid grid-cols-2 gap-3">
        <button
          onClick={() => setLodgingType("hotel")}
          className={`rounded-2xl border p-4 text-left ${
            lodging.type === "hotel" ? "border-amber-500 bg-amber-50 ring-2 ring-amber-200" : "border-stone-200 bg-white"
          }`}
        >
          <div className="text-base font-bold">🏨 ホテル</div>
          <div className="mt-1 text-xs text-stone-500">予算別に候補を提案</div>
        </button>
        <button
          onClick={() => setLodgingType("friend")}
          className={`rounded-2xl border p-4 text-left ${
            lodging.type === "friend" ? "border-amber-500 bg-amber-50 ring-2 ring-amber-200" : "border-stone-200 bg-white"
          }`}
        >
          <div className="text-base font-bold">🏠 知人宅</div>
          <div className="mt-1 text-xs text-stone-500">住所を入力（宿泊費0円）</div>
        </button>
      </div>

      {lodging.type === "friend" ? (
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">滞在先の住所</label>
          <input
            value={lodging.address ?? ""}
            onChange={(e) => setFriendAddress(e.target.value)}
            placeholder="例: 東京都新宿区西新宿2-8-1"
            className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
          />
        </div>
      ) : (
        <>
          <div className="mb-3">
            <div className="mb-2 text-sm font-medium text-stone-700">1泊あたりの予算</div>
            <div className="grid grid-cols-4 gap-2">
              {BUDGETS.map((b) => (
                <button
                  key={b}
                  onClick={() => search(b)}
                  className={`rounded-xl border px-2 py-2 text-sm font-semibold ${
                    hotelBudget === b ? "border-amber-500 bg-amber-50" : "border-stone-200 bg-white"
                  }`}
                >
                  〜{(b / 1000).toFixed(0)}千
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <Spinner label="ホテルを検索中…" />
          ) : hotels.length > 0 ? (
            <div className="space-y-3">
              <div className="text-xs text-stone-400">提供: {provider}</div>
              {hotels.map((h) => {
                const selected = lodging.selectedHotel?.id === h.id;
                return (
                  <Card key={h.id} selected={selected} onClick={() => selectHotel(h)}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-bold text-stone-900">{h.name}</div>
                        <div className="mt-0.5 truncate text-xs text-stone-500">{h.address}</div>
                        <div className="mt-1.5 flex items-center gap-2">
                          {h.rating && <Badge tone="amber">★ {h.rating.toFixed(1)}</Badge>}
                          {nights > 0 && <Badge>{nights}泊計 {yen(h.pricePerNight * nights)}</Badge>}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-lg font-bold text-stone-900">{yen(h.pricePerNight)}</div>
                        <div className="text-xs text-stone-400">/泊</div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-stone-400">予算を選ぶと候補が表示されます。</p>
          )}
        </>
      )}
    </div>
  );
}
