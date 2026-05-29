"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { getArchitecture } from "@/lib/architectures";
import { computeBudget, nightsFromItinerary } from "@/lib/budget";
import { Badge, StepTitle } from "@/components/ui";
import { dateLabel, minutes, timeHM, yen } from "@/lib/format";
import { useTripStore } from "@/store/tripStore";

const COLORS = ["#78716c", "#f59e0b", "#10b981"];

export function Step8Summary() {
  const store = useTripStore();
  const budget = computeBudget(store.itinerary, store.transportCost, store.lodging);
  const nights = nightsFromItinerary(store.itinerary);

  const chartData = [
    { name: "交通費", value: budget.transport },
    { name: "宿泊費", value: budget.lodging },
    { name: "拝観料", value: budget.admission },
  ].filter((d) => d.value > 0);

  return (
    <div>
      <StepTitle step={8} title="最終スケジュールと予算" subtitle="お疲れさまでした。これがあなたの建築巡りプランです。" />

      {/* 予算サマリ */}
      <div className="mb-5 rounded-2xl bg-stone-800 p-5 text-white">
        <div className="text-sm text-stone-300">総予算（概算）</div>
        <div className="mt-1 text-3xl font-bold">{yen(budget.total)}</div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-stone-700 py-2">
            <div className="text-stone-300">交通</div>
            <div className="mt-0.5 font-semibold">{yen(budget.transport)}</div>
          </div>
          <div className="rounded-lg bg-stone-700 py-2">
            <div className="text-stone-300">宿泊</div>
            <div className="mt-0.5 font-semibold">{yen(budget.lodging)}</div>
          </div>
          <div className="rounded-lg bg-stone-700 py-2">
            <div className="text-stone-300">拝観</div>
            <div className="mt-0.5 font-semibold">{yen(budget.admission)}</div>
          </div>
        </div>
      </div>

      {/* 内訳チャート */}
      {chartData.length > 0 && (
        <div className="mb-5 h-56 rounded-2xl bg-white p-3">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: unknown) => yen(Number(v))} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 宿泊情報 */}
      <div className="mb-5 rounded-2xl border border-stone-200 bg-white p-4">
        <div className="text-sm font-bold text-stone-900">宿泊</div>
        {store.lodging.type === "hotel" && store.lodging.selectedHotel ? (
          <div className="mt-1 text-sm text-stone-600">
            🏨 {store.lodging.selectedHotel.name}（{yen(store.lodging.selectedHotel.pricePerNight)}/泊 × {nights}泊）
          </div>
        ) : store.lodging.type === "friend" ? (
          <div className="mt-1 text-sm text-stone-600">🏠 知人宅：{store.lodging.address || "（住所未入力）"}</div>
        ) : (
          <div className="mt-1 text-sm text-stone-400">未選択</div>
        )}
      </div>

      {/* タイムライン */}
      <div className="space-y-6">
        {store.itinerary.map((day, di) => (
          <div key={day.date}>
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-bold text-white">Day {di + 1}</span>
              <span className="text-sm font-medium text-stone-600">{dateLabel(day.date)}</span>
            </div>
            <div className="space-y-2">
              {day.stops.map((stop) => {
                const a = getArchitecture(stop.spotId);
                if (!a) return null;
                return (
                  <div key={stop.spotId} className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-3">
                    <div className="shrink-0 text-center">
                      <div className="text-sm font-bold text-stone-900">{timeHM(stop.arriveAt)}</div>
                      <div className="text-[10px] text-stone-400">{timeHM(stop.departAt)}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-stone-900">{a.name}</div>
                      <div className="text-xs text-stone-500">{a.architect}・滞在 {minutes(stop.stayMin)}</div>
                    </div>
                    {a.admission === "paid" && a.fee ? <Badge>{yen(a.fee)}</Badge> : <Badge tone="green">無料</Badge>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
