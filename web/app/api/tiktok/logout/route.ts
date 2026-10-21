import { NextResponse } from "next/server";
import { clearTikTokSession } from "@/lib/tiktok";

export const runtime = "nodejs";

export async function POST() {
  await clearTikTokSession();
  return NextResponse.json({ ok: true });
}
