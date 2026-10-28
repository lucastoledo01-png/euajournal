# Reels no molde do eua.journal

Ferramenta: `src/scripts/montar-reel.ts` (28/10/2026). Entra um vídeo, sai um
MP4 9:16 (1080x1920, H.264, áudio original). Não publica nada: publicar é com
`src/scripts/_publicar-reel-manual.ts`.

## Os dois moldes

**A, moldura.** O fundo é `src/scripts/reel/molde-a.jpg` (Capitólio, Casa
Branca, as duas bandeiras). O vídeo entra na moldura (992x537, em
x 44 / y 609), o rótulo vai na faixa vermelha e a manchete em três linhas,
com a linha marcada com `*` em vermelho. Rótulo e manchete se ajustam ao
tamanho sozinhos.

**B, tela cheia.** O vídeo ocupa a tela, com a marca no alto, a editoria numa
etiqueta vermelha e a manchete em caixas brancas, sobre um escurecido.

## Como usar

```bash
# A: rótulo, três linhas (a do meio em destaque) e o corte que tira a marca de quem publicou
npx tsx src/scripts/montar-reel.ts --video video.mp4 --formato a \
  --rotulo "TRAGÉDIA" --linhas "ACIDENTE DE TREM|*NA ESPANHA*|ENTRE OS MAIS GRAVES DO PAÍS" \
  --corte "0:385:720:390"

# B: editoria e linhas da manchete
npx tsx src/scripts/montar-reel.ts --video video.mp4 --formato b \
  --categoria "Mundo" --linhas "Acidente de trem na Espanha|está entre os mais graves|da história do país" \
  --corte "175:0:456:810"
```

`--corte x:y:largura:altura` é em pixels do vídeo ORIGINAL e roda antes do
encaixe. É assim que sai o logo e a legenda de quem publicou primeiro: meça
num quadro (`ffmpeg -ss 5 -i video.mp4 -frames:v 1 quadro.png`) e corte fora.
No molde A o corte deve ter a proporção da moldura (~1,85:1); no B, 9:16.

## Direito de uso

Vídeo de outra conta é obra de terceiro. Republicar, mesmo com moldura e
crédito, pode gerar denúncia, derrubada do Reel e penalidade na conta, que é
comercial. O dono decidiu seguir sabendo disso (28/10/2026). Onde der,
prefira vídeo de governo dos EUA (em geral domínio público), vídeo com
autorização ou vídeo próprio.

## Automático (28/10/2026)

O caminho, do vídeo achado ao Reel na fila:

1. **Descoberta**, de hora em hora das 9h às 17h (`/api/cron/reels?relogio=1`,
   capacidade `reels`): lê os perfis de referência e `settings.reels.perfis_ig`
   no Instagram (Business Discovery com `media_url`) e até quatro buscas no
   YouTube (`YOUTUBE_API_KEY`). Ordena pela nota da fonte e pelo calor da
   história do termômetro; fora do nicho não entra. Grava em
   `reels_candidatos`. Nada aqui baixa vídeo nem chama modelo.
2. **Escolha, no chat do Claude** (MCP): `reels_sugeridos`, depois
   `produzir_reel`.
3. **Preparo, no worker** (giro de 30 s): baixa (Instagram direto, YouTube
   pelo yt-dlp), corta nos primeiros 60 s, mede o corte que tira a marca de
   quem publicou (`social/reels/corte.ts`: o que não mexe e tem borda é
   sobreposição), desenha a folha de quadros e abre a tarefa `escrever_reel`.
4. **Texto, pelo Claude**: `ver_reel` mostra a folha com o corte em amarelo;
   `proxima_tarefa` e `entregar_tarefa` fazem o texto. A plataforma confere
   com as guardas (ancoragem no material do vídeo, forma da legenda,
   `limparVicios`) e pede reparo até o teto.
5. **Render, no worker**: monta no molde, sobe o MP4 no bucket `reels` e grava
   a linha em `social_posts` (`formato: "reel"`) na próxima vaga do dia,
   `aguardando` na fila. `ver_reel` mostra a folha do Reel pronto; o vídeo
   toca no painel.
6. **Aprovação, só no painel.** Reprovar texto, imagem (corte) ou arte (molde)
   devolve a tarefa ao Claude com o motivo; a versão nova volta à fila com
   hash novo. A seleção não se refaz: cancele e escolha outro vídeo.
7. **Publicação, no worker**: container `media_type=REELS`, espera de até 5
   minutos pelo processamento da Meta.

Ligar, nesta ordem: rodar `supabase/2026-10-28-reels.sql`; pôr
`YOUTUBE_API_KEY` no web; deploy do web e do worker (o worker ganha ffmpeg e
yt-dlp; a versão do yt-dlp é `YTDLP_VERSION` no `Dockerfile.worker` e precisa
ser atual); `settings.capacidades.reels` em `dry_run` para ver o
`reels_rodada` em `platform_events` sem gravar candidato; depois `enforce`.
A fila de aprovação do projeto precisa estar em `enforce`: sem ela, nenhum
Reel é gravado.

Ensaio sem banco e sem publicar:
`npx tsx src/scripts/ensaiar-reel.ts --video <arquivo.mp4>`.

## O que ainda falta

- O Reel não passa pela trava do termômetro.
- Os textos são estáticos (sem animação de entrada).
- `reels_sugeridos` mostra métricas e link, não a folha: a folha só existe
  depois do download, que só acontece no `produzir_reel`.
- A terceira reprovação descarta a peça na fila, mas o candidato fica como
  estava.
