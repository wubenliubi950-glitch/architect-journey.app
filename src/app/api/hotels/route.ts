import { NextResponse } from "next/server";
import { getHotelProvider, type HotelQuery } from "@/lib/server/hotels";

export async function POST(req: Request) {
  try {
    const q = (await req.json()) as HotelQuery;
    if (q.lat === undefined || q.lng === undefined) {
      return NextResponse.json({ error: "lat/lng required" }, { status: 400 });
    }
    const provider = getHotelProvider();
    const hotels = await provider.search(q);
    return NextResponse.json({ hotels, provider: provider.name });
  } catch (e) {
    console.error("hotels error", e);
    return NextResponse.json({ hotels: [] }, { status: 200 });
  }
}
