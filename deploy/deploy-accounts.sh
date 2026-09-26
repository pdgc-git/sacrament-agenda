#!/usr/bin/env bash
# Deploy the accounts service (server/agenda-accounts) to forwartrans-vps as a systemd unit.
# First run also writes /etc/agenda-accounts.env from the Supabase .env (keys never leave the VPS).
set -euo pipefail
cd "$(dirname "$0")/.."
HOST="forwartrans-vps"

rsync -az server/agenda-accounts/agenda_accounts.py "${HOST}:/opt/agenda-accounts/"
rsync -az server/agenda-accounts/agenda-accounts.service "${HOST}:/etc/systemd/system/agenda-accounts.service"
ssh "$HOST" 'set -e
  chmod 755 /opt/agenda-accounts; chmod 644 /opt/agenda-accounts/agenda_accounts.py
  if [ ! -f /etc/agenda-accounts.env ]; then
    umask 077
    { echo "KONG_URL=http://127.0.0.1:8000"
      grep "^ANON_KEY=" /srv/supabase/.env
      grep "^SERVICE_ROLE_KEY=" /srv/supabase/.env
      echo "PORT=8790"; } > /etc/agenda-accounts.env
  fi
  systemctl daemon-reload
  systemctl enable --now agenda-accounts >/dev/null
  systemctl restart agenda-accounts
  sleep 1; systemctl is-active agenda-accounts'
