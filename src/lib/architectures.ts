// 建築シードデータへのアクセス
import data from "@/data/architectures.json";
import type { Architecture } from "@/types";

export const architectures = data as Architecture[];

/** データに登場する都道府県の一覧（出現順） */
export const availablePrefectures: string[] = Array.from(
  new Set(architectures.map((a) => a.prefecture)),
);

export function getArchitecture(id: string): Architecture | undefined {
  return architectures.find((a) => a.id === id);
}

export function getArchitectures(ids: string[]): Architecture[] {
  return ids
    .map((id) => getArchitecture(id))
    .filter((a): a is Architecture => a !== undefined);
}

export function byPrefectures(prefectures: string[]): Architecture[] {
  if (prefectures.length === 0) return architectures;
  return architectures.filter((a) => prefectures.includes(a.prefecture));
}
