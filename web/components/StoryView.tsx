import { CommentSection } from "@/components/CommentSection";
import { ShareButton } from "@/components/ShareButton";
import { briefOf, coverageLinks, stat } from "@/components/stories/format";
import { placements } from "@/lib/horizons";
import { storyKey } from "@/lib/stories";
import type { Sighting } from "@/lib/search";
import type { FeedItem } from "@/lib/types";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** A story in full: its page, or the same thing in a modal over a list. */
export function StoryView({
  item,
  seen = [],
  ranks: given,
}: {
  item: FeedItem;
  /** Every list and saved day the story made. */
  seen?: Sighting[];
  /** Where it ranked in the list it was opened from; else where it stands now. */
  ranks?: string[];
}) {
  const s = stat(item);
  // Where it stands now; a story from a past day shows its latest day.
  // (Only worked out when the caller didn't say: it reads every window.)
  const live = () => placements(item.title).map((r) => `No. ${r.rank} ${r.label.toLowerCase()}`);
  // The number below names the source, so the ranks don't repeat it.
  const now = given ? [] : live();
  const ranks = [...new Set(given ?? (now.length > 0 ? now : seen.slice(0, 1).map((x) => x.label)))];
  const links = coverageLinks(item);

  return (
    <article className="column story-page">
      <header className="story-head">
        {/* Small and set apart by a hairline: the title reads first. */}
        <ul className="story-label story-tags">
          {ranks.map((r) => (
            <li key={r}>{r}</li>
          ))}
          <li>
            {s.value} {s.unit}
          </li>
        </ul>
        <h1 className="hl hl-display">{item.title}</h1>
        <p className="story-brief">{briefOf(item)}</p>
        <p className="story-share">
          <ShareButton />
        </p>
      </header>

      {/* Two columns: the conversation left, where to read more right. */}
      <div className="story-cols">
        <div id="feed" className="story-comments">
          {/* One thread per story, shared by every window and source it appears in. */}
          <CommentSection itemKey={storyKey(item.title)} />
        </div>
        <section className="story-block" aria-labelledby="coverage">
          <h2 id="coverage" className="block-title">
            Sources
          </h2>
          <ul className="link-list">
            {links.map((l) => (
              <li key={l.url}>
                <a href={l.url} target="_blank" rel="noreferrer">
                  <span className="link-outlet">{l.outlet ?? hostOf(l.url)}</span>
                  <span className="link-title">{l.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>

    </article>
  );
}
