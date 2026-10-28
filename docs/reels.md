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

## O que ainda falta

- O Reel não passa pela fila de aprovação nem pela trava do termômetro.
- Os textos são estáticos (sem animação de entrada).
