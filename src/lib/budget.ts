// 予算計算
import type { Budget, ItineraryDay, Lodging } from "@/types";
import { getArchitecture } from "@/lib/architectures";

export function nightsFromItinerary(itinerary: ItineraryDay[]): number {
  return Math.max(0, itinerary.length - 1);
}

export function computeBudget(
  itinerary: ItineraryDay[],
  transportCost: number,
  lodging: Lodging,
): Budget {
  let admission = 0;
  for (const day of itinerary) {
    for (const stop of day.stops) {
      const a = getArchitecture(stop.spotId);
      if (a?.admission === "paid" && a.fee) admission += a.fee;
    }
  }

  const nights = nightsFromItinerary(itinerary);
  const lodgingCost =
    lodging.type === "hotel" && lodging.selectedHotel
      ? lodging.selectedHotel.pricePerNight * nights
      : 0;

  const total = transportCost + lodgingCost + admission;
  return { transport: transportCost, lodging: lodgingCost, admission, total };
}
