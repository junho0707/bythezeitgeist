export type RangeKind = "trending" | "day" | "week";

export type MetricKind = "views" | "traffic" | "days_appeared" | "count" | "rank";

export function parseRange(raw: string | null | undefined): RangeKind {
  if (raw === "day" || raw === "week" || raw === "trending") return raw;
  return "trending";
}

export function rangeLabel(range: RangeKind): string {
  if (range === "week") return "This week";
  if (range === "trending") return "Trending now";
  return "Today";
}

export type FeedItem = {
  key: string;
  source: string;
  range: RangeKind;
  rank: number;
  title: string;
  url?: string | null;
  domain?: string | null;
  metric: {
    kind: MetricKind;
    value: number;
    display: string;
    caption: string;
  };
  /** One sentence shown under the headline in lists. */
  summary?: string | null;
  /** A few sentences shown on the story page. */
  brief?: string | null;
  /** Optional picture for the story (URL), shown with the top stories. */
  image?: string | null;
  /** Coverage of this story elsewhere: outlets, reference pages, sources. */
  links?: StoryLink[];
  extra?: Record<string, unknown>;
};

export type StoryLink = {
  title: string;
  url: string;
  /** Publisher or site name, e.g. "Reuters", "Wikipedia". */
  outlet?: string | null;
};

export type FeedPayload = {
  source: string;
  label: string;
  kicker: string;
  range: RangeKind;
  asOf?: string | null;
  fetchedAt?: string | null;
  stale: boolean;
  staleReason?: string | null;
  note?: string | null;
  error?: string | null;
  pollAfterSeconds: number;
  itemCount: number;
  items: FeedItem[];
};

export type SourceMeta = {
  id: string;
  label: string;
  kicker: string;
  blurb: string;
  pollAfterSeconds: number;
  defaultEnabled: boolean;
  category: "attention";
};

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
};

export type CommentNode = {
  id: string;
  itemKey: string;
  userId: string;
  displayName: string;
  parentId: string | null;
  body: string;
  score: number;
  myVote: 1 | -1 | 0;
  createdAt: string;
  replies: CommentNode[];
};
