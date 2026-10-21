/*
 * Outgoing email through Resend (RESEND_API_KEY). Without a key (local dev)
 * the message is printed to the server log instead.
 */

const FROM = process.env.MAIL_FROM ?? "The Zeitgeist <login@bythezeitgeist.com>";

export async function sendLoginCode(to: string, code: string): Promise<void> {
  const subject = `${code} is your Zeitgeist code`;
  const text = `Your code is ${code}. It works for 15 minutes.\n\nIf you didn't ask for it, ignore this email.`;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[mail] to ${to}: ${subject}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, text }),
  });
  if (!res.ok) throw new Error(`Resend: HTTP ${res.status} ${await res.text()}`);
}
