import { notFound, permanentRedirect } from "next/navigation";
import { itemHref } from "@/components/stories/format";
import { findItem } from "@/lib/feeds";
import { loadData } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Old per-row links (/item/source:range:slug) now go to the story's page. */
export default async function ItemPage({ params }: { params: Promise<{ key: string }> }) {
  await loadData();
  const { key } = await params;
  const item = findItem(decodeURIComponent(key));
  if (!item) notFound();
  permanentRedirect(itemHref(item));
}
