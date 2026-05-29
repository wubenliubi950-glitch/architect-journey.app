import { NextResponse } from "next/server";
import { isMockClaude, isMockGoogle, isMockRakuten } from "@/lib/server/config";

/** 各外部APIがモック動作かどうかを返す（UIのデモ表示用） */
export async function GET() {
  const google = isMockGoogle();
  const rakuten = isMockRakuten();
  const claude = isMockClaude();
  return NextResponse.json({
    google,
    rakuten,
    claude,
    anyMock: google || rakuten || claude,
  });
}
