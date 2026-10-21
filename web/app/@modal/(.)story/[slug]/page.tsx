import { notFound } from "next/navigation";
import { Modal } from "@/components/Modal";
import { StoryView } from "@/components/StoryView";
import { findStory } from "@/lib/search";
import { loadData } from "@/lib/store";

export const dynamic = "force-dynamic";

/** A story clicked from a list opens over it; /story/[slug] is the full page. */
export default async function StoryModal({ params }: { params: Promise<{ slug: string }> }) {
  await loadData();
  const { slug } = await params;
  const story = findStory(decodeURIComponent(slug));
  if (!story) notFound();
  return (
    <Modal label={story.item.title}>
      <StoryView item={story.item} seen={story.seen} />
    </Modal>
  );
}
