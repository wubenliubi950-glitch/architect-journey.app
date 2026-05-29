"use client";

import { useEffect, useRef, useState } from "react";
import type { PlaceDetails, PlaceSuggestion } from "@/types";
import { fetchAutocomplete, fetchPlaceDetails } from "@/lib/api";

export function PlaceInput({
  label,
  placeholder,
  value,
  onSelect,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onSelect: (text: string, details: PlaceDetails | null) => void;
}) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 親の value（ストア値）が外部更新されたら入力欄に同期する
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery(value);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const s = await fetchAutocomplete(query);
      setSuggestions(s);
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, open]);

  const choose = async (s: PlaceSuggestion) => {
    setQuery(s.description);
    setOpen(false);
    const details = await fetchPlaceDetails(s.placeId);
    onSelect(s.description, details);
  };

  return (
    <div className="relative">
      <label className="mb-1 block text-sm font-medium text-stone-700">{label}</label>
      <input
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-stone-200 bg-white shadow-lg">
          {suggestions.map((s) => (
            <li
              key={s.placeId}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(s)}
              className="cursor-pointer px-4 py-3 text-sm hover:bg-amber-50"
            >
              {s.description}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
