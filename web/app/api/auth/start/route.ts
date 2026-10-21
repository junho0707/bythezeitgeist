import { NextRequest, NextResponse } from "next/server";
import { findUserByEmail, isEmail } from "@/lib/auth";
import { issueCode } from "@/lib/emailCodes";

export const runtime = "nodejs";

/**
 * The first step of signing in: someone with a password is asked for it;
 * anyone else (new, or signed up with Google, or resetting) gets a code.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { email?: string; reset?: boolean } | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  if (!isEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }
  const user = await findUserByEmail(email);
  if (user?.password_hash && !body?.reset) {
    return NextResponse.json({ next: "password" });
  }
  const sent = await issueCode(email).catch((e) => {
    console.error("[auth] code not sent:", e);
    return { error: "Couldn't send the email. Try again shortly." };
  });
  if ("error" in sent) return NextResponse.json({ error: sent.error }, { status: 429 });
  return NextResponse.json({ next: "code", newUser: !user });
}
