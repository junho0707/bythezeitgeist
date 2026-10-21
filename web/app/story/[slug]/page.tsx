import { notFound } from "next/navigation";
import { Masthead } from "@/components/Masthead";
import { StoryView } from "@/components/StoryView";
import { findStory } from "@/lib/search";
import { loadData } from "@/lib/store";

export const dynamic = "force-dynamic";

/** One page per story, whichever window or day it was found in. */
export default async function StoryPage({ params }: { params: Promise<{ slug: string }> }) {
  await loadData();
  const { slug } = await params;
  const story = findStory(decodeURIComponent(slug));
  if (!story) notFound();
  return (
    <div className="shell">
      <Masthead />
      <StoryView item={story.item} seen={story.seen} />
    </div>
  );
}
