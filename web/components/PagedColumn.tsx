"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * One column of a paired list (Google | Wikipedia) with its own pages. Every
 * page is rendered on the server; clicking a number swaps this column only —
 * no navigation, no scroll jump — and records the page in the address
 * (?google=2) so a reload or shared link opens the same view.
 */
export function PagedColumn({
  slug,
  label,
  side,
  pages,
  counts,
  initial,
}: {
  slug: string;
  label: string;
  side: "left" | "right";
  /** Each page's rows, already rendered. */
  pages: ReactNode[];
  /** Stories on each page, for the row grid. */
  counts: number[];
  initial: number;
}) {
  const [page, setPage] = useState(initial);
  const section = useRef<HTMLElement>(null);
  const total = pages.length;

  function go(n: number) {
    setPage(n);
    const url = new URL(window.location.href);
    if (n === 1) url.searchParams.delete(slug);
    else url.searchParams.set(slug, String(n));
    window.history.replaceState(window.history.state, "", url);
    // The numbers sit at the bottom: bring the new page's first story into view.
    requestAnimationFrame(() => {
      const top = section.current?.getBoundingClientRect().top ?? 0;
      if (top < 0) section.current?.scrollIntoView({ block: "start" });
    });
  }

  // Header + one grid row per story + the pager, so rows line up across columns.
  const rows = 1 + Math.max(counts[page - 1] ?? 0, 1) + 1;
  return (
    <section
      ref={section}
      className={`horizon pair ${side}`}
      aria-labelledby={`${slug}-label`}
      style={{ "--section-rows": rows } as CSSProperties}
    >
      <header className="horizon-head">
        <h2 id={`${slug}-label`} className="horizon-label">
          {label}
        </h2>
        <p className="horizon-fresh">
          page {page} of {total}
        </p>
      </header>
      {pages[page - 1]}
      <nav className="pager" aria-label={`${label} pages`}>
        <span className="pager-pages">
          {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              className={n === page ? "on" : undefined}
              aria-current={n === page ? "page" : undefined}
              onClick={() => go(n)}
            >
              {n}
            </button>
          ))}
        </span>
      </nav>
    </section>
  );
}
