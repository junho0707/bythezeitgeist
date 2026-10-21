"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { AuthUser } from "@/lib/types";

type Props = {
  onAuthChange?: (user: AuthUser | null) => void;
};

type Step = "email" | "password" | "code";

export function AuthBar({ onAuthChange }: Props) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [google, setGoogle] = useState(false);
  const [open, setOpen] = useState(false);
  // Email first; then a password for known accounts, else an emailed code.
  const [step, setStep] = useState<Step>("email");
  const [newUser, setNewUser] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        setUser(data.user);
        setGoogle(Boolean(data.google));
        onAuthChange?.(data.user);
      })
      .catch(() => undefined);
  }, [onAuthChange]);

  async function post(url: string, body: object) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? "Something went wrong.");
      return res.ok ? data : null;
    } finally {
      setBusy(false);
    }
  }

  /** Asks for a code: a new account, or a forgotten password. */
  async function start(reset = false) {
    const data = await post("/api/auth/start", { email, reset });
    if (!data) return;
    if (data.next === "password") {
      setStep("password");
      return;
    }
    setNewUser(Boolean(data.newUser));
    if (data.newUser && !displayName) setDisplayName(email.split("@")[0].slice(0, 32));
    setNote("We emailed you a 6-digit code.");
    setStep("code");
  }

  function signedIn(u: AuthUser) {
    setUser(u);
    onAuthChange?.(u);
    setOpen(false);
    setStep("email");
    setPassword("");
    setCode("");
    setNote(null);
    router.refresh();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (step === "email") return start();
    const data =
      step === "password"
        ? await post("/api/auth/login", { email, password })
        : await post("/api/auth/verify", { email, code, password, displayName });
    if (data?.user) signedIn(data.user);
  }

  function restart() {
    setStep("email");
    setError(null);
    setNote(null);
    setPassword("");
    setCode("");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    onAuthChange?.(null);
    router.refresh();
  }

  if (user) {
    return (
      <div className="auth-signed">
        <span className="byline">{user.displayName}</span>
        <button type="button" onClick={logout}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="auth-bar">
      <button type="button" onClick={() => setOpen((v) => !v)}>
        Sign in
      </button>
      {open && (
        <form className="auth-card" onSubmit={submit}>
          {step === "email" ? (
            <input
              type="email"
              placeholder="Email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          ) : (
            <p className="auth-note">
              {email}{" "}
              <button type="button" className="auth-link" onClick={restart}>
                Change
              </button>
            </p>
          )}
          {note && <p className="auth-note">{note}</p>}
          {step === "code" && (
            <>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
                autoFocus
              />
              {newUser && (
                <input
                  placeholder="Name shown on comments"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={32}
                />
              )}
            </>
          )}
          {step !== "email" && (
            <input
              type="password"
              placeholder={step === "code" ? "Choose a password" : "Password"}
              autoComplete={step === "code" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoFocus={step === "password"}
            />
          )}
          {error && <p className="form-error">{error}</p>}
          <button type="submit" disabled={busy}>
            {busy ? "…" : step === "email" ? "Continue" : step === "password" ? "Sign in" : newUser ? "Create account" : "Set password"}
          </button>
          {step === "password" && (
            <button type="button" className="auth-link" disabled={busy} onClick={() => start(true)}>
              Forgot password?
            </button>
          )}
          {step === "code" && (
            <button type="button" className="auth-link" disabled={busy} onClick={() => start(true)}>
              Send a new code
            </button>
          )}
          {step === "email" && google && (
            <>
              <p className="auth-or">or</p>
              <a className="auth-google" href={`/api/auth/google?next=${encodeURIComponent(pathname)}`}>
                Continue with Google
              </a>
            </>
          )}
        </form>
      )}
    </div>
  );
}
