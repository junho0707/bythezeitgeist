import Link from "next/link";
import { AuthBar } from "./AuthBar";
import { SearchBox } from "./SearchBox";
import { SITE_TZ } from "./stories/format";
import { HORIZONS, type HorizonId } from "@/lib/horizons";
import type { RangeKind } from "@/lib/types";

type Props = {
  /** Highlights the matching time horizon in the nav. */
  active?: HorizonId | "calendar" | "search";
  /** The search box's current query, on the search page. */
  query?: string;
  /** Legacy prop from the per-source layout; kept so older callers compile. */
  range?: RangeKind;
};

export function Masthead({ active, query }: Props) {
  const now = new Date();
  const today = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: SITE_TZ,
  });
  // Phones: "Sat, Sep 26" leaves room for the search box.
  const short = now.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: SITE_TZ,
  });

  return (
    <header className="masthead">
      <div className="utility">
        <p className="date-line">
          <span className="date-long">{today}</span>
          <span className="date-short">{short}</span>
        </p>
        <div className="utility-right">
          <SearchBox key={query} query={query} />
          <AuthBar />
        </div>
      </div>
      <Link href="/" className="wordmark" aria-label="By the Zeitgeist">
        <span className="wordmark-by" aria-hidden>By the</span>
        {/* Dotless i with our own red dot: the one custom detail in the mark. */}
        <span className="wordmark-name" aria-hidden>
          Zeitge<span className="wordmark-i">ı</span>st
        </span>
      </Link>
      <nav className="section-nav" aria-label="Time windows">
        {HORIZONS.map((h) => (
          <Link
            key={h.id}
            href={`/trending/${h.id}`}
            className={active === h.id ? "on" : ""}
            aria-current={active === h.id ? "page" : undefined}
          >
            {h.label}
          </Link>
        ))}
        <Link
          href="/calendar"
          className={active === "calendar" ? "on" : ""}
          aria-current={active === "calendar" ? "page" : undefined}
        >
          Calendar
        </Link>
      </nav>
    </header>
  );
}
