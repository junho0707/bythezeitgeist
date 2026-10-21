"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Opens a story or a day over the page the reader came from, so they don't
 * lose their place. The URL is the real page's, so reload or share opens it
 * in full. Closing (×, Esc, a click outside) goes back.
 */
export function Modal({ children, label }: { children: ReactNode; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // In a comment box, Esc leaves the box; it doesn't throw the draft away.
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable]")) {
        el.blur();
        return;
      }
      router.back();
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [router]);

  // A new story or day opened from inside the modal starts at its top.
  useEffect(() => {
    panel.current?.scrollTo(0, 0);
    panel.current?.focus();
  }, [pathname]);

  return (
    <div className="modal-backdrop" onClick={() => router.back()}>
      <div
        ref={panel}
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" aria-label="Close" onClick={() => router.back()}>
          ×
        </button>
        {children}
      </div>
    </div>
  );
}
