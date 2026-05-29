import { NextResponse } from "next/server";
import { buildRouteMatrix, type MatrixPoint } from "@/lib/server/google";
import type { LatLng } from "@/lib/geo";

interface Body {
  origin?: LatLng | null;
  points: MatrixPoint[];
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!body.points || body.points.length === 0) {
      return NextResponse.json({ error: "points required" }, { status: 400 });
    }
    const matrix = await buildRouteMatrix(body.origin ?? null, body.points);
    return NextResponse.json({ matrix });
  } catch (e) {
    console.error("routes error", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
