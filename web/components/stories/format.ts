import { storySlug } from "@/lib/slug";
import type { FeedItem, StoryLink } from "@/lib/types";

/** Dates and times read in US Eastern, whatever the server's clock. */
export const SITE_TZ = "America/New_York";

/**
 * A story's address, under the list it was found in: base is that list's
 * place (e.g. /trending/now/2026-09-26 or /day/2026-09-24). Without one,
 * the story's own page.
 */
export function itemHref(item: FeedItem, base?: string): string {
  return `${base ?? "/story"}/${encodeURIComponent(storySlug(item.title))}`;
}

const SOURCE_TAGS: Record<string, string> = {
  google_trends: "Search",
  wikipedia_pageviews: "Wikipedia",
};

/** Short tag telling the reader where the signal comes from. */
export function sourceTag(item: FeedItem): string {
  return SOURCE_TAGS[item.source] ?? item.source;
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  return n.toLocaleString("en-US");
}

/** "2000000+" → "2M+": Google sends raw thresholds. */
function compactTraffic(display: string): string {
  const m = display.replace(/,/g, "").match(/^(\d+)(\+?)$/);
  if (!m) return display;
  const n = Number(m[1]);
  const short = n >= 1_000_000 ? `${n / 1_000_000}M` : n >= 1_000 ? `${n / 1_000}K` : String(n);
  return short + m[2];
}

/** The number, sized for scanning in a list: "974K", "10,000+", "5 of 7". */
export function stat(item: FeedItem): { value: string; unit: string } {
  const { kind, value, display } = item.metric;
  switch (kind) {
    case "views":
      return { value: compact(value), unit: "Wikipedia views" };
    case "traffic":
      return { value: compactTraffic(display), unit: "Google searches" };
    case "days_appeared":
      return { value: `${display} of 7`, unit: "days" };
    default:
      return { value: `No. ${item.rank}`, unit: "in news" };
  }
}

/** One-sentence explanation of the number — our stand-in for a summary. */
export function dek(item: FeedItem): string {
  const { kind, display, caption } = item.metric;
  switch (kind) {
    case "views":
      return `${display} ${caption} on English Wikipedia.`;
    case "traffic":
      return `${compactTraffic(display)} searches in the U.S., by Google’s estimate.`;
    case "days_appeared":
      return `Trending on Google on ${display} of the last 7 days.`;
    default:
      return item.domain
        ? `No. ${item.rank} in the world-news pull, via ${item.domain}.`
        : `No. ${item.rank} in the world-news pull.`;
  }
}

/** One sentence for list rows. Falls back to the number sentence until summaries exist. */
export function summaryOf(item: FeedItem): string {
  return item.summary || dek(item);
}

/** The story page's short summary. */
export function briefOf(item: FeedItem): string {
  return item.brief || item.summary || dek(item);
}

/**
 * Where to read more. Curated links from the pipeline come first, then the
 * item's own source, then reference pages we can build honestly from the title.
 */
export function coverageLinks(item: FeedItem): StoryLink[] {
  const out: StoryLink[] = [...(item.links ?? [])];
  const has = (url: string) => out.some((l) => l.url === url);
  const push = (link: StoryLink) => {
    if (!has(link.url)) out.push(link);
  };

  if (item.url) {
    push({ title: "Original report", url: item.url, outlet: item.domain ?? null });
  }
  if (item.source === "wikipedia_pageviews") {
    push({
      title: item.title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, "_"))}`,
      outlet: "Wikipedia",
    });
  }
  push({
    title: `News coverage of “${item.title}”`,
    url: `https://news.google.com/search?q=${encodeURIComponent(item.title)}`,
    outlet: "Google News",
  });
  return out;
}

export function formatAsOf(raw?: string | null): string | null {
  if (!raw) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: SITE_TZ });
}

/** "September 25" — how a window's date reads in its header. */
export function formatLongDate(raw?: string | null): string | null {
  if (!raw) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: SITE_TZ });
}

/** "September 20 – 26", or "September 27 – October 3" across a month. */
export function formatDateRange(start: string, end: string): string {
  const a = formatLongDate(start) ?? start;
  const b = formatLongDate(end) ?? end;
  const [am] = a.split(" ");
  const [bm, bd] = b.split(" ");
  return am === bm ? `${a} – ${bd}` : `${a} – ${b}`;
}

export function formatTime(raw?: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: SITE_TZ });
}
