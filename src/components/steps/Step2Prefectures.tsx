"use client";

import { availablePrefectures, byPrefectures } from "@/lib/architectures";
import { StepTitle } from "@/components/ui";
import { useTripStore } from "@/store/tripStore";

export function Step2Prefectures() {
  const { prefectures, togglePrefecture } = useTripStore();

  return (
    <div>
      <StepTitle
        step={2}
        title="行きたい都道府県"
        subtitle="複数選択できます。選んだ県の名建築から旅程を組みます。"
      />
      <div className="grid grid-cols-2 gap-3">
        {availablePrefectures.map((p) => {
          const count = byPrefectures([p]).length;
          const active = prefectures.includes(p);
          return (
            <button
              key={p}
              onClick={() => togglePrefecture(p)}
              className={`rounded-2xl border p-4 text-left transition active:scale-[0.98] ${
                active
                  ? "border-amber-500 bg-amber-50 ring-2 ring-amber-200"
                  : "border-stone-200 bg-white"
              }`}
            >
              <div className="text-lg font-bold text-stone-900">{p}</div>
              <div className="mt-1 text-xs text-stone-500">{count}件の建築</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
