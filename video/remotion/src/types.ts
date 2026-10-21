import {z} from 'zod';

/** One authored caption line, with the moment it should appear. */
export const captionLineSchema = z.object({
  text: z.string(),
  /** Seconds from start of narration; when this line is revealed. */
  start: z.number(),
});

export const captionGroupSchema = z.object({
  /** Seconds from start of narration. */
  start: z.number(),
  end: z.number(),
  /**
   * Lines are revealed in turn, not all at once: line 1 appears, line 2 appears
   * beneath it, then the whole group clears for the next one. Breaks come from
   * the script, not from browser wrapping.
   */
  lines: z.array(captionLineSchema),
});

export type CaptionGroup = z.infer<typeof captionGroupSchema>;
