import type { RangeKind, SourceMeta } from "./types";

/** Which columns belong on each edition. The page does not mix the others in. */
export const RANGE_SOURCES: Record<RangeKind, string[]> = {
  trending: ["google_trends"],
  day: ["google_trends"],
  week: ["google_trends", "wikipedia_pageviews"],
};

export function sourcesForRange(range: RangeKind): string[] {
  return RANGE_SOURCES[range];
}

export const SOURCE_CATALOG: SourceMeta[] = [
  {
    id: "google_trends",
    label: "Google Trends",
    kicker: "Searches",
    blurb: "What people are typing into Google right now (US).",
    pollAfterSeconds: 15 * 60,
    defaultEnabled: true,
    category: "attention",
  },
  {
    id: "wikipedia_pageviews",
    label: "Wikipedia",
    kicker: "Pageviews",
    blurb: "Articles the world actually opened. Real view counts.",
    pollAfterSeconds: 6 * 60 * 60,
    defaultEnabled: true,
    category: "attention",
  },
];

export function sourceMeta(id: string): SourceMeta | undefined {
  return SOURCE_CATALOG.find((s) => s.id === id);
}
