#!/bin/sh
# Chama uma rota de /api/cron do serviço web e escreve uma linha no log do
# contêiner. O segredo vem de /etc/cron.env, gravado na partida, porque o
# crond do busybox não repassa o ambiente do contêiner para as tarefas.
. /etc/cron.env
rota="$1"
espera="${2:-60}"
saida=$(curl -sS -o /dev/null -w '%{http_code}' -m "$espera" -X POST \
  -H "Authorization: Bearer $CRON_SECRET" "$CRON_BASE_URL/api/cron/$rota" 2>&1)
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $rota $saida" > /proc/1/fd/1
