"use client";

import { useState } from "react";
import { getArchitecture, getArchitectures } from "@/lib/architectures";
import { fetchChatAdjust } from "@/lib/api";
import { recomputeItinerary } from "@/lib/planner";
import { Button, Spinner, StepTitle } from "@/components/ui";
import { minutes } from "@/lib/format";
import { useTripStore } from "@/store/tripStore";

const SUGGESTIONS = ["全体をもっとゆっくりに", "2日目を短めに", "滞在を急ぎ足で"];

export function Step7Chat() {
  const store = useTripStore();
  const { chat, addChat } = store;
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const itinerarySummary =
    store.itinerary
      .map(
        (d, i) =>
          `Day${i + 1}: ` +
          d.stops.map((s) => `${getArchitecture(s.spotId)?.name}(${minutes(s.stayMin)})`).join(" → "),
      )
      .join("\n") || "（まだ旅程がありません）";

  const send = async (message: string) => {
    if (!message.trim() || loading) return;
    addChat({ role: "user", content: message });
    setInput("");
    setLoading(true);
    try {
      const spots = getArchitectures(store.selectedSpotIds).map((a) => ({
        id: a.id,
        name: a.name,
        stayMin: store.stayOverrides[a.id] ?? a.defaultStayMin,
      }));
      const adj = await fetchChatAdjust({ message, spots, itinerarySummary });

      // 調整を反映
      if (adj.stayOverrides && Object.keys(adj.stayOverrides).length > 0) {
        store.setStayOverrides({ ...store.stayOverrides, ...adj.stayOverrides });
      }
      if (adj.removeSpotIds && adj.removeSpotIds.length > 0) {
        store.removeSpots(adj.removeSpotIds);
      }

      // 旅程を再計算（最新stateを取得して使用）
      const s = useTripStore.getState();
      const result = await recomputeItinerary({
        origin: s.origin,
        selectedSpotIds: s.selectedSpotIds,
        departAt: s.departAt,
        returnAt: s.returnAt,
        stayOverrides: s.stayOverrides,
      });
      s.setItinerary(result.days, result.transportCost, result.unscheduledSpotIds);

      addChat({ role: "assistant", content: adj.note ?? "旅程を更新しました。" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <StepTitle
        step={7}
        title="AIチャットで微調整"
        subtitle="「〇〇をゆっくり」「△△を外して」など自然文で要望を伝えると旅程を調整します。"
      />

      <div className="mb-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => send(s)}
            className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs text-stone-600"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mb-3 min-h-40 space-y-3 rounded-2xl bg-white p-4">
        {chat.length === 0 && (
          <p className="py-6 text-center text-sm text-stone-400">
            要望を送るとここに会話が表示されます。
          </p>
        )}
        {chat.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <span
              className={`inline-block max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                m.role === "user" ? "bg-stone-800 text-white" : "bg-stone-100 text-stone-800"
              }`}
            >
              {m.content}
            </span>
          </div>
        ))}
        {loading && <Spinner label="調整中…" />}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="要望を入力…"
          className="flex-1 rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
        />
        <Button onClick={() => send(input)} disabled={loading || !input.trim()}>
          送信
        </Button>
      </div>
    </div>
  );
}
