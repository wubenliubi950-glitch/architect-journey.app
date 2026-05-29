// テスト用: origin + spots から同期的に移動行列を構築
import { estimateLeg, type LatLng } from "./geo";
import type { Architecture, RouteMatrix } from "@/types";

export function buildMockMatrix(origin: LatLng | null, spots: Architecture[]): RouteMatrix {
  const nodes: { id: string; lat: number; lng: number }[] = [];
  if (origin) nodes.push({ id: "origin", lat: origin.lat, lng: origin.lng });
  nodes.push(...spots.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng })));

  const n = nodes.length;
  const duration: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const cost: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const distance: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const mode: RouteMatrix["mode"] = Array.from({ length: n }, () => Array(n).fill("walking"));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const e = estimateLeg(nodes[i], nodes[j]);
      duration[i][j] = e.durationMin;
      cost[i][j] = e.cost;
      distance[i][j] = e.distanceKm;
      mode[i][j] = e.mode;
    }
  }
  return { ids: nodes.map((p) => p.id), duration, cost, distance, mode };
}
