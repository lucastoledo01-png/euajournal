#!/bin/sh
set -e
if [ -z "$CRON_SECRET" ]; then
  echo "CRON_SECRET vazio: os relógios não vão ligar." >&2
  exit 1
fi
CRON_BASE_URL="${CRON_BASE_URL:-http://euajournal_web:80}"
umask 077
printf 'CRON_SECRET=%s\nCRON_BASE_URL=%s\n' "'$CRON_SECRET'" "'$CRON_BASE_URL'" > /etc/cron.env
echo "relógios do eua.journal ligados, chamando $CRON_BASE_URL"
exec crond -f -l 8
