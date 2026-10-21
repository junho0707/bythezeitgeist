import { createHash, randomInt } from "node:crypto";
import { one, run } from "./db";
import { sendLoginCode } from "./mail";

/*
 * Six-digit codes emailed to prove an address: to sign up, or to set a new
 * password. Stored hashed, good for 15 minutes and 5 tries, and resent at
 * most once a minute.
 */

const TTL = 15 * 60_000;
const RESEND_AFTER = 60_000;
const MAX_TRIES = 5;

function hash(email: string, code: string): string {
  return createHash("sha256").update(`${email}:${code}:${process.env.AUTH_SECRET ?? ""}`).digest("hex");
}

/** Emails a fresh code, unless one went out under a minute ago. */
export async function issueCode(email: string): Promise<{ ok: true } | { error: string }> {
  const now = Date.now();
  const last = await one<{ sent_at: number }>("SELECT sent_at FROM email_codes WHERE email = ?", [email]);
  if (last && now - Number(last.sent_at) < RESEND_AFTER) {
    return { error: "A code was just sent. Wait a minute before asking again." };
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await run(
    `INSERT INTO email_codes (email, code_hash, expires_at, sent_at, attempts) VALUES (?, ?, ?, ?, 0)
     ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at,
       sent_at = excluded.sent_at, attempts = 0`,
    [email, hash(email, code), now + TTL, now],
  );
  await sendLoginCode(email, code);
  return { ok: true };
}

/** True once, for the right unexpired code; then the code is spent. */
export async function checkCode(email: string, code: string): Promise<boolean> {
  const row = await one<{ code_hash: string; expires_at: number; attempts: number }>(
    "SELECT code_hash, expires_at, attempts FROM email_codes WHERE email = ?",
    [email],
  );
  if (!row || Number(row.expires_at) < Date.now() || Number(row.attempts) >= MAX_TRIES) return false;
  if (row.code_hash !== hash(email, code.trim())) {
    await run("UPDATE email_codes SET attempts = attempts + 1 WHERE email = ?", [email]);
    return false;
  }
  await run("DELETE FROM email_codes WHERE email = ?", [email]);
  return true;
}
