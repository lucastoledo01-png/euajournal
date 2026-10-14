# Aplicação web: site, painel e a redação diária.
#
# Inclui Chromium, e a razão mudou de lado. Antes a renderização dos slides
# acontecia só no worker, e carregar ~400 MB de navegador aqui seria peso morto.
#
# Depois que o artefato do social passou a ser CONGELADO no momento da
# aprovação — para o que vai ao ar ser exatamente o que passou pelo Social
# Guard, e não uma nova renderização feita horas depois —, quem desenha a peça é
# a redação, que roda neste contêiner. O worker deixou de desenhar: ele baixa o
# arquivo aprovado e confere o SHA-256.
#
# O motivo original de não ter Chromium aqui ("a hospedagem compartilhada não
# permite") também não vale mais: web e worker são dois serviços Docker na mesma
# VPS.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# O domínio do portal entra no build: o Next grava NEXT_PUBLIC_* no pacote.
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
# A chave pública do Turnstile também (14/10/2026): sem ela o build gravava a
# chave de fallback do código, do widget antigo, e o captcha travava em
# "Verificando" no domínio novo.
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# O server.js standalone do Next usa a env HOSTNAME para decidir em qual
# endereço escutar — sem isso, ele herda o HOSTNAME que o Docker injeta
# automaticamente em todo contêiner (o ID do contêiner), e passa a escutar
# só nesse endereço específico em vez de todas as interfaces. Resultado:
# ECONNREFUSED em localhost/127.0.0.1 por dentro do próprio contêiner e o
# Traefik incapaz de rotear pra ele por fora (502).
ENV HOSTNAME=0.0.0.0

# O navegador fica fora do HOME do usuário da aplicação, num caminho fixo e
# legível por todos: a instalação acontece como root, e o processo roda como
# `nextjs`. Sem isso o Chromium iria para /root/.cache e o app não o acharia.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# A versão vem fixada e igual à do package-lock. Divergência entre a biblioteca
# e o binário do navegador é o tipo de falha que só aparece em produção, no
# primeiro render.
# --with-deps traz as bibliotecas de sistema que o Chromium exige.
RUN npx -y playwright@1.62.1 install --with-deps chromium \
  && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# `playwright-core` entra explicitamente, e não pela análise de dependências do
# Next: ele é carregado por `await import("playwright-core")` dentro do módulo
# de arte, e um import dinâmico que o tracer não enxergue vira MODULE_NOT_FOUND
# na primeira peça a ser congelada — em produção, sem aviso no build. Depois do
# standalone, para não haver dúvida sobre qual cópia sobrevive.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/playwright-core ./node_modules/playwright-core

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
