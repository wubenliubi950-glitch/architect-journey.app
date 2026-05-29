// Google Maps Platform プロキシ（モックフォールバック付き）
import type { PlaceDetails, PlaceSuggestion, RouteMatrix } from "@/types";
import { estimateLeg, type LatLng } from "@/lib/geo";
import { config, isMockGoogle } from "@/lib/server/config";

// --- モック用の主要駅/空港データ ---
const MOCK_PLACES: Record<string, PlaceDetails> = {
  "mock-tokyo-st": { name: "東京駅", address: "東京都千代田区丸の内1", lat: 35.6812, lng: 139.7671 },
  "mock-shinjuku-st": { name: "新宿駅", address: "東京都新宿区", lat: 35.6896, lng: 139.7006 },
  "mock-shin-osaka-st": { name: "新大阪駅", address: "大阪府大阪市淀川区", lat: 34.7335, lng: 135.5003 },
  "mock-takamatsu-st": { name: "高松駅", address: "香川県高松市浜ノ町", lat: 34.3528, lng: 134.0466 },
  "mock-yokohama-st": { name: "横浜駅", address: "神奈川県横浜市西区", lat: 35.4658, lng: 139.6223 },
  "mock-haneda": { name: "羽田空港", address: "東京都大田区羽田空港", lat: 35.5494, lng: 139.7798 },
  "mock-narita": { name: "成田空港", address: "千葉県成田市", lat: 35.772, lng: 140.3929 },
  "mock-itami": { name: "大阪国際空港(伊丹)", address: "大阪府豊中市", lat: 34.7855, lng: 135.4382 },
  "mock-takamatsu-ap": { name: "高松空港", address: "香川県高松市香南町", lat: 34.2142, lng: 134.0156 },
};

export async function placesAutocomplete(query: string): Promise<PlaceSuggestion[]> {
  if (isMockGoogle()) {
    const q = query.trim();
    const all = Object.entries(MOCK_PLACES).map(([placeId, d]) => ({
      placeId,
      description: `${d.name}（${d.address}）`,
    }));
    if (!q) return all.slice(0, 6);
    return all.filter((p) => p.description.includes(q)).slice(0, 6);
  }

  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.searchParams.set("input", query);
  url.searchParams.set("language", "ja");
  url.searchParams.set("components", "country:jp");
  url.searchParams.set("key", config.googleKey);
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();
  return (data.predictions ?? []).map((p: { description: string; place_id: string }) => ({
    description: p.description,
    placeId: p.place_id,
  }));
}

export async function placeDetails(placeId: string): Promise<PlaceDetails | null> {
  if (isMockGoogle()) {
    return MOCK_PLACES[placeId] ?? null;
  }

  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("language", "ja");
  url.searchParams.set("fields", "name,formatted_address,geometry");
  url.searchParams.set("key", config.googleKey);
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();
  const r = data.result;
  if (!r?.geometry?.location) return null;
  return {
    name: r.name ?? "",
    address: r.formatted_address ?? "",
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
  };
}

export interface MatrixPoint {
  id: string;
  lat: number;
  lng: number;
}

/** origin を index 0 に含む N+1 移動行列を構築 */
export async function buildRouteMatrix(
  origin: LatLng | null,
  points: MatrixPoint[],
): Promise<RouteMatrix> {
  const nodes: MatrixPoint[] = [];
  if (origin) nodes.push({ id: "origin", lat: origin.lat, lng: origin.lng });
  nodes.push(...points);

  const n = nodes.length;
  const duration: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const cost: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const distance: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const mode: RouteMatrix["mode"] = Array.from({ length: n }, () => Array(n).fill("walking"));

  // Google が使える場合は所要時間・距離を取得、運賃は距離から推定（Distance Matrix は運賃を返さないため）
  let googleMatrix: { dur: number[][]; dist: number[][] } | null = null;
  if (!isMockGoogle() && n <= 10) {
    googleMatrix = await fetchDistanceMatrix(nodes);
  }

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const est = estimateLeg(nodes[i], nodes[j]);
      if (googleMatrix && googleMatrix.dur[i][j] > 0) {
        const km = googleMatrix.dist[i][j] / 1000;
        duration[i][j] = Math.round(googleMatrix.dur[i][j] / 60);
        distance[i][j] = km;
        mode[i][j] = km < 1.2 ? "walking" : "transit";
        cost[i][j] = km < 1.2 ? 0 : Math.max(150, Math.round((km * 22) / 10) * 10);
      } else {
        duration[i][j] = est.durationMin;
        distance[i][j] = est.distanceKm;
        cost[i][j] = est.cost;
        mode[i][j] = est.mode;
      }
    }
  }

  return { ids: nodes.map((p) => p.id), duration, cost, distance, mode };
}

async function fetchDistanceMatrix(
  nodes: MatrixPoint[],
): Promise<{ dur: number[][]; dist: number[][] } | null> {
  try {
    const coords = nodes.map((p) => `${p.lat},${p.lng}`).join("|");
    const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
    url.searchParams.set("origins", coords);
    url.searchParams.set("destinations", coords);
    url.searchParams.set("mode", "transit");
    url.searchParams.set("language", "ja");
    url.searchParams.set("key", config.googleKey);
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    if (data.status !== "OK") return null;
    const n = nodes.length;
    const dur: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
    const dist: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
    data.rows.forEach((row: { elements: { status: string; duration?: { value: number }; distance?: { value: number } }[] }, i: number) => {
      row.elements.forEach((el, j) => {
        if (el.status === "OK" && el.duration && el.distance) {
          dur[i][j] = el.duration.value;
          dist[i][j] = el.distance.value;
        }
      });
    });
    return { dur, dist };
  } catch {
    return null;
  }
}
