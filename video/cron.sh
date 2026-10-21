#!/usr/bin/env bash
# Cron entry point: make edition(s) ahead of their slot, so `zg` finds them ready.
#   video/cron.sh yesterday morning
# One GPU, so runs queue on a lock (shared with zg.sh) instead of overlapping.
# A failed edition doesn't stop the next one.
VIDEO="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
mkdir -p "$VIDEO/episodes"
exec 9>"$VIDEO/episodes/.lock"
flock 9
for ED in "$@"; do
  "$VIDEO/run.sh" "$ED" || echo "$(date -Is) $ED failed (see video/episodes/${ED}_$(date +%F)/run.log)"
done
