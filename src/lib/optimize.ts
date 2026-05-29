// ルート最適化と日割りスケジューリング
import type { Architecture, ItineraryDay, ItineraryStop, Leg, RouteMatrix } from "@/types";

const ORIGIN = "origin";

// 観光ウィンドウ（時/分）
const DAY_START_HOUR = 9;
const DAY_END_HOUR = 19;

export interface OptimizeInput {
  spots: Architecture[]; // 選択済みスポット
  matrix: RouteMatrix; // origin を含む移動行列
  departAt: string; // ISO
  returnAt: string; // ISO
  /** スポットごとの滞在時間上書き（分） */
  stayOverrides?: Record<string, number>;
}

export interface OptimizeResult {
  days: ItineraryDay[];
  transportCost: number;
  /** 期間内に収まらなかったスポットid */
  unscheduledSpotIds: string[];
}

/** 最近傍法 + 2-opt で origin 起点の開いた経路を最適化し、日割りする */
export function optimizeItinerary(input: OptimizeInput): OptimizeResult {
  const { spots, matrix, departAt, returnAt, stayOverrides } = input;
  if (spots.length === 0) {
    return { days: [], transportCost: 0, unscheduledSpotIds: [] };
  }

  const idx = new Map<string, number>();
  matrix.ids.forEach((id, i) => idx.set(id, i));
  const dur = matrix.duration;

  const spotIdxList = spots
    .map((s) => idx.get(s.id))
    .filter((v): v is number => v !== undefined);

  const hasOrigin = idx.has(ORIGIN);
  const originIdx = hasOrigin ? (idx.get(ORIGIN) as number) : spotIdxList[0];
  // origin が無い場合は先頭スポットを起点とし、それ自身を最初の訪問地に含める
  const toVisit = hasOrigin ? spotIdxList : spotIdxList.slice(1);
  const path = twoOpt(nearestNeighbor(originIdx, toVisit, dur), dur, originIdx);
  const order = hasOrigin ? path : [originIdx, ...path];

  // matrix index -> Architecture
  const byMatrixIdx = new Map<number, Architecture>();
  for (const s of spots) {
    const i = idx.get(s.id);
    if (i !== undefined) byMatrixIdx.set(i, s);
  }

  return schedule(order, byMatrixIdx, matrix, originIdx, departAt, returnAt, stayOverrides ?? {});
}

function nearestNeighbor(originIdx: number, spotIdxList: number[], dur: number[][]): number[] {
  const remaining = new Set(spotIdxList);
  const path: number[] = [];
  let current = originIdx;
  while (remaining.size > 0) {
    let best = -1;
    let bestD = Infinity;
    for (const cand of remaining) {
      const d = dur[current][cand];
      if (d < bestD) {
        bestD = d;
        best = cand;
      }
    }
    path.push(best);
    remaining.delete(best);
    current = best;
  }
  return path;
}

function twoOpt(path: number[], dur: number[][], originIdx: number): number[] {
  if (path.length < 3) return path;
  let best = path.slice();
  let improved = true;
  const cost = (p: number[]) => {
    let total = dur[originIdx][p[0]];
    for (let i = 0; i < p.length - 1; i++) total += dur[p[i]][p[i + 1]];
    return total;
  };
  let bestCost = cost(best);
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const candidate = best.slice(0, i).concat(best.slice(i, k + 1).reverse(), best.slice(k + 1));
        const c = cost(candidate);
        if (c < bestCost - 1e-6) {
          best = candidate;
          bestCost = c;
          improved = true;
        }
      }
    }
  }
  return best;
}

function schedule(
  order: number[],
  byMatrixIdx: Map<number, Architecture>,
  matrix: RouteMatrix,
  originIdx: number,
  departAt: string,
  returnAt: string,
  stayOverrides: Record<string, number>,
): OptimizeResult {
  const start = new Date(departAt);
  const end = new Date(returnAt);
  const numDays = dayCount(start, end);

  const days: ItineraryDay[] = [];
  const unscheduled: string[] = [];
  let transportCost = 0;

  let dayIndex = 0;
  let cursor = new Date(Math.max(start.getTime(), dayStart(start, 0).getTime()));
  let prevIdx = originIdx;
  let current: ItineraryDay = { date: ymd(addDays(start, 0)), stops: [] };

  for (const spotIdx of order) {
    const spot = byMatrixIdx.get(spotIdx);
    if (!spot) continue;
    const stay = stayOverrides[spot.id] ?? spot.defaultStayMin;

    const tryPlace = (): { stop: ItineraryStop; depart: Date } | null => {
      const leg = makeLeg(matrix, matrix.ids[prevIdx], spot.id);
      const arrive = new Date(cursor.getTime() + leg.durationMin * 60000);
      const depart = new Date(arrive.getTime() + stay * 60000);
      const limit = dayLimit(start, end, dayIndex, numDays);
      if (depart > limit && current.stops.length > 0) return null;
      return {
        stop: { spotId: spot.id, arriveAt: arrive.toISOString(), departAt: depart.toISOString(), stayMin: stay, legToHere: leg },
        depart,
      };
    };

    let placed = tryPlace();
    if (!placed) {
      // 翌日へ
      days.push(current);
      dayIndex++;
      if (dayIndex >= numDays) {
        unscheduled.push(spot.id);
        // 残りも全て収まらない
        const startPos = order.indexOf(spotIdx);
        for (let j = startPos + 1; j < order.length; j++) {
          const s = byMatrixIdx.get(order[j]);
          if (s) unscheduled.push(s.id);
        }
        current = { date: "", stops: [] };
        break;
      }
      cursor = dayStart(start, dayIndex);
      current = { date: ymd(addDays(start, dayIndex)), stops: [] };
      placed = tryPlace();
      if (!placed) {
        unscheduled.push(spot.id);
        continue;
      }
    }

    current.stops.push(placed.stop);
    transportCost += placed.stop.legToHere.cost;
    cursor = placed.depart;
    prevIdx = spotIdx;
  }

  if (current.stops.length > 0) days.push(current);

  return { days, transportCost, unscheduledSpotIds: unscheduled };
}

function makeLeg(matrix: RouteMatrix, fromId: string, toId: string): Leg {
  const i = matrix.ids.indexOf(fromId);
  const j = matrix.ids.indexOf(toId);
  return {
    fromId,
    toId,
    mode: matrix.mode[i][j],
    durationMin: matrix.duration[i][j],
    cost: matrix.cost[i][j],
    distanceKm: matrix.distance[i][j],
  };
}

function dayCount(start: Date, end: Date): number {
  const a = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const b = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
}

function addDays(base: Date, n: number): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + n);
  return d;
}

function dayStart(base: Date, dayIndex: number): Date {
  const d = addDays(base, dayIndex);
  d.setHours(DAY_START_HOUR, 0, 0, 0);
  return d;
}

/** その日の観光終了リミット。最終日は returnAt、それ以外は 19:00 */
function dayLimit(start: Date, end: Date, dayIndex: number, numDays: number): Date {
  if (dayIndex === numDays - 1) return end;
  const d = addDays(start, dayIndex);
  d.setHours(DAY_END_HOUR, 0, 0, 0);
  return d;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
