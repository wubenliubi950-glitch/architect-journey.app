import { describe, expect, it } from "vitest";
import { optimizeItinerary } from "./optimize";
import { buildMockMatrix } from "./optimize.testutil";
import type { Architecture } from "@/types";

function spot(id: string, lat: number, lng: number, stay = 60): Architecture {
  return {
    id,
    name: id,
    prefecture: "東京都",
    address: "",
    lat,
    lng,
    architect: "",
    year: 2000,
    category: "museum",
    admission: "free",
    defaultStayMin: stay,
    description: "",
  };
}

describe("optimizeItinerary", () => {
  // 一直線に並ぶ3点。origin に近い順 a → b → c が最適
  const a = spot("a", 35.0, 139.0);
  const b = spot("b", 35.1, 139.0);
  const c = spot("c", 35.2, 139.0);
  const origin = { lat: 34.99, lng: 139.0 };

  it("origin から近い順に訪問順を最適化する", () => {
    const spots = [c, a, b]; // わざと順不同で渡す
    const matrix = buildMockMatrix(origin, spots);
    const res = optimizeItinerary({
      spots,
      matrix,
      departAt: "2026-06-01T09:00:00",
      returnAt: "2026-06-03T19:00:00",
    });
    const visited = res.days.flatMap((d) => d.stops.map((s) => s.spotId));
    expect(visited).toEqual(["a", "b", "c"]);
    expect(res.unscheduledSpotIds).toHaveLength(0);
  });

  it("滞在時間が長すぎると期間に収まらない分が unscheduled になる", () => {
    const longSpots = [spot("a", 35.0, 139.0, 600), spot("b", 35.1, 139.0, 600)];
    const matrix = buildMockMatrix(origin, longSpots);
    const res = optimizeItinerary({
      spots: longSpots,
      matrix,
      departAt: "2026-06-01T09:00:00",
      returnAt: "2026-06-01T19:00:00", // 日帰り、10時間しかない
    });
    const visited = res.days.flatMap((d) => d.stops.map((s) => s.spotId));
    expect(visited.length).toBe(1);
    expect(res.unscheduledSpotIds).toContain("b");
  });

  it("stayOverrides を反映する", () => {
    const matrix = buildMockMatrix(origin, [a]);
    const res = optimizeItinerary({
      spots: [a],
      matrix,
      departAt: "2026-06-01T09:00:00",
      returnAt: "2026-06-01T19:00:00",
      stayOverrides: { a: 30 },
    });
    expect(res.days[0].stops[0].stayMin).toBe(30);
  });
});
