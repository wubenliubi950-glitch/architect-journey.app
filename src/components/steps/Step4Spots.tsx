"use client";

import { byPrefectures } from "@/lib/architectures";
import { Badge, Card, StepTitle } from "@/components/ui";
import { minutes, yen } from "@/lib/format";
import { useTripStore } from "@/store/tripStore";
import type { Admission } from "@/types";

const admissionLabel: Record<Admission, string> = {
  free: "無料",
  paid: "有料",
  exterior: "外観のみ",
};

export function Step4Spots() {
  const { prefectures, selectedSpotIds, toggleSpot } = useTripStore();
  const spots = byPrefectures(prefectures);

  return (
    <div>
      <StepTitle
        step={4}
        title="見たい建築を選ぶ"
        subtitle={`${spots.length}件から選択中 ${selectedSpotIds.length}件`}
      />
      <div className="space-y-3">
        {spots.map((a) => {
          const selected = selectedSpotIds.includes(a.id);
          return (
            <Card key={a.id} selected={selected} onClick={() => toggleSpot(a.id)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-stone-900">{a.name}</div>
                  <div className="mt-0.5 text-xs text-stone-500">
                    {a.architect}・{a.year}年・{a.prefecture}
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-stone-600">{a.description}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge tone={a.admission === "free" ? "green" : "stone"}>
                      {admissionLabel[a.admission]}
                      {a.admission === "paid" && a.fee ? ` ${yen(a.fee)}` : ""}
                    </Badge>
                    <Badge>滞在 {minutes(a.defaultStayMin)}</Badge>
                  </div>
                </div>
                <div
                  className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                    selected ? "border-amber-500 bg-amber-500 text-white" : "border-stone-300"
                  }`}
                >
                  {selected && <span className="text-sm">✓</span>}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
