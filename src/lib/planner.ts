"use client";

import { getArchitectures } from "@/lib/architectures";
import { fetchRouteMatrix } from "@/lib/api";
import { optimizeItinerary, type OptimizeResult } from "@/lib/optimize";
import type { Origin } from "@/types";

export interface PlanInput {
  origin: Origin;
  selectedSpotIds: string[];
  departAt: string;
  returnAt: string;
  stayOverrides: Record<string, number>;
}

/** スポット座標から移動行列を取得し、最適化した旅程を返す */
export async function recomputeItinerary(input: PlanInput): Promise<OptimizeResult> {
  const spots = getArchitectures(input.selectedSpotIds);
  if (spots.length === 0) {
    return { days: [], transportCost: 0, unscheduledSpotIds: [] };
  }

  const points = spots.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng }));
  const origin =
    input.origin.lat !== undefined && input.origin.lng !== undefined
      ? { lat: input.origin.lat, lng: input.origin.lng }
      : null;

  const matrix = await fetchRouteMatrix(origin, points);
  return optimizeItinerary({
    spots,
    matrix,
    departAt: input.departAt,
    returnAt: input.returnAt,
    stayOverrides: input.stayOverrides,
  });
}
