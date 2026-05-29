import { NextResponse } from "next/server";
import { placeDetails } from "@/lib/server/google";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const placeId = searchParams.get("placeId") ?? "";
  if (!placeId) {
    return NextResponse.json({ error: "placeId required" }, { status: 400 });
  }
  try {
    const details = await placeDetails(placeId);
    if (!details) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ details });
  } catch (e) {
    console.error("details error", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
