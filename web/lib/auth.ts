import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { one, run } from "./db";
import type { AuthUser } from "./types";

const COOKIE = "zg_session";
const SALT_ROUNDS = 10;

function secret() {
  const raw = process.env.AUTH_SECRET;
  if (!raw || raw.length < 16) {
    throw new Error("Set AUTH_SECRET in web/.env.local (16+ chars).");
  }
  return new TextEncoder().encode(raw);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function signSession(user: AuthUser): Promise<string> {
  return new SignJWT({ email: user.email, displayName: user.displayName })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function setSessionCookie(user: AuthUser) {
  const token = await signSession(user);
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const id = payload.sub;
    if (!id) return null;
    const row = await one<{ id: string; email: string; display_name: string }>(
      "SELECT id, email, display_name FROM users WHERE id = ?",
      [id],
    );
    if (!row) return null;
    return { id: row.id, email: row.email, displayName: row.display_name };
  } catch {
    return null;
  }
}

export function findUserByEmail(email: string) {
  return one<{ id: string; email: string; password_hash: string; display_name: string }>(
    "SELECT * FROM users WHERE email = ?",
    [email.toLowerCase()],
  );
}

export async function createUser(input: {
  email: string;
  passwordHash: string;
  displayName: string;
}): Promise<AuthUser> {
  const id = crypto.randomUUID();
  await run(
    "INSERT INTO users (id, email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?)",
    [id, input.email.toLowerCase(), input.passwordHash, input.displayName, new Date().toISOString()],
  );
  return { id, email: input.email.toLowerCase(), displayName: input.displayName };
}

export function isEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function setPassword(userId: string, passwordHash: string): Promise<void> {
  await run("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, userId]);
}
