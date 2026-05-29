"use client";

import type {
  Adjustments,
  Hotel,
  PlaceDetails,
  PlaceSuggestion,
  RouteMatrix,
} from "@/types";
import type { LatLng } from "@/lib/geo";
import type { MatrixPoint } from "@/lib/server/google";

export async function fetchAutocomplete(q: string): Promise<PlaceSuggestion[]> {
  const res = await fetch(`/api/places/autocomplete?q=${encodeURIComponent(q)}`);
  const data = await res.json();
  return data.suggestions ?? [];
}

export async function fetchPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  const res = await fetch(`/api/places/details?placeId=${encodeURIComponent(placeId)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.details ?? null;
}

export async function fetchRouteMatrix(
  origin: LatLng | null,
  points: MatrixPoint[],
): Promise<RouteMatrix> {
  const res = await fetch("/api/routes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origin, points }),
  });
  const data = await res.json();
  return data.matrix;
}

export async function fetchHotels(params: {
  lat: number;
  lng: number;
  checkIn: string;
  checkOut: string;
  budget: number;
}): Promise<{ hotels: Hotel[]; provider: string }> {
  const res = await fetch("/api/hotels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function fetchChatAdjust(params: {
  message: string;
  spots: { id: string; name: string; stayMin: number }[];
  itinerarySummary: string;
}): Promise<Adjustments> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  return data.adjustments ?? { note: "応答がありませんでした。" };
}
