import { storySlug } from "./slug";

/*
 * A story is the topic, not the row. "Lizzie Borden" is one story whether it
 * shows up in Today or This week, on Wikipedia or in Google searches, so it
 * gets one discussion thread. Item keys (source:range:slug) still identify
 * rows; story keys identify conversations.
 */

export function storyKey(title: string): string {
  return `story:${storySlug(title)}`;
}
