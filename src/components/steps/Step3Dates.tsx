"use client";

import { StepTitle } from "@/components/ui";
import { useTripStore } from "@/store/tripStore";

export function Step3Dates() {
  const { departAt, returnAt, setDates } = useTripStore();

  return (
    <div>
      <StepTitle
        step={3}
        title="出発・帰宅の日時"
        subtitle="観光は各日 9:00〜19:00 を目安に、初日と最終日はこの時刻で調整します。"
      />
      <div className="space-y-5">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">出発日時</label>
          <input
            type="datetime-local"
            value={departAt}
            onChange={(e) => setDates(e.target.value, returnAt)}
            className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">帰宅日時</label>
          <input
            type="datetime-local"
            value={returnAt}
            onChange={(e) => setDates(departAt, e.target.value)}
            className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
          />
        </div>
      </div>
    </div>
  );
}
