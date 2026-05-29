"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Hotel,
  ItineraryDay,
  Lodging,
  Origin,
} from "@/types";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface TripStore {
  step: number;

  origin: Origin;
  prefectures: string[];
  departAt: string;
  returnAt: string;
  selectedSpotIds: string[];

  itinerary: ItineraryDay[];
  transportCost: number;
  unscheduledSpotIds: string[];

  lodging: Lodging;
  hotelBudget: number; // 1泊あたり予算上限

  stayOverrides: Record<string, number>;
  chat: ChatMessage[];

  // --- actions ---
  setStep: (s: number) => void;
  next: () => void;
  prev: () => void;

  setOrigin: (o: Partial<Origin>) => void;
  togglePrefecture: (p: string) => void;
  setDates: (departAt: string, returnAt: string) => void;
  toggleSpot: (id: string) => void;

  setItinerary: (days: ItineraryDay[], transportCost: number, unscheduled: string[]) => void;
  setStayOverrides: (o: Record<string, number>) => void;
  removeSpots: (ids: string[]) => void;

  setLodgingType: (type: Lodging["type"]) => void;
  setFriendAddress: (address: string) => void;
  selectHotel: (hotel: Hotel) => void;
  setHotelBudget: (n: number) => void;

  addChat: (m: ChatMessage) => void;
  reset: () => void;
}

const initial = {
  step: 0,
  origin: { station: "", airport: "" },
  prefectures: [] as string[],
  departAt: "",
  returnAt: "",
  selectedSpotIds: [] as string[],
  itinerary: [] as ItineraryDay[],
  transportCost: 0,
  unscheduledSpotIds: [] as string[],
  lodging: { type: "hotel" } as Lodging,
  hotelBudget: 12000,
  stayOverrides: {} as Record<string, number>,
  chat: [] as ChatMessage[],
};

export const TOTAL_STEPS = 8;

export const useTripStore = create<TripStore>()(
  persist(
    (set) => ({
      ...initial,

      setStep: (s) => set({ step: Math.max(0, Math.min(TOTAL_STEPS - 1, s)) }),
      next: () => set((st) => ({ step: Math.min(TOTAL_STEPS - 1, st.step + 1) })),
      prev: () => set((st) => ({ step: Math.max(0, st.step - 1) })),

      setOrigin: (o) => set((st) => ({ origin: { ...st.origin, ...o } })),
      togglePrefecture: (p) =>
        set((st) => ({
          prefectures: st.prefectures.includes(p)
            ? st.prefectures.filter((x) => x !== p)
            : [...st.prefectures, p],
        })),
      setDates: (departAt, returnAt) => set({ departAt, returnAt }),
      toggleSpot: (id) =>
        set((st) => ({
          selectedSpotIds: st.selectedSpotIds.includes(id)
            ? st.selectedSpotIds.filter((x) => x !== id)
            : [...st.selectedSpotIds, id],
        })),

      setItinerary: (itinerary, transportCost, unscheduled) =>
        set({ itinerary, transportCost, unscheduledSpotIds: unscheduled }),
      setStayOverrides: (stayOverrides) => set({ stayOverrides }),
      removeSpots: (ids) =>
        set((st) => ({
          selectedSpotIds: st.selectedSpotIds.filter((x) => !ids.includes(x)),
        })),

      setLodgingType: (type) => set((st) => ({ lodging: { ...st.lodging, type } })),
      setFriendAddress: (address) =>
        set((st) => ({ lodging: { ...st.lodging, address } })),
      selectHotel: (hotel) =>
        set((st) => ({ lodging: { ...st.lodging, type: "hotel", selectedHotel: hotel } })),
      setHotelBudget: (n) => set({ hotelBudget: n }),

      addChat: (m) => set((st) => ({ chat: [...st.chat, m] })),
      reset: () => set({ ...initial }),
    }),
    {
      name: "architect-journey-trip",
      version: 1,
    },
  ),
);
