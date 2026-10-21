import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  Sequence,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {fitText} from '@remotion/layout-utils';
import {z} from 'zod';
import {loadFont as loadNewsreader} from '@remotion/google-fonts/Newsreader';
import {loadFont as loadInter} from '@remotion/google-fonts/Inter';
import {captionGroupSchema, type CaptionGroup} from './types';

/**
 * By The Zeitgeist news Shorts (morning brief, midday, evening, weekly, monthly).
 * Newspaper look taken from the site: Newsreader + Inter, black on white,
 * hairlines, one red accent. Props come from scripts/zeitgeist/build.mjs.
 *
 * The video is a run of segments -- intro, one per story, outro -- whose
 * start/end times come from the narration (the "(pic N)" cuts captions.py
 * finds), so every card changes exactly when the voice moves on.
 */

const SERIF = loadNewsreader('normal', {weights: ['500', '600', '700'], subsets: ['latin'], ignoreTooManyRequestsWarning: true}).fontFamily;
const SERIF_ITALIC = loadNewsreader('italic', {weights: ['500'], subsets: ['latin'], ignoreTooManyRequestsWarning: true}).fontFamily;
const SANS = loadInter('normal', {weights: ['500', '600', '700', '800'], subsets: ['latin'], ignoreTooManyRequestsWarning: true}).fontFamily;

export const ZG = {
  ink: '#121212',
  muted: '#6b6b6b',
  rule: '#dadada',
  accent: '#b00020',
  paper: '#ffffff',
  margin: 64,
  /** Everything important stays above this; YouTube/IG put their UI below. */
  bottomSafe: 1560,
  /** Seconds the outro card is held after the last word. */
  tail: 1.6,
  musicVolume: 0.07,
} as const;

const statSchema = z.object({
  value: z.number(),
  /** "searches" / "views"; drawn after the number. */
  unit: z.string(),
  /** Google's traffic buckets are floors ("100K+"). */
  plus: z.boolean().default(false),
  source: z.string(),
});

export const zgSegmentSchema = z.object({
  kind: z.enum(['intro', 'story', 'outro']),
  start: z.number(),
  end: z.number(),
  /** Section label shown in red above the story, e.g. "Yesterday". */
  section: z.string().optional(),
  number: z.number().optional(),
  title: z.string().optional(),
  stat: statSchema.optional(),
  image: z.string().optional(),
  credit: z.string().optional(),
  /** CSS object-position for the photo. */
  focal: z.string().optional(),
});

export const zeitgeistSchema = z.object({
  audio: z.string(),
  music: z.string().optional(),
  /** Per-track level from build.mjs (tracks differ by ~15 dB); else ZG.musicVolume. */
  musicVolume: z.number().optional(),
  narrationSeconds: z.number(),
  edition: z.string(),
  dateline: z.string(),
  site: z.string(),
  cta: z.string(),
  question: z.string().optional(),
  captions: z.array(captionGroupSchema),
  segments: z.array(zgSegmentSchema),
});

/** The site's wordmark (web/components/Masthead.tsx): Fraunces, "By the" at
 * about 60% of "Zeitgeist", and a dotless i carrying a red dot. */
const BRAND_FONT = 'ZgBrand';
if (typeof FontFace !== 'undefined') {
  const handle = delayRender('Fraunces');
  const face = new FontFace(BRAND_FONT, `url(${staticFile('fonts/Fraunces-var.ttf')})`, {weight: '100 900'});
  face.load().then((f) => {
    document.fonts.add(f);
    continueRender(handle);
  });
}

/** size = font size of "Zeitgeist" in px. */
const Wordmark: React.FC<{size: number; style?: React.CSSProperties}> = ({size, style}) => (
  <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'center', fontFamily: BRAND_FONT, lineHeight: 1, color: ZG.ink, ...style}}>
    <span style={{marginRight: '0.28em', fontSize: size * 0.606, fontWeight: 600, fontVariationSettings: '"opsz" 72, "SOFT" 0, "WONK" 1', letterSpacing: '-0.02em'}}>
      By the
    </span>
    <span style={{fontSize: size, fontWeight: 600, fontVariationSettings: '"opsz" 60, "SOFT" 0, "WONK" 1', letterSpacing: '-0.035em'}}>
      Zeitge
      <span style={{position: 'relative'}}>
        ı
        <span
          style={{
            position: 'absolute',
            left: '50%',
            top: '0.32em',
            width: '0.15em',
            height: '0.15em',
            borderRadius: '50%',
            backgroundColor: ZG.accent,
            transform: 'translateX(-50%)',
          }}
        />
      </span>
      st
    </span>
  </div>
);

export type ZgSegment = z.infer<typeof zgSegmentSchema>;
export type ZeitgeistProps = z.infer<typeof zeitgeistSchema>;

export const zeitgeistDuration = (p: ZeitgeistProps, fps: number) =>
  Math.round((p.narrationSeconds + ZG.tail) * fps);

export const Zeitgeist: React.FC<ZeitgeistProps> = ({
  audio,
  music,
  musicVolume,
  narrationSeconds,
  edition,
  dateline,
  site,
  cta,
  question,
  captions,
  segments,
}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const t = frame / fps;
  const stories = segments.filter((s) => s.kind === 'story');

  // The outro holds past the last word, so stretch the final segment.
  const segs = segments.map((s, i) => (i === segments.length - 1 ? {...s, end: narrationSeconds + ZG.tail} : s));
  const index = Math.max(0, segs.findIndex((s) => t >= s.start && t < s.end));
  const seg = segs[index];
  const storyIndex = stories.findIndex((s) => s.start === seg.start);

  const musicFade = interpolate(frame, [durationInFrames - fps, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{backgroundColor: ZG.paper, color: ZG.ink}}>
      <Audio src={staticFile(audio)} />
      {music ? <Audio src={staticFile(music)} volume={(musicVolume ?? ZG.musicVolume) * musicFade} /> : null}

      {segs.map((s, i) => (
        <Sequence
          key={i}
          from={Math.round(s.start * fps)}
          durationInFrames={Math.max(1, Math.round((s.end - s.start) * fps))}
        >
          {s.kind === 'intro' ? (
            <Intro edition={edition} dateline={dateline} stories={stories} seconds={s.end - s.start} />
          ) : s.kind === 'outro' ? (
            <Outro site={site} cta={cta} question={question} />
          ) : (
            <Story seg={s} total={stories.length} />
          )}
        </Sequence>
      ))}

      {seg.kind === 'story' ? <Masthead edition={edition} dateline={dateline} /> : null}
      {seg.kind === 'story' ? <Progress total={stories.length} current={storyIndex} /> : null}

      <Sequence durationInFrames={Math.round(narrationSeconds * fps)}>
        {seg.kind === 'story' ? <Captions groups={captions} /> : null}
      </Sequence>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ pieces

const Masthead: React.FC<{edition: string; dateline: string}> = ({edition, dateline}) => (
  <div style={{position: 'absolute', top: 150, left: ZG.margin, right: ZG.margin, textAlign: 'center'}}>
    <Wordmark size={66} />
    <div style={{marginTop: 14, borderTop: `3px solid ${ZG.ink}`, borderBottom: `1px solid ${ZG.ink}`, height: 4}} />
    <div
      style={{
        marginTop: 12,
        display: 'flex',
        justifyContent: 'space-between',
        fontFamily: SANS,
        fontWeight: 700,
        fontSize: 24,
        letterSpacing: 2,
        textTransform: 'uppercase',
      }}
    >
      <span style={{color: ZG.accent}}>{edition}</span>
      <span style={{color: ZG.muted}}>{dateline}</span>
    </div>
  </div>
);

const Progress: React.FC<{total: number; current: number}> = ({total, current}) => (
  <div style={{position: 'absolute', top: 318, left: ZG.margin, right: ZG.margin, display: 'flex', gap: 10}}>
    {Array.from({length: total}, (_, i) => (
      <div key={i} style={{flex: 1, height: 5, backgroundColor: i <= current ? ZG.ink : ZG.rule}} />
    ))}
  </div>
);

const compact = (n: number) =>
  n >= 1e6 ? `${+(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n.toLocaleString('en-US');

const Story: React.FC<{seg: ZgSegment; total: number}> = ({seg}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const dur = (seg.end - seg.start) * fps;
  const ease = Easing.bezier(0.2, 0.7, 0.2, 1);

  const reveal = interpolate(frame, [0, 10], [0, 100], {extrapolateRight: 'clamp', easing: ease});
  const rise = (delay: number) => ({
    opacity: interpolate(frame, [delay, delay + 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
    transform: `translateY(${interpolate(frame, [delay, delay + 10], [24, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease})}px)`,
  });
  const zoom = interpolate(frame, [0, dur], [1.02, 1.12]);
  const count = seg.stat ? interpolate(frame, [6, 6 + fps * 0.9], [0, seg.stat.value], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)}) : 0;

  const width = 1080 - ZG.margin * 2;
  const title = seg.title ?? '';
  const fitted = fitText({text: title, withinWidth: width, fontFamily: SERIF, fontWeight: '600'}).fontSize;
  const titleSize = Math.max(62, Math.min(104, fitted));

  const photoH = seg.image ? 780 : 0;

  return (
    <AbsoluteFill>
      <div style={{position: 'absolute', top: 352, left: ZG.margin, right: ZG.margin}}>
        <div
          style={{
            ...rise(0),
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: SANS,
            fontWeight: 800,
            fontSize: 30,
            letterSpacing: 3,
            textTransform: 'uppercase',
            color: ZG.accent,
          }}
        >
          <span>{seg.section}</span>
          <span style={{color: ZG.ink}}>No. {seg.number}</span>
        </div>

        {seg.image ? (
          <div style={{marginTop: 20, height: photoH, overflow: 'hidden', clipPath: `inset(0 ${100 - reveal}% 0 0)`, backgroundColor: '#eee'}}>
            <Img
              src={staticFile(seg.image)}
              style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: seg.focal ?? 'center 30%', transform: `scale(${zoom})`}}
            />
          </div>
        ) : (
          <div style={{marginTop: 20, height: 4, backgroundColor: ZG.ink, width: `${reveal}%`}} />
        )}
        {seg.credit ? (
          <div style={{marginTop: 8, fontFamily: SANS, fontSize: 18, color: ZG.muted, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
            {seg.credit}
          </div>
        ) : null}

        <div
          style={{
            ...rise(4),
            marginTop: seg.image ? 18 : 120,
            fontFamily: SERIF,
            fontWeight: 600,
            fontSize: seg.image ? titleSize : Math.min(140, titleSize * 1.3),
            lineHeight: 1.02,
            letterSpacing: -1.5,
          }}
        >
          {title}
        </div>

        {seg.stat ? (
          <div style={{...rise(8), marginTop: 18, display: 'flex', alignItems: 'baseline', gap: 14, fontFamily: SANS}}>
            <span style={{fontWeight: 800, fontSize: 56, fontVariantNumeric: 'tabular-nums'}}>
              {compact(count)}
              {seg.stat.plus ? '+' : ''}
            </span>
            <span style={{fontWeight: 600, fontSize: 30, color: ZG.muted}}>
              {seg.stat.unit} · {seg.stat.source}
            </span>
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

const Captions: React.FC<{groups: CaptionGroup[]}> = ({groups}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const g = groups.find((x) => t >= x.start && t < x.end);
  if (!g) return null;
  return (
    <div
      style={{
        position: 'absolute',
        top: 1450,
        left: ZG.margin,
        right: ZG.margin,
        borderTop: `1px solid ${ZG.rule}`,
        paddingTop: 22,
        fontFamily: SERIF_ITALIC,
        fontWeight: 500,
        fontSize: 60,
        lineHeight: 1.16,
        color: ZG.ink,
      }}
    >
      {g.lines.filter((l) => t >= l.start).map((l, i) => (
        <div key={i}>{l.text}</div>
      ))}
    </div>
  );
};

const Intro: React.FC<{edition: string; dateline: string; stories: ZgSegment[]; seconds: number}> = ({edition, dateline, stories, seconds}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const fade = (d: number) => interpolate(frame, [d, d + 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const rule = interpolate(frame, [0, 14], [0, 100], {extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  // Spread the table of contents over the intro so it finishes as the first story starts.
  const step = Math.max(3, Math.min(8, ((seconds * fps) - 18) / Math.max(1, stories.length)));
  return (
    <AbsoluteFill style={{padding: `0 ${ZG.margin}px`}}>
      <div style={{marginTop: 260, textAlign: 'center'}}>
        <Wordmark size={132} style={{opacity: fade(0)}} />
        <div style={{margin: '26px auto 0', width: `${rule}%`, borderTop: `4px solid ${ZG.ink}`, borderBottom: `1px solid ${ZG.ink}`, height: 6}} />
        <div style={{opacity: fade(6), marginTop: 30, fontFamily: SANS, fontWeight: 800, fontSize: 40, letterSpacing: 5, textTransform: 'uppercase', color: ZG.accent}}>
          {edition}
        </div>
        <div style={{opacity: fade(9), marginTop: 12, fontFamily: SANS, fontWeight: 600, fontSize: 32, letterSpacing: 2, textTransform: 'uppercase', color: ZG.muted}}>
          {dateline}
        </div>
      </div>
      <div style={{marginTop: 110}}>
        {stories.map((s, i) => (
          <div
            key={i}
            style={{
              opacity: fade(14 + i * step),
              display: 'flex',
              gap: 28,
              alignItems: 'baseline',
              padding: '28px 0',
              borderTop: `1px solid ${i === 0 ? ZG.ink : ZG.rule}`,
            }}
          >
            <span style={{fontFamily: SANS, fontWeight: 800, fontSize: 44, color: ZG.accent, width: 56}}>{i + 1}</span>
            <span style={{fontFamily: SERIF, fontWeight: 600, fontSize: 68, lineHeight: 1.1}}>{s.title}</span>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC<{site: string; cta: string; question?: string}> = ({site, cta, question}) => {
  const frame = useCurrentFrame();
  const fade = (d: number) => interpolate(frame, [d, d + 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', padding: `0 ${ZG.margin}px`, paddingBottom: 300, textAlign: 'center'}}>
      {question ? (
        <div style={{opacity: fade(0), marginBottom: 90}}>
          <div style={{fontFamily: SERIF, fontWeight: 700, fontSize: 76, lineHeight: 1.1, letterSpacing: -1}}>{question}</div>
          <div style={{marginTop: 22, fontFamily: SANS, fontWeight: 800, fontSize: 40, letterSpacing: 3, textTransform: 'uppercase', color: ZG.accent}}>Tell us in the comments</div>
        </div>
      ) : null}
      <Wordmark size={question ? 96 : 124} style={{opacity: fade(question ? 20 : 0)}} />
      <div style={{opacity: fade(0), margin: '24px 0', width: '100%', borderTop: `4px solid ${ZG.ink}`, borderBottom: `1px solid ${ZG.ink}`, height: 6}} />
      <div style={{opacity: fade(4), fontFamily: SERIF_ITALIC, fontWeight: 500, fontSize: 52, lineHeight: 1.2}}>Spirit of the times.</div>
      <div style={{opacity: fade(8), marginTop: 44, fontFamily: SANS, fontWeight: 800, fontSize: 44, letterSpacing: 1, color: ZG.accent}}>{site}</div>
      <div style={{opacity: fade(12), marginTop: 18, fontFamily: SANS, fontWeight: 600, fontSize: 34, color: ZG.muted}}>{cta}</div>
    </AbsoluteFill>
  );
};

/** Thumbnail / IG cover (a still, same props as the video): what edition, which
 * day, and the five stories, readable at feed size. */
export const ZeitgeistCover: React.FC<ZeitgeistProps> = ({edition, dateline, site, segments}) => {
  const stories = segments.filter((s) => s.kind === 'story');
  // The first story with a photo leads; the rest of the cover is the numbered list,
  // so it reads as "today's top 5 news" at a glance.
  const hero = stories.find((s) => s.image);
  const editionSize = Math.min(128, fitText({text: edition, withinWidth: 1080 - 2 * ZG.margin - 10, fontFamily: SERIF, fontWeight: '700', letterSpacing: '-3px'}).fontSize);
  const heroH = 760;
  const rowH = 168;
  return (
    <AbsoluteFill style={{backgroundColor: ZG.paper, color: ZG.ink}}>
      <div style={{height: 190, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 26}}>
        <Wordmark size={96} />
      </div>
      <div style={{position: 'relative', height: heroH, overflow: 'hidden', backgroundColor: ZG.ink}}>
        {hero ? <Img src={staticFile(hero.image!)} style={{width: '100%', height: '100%', objectFit: 'cover'}} /> : null}
        <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 22%, rgba(0,0,0,0.55) 48%, rgba(0,0,0,0.85) 100%)'}} />
        <div style={{position: 'absolute', left: ZG.margin, right: ZG.margin, bottom: 44}}>
          <div style={{display: 'inline-block', backgroundColor: ZG.accent, color: '#fff', fontFamily: SANS, fontWeight: 900, fontSize: 104, letterSpacing: 1, padding: '12px 26px 6px', lineHeight: 1}}>
            TOP 5 NEWS
          </div>
          <div style={{marginTop: 18, color: '#fff', fontFamily: SERIF, fontWeight: 700, fontSize: editionSize, lineHeight: 1, letterSpacing: -3, whiteSpace: 'nowrap'}}>
            {edition}
          </div>
          <div style={{marginTop: 20, display: 'inline-block', border: '4px solid #fff', color: '#fff', fontFamily: SANS, fontWeight: 900, fontSize: 64, letterSpacing: 4, padding: '8px 22px 4px', lineHeight: 1, textTransform: 'uppercase'}}>
            {dateline}
          </div>
        </div>
      </div>
      <div style={{padding: `18px ${ZG.margin}px 0`}}>
        {stories.map((s, i) => (
          <div key={i} style={{height: rowH, display: 'flex', alignItems: 'center', gap: 28, borderTop: i ? `1.5px solid ${ZG.rule}` : 'none'}}>
            <div style={{flex: 'none', width: 78, height: 78, borderRadius: 39, backgroundColor: ZG.accent, color: '#fff', fontFamily: SANS, fontWeight: 900, fontSize: 50, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
              {i + 1}
            </div>
            <div style={{flex: 1, fontFamily: SERIF, fontWeight: 700, fontSize: 80, lineHeight: 1, letterSpacing: -1.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{s.title}</div>
            {s.image ? (
              <Img src={staticFile(s.image)} style={{flex: 'none', width: 136, height: 136, objectFit: 'cover', borderRadius: 10}} />
            ) : null}
          </div>
        ))}
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 44, textAlign: 'center', fontFamily: SANS, fontWeight: 700, fontSize: 36, color: ZG.muted}}>
        {site}
      </div>
    </AbsoluteFill>
  );
};
