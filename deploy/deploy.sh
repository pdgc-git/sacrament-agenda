#!/usr/bin/env bash
# Deploy the static app to forwartrans-vps (Caddy serves /var/www/sacrament-agenda). No build step.
# Usage: ./deploy/deploy.sh            (rsync + verify)
#        ./deploy/deploy.sh --dry-run
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="forwartrans-vps"
DEST="/var/www/sacrament-agenda/"
URL="${URL:-https://agenda.89-58-18-212.nip.io}"
DRY="${1:-}"

rsync -az --delete ${DRY:+--dry-run -v} \
  --include='/index.html' --include='/simple.html' --include='/planner.html' \
  --include='/style.css' --include='/planner.css' --include='/agenda-paper.css' \
  --include='/hymns.js' \
  --exclude='/js/firebase-config.js' \
  --include='/js/***' \
  --exclude='*' \
  ./ "${HOST}:${DEST}"

if [ -z "$DRY" ]; then
  ssh "$HOST" "chown -R root:root ${DEST} && find ${DEST} -type f -exec chmod 644 {} + && find ${DEST} -type d -exec chmod 755 {} +"
  echo "Deployed. Verifying…"
  curl -sS -o /dev/null -w "planner.html %{http_code}\n" ${URL}/planner.html
  curl -sS -o /dev/null -w "js/vendor/supabase.js %{http_code}\n" ${URL}/js/vendor/supabase.js
fi
