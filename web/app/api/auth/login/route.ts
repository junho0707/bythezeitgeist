import { NextRequest, NextResponse } from "next/server";
import { findUserByEmail, setSessionCookie, verifyPassword } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    email?: string;
    password?: string;
  } | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  const password = body?.password ?? "";
  const row = await findUserByEmail(email);
  if (!row?.password_hash || !(await verifyPassword(password, row.password_hash))) {
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }
  const user = { id: row.id, email: row.email, displayName: row.display_name };
  await setSessionCookie(user);
  return NextResponse.json({ user });
}
