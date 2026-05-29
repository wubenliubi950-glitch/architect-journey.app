"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { TOTAL_STEPS, useTripStore } from "@/store/tripStore";
import { Step1Origin } from "@/components/steps/Step1Origin";
import { Step2Prefectures } from "@/components/steps/Step2Prefectures";
import { Step3Dates } from "@/components/steps/Step3Dates";
import { Step4Spots } from "@/components/steps/Step4Spots";
import { Step5Route } from "@/components/steps/Step5Route";
import { Step6Lodging } from "@/components/steps/Step6Lodging";
import { Step7Chat } from "@/components/steps/Step7Chat";
import { Step8Summary } from "@/components/steps/Step8Summary";

const STEPS = [
  Step1Origin,
  Step2Prefectures,
  Step3Dates,
  Step4Spots,
  Step5Route,
  Step6Lodging,
  Step7Chat,
  Step8Summary,
];

export function Wizard() {
  const store = useTripStore();
  const [mounted, setMounted] = useState(false);
  // ハイドレーション境界: マウント後に1度だけ表示を有効化する
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="flex flex-1 items-center justify-center text-stone-400">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
      </div>
    );
  }

  const { step } = store;
  const Current = STEPS[step];

  const canProceed = (): boolean => {
    switch (step) {
      case 0:
        return store.origin.station.trim().length > 0;
      case 1:
        return store.prefectures.length > 0;
      case 2:
        return (
          !!store.departAt &&
          !!store.returnAt &&
          new Date(store.returnAt) >= new Date(store.departAt)
        );
      case 3:
        return store.selectedSpotIds.length > 0;
      case 4:
        return store.itinerary.length > 0;
      case 5:
        return store.lodging.type === "friend"
          ? !!store.lodging.address?.trim()
          : !!store.lodging.selectedHotel;
      default:
        return true;
    }
  };

  return (
    <div className="flex min-h-dvh flex-col">
      {/* ヘッダー */}
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-100/90 px-5 pb-3 pt-4 backdrop-blur">
        <div className="mx-auto max-w-md">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-stone-800">建築巡り</span>
            <span className="text-xs text-stone-400">
              {step + 1} / {TOTAL_STEPS}
            </span>
          </div>
          <div className="mt-2 flex gap-1">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-amber-500" : "bg-stone-200"}`}
              />
            ))}
          </div>
        </div>
      </header>

      {/* 本文 */}
      <main className="flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto max-w-md">
          <Current />
        </div>
      </main>

      {/* フッターナビ */}
      <footer className="sticky bottom-0 border-t border-stone-200 bg-stone-100/90 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3">
          {step > 0 && (
            <Button variant="secondary" onClick={store.prev}>
              戻る
            </Button>
          )}
          {step < TOTAL_STEPS - 1 ? (
            <div className="flex-1">
              <Button full onClick={store.next} disabled={!canProceed()}>
                次へ
              </Button>
            </div>
          ) : (
            <div className="flex-1">
              <Button
                full
                variant="secondary"
                onClick={() => {
                  if (confirm("プランを破棄して最初からやり直しますか？")) store.reset();
                }}
              >
                最初からやり直す
              </Button>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
