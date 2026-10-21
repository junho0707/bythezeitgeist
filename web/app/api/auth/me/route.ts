import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  // So the sign-in form knows whether to offer Google.
  return NextResponse.json({ user, google: Boolean(process.env.GOOGLE_CLIENT_ID) });
}
