import { listDays, loadDayFeeds } from "./feeds";
import { sourceLists, type SourceList } from "./horizons";
import type { FeedItem } from "./types";

/*
 * Saved days: the pipeline archives each finished day's lists in
 * output/history/<date>.json. A day reads like the Today list did.
 */

export type SavedDay = { date: string; lists: SourceList[] };

export function loadDay(date: string): SavedDay | null {
  const feeds = loadDayFeeds(date);
  if (!feeds) return null;
  return { date, lists: sourceLists(feeds) };
}

/** date -> the day's lists, for the saved days between start and end. */
export function loadDays(start: string, end: string): Map<string, SourceList[]> {
  const out = new Map<string, SourceList[]>();
  for (const date of listDays()) {
    if (date < start || date > end) continue;
    const day = loadDay(date);
    if (day) out.set(date, day.lists);
  }
  return out;
}

// Dates are plain "YYYY-MM-DD" strings, handled in UTC so no timezone
// shifts a day.
function parse(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

export function monthBounds(date: string): { start: string; end: string } {
  const d = parse(date);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { start: iso(start), end: iso(end) };
}

/** Today in the US (Eastern), the day the pipeline files under; the server's own clock may be UTC. */
export function localToday(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export function formatDay(date: string, opts: Intl.DateTimeFormatOptions): string {
  return parse(date).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

export function weekday(date: string): number {
  return parse(date).getUTCDay();
}

/** Months that have saved days, newest first ("2026-09"). */
export function savedMonths(): string[] {
  return [...new Set(listDays().map((d) => d.slice(0, 7)))].sort().reverse();
}

/**
 * This month, one list per source: each topic's daily numbers added up over
 * the month's saved days — Google's search estimates, Wikipedia's page
 * views — ranked by the total. Each story keeps its latest day's headline.
 */
export function loadMonth(date: string): { start: string; end: string; lists: SourceList[] } {
  const { start, end } = monthBounds(date);
  const bySource = new Map<string, { list: SourceList; totals: Map<string, { item: FeedItem; sum: number }> }>();
  // Oldest day first, so the newest day's row (headline, picture) wins.
  for (const lists of [...loadDays(start, end).values()]) {
    for (const list of lists) {
      const entry = bySource.get(list.source) ?? { list, totals: new Map() };
      bySource.set(list.source, entry);
      for (const item of list.items) {
        if (item.metric.kind !== "views" && item.metric.kind !== "traffic") continue;
        const k = item.title.toLowerCase();
        entry.totals.set(k, { item, sum: (entry.totals.get(k)?.sum ?? 0) + item.metric.value });
      }
    }
  }
  const lists = [...bySource.values()].map(({ list, totals }) => ({
    ...list,
    items: [...totals.values()]
      .sort((a, b) => b.sum - a.sum)
      .map(({ item, sum }, i) => ({
        ...item,
        rank: i + 1,
        metric:
          item.metric.kind === "views"
            ? { kind: "views" as const, value: sum, display: sum.toLocaleString("en-US"), caption: "views this month" }
            : // Google gives floors ("50K+"), so the total is a floor too.
              { kind: "traffic" as const, value: sum, display: `${sum}+`, caption: "approx. US searches this month" },
      })),
  }));
  return { start, end, lists };
}
