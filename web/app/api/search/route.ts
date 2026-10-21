import { NextResponse } from "next/server";
import { itemHref, summaryOf } from "@/components/stories/format";
import { searchStories } from "@/lib/search";
import { loadData } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Matching stories for the search box, as you type. */
export async function GET(request: Request) {
  await loadData();
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const stories = searchStories(q).slice(0, 6);
  return NextResponse.json({
    results: stories.map((s) => ({
      title: s.item.title,
      summary: summaryOf(s.item),
      image: s.item.image ?? null,
      href: itemHref(s.item, s.seen[0]?.base),
      seen: s.seen[0]?.label ?? null,
    })),
  });
}
