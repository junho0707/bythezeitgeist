#!/usr/bin/env bash
# Get the edition(s) due now ready to post by hand on YouTube and Facebook.
#
#   zg                     # by the clock: before 11 yesterday + morning (+ weekly on
#                          # Sunday, monthly on the 1st), before 16 midday, then evening
#   zg evening             # a given edition, today
#   zg weekly 2026-09-27   # a given edition and date
#
# Whatever cron already made is reused, so this is quick after a cron run and
# makes the video from scratch otherwise. Nothing is posted: that's done by hand.
set -uo pipefail
VIDEO="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
cd "$VIDEO"
DATE="${2:-$(date +%F)}"
if [ -n "${1:-}" ]; then
  EDITIONS=("$1")
else
  H=$((10#$(date +%H)))
  if [ "$H" -lt 11 ]; then
    EDITIONS=(yesterday morning)
    [ "$(date +%u)" = 7 ] && EDITIONS+=(weekly)
    [ "$(date +%d)" = 01 ] && EDITIONS+=(monthly)
  elif [ "$H" -lt 16 ]; then EDITIONS=(midday)
  else EDITIONS=(evening)
  fi
fi

# Same lock as cron.sh: one GPU, so wait for a cron run instead of overlapping it.
mkdir -p episodes
exec 9>episodes/.lock
flock -n 9 || { echo "cron is making a video; waiting for it..."; flock 9; }

TOPOST="${ZG_TOPOST:-$(dirname "$VIDEO")/to-post}"
OK=()
for ED in "${EDITIONS[@]}"; do
  echo "==> $ED $DATE"
  if ./run.sh "$ED" "$DATE" > /dev/null; then
    OK+=("$ED")
  else
    echo "    failed: $(grep -m1 -oP '"message": "\K[^"]+' "episodes/${ED}_${DATE}/run.log" || echo "see video/episodes/${ED}_${DATE}/run.log")"
  fi
done

for ED in "${OK[@]}"; do
  D="$TOPOST/${ED}_${DATE}"
  cat <<EOF

━━ ${ED} ${DATE}: $(sed -n 2p "$D/youtube.txt")
  Files: $D  (video.mp4, cover.png, youtube.txt, facebook.txt)

  YOUTUBE: studio.youtube.com → Create → Upload → video.mp4
    title + description from youtube.txt → thumbnail = cover.png → Publish
  FACEBOOK: facebook.com (as the Page) → Reel → video.mp4
    caption = facebook.txt → auto captions on → Share
  (In the Windows file picker: \\\\wsl.localhost\\Ubuntu${D//\//\\})
EOF
done
