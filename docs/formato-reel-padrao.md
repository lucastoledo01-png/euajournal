# Formato padrão: Reel de capa (a partir de 30/10/2026)

Todo post do eua.journal passa a sair como **Reel de 10 segundos feito só da capa**. O conteúdo que iria nas
lâminas do carrossel vai para a **descrição**. Aprovado pelo dono em 30/10/2026.

## O que o Reel leva
- Foto em tela cheia 9:16 com zoom lento (cortar em 9:16 **antes** do zoom, nunca esticar), trilha curta baixa
  com fade no fim.
- **Só três elementos:** logo `eua.` branco no topo, categoria (POLÍTICA, EUA, MUNDO…) e manchete em caixa alta
  com o trecho de destaque em vermelho (`#ff3b53`). Sem `@eua.journal`, sem "Imagens de arquivo" no vídeo.
- **Texto na tela desde o primeiro quadro.** Sem animação de entrada.
- **Margem de corte:** tudo dentro de x 100 a 940 e y 310 a 1390 (sobrevive ao corte 4:5 do feed e fica longe dos
  botões do Reels). Manchete em até 4 linhas; se passar disso, encurtar o texto.
- Rosto nunca debaixo do texto: ajustar o recorte para o rosto ficar no terço de cima.

## Fotos
- Orgânicas: a pessoa falando, na pista, no púlpito. Nada de retrato oficial parado, e **não repetir foto já usada**.
- Wikimedia Commons (Casa Branca e agências federais são domínio público; conferir licença e crédito).
- Fonte de arquivo (foto antiga) fica explícita na legenda, não no vídeo.

## Descrição (legenda)
Manchete, depois o conteúdo das lâminas em parágrafos curtos, com a fonte dentro do texto ("segundo…"),
números arredondados, **5 hashtags**, `Siga @eua.journal` e o crédito da imagem na última linha
(`Imagens de arquivo: Casa Branca.` / `Imagem ilustrativa: Cytis.`). Notícia que só uma fonte traz fica atribuída.

## Como gerar e publicar
1. `producao-manual/AAAA-MM-DD/reels/` com `reels.json` (modelo: `producao-manual/2026-10-30/reels/reels.json`:
   foto, recorte `L:A:X:Y`, categoria, manchete com `<em>` no destaque) e `legenda_<id>.txt`.
2. `node producao-manual/_modelo-reel-foto/gerar_reels.mjs producao-manual/AAAA-MM-DD/reels [id]` gera `reel_<id>.mp4`.
3. Conferir quadros (logo, rosto livre, margens) e mandar ao dono.
4. Depois do ok, agendar pela fila (o worker da VPS publica; nenhum computador precisa ficar ligado):
   `npx tsx src/scripts/_agendar-reels-manual.ts --dia producao-manual/AAAA-MM-DD/reels` (ensaio) e, com `--valendo`,
   grava. Precisa de `agenda.json` na pasta (ordem, reel, slug, horaBrasilia, publicarEmUtc) e do worker com suporte a
   Reel já no ar (`content_json.formato = "reel"`, arquivo `video/mp4` com SHA-256, conferido antes de criar o
   container; a Meta recebe `media_type=REELS` e o worker espera até 10 min o vídeo ficar pronto).
5. Enquanto o worker não tiver essa versão no ar, o atalho é
   `npx tsx src/scripts/_publicar-reel-manual.ts --video … --legenda … --nome … [--quando <UTC ISO>]`: a Meta não
   agenda Reel, então o processo espera a hora no computador (Mac ligado e sessão aberta). Arquivo até 10 MB.
