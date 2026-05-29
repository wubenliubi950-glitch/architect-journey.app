import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { Adjustments } from "@/types";
import { config, isMockClaude } from "@/lib/server/config";

interface SpotContext {
  id: string;
  name: string;
  stayMin: number;
}

interface Body {
  message: string;
  spots: SpotContext[];
  itinerarySummary: string;
}

const SYSTEM = `あなたは建築巡り旅程プランナーのアシスタントです。
ユーザーの自然文の要望をもとに、旅程の「滞在時間の調整」と「スポットの除外」だけを提案します。
新しいスポットの追加や移動手段の変更はできません。
必ず apply_adjustments ツールを呼び出して結果を返してください。
note には日本語で、何をどう変えたかを1〜2文で簡潔に説明してください。
滞在時間は分単位で、現実的な範囲（20〜240分）にしてください。`;

const TOOL: Anthropic.Tool = {
  name: "apply_adjustments",
  description: "旅程の滞在時間変更とスポット除外を適用する",
  input_schema: {
    type: "object",
    properties: {
      stayOverrides: {
        type: "object",
        description: "スポットidをキー、新しい滞在時間(分)を値とするマップ",
        additionalProperties: { type: "number" },
      },
      removeSpotIds: {
        type: "array",
        items: { type: "string" },
        description: "除外するスポットidの配列",
      },
      note: { type: "string", description: "変更内容の日本語説明" },
    },
    required: ["note"],
  },
};

export async function POST(req: Request) {
  const body = (await req.json()) as Body;

  if (isMockClaude()) {
    return NextResponse.json({ adjustments: mockAdjust(body) });
  }

  try {
    const client = new Anthropic({ apiKey: config.anthropicKey });
    const context = `現在の旅程:\n${body.itinerarySummary}\n\n選択中のスポット:\n${body.spots
      .map((s) => `- ${s.name} (id=${s.id}, 現在の滞在 ${s.stayMin}分)`)
      .join("\n")}`;

    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: [TOOL],
      tool_choice: { type: "tool", name: "apply_adjustments" },
      messages: [{ role: "user", content: `${context}\n\nユーザーの要望: ${body.message}` }],
    });

    const toolUse = res.content.find((c) => c.type === "tool_use");
    if (toolUse && toolUse.type === "tool_use") {
      return NextResponse.json({ adjustments: toolUse.input as Adjustments });
    }
    return NextResponse.json({ adjustments: { note: "うまく解釈できませんでした。" } });
  } catch (e) {
    console.error("chat error", e);
    return NextResponse.json({ adjustments: { note: "調整中にエラーが発生しました。" } });
  }
}

/** キーが無いときの簡易ヒューリスティック */
function mockAdjust(body: Body): Adjustments {
  const msg = body.message;
  const stayOverrides: Record<string, number> = {};
  const removeSpotIds: string[] = [];

  // 名前が含まれるスポットを対象に
  const mentioned = body.spots.filter((s) => msg.includes(s.name) || msg.includes(s.name.slice(0, 3)));
  const targets = mentioned.length > 0 ? mentioned : body.spots;

  if (/ゆっくり|長く|じっくり|増や/.test(msg)) {
    for (const s of targets) stayOverrides[s.id] = Math.min(240, Math.round(s.stayMin * 1.5));
    return { stayOverrides, note: `${targets.length}件の滞在時間を長めに調整しました（モック応答）。` };
  }
  if (/短く|急ぎ|さくっと|減ら/.test(msg)) {
    for (const s of targets) stayOverrides[s.id] = Math.max(20, Math.round(s.stayMin * 0.7));
    return { stayOverrides, note: `${targets.length}件の滞在時間を短めに調整しました（モック応答）。` };
  }
  if (/(外して|なしで|除外|やめ|削除)/.test(msg) && mentioned.length > 0) {
    removeSpotIds.push(...mentioned.map((s) => s.id));
    return { removeSpotIds, note: `${mentioned.map((s) => s.name).join("、")}を除外しました（モック応答）。` };
  }
  return {
    note: "（モック応答）『〇〇をゆっくり』『△△を外して』のように具体的に指示すると調整できます。実APIキー設定で自由な対話が可能になります。",
  };
}
