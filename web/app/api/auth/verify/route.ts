import { NextRequest, NextResponse } from "next/server";
import { createUser, findUserByEmail, hashPassword, isEmail, setPassword, setSessionCookie } from "@/lib/auth";
import { checkCode } from "@/lib/emailCodes";

export const runtime = "nodejs";

/** The emailed code plus a new password: creates the account, or resets it. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    email?: string;
    code?: string;
    password?: string;
    displayName?: string;
  } | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  const password = body?.password ?? "";
  const displayName = body?.displayName?.trim() ?? "";
  if (!isEmail(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  const existing = await findUserByEmail(email);
  if (!existing && (displayName.length < 2 || displayName.length > 32)) {
    return NextResponse.json({ error: "Name must be 2–32 characters." }, { status: 400 });
  }
  if (!(await checkCode(email, body?.code ?? ""))) {
    return NextResponse.json({ error: "That code is wrong or expired." }, { status: 400 });
  }
  const passwordHash = await hashPassword(password);
  let user;
  if (existing) {
    await setPassword(existing.id, passwordHash);
    user = { id: existing.id, email: existing.email, displayName: existing.display_name };
  } else {
    user = await createUser({ email, passwordHash, displayName });
  }
  await setSessionCookie(user);
  return NextResponse.json({ user });
}
