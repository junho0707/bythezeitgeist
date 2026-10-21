import { notFound } from "next/navigation";
import { Masthead } from "@/components/Masthead";
import { Modal } from "@/components/Modal";
import { StoryView } from "@/components/StoryView";
import { findStoryAt } from "@/lib/search";

type Where = { horizon: string; date: string } | { day: string };

/**
 * A story opened from a list, at /trending/<window>/<date>/<slug> or
 * /day/<date>/<slug>: the full page, or (inModal) over the list.
 */
export function StoryAtPage({ where, slug, inModal = false }: { where: Where; slug: string; inModal?: boolean }) {
  const story = findStoryAt(where, decodeURIComponent(slug));
  if (!story) notFound();
  const view = <StoryView item={story.item} seen={story.seen} ranks={story.ranks} />;
  if (inModal) return <Modal label={story.item.title}>{view}</Modal>;
  return (
    <div className="shell">
      <Masthead />
      {view}
    </div>
  );
}
