"use client";

import { useCallback, useEffect, useState } from "react";
import { getArchitecture } from "@/lib/architectures";
import { recomputeItinerary } from "@/lib/planner";
import { Badge, Button, Spinner, StepTitle } from "@/components/ui";
import { minutes, timeHM, dateLabel, yen } from "@/lib/format";
import { useTripStore } from "@/store/tripStore";
import type { TravelMode } from "@/types";

const modeLabel: Record<TravelMode, string> = {
  transit: "🚃 公共交通",
  walking: "🚶 徒歩",
  driving: "🚗 車",
};

export function Step5Route() {
  const store = useTripStore();
  const { itinerary, transportCost, unscheduledSpotIds, setItinerary } = store;
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const result = await recomputeItinerary({
        origin: store.origin,
        selectedSpotIds: store.selectedSpotIds,
        departAt: store.departAt,
        returnAt: store.returnAt,
        stayOverrides: store.stayOverrides,
      });
      setItinerary(result.days, result.transportCost, result.unscheduledSpotIds);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.origin, store.selectedSpotIds, store.departAt, store.returnAt, store.stayOverrides]);

  useEffect(() => {
    if (itinerary.length > 0) return;
    // setState を effect 内で同期実行しないよう次tickで起動
    const t = setTimeout(run, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <StepTitle
        step={5}
        title="最適ルートと交通費"
        subtitle="出発地を起点に、移動が最短になる順で自動最適化しました。"
      />

      {loading ? (
        <Spinner label="ルートを最適化しています…" />
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between rounded-2xl bg-stone-800 px-4 py-3 text-white">
            <span className="text-sm">交通費（概算）</span>
            <span className="text-xl font-bold">{yen(transportCost)}</span>
          </div>

          {unscheduledSpotIds.length > 0 && (
            <div className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              期間内に収まらなかった建築があります:{" "}
              {unscheduledSpotIds.map((id) => getArchitecture(id)?.name).filter(Boolean).join("、")}
              。日程を延ばすか建築を減らすと収まります。
            </div>
          )}

          <div className="space-y-6">
            {itinerary.map((day, di) => (
              <div key={day.date}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-full bg-stone-800 px-2.5 py-0.5 text-xs font-bold text-white">
                    Day {di + 1}
                  </span>
                  <span className="text-sm font-medium text-stone-600">{dateLabel(day.date)}</span>
                </div>
                <ol className="relative border-l-2 border-stone-200 pl-5">
                  {day.stops.map((stop) => {
                    const a = getArchitecture(stop.spotId);
                    if (!a) return null;
                    return (
                      <li key={stop.spotId} className="mb-5 last:mb-0">
                        <div className="mb-1 text-xs text-stone-400">
                          {modeLabel[stop.legToHere.mode]} {minutes(stop.legToHere.durationMin)}
                          {stop.legToHere.cost > 0 && ` ・ ${yen(stop.legToHere.cost)}`}
                        </div>
                        <div className="absolute -left-[7px] mt-1 h-3 w-3 rounded-full bg-amber-500" />
                        <div className="rounded-xl border border-stone-200 bg-white p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-stone-900">{a.name}</span>
                            <Badge tone="amber">
                              {timeHM(stop.arriveAt)}–{timeHM(stop.departAt)}
                            </Badge>
                          </div>
                          <div className="mt-1 text-xs text-stone-500">
                            滞在 {minutes(stop.stayMin)}・{a.architect}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <Button variant="secondary" full onClick={run}>
              ↻ ルートを再計算
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
