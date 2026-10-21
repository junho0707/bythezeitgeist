#!/usr/bin/env node
/**
 * Zeitgeist step 6: captions.json + script.json + credits.json -> the props
 * the `Zeitgeist` composition renders (remotion/public/zeitgeist.json).
 *
 *   node pipeline/build.mjs episodes/morning_2026-09-26
 *
 * Segment times are the "(pic N)" cuts captions.py found in the audio:
 * pic 1 = intro, pic 2..N-1 = stories, pic N = outro.
 */
import {existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {basename, join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const root = resolve(new URL('..', import.meta.url).pathname);
const epDir = resolve(process.argv[2] ?? '');
if (!process.argv[2] || !existsSync(join(epDir, 'captions.json'))) {
  console.error('usage: build.mjs <episode-dir>   (needs captions.json from captions.py)');
  process.exit(1);
}
const name = basename(epDir);
const read = (f) => JSON.parse(readFileSync(join(epDir, f), 'utf8'));
const caps = read('captions.json');
const script = read('script.json');
const credits = existsSync(join(epDir, 'credits.json')) ? read('credits.json') : [];

// Stories under this many searches/views read as weak on screen; the
// narration already leaves them out (write.py), so the card does too.
const MIN_STAT = 5000;
const SITE = process.env.ZEITGEIST_SITE ?? 'bythezeitgeist.com';

const publicDir = join(root, 'remotion/public');
const link = (target, at) => {
  mkdirSync(join(at, '..'), {recursive: true});
  if (existsSync(at) || (() => { try { return lstatSync(at).isSymbolicLink(); } catch { return false; } })()) rmSync(at);
  symlinkSync(target, at, 'dir');
};
link(epDir, join(publicDir, 'episodes', name));
if (!existsSync(join(publicDir, 'music'))) symlinkSync(join(root, 'music'), join(publicDir, 'music'), 'dir');

const cuts = caps.picCuts ?? [];
const nSeg = script.stories.length + 2;
if (cuts.length !== nSeg) {
  console.error(`expected ${nSeg} pic cuts (intro + stories + outro), captions.json has ${cuts.length}`);
  process.exit(1);
}
const span = (i) => ({start: cuts[i], end: i + 1 < cuts.length ? cuts[i + 1] : caps.narrationSeconds});

const credit = (c) => {
  if (!c?.image) return undefined;
  const author = (c.author || '').replace(/^(.+?)\1$/, '$1').replace(/^Unknown author$/i, '').trim();
  return `Photo: ${author ? `${author} · ` : ''}${c.license}${c.via?.startsWith('pexels') ? ' (Pexels)' : ' via Wikimedia'}`;
};

const segments = [{kind: 'intro', ...span(0)}];
script.stories.forEach((s, i) => {
  const c = credits.find((x) => x.n === i + 1);
  segments.push({
    kind: 'story',
    ...span(i + 1),
    section: s.section,
    number: i + 1,
    title: s.title,
    stat: s.stat.value >= MIN_STAT ? {value: s.stat.value, unit: s.stat.unit, plus: s.stat.plus, source: s.stat.source} : undefined,
    image: c?.image ? `episodes/${name}/${c.image}` : undefined,
    credit: credit(c),
  });
});
segments.push({kind: 'outro', ...span(nSeg - 1)});

// The brand's own bed (music/bythezeitgeist.mp3, Pixabay licence, set by the user);
// else calm public-domain piano from music/library.json, rotated by date.
let music = existsSync(join(root, 'music/bythezeitgeist.mp3')) ? 'music/bythezeitgeist.mp3' : undefined;
const libPath = join(root, 'music/library.json');
if (!music && existsSync(libPath)) {
  const lib = JSON.parse(readFileSync(libPath, 'utf8')).filter((t) => t.file && existsSync(join(root, 'music', t.file)));
  if (lib.length) music = `music/${lib[Number(script.date.replaceAll('-', '')) % lib.length].file}`;
}

// Tracks run from -14 to -29 dB mean, so one fixed volume leaves some inaudible.
// Scale each so the bed sits ~15 dB under the voice (~-19.5 dB mean); 9 dB was too loud.
let musicVolume;
if (music) {
  const ff = join(root, 'remotion/node_modules/ffmpeg-static/ffmpeg');
  const r = spawnSync(ff, ['-hide_banner', '-t', '90', '-i', join(root, music), '-af', 'volumedetect', '-f', 'null', '-'], {encoding: 'utf8'});
  const mean = Number(/mean_volume: (-?[\d.]+)/.exec(r.stderr)?.[1]);
  if (Number.isFinite(mean)) musicVolume = Math.min(1, Math.max(0.02, 10 ** ((-34.5 - mean) / 20)));
}

const props = {
  audio: `episodes/${name}/output.wav`,
  music,
  musicVolume,
  narrationSeconds: caps.narrationSeconds,
  edition: script.name,
  dateline: script.dateline,
  site: SITE,
  cta: script.cta,
  question: script.question ?? undefined,
  captions: caps.captions,
  segments,
};
writeFileSync(join(publicDir, 'zeitgeist.json'), JSON.stringify(props, null, 2));
writeFileSync(join(epDir, 'props.json'), JSON.stringify(props, null, 2));
console.log(`[build] ${segments.length} segments, ${caps.narrationSeconds.toFixed(1)}s narration, music: ${music ?? 'none'} @ ${musicVolume?.toFixed(3) ?? '-'}`);
