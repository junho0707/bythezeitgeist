/**
 * A story's slug: its title, lowercased, accents and punctuation dropped
 * ("Türkiye vs France" -> "turkiye-vs-france"). Titles with no Latin
 * letters (e.g. 刘欢) keep their own characters so they don't all collide.
 */
export function storySlug(title: string): string {
  const latin = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return latin || title.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 80);
}
