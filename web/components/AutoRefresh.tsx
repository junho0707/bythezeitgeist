"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-render the server page on an interval so "Right now" stays current. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), Math.max(30, seconds) * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
