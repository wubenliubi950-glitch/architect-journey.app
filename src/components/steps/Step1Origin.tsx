"use client";

import { PlaceInput } from "@/components/PlaceInput";
import { StepTitle } from "@/components/ui";
import { useTripStore } from "@/store/tripStore";

export function Step1Origin() {
  const { origin, setOrigin } = useTripStore();

  return (
    <div>
      <StepTitle
        step={1}
        title="出発地を登録"
        subtitle="最寄り駅と利用する空港を入力してください。駅は旅程の起点になります。"
      />
      <div className="space-y-5">
        <PlaceInput
          label="最寄り駅"
          placeholder="例: 東京駅"
          value={origin.station}
          onSelect={(text, details) =>
            setOrigin({
              station: text,
              lat: details?.lat,
              lng: details?.lng,
            })
          }
        />
        <PlaceInput
          label="利用する空港"
          placeholder="例: 羽田空港"
          value={origin.airport}
          onSelect={(text) => setOrigin({ airport: text })}
        />
      </div>
    </div>
  );
}
