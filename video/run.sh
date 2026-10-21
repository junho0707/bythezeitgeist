#!/usr/bin/env bash
# One edition, from the site's data to drafts ready to post by hand.
#
#   video/run.sh morning              # today's morning brief
#   video/run.sh weekly 2026-09-27    # a given date
#   PULL=0 ...                        # skip refreshing the zeitgeist data
#   ZG_VOICE=mfsmith ...              # voice reference in voices/ (default mfsmith_64kb)
#
# Editions: morning | midday | evening | yesterday | weekly | monthly (see pick.py).
# Steps: pull -> pick -> write -> images -> TTS -> captions -> check -> build ->
# render -> cover -> post.json -> drafts in to-post/<edition>_<date>/.
# Every step's output stays in episodes/<edition>_<date>/ and a finished step
# is not redone on a re-run (delete its file to force it).

set -euo pipefail
VIDEO="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
REPO="$(dirname "$VIDEO")"
EDITION="${1:?usage: run.sh morning|midday|evening|yesterday|weekly|monthly [YYYY-MM-DD]}"
DATE="${2:-$(date +%F)}"
export ZEITGEIST_DIR="${ZEITGEIST_DIR:-$REPO/zeitgeist}"
EP="episodes/${EDITION}_${DATE}"
STEM="$(basename "$EP")"
NODE="${NODE:-$(command -v node || echo "$HOME/.nvm/versions/node/v22.23.2/bin/node")}"
export PATH="$(dirname "$NODE"):$PATH"
FFMPEG=remotion/node_modules/ffmpeg-static/ffmpeg

cd "$VIDEO"
mkdir -p "$EP"
exec > >(tee -a "$EP/run.log") 2>&1
echo "==> $(date -Is) $EDITION $DATE"

# Refresh the data first: the site's saved state (with the hourly Action's
# summaries), then fresh trends on top. No summaries here (ZG_SUMMARIES=0): the
# Action writes them, and this copy never reaches the site.
if [ "${PULL:-1}" = "1" ]; then
  echo "==> pull"
  (cd "$ZEITGEIST_DIR/blob" && "$NODE" --env-file="$REPO/web/.env.local" sync.mjs pull) || echo "    saved-state pull failed"
  (cd "$ZEITGEIST_DIR" && ZG_SUMMARIES=0 python3 aggregate.py) || echo "    pull failed; using the last good data"
fi

[ -f "$EP/candidates.json" ] || { echo "==> pick"; python3 pipeline/pick.py "$EP" "$EDITION" --date "$DATE"; }
[ -f "$EP/script.json" ]     || { echo "==> write"; python3 pipeline/write.py "$EP"; }
[ -f "$EP/credits.json" ]    || { echo "==> images"; python3 pipeline/images.py "$EP"; }

# Voice (Chatterbox, cloned from a public-domain LibriVox reading) + an automatic
# take check against Whisper; one re-take if the check fails.
voice() {
  cp "voices/${ZG_VOICE:-mfsmith_64kb}.wav" "$EP/reference.wav"
  conda run --no-capture-output -n "${CHATTERBOX_ENV:-chatterbox}" python pipeline/tts.py "$EP" \
    --cfg-weight 0.5 --max-chars 300 --paragraphs --gap 0.45 > "$EP/tts.log" 2>&1
  lead_in
}
# Chatterbox starts speaking on sample 0; a short pause keeps the first word
# from sounding clipped. Captions are timed from this final file, so they follow.
lead_in() {
  "$FFMPEG" -loglevel error -y -i "$EP/output.wav" \
    -af "adelay=350" -ar 24000 -ac 1 "$EP/output.lead.wav" && mv "$EP/output.lead.wav" "$EP/output.wav"
}
captions() {
  "${CAPTIONS_PYTHON:-.venv-captions/bin/python}" pipeline/captions.py "$EP" \
    --model "${WHISPER_MODEL:-large-v3}" --device "${WHISPER_DEVICE:-cuda}"
}
# A finished video is kept (delete its mp4 to remake it).
if [ ! -f "$EP/$STEM.mp4" ] || [ ! -f "$EP/cover.png" ]; then
  [ -f "$EP/output.wav" ] || { echo "==> voice"; voice; }
  echo "==> captions"
  captions
  if ! python3 pipeline/check.py "$EP"; then
    echo "==> voice (re-take)"
    voice && captions
    python3 pipeline/check.py "$EP" || echo "    second take also flagged; using it anyway"
  fi

  echo "==> build + render"
  node pipeline/build.mjs "$EP"
  (cd remotion && npx remotion render Zeitgeist "$VIDEO/$EP/$STEM.mp4" --props="$VIDEO/$EP/props.json" --log=error)
  # Cover / thumbnail: edition, date and the five stories.
  (cd remotion && npx remotion still ZeitgeistCover "$VIDEO/$EP/cover.png" --props="$VIDEO/$EP/props.json" --log=error)
fi

python3 pipeline/post.py "$EP"

# Stage it for bythezeitgeist.com/tiktok (posts through TikTok's Direct Post API).
(cd "$REPO/zeitgeist/blob" && "$NODE" --env-file="$REPO/web/.env.local" stage-video.mjs "$VIDEO/$EP") \
  || echo "    tiktok staging failed"

# Drafts to post by hand: video, cover and copy in to-post/<edition>_<date>/
# (git-ignored).
TOPOST="${ZG_TOPOST:-$REPO/to-post}/$STEM"
mkdir -p "$TOPOST"
cp "$EP/$STEM.mp4" "$TOPOST/video.mp4"; cp "$EP/cover.png" "$TOPOST/cover.png"
python3 -c "import json;p=json.load(open('$EP/post.json'));y=p['youtube'];open('$TOPOST/youtube.txt','w').write(f\"TITLE:\n{y['title']}\n\nDESCRIPTION:\n{y['description']}\n\");open('$TOPOST/facebook.txt','w').write(p['facebook']['caption']+'\n')"
echo "==> drafts: $TOPOST"
