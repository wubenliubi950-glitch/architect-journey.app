import { NextResponse } from "next/server";
import { placesAutocomplete } from "@/lib/server/google";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  try {
    const suggestions = await placesAutocomplete(q);
    return NextResponse.json({ suggestions });
  } catch (e) {
    console.error("autocomplete error", e);
    return NextResponse.json({ suggestions: [] }, { status: 200 });
  }
}
