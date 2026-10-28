/**
 * Camada base — o CSS idêntico nos três formatos. Só usa `var(--s-*)`
 * (definidos por `tokensToCss`). As variantes de slide não redeclaram nada
 * daqui; só compõem estas primitivas.
 *
 * Alvo: `var(--s-w)` × `var(--s-h)` (padrão 1080×1440), definidos pelos
 * tokens. As fontes também: o `<link>` do `renderShell` é derivado delas.
 */
export const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0;-webkit-font-smoothing:antialiased;}
html,body{width:var(--s-w);height:var(--s-h);background:var(--s-bg);color:var(--s-ink);
  font-family:var(--s-font-body);overflow:hidden;}

.slide{width:var(--s-w);height:var(--s-h);padding:80px;display:flex;flex-direction:column;
  justify-content:space-between;position:relative;}
.slide.full{padding:0;}

/* ---- marca sobreposta ----
 *
 * O chrome de cabecalho e rodape virou sistema proprio (.c-head e .c-foot), e
 * as regras antigas de .s-header e .s-footer sairam junto. So que a remocao
 * levou os seletores e deixou as chaves: sobraram dois blocos de declaracoes
 * orfas, que o parser de CSS descarta em silencio.
 *
 * O efeito nao era silencioso na arte. overlayBrand() continua emitindo
 * .s-header.plain com .s-brand, .s-badge e .s-wordmark dentro, e a capa com
 * foto e a peca que esta no ar: ela vinha renderizando a marca como texto sem
 * estilo nenhum. O mesmo vale para .s-counter, que a galeria ainda usa.
 *
 * O que volta aqui e so o que ainda e emitido, e nada do chrome aposentado.
 */
.s-header{display:flex;align-items:center;justify-content:space-between;}
.s-header.plain{border:none;padding:0;}
.s-brand{display:flex;align-items:center;gap:14px;}
.s-badge{background:var(--s-accent);color:#fff;font-weight:800;font-size:22px;
  width:44px;height:44px;border-radius:12px;display:grid;place-items:center;
  font-family:var(--s-font-accent);}
.s-wordmark{font-family:var(--s-font-accent);font-size:30px;font-weight:700;color:var(--s-ink);}
.s-counter{background:var(--s-border);color:var(--s-stone);font-size:18px;font-weight:700;
  padding:8px 20px;border-radius:22px;font-variant-numeric:tabular-nums;}
.on-dark .s-wordmark,.on-dark .s-counter{color:#fff;}
/* Desde 05/10/2026 a sobreposicao das capas desenha o logotipo, e nao o selo
   com o nome. A altura e a mesma da capa de jornal, para as pecas do feed
   terem a marca do mesmo tamanho. */
.s-logo{height:44px;width:auto;display:block;filter:drop-shadow(0 2px 7px rgba(0,0,0,0.45));}
.on-dark .s-counter{background:rgba(255,255,255,0.16);}

/* ---- eyebrow ---- */
.s-eyebrow{display:inline-flex;align-items:center;width:fit-content;
  font-family:var(--s-font-mono);font-size:17px;font-weight:700;
  letter-spacing:3px;text-transform:uppercase;padding:9px 22px;border-radius:8px;}
.eb-noticia{background:var(--s-eb-noticia-bg);color:var(--s-eb-noticia-fg);}
.eb-tutorial{background:var(--s-eb-tutorial-bg);color:var(--s-eb-tutorial-fg);}
.eb-prompt{background:var(--s-eb-prompt-bg);color:var(--s-eb-prompt-fg);}

/* ---- corpo ---- */
.s-mid{flex:1;display:flex;flex-direction:column;justify-content:center;gap:28px;padding:30px 0;}
.s-title{font-family:var(--s-font-accent);font-weight:800;line-height:1.16;
  letter-spacing:-0.01em;font-size:var(--s-display-lg);color:var(--s-ink);}
.s-title.sm{font-size:var(--s-display-md);}
.on-dark .s-title{color:#fff;}
.s-sub{font-size:var(--s-body);line-height:1.55;color:var(--s-stone);font-weight:500;}
.on-dark .s-sub{color:#d4d4d8;}

/* ---- cartão ---- */
.s-card{background:var(--s-ivory);border:2px solid var(--s-border);border-radius:var(--s-radius);
  padding:var(--s-card-pad);display:flex;flex-direction:column;gap:22px;}
.s-card.dark{background:var(--s-dark);border:none;color:#fafafa;}
.s-card .p{font-size:var(--s-body);line-height:1.6;color:var(--s-ink);font-weight:500;}
.s-card.dark .p{color:#e4e4e7;}

.s-label{font-family:var(--s-font-mono);font-size:15px;font-weight:700;letter-spacing:1.5px;
  text-transform:uppercase;width:fit-content;padding:7px 16px;border-radius:10px;}
.lbl-gold{background:#fef3c7;color:#d97706;}
.lbl-step{background:var(--s-border);color:var(--s-stone);}

.s-bullet{display:flex;align-items:center;gap:20px;background:var(--s-bg);
  border:1.5px solid var(--s-border);border-radius:18px;padding:22px 26px;}
.s-bullet .i{flex:0 0 auto;width:38px;height:38px;border-radius:50%;background:var(--s-accent);
  color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;}
.s-bullet .x{font-size:23px;font-weight:600;line-height:1.35;color:var(--s-ink);}

.s-code{background:#0f0f11;border:1px solid #2a2a2e;border-radius:16px;padding:26px;
  font-family:var(--s-font-mono);font-size:var(--s-mono);line-height:1.7;color:#e4e4e7;
  white-space:pre-wrap;word-break:break-word;}
.s-code .p{color:#6ee7b7;}
.s-code .k{color:var(--s-accent);font-weight:700;}
.s-code .c{color:#71717a;}

/* ---- imagem de fundo ---- */
.s-photo{position:absolute;inset:0;z-index:1;background-size:cover;background-position:center;}
.s-credito{position:absolute;left:0;right:0;bottom:0;z-index:40;padding:14px 28px;font-family:var(--s-font-body);font-size:19px;line-height:1.25;letter-spacing:.01em;color:rgba(255,255,255,.92);background:linear-gradient(to top,rgba(0,0,0,.72),rgba(0,0,0,0));text-align:right;}
.s-photo.ph{background:
  radial-gradient(circle at 50% 38%,rgba(255,120,60,0.28),transparent 45%),
  radial-gradient(circle at 50% 42%,rgba(90,20,10,0.45),transparent 60%),
  linear-gradient(180deg,#14100e,#241511 70%,#0c0a09);}
.s-grad{position:absolute;inset:0;z-index:2;
  background:linear-gradient(180deg,rgba(10,10,12,0.15) 0%,rgba(10,10,12,0.55) 55%,rgba(10,10,12,0.95) 92%);}
.s-grad.soft{background:linear-gradient(180deg,rgba(10,10,12,0) 45%,rgba(10,10,12,0.9) 93%);}

.s-overlay{position:absolute;inset:0;z-index:4;padding:80px;display:flex;flex-direction:column;
  justify-content:space-between;}

.s-profile{display:flex;align-items:center;gap:16px;}
.s-avatar{width:56px;height:56px;border-radius:50%;background:var(--s-accent);color:#fff;
  font-weight:900;font-size:26px;display:flex;align-items:center;justify-content:center;
  border:2px solid rgba(255,255,255,0.8);}
.s-pname{font-size:20px;font-weight:800;color:#fff;display:flex;align-items:center;gap:6px;}
.s-check{background:#3b82f6;color:#fff;font-size:11px;width:18px;height:18px;border-radius:50%;
  display:inline-flex;align-items:center;justify-content:center;font-weight:900;}
.s-phandle{font-size:15px;color:rgba(255,255,255,0.8);}
/* Segue viva para a variante result_showcase, que e dos formatos de tutorial e
   de prompt. Ali a linha promete um conteudo (Passo a passo completo), e nao
   ensina o leitor a arrastar. A regra de nao convidar ao arraste e da gramatica
   de noticia. */
.s-swipe{font-size:18px;font-weight:700;color:#e4e4e7;letter-spacing:0.5px;text-align:right;}

/* ---- CTA ---- */
.s-cta{background:var(--s-dark);color:#fafafa;border-radius:32px;padding:56px 40px;text-align:center;
  display:flex;flex-direction:column;align-items:center;gap:26px;flex:1;justify-content:center;}
.s-cta .ico{font-size:56px;}
.s-cta .t{font-family:var(--s-font-accent);font-size:44px;font-weight:700;line-height:1.2;}
.s-cta .b{font-size:22px;color:#a1a1aa;max-width:640px;line-height:1.5;}
.s-cta .btn{background:var(--s-accent);color:#fff;font-size:24px;font-weight:800;
  padding:20px 44px;border-radius:50px;}
.s-kw{font-family:var(--s-font-mono);font-weight:700;background:rgba(255,255,255,0.14);
  padding:2px 10px;border-radius:6px;}

/* ---- selos de formato ---- */
.prompt-badge{position:absolute;top:28px;right:28px;z-index:5;background:rgba(255,255,255,0.94);
  color:#18181b;border-radius:16px;padding:10px 18px;font-weight:800;font-size:17px;
  transform:rotate(4deg);box-shadow:0 10px 25px rgba(0,0,0,0.25);}
.step-count{background:rgba(255,255,255,0.94);color:#18181b;border-radius:14px;padding:8px 18px;
  font-weight:800;font-size:18px;width:fit-content;font-family:var(--s-font-mono);}

.gallery-cap{font-size:30px;font-weight:700;color:#fff;text-shadow:0 2px 12px rgba(0,0,0,0.6);}

/* ---- chrome: colchetes de corte (sistema impresso) ---- */
.c-corners i{position:absolute;width:46px;height:46px;border-color:var(--s-accent);border-style:solid;border-width:0;}
.c-corners .tl{top:44px;left:44px;border-top-width:3px;border-left-width:3px;}
.c-corners .tr{top:44px;right:44px;border-top-width:3px;border-right-width:3px;}
.c-corners .bl{bottom:44px;left:44px;border-bottom-width:3px;border-left-width:3px;}
.c-corners .br{bottom:44px;right:44px;border-bottom-width:3px;border-right-width:3px;}

/* ---- chrome editorial ---- */
.c-head{display:flex;align-items:center;justify-content:space-between;position:relative;z-index:2;}
.c-head.editorial .handle,.c-head.editorial .count{font-family:var(--s-font-mono);font-size:19px;
  font-weight:600;letter-spacing:1.6px;text-transform:uppercase;color:var(--s-stone);}
.c-foot{display:flex;align-items:center;justify-content:space-between;position:relative;z-index:2;}
.c-foot.editorial{border-top:1px solid var(--s-border);padding-top:26px;}
.c-foot.editorial .tag,.c-foot.editorial .swipe{font-family:var(--s-font-mono);font-size:16px;
  font-weight:700;letter-spacing:2px;text-transform:uppercase;}
.c-foot.editorial .tag{color:var(--s-stone);}
.c-foot.editorial .swipe{color:var(--s-accent);display:inline-flex;align-items:center;gap:10px;}
.c-foot.editorial .swipe svg{width:22px;height:22px;}
.c-dots{display:flex;gap:11px;}
.c-dots .d{width:11px;height:11px;border-radius:50%;background:var(--s-border);}
.c-dots .d.on{background:var(--s-accent);}

/* ---- chrome social ---- */
.c-head.social .mark{font-family:var(--s-font-body);font-size:21px;font-weight:800;
  letter-spacing:2.4px;text-transform:uppercase;color:var(--s-accent);}
.c-head.social img.mark{height:34px;width:auto;display:block;}
.c-head.social .pill{font-family:var(--s-font-mono);font-size:18px;font-weight:700;color:var(--s-ink);
  background:rgba(255,255,255,0.10);border:1px solid var(--s-border);border-radius:999px;padding:8px 20px;}
.c-head.social .pill i{opacity:0.45;font-style:normal;margin:0 4px;}
.c-foot.social .prog{font-family:var(--s-font-mono);font-size:17px;letter-spacing:1.8px;
  text-transform:uppercase;color:var(--s-stone);}
.c-foot.social .prog b{color:var(--s-accent);font-weight:700;margin-right:10px;}
.c-foot.social .next{width:64px;height:64px;border-radius:50%;background:var(--s-accent);color:#fff;
  display:inline-flex;align-items:center;justify-content:center;}
.c-foot.social .next svg{width:28px;height:28px;}

/* Trilho de engajamento — ícones, sem números: contador de maquete impresso
   na arte seria prova social inventada. */
.c-rail{position:absolute;right:56px;top:50%;transform:translateY(-50%);z-index:2;
  display:flex;flex-direction:column;gap:24px;}
.c-rail span{width:76px;height:76px;border-radius:50%;background:rgba(255,255,255,0.08);
  border:1px solid var(--s-border);color:var(--s-ink);
  display:inline-flex;align-items:center;justify-content:center;}
.c-rail svg{width:32px;height:32px;}

/* ---- primitivas do sistema impresso (design claro) ---- */
.e-wrap{flex:1;display:flex;flex-direction:column;justify-content:center;gap:34px;position:relative;z-index:2;}
.e-wrap.center{align-items:center;text-align:center;}

/* ---- capa de texto da noticia: a manchete e a arte ----
   O corpo do tipo nao esta declarado aqui nem calculado por estimativa: quem
   mede e o navegador, pelo SCRIPT_DE_AJUSTE, depois que as fontes carregam.
   A caixa da manchete tem altura fixa e o texto encolhe ate caber nela. */
.e-wrap.n-capa{justify-content:flex-end;gap:0;padding-bottom:30px;}
.n-topo{flex:none;margin-bottom:46px;}
.n-editoria{display:block;font-family:var(--s-font-mono);font-size:19px;font-weight:700;
  letter-spacing:4px;text-transform:uppercase;color:var(--s-accent);margin-bottom:18px;}
.n-regua{display:block;height:3px;background:var(--s-ink);}
.n-manchete{flex:0 0 60%;display:flex;flex-direction:column;justify-content:flex-end;
  font-family:var(--s-font-accent);font-weight:800;letter-spacing:-0.015em;line-height:1.06;
  color:var(--s-ink);}
/* I-765 e H-1B sao o nome da coisa, nao hifenizacao: nao quebram no hifen. */
.n-junto{white-space:nowrap;}

/* ---- capa sem foto, na identidade nova ----------------------------------- */
/* As cores sao escritas, e nao lidas dos tokens, pelo mesmo motivo da chamada
   da newsletter logo abaixo: os tokens ainda carregam a paleta da vertical
   anterior, creme com acento laranja. Quando eles forem migrados, estas linhas
   voltam a ser var(). */
/* ====================================================================
   RECORTE DE POST: a peca que parece alguem comentando a noticia.

   E a segunda gramatica de capa, ao lado da capa de jornal, e a diferenca
   entre as duas nao e de gosto. A capa de jornal AFIRMA: foto sangrando,
   chapeu de editoria, manchete em caixa alta. O recorte COMENTA: fundo
   branco, autor no topo, texto corrido em caixa baixa, com o peso na frase
   e nao na imagem. Uma serve para o fato do dia, a outra para a leitura do
   fato.

   As medidas sairam da referencia enviada pelo dono em 16/09/2026, um post
   do Tallis Gomes, remedidas para a tela de 1080 por 1440: margem lateral
   de 9 por cento, avatar de 7 por cento da largura, cartao de midia com
   cantos de 28px, e o bloco de texto ocupando o resto.
   ==================================================================== */
.r-pagina{position:absolute;inset:0;background:#fff;z-index:1;
  display:flex;flex-direction:column;padding:8.5% 9% 7%;}

/* O autor, no topo, como em qualquer post de rede social. Sem selo de
   verificado: o perfil nao e verificado, e desenhar o selo seria dizer que e. */
.r-autor{flex:0 0 auto;display:flex;align-items:center;gap:22px;margin-bottom:5.5%;}
.r-ava{width:76px;height:76px;border-radius:50%;object-fit:cover;display:block;
  background:#0A3161;}
.r-quem{display:flex;flex-direction:column;gap:2px;}
.r-nome{font-family:var(--s-font-display);font-size:34px;font-weight:800;color:#0f172a;
  letter-spacing:-0.01em;}
.r-arroba{font-size:27px;font-weight:500;color:#64748b;}

/* O CORPO E FIXO EM 46px, e nao e o ajuste que decide.

   Esta e a diferenca de filosofia entre o recorte e a capa de jornal. Na capa
   de jornal a manchete e a peca inteira, entao faz sentido ela crescer e
   encolher para ocupar a faixa: o leitor ve uma peca por vez.

   O recorte e um carrossel, e o leitor ve os slides EM SEQUENCIA, arrastando.
   Tipo que muda de tamanho de um slide para o outro denuncia que a peca foi
   montada por maquina, e foi exatamente isso que o dono apontou em 16/09/2026:
   "precisa ter um padrao de tamanho de fonte, nao pode cada slide ter um
   tamanho".

   A consequencia e que o texto passa a ter ORCAMENTO. O que nao cabe em 46px
   nao e encolhido nem cortado: a peca sai na gramatica de jornal, que sabe se
   virar com texto de qualquer tamanho. Ver CAPACIDADE_DO_RECORTE. */
.r-texto{flex:0 0 76%;overflow:hidden;display:block;
  font-family:var(--s-font-body);font-size:46px;font-weight:400;line-height:1.34;
  color:#0f172a;letter-spacing:-0.005em;}
.r-texto p{margin:0 0 0.62em;}
.r-texto p:last-child{margin-bottom:0;}
.r-texto b{font-weight:800;}

/* O cartao de midia, com altura fixa em pixel de proposito.
   Se ela fosse em em, o texto longo encolheria a foto junto, e a peca mudaria
   de desenho conforme o tamanho da manchete. A foto e o elemento estavel. */
/* position:relative nao e detalhe: .s-photo e position:absolute com inset:0, e
   sem um pai posicionado ela se ancora na .r-pagina e pinta a peca inteira
   atras do fundo branco. O cartao saia cinza e vazio. */
.r-midia{position:relative;margin:0.55em 0 0.7em;border-radius:28px;overflow:hidden;
  height:430px;background:#e2e8f0;}
.r-midia .s-photo{width:100%;height:100%;object-fit:cover;}

/* A faixa de texto comeca mais alto que na peca com foto (30% contra 58%)
   porque aqui nao ha imagem para ocupar o topo: a manchete e a arte, e ela
   precisa do espaco. O ajuste continua medindo, entao manchete curta nao
   estica e manchete longa nao transborda. */
.n-fundo{position:absolute;inset:0;background:#0A3161;z-index:1;}
.n-texto{position:absolute;left:9%;right:9%;top:30%;bottom:9.5%;z-index:4;
  display:flex;flex-direction:column;justify-content:flex-end;}
/* A altura e FLEX-BASIS, e nao max-height, e isso nao e preferencia.
   O SCRIPT_DE_AJUSTE mede el.clientHeight ANTES de aplicar o data-max. Com
   flex:0 0 auto essa medida e a altura do CONTEUDO no corpo herdado do body,
   ou seja umas duas linhas de 16px: o script conclui que so cabem 34px e
   encolhe a manchete ate o piso. Medido: a peca saiu em 44px, o minimo, numa
   faixa de 871px vazia.
   Com flex-basis em porcentagem a caixa tem altura definida antes de qualquer
   fonte ser aplicada, que e o que o script precisa para medir. O font-size
   declarado igual ao data-max e a segunda garantia, para o caso de alguem
   trocar a base de novo. */
.n-manchete{flex:0 0 78%;overflow:hidden;display:block;
  font-family:var(--s-font-display);font-size:104px;font-weight:800;line-height:1.07;
  letter-spacing:-0.005em;text-transform:uppercase;color:#fff;
  display:flex;flex-direction:column;justify-content:flex-end;}
.n-manchete > span{display:block;}

/* ---- capa de carrossel: a manchete marcada ----
 *
 * A capa da notícia é serifa preta sobre creme, e continua sendo. Esta é a do
 * conteúdo permanente, e é DE PROPÓSITO diferente: no feed, notícia do dia e
 * material de referência são dois produtos, e a capa é onde isso se anuncia.
 *
 * O marca-texto entra atrás de um trecho que a copy já declarou como destaque,
 * e o destaque é, por guarda, trecho LITERAL da manchete. Ou seja: a cor não
 * escolhe o que enfatizar, ela pinta o que a copy enfatizou, e nada aparece
 * pintado que não esteja na manchete conferida.
 *
 * A faixa escura cobre a peça inteira quando não há foto, e vira degradê sobre
 * a foto quando há. Nos dois casos a manchete assenta na base, sem cartão e sem
 * moldura: vazio cercado lê como falta, vazio aberto lê como margem.
 */
.k-capa{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;
  justify-content:flex-end;padding:104px 92px 116px;background:#101014;}
.k-capa.com-foto{background:linear-gradient(to top,#101014 0%,#101014 44%,
  rgba(16,16,20,0.78) 60%,rgba(16,16,20,0.28) 76%,rgba(16,16,20,0) 90%);}
/* Tratamento coeso: toda foto entra igual.
 *
 * Fonte nenhuma entrega coerencia sozinha. Commons e acervo documental, com
 * foto de epoca e enquadramento irregular; Unsplash e Pexels sao curados, e
 * ainda assim variam em temperatura, contraste e estilo. Um feed em que cada
 * capa tem a cara do banco de onde veio nao parece uma publicacao.
 *
 * Entao a imagem e normalizada aqui, e nao escolhida melhor la: dessatura,
 * ganha contraste, escurece, e recebe o tom da marca por cima. Foto do
 * Commons, do Unsplash e do Pexels saem parecendo a mesma peca, e a manchete
 * continua legivel porque assenta sobre area escura de qualquer jeito. */
.k-foto{position:absolute;inset:0;z-index:1;}
.k-foto .s-photo{filter:grayscale(1) contrast(1.06) brightness(0.62);}
/* z-index explicito: a propria .s-photo ja tem z-index 1, e sem isto o tom da marca
   seria pintado DEBAIXO da foto e nao apareceria. */
.k-foto::after{content:"";position:absolute;inset:0;z-index:2;
  background:var(--s-accent);mix-blend-mode:color;opacity:0.34;}

/* A sombra nao e decoracao: a arroba fica sobre a foto, e foto de documento
   tem area quase branca no topo. Sem ela, some. */
.k-handle{position:absolute;top:96px;left:92px;font-family:var(--s-font-mono);
  font-size:27px;font-weight:500;letter-spacing:2px;color:rgba(255,255,255,0.88);
  text-shadow:0 2px 14px rgba(0,0,0,0.8);}
/* Com flex:none e o bloco da manchete crescendo, a editoria era empurrada ate o
   topo do campo, exatamente onde a arroba e ancorada em absoluto: as duas
   saiam impressas uma sobre a outra. Editoria e manchete sao um conjunto e
   assentam juntas na base. */
.k-topo{flex:0 0 auto;margin-bottom:40px;}
.k-editoria{display:block;font-family:var(--s-font-mono);font-size:20px;font-weight:700;
  letter-spacing:4px;text-transform:uppercase;color:var(--s-accent);margin-bottom:16px;}
.k-regua{display:block;height:3px;background:rgba(255,255,255,0.22);}
/* Grotesca pesada, e não a serifa da capa de notícia: serifa com marca-texto
   vira cartaz de leilão.

   Corpo FIXO e entrelinha FIXA, de propósito. A capa nasceu com ajuste
   automático, o mesmo da capa de notícia, e o efeito no feed era que cada post
   saía com um tamanho de manchete diferente conforme o comprimento do texto.
   Numa peça que é quase só tipo, isso não lê como ajuste, lê como falta de
   padrão. As manchetes medidas ficam entre 31 e 43 caracteres, e o prompt pede
   de 3 a 10 palavras: 112px cabe folgado em duas ou três linhas. */
.k-manchete{flex:0 0 auto;display:flex;flex-direction:column;justify-content:flex-end;
  font-family:var(--s-font-display);font-weight:800;letter-spacing:-0.028em;
  font-size:112px;line-height:1.3;color:#fff;}
/* O marcador NÃO entra no cálculo da linha.

   Com padding vertical, a caixa do marca-texto aumenta a altura da linha, e a
   entrelinha passa a ser maior entre linhas marcadas do que entre as brancas:
   o mesmo bloco de texto com dois ritmos. Padding só na horizontal, e a altura
   da cor vem do box-shadow, que pinta sem ocupar espaco. */
.k-manchete mark{background:var(--s-accent);color:#101014;
  padding:0 0.14em;border-radius:4px;
  box-shadow:0 0 0 0.085em var(--s-accent);
  -webkit-box-decoration-break:clone;box-decoration-break:clone;}

.e-mark{width:74px;height:74px;color:var(--s-accent);}
.e-mark svg{width:100%;height:100%;}

/* Título partido: primeira linha em display pesada, segunda em serifa itálica
   na cor de destaque. É a assinatura do design. */
.e-title{font-family:var(--s-font-display);font-weight:800;letter-spacing:-0.035em;
  line-height:1.02;font-size:var(--s-display-lg);color:var(--s-ink);text-transform:uppercase;}
.e-title .it{display:block;font-family:var(--s-font-accent);font-weight:400;font-style:italic;
  color:var(--s-accent);text-transform:none;letter-spacing:-0.01em;line-height:1.1;}
.e-title.sm{font-size:var(--s-display-md);text-transform:none;letter-spacing:-0.03em;}

.e-btn{display:inline-flex;align-items:center;justify-content:center;
  border:2px solid var(--s-accent);color:var(--s-accent);border-radius:6px;
  font-family:var(--s-font-body);font-weight:800;font-size:30px;letter-spacing:5px;
  padding:22px 58px;width:fit-content;}

.e-lede{font-size:var(--s-body);line-height:1.55;color:var(--s-stone);max-width:760px;font-weight:500;}
.e-lede b{color:var(--s-ink);font-weight:800;}
.e-lede i{font-family:var(--s-font-accent);font-style:italic;color:var(--s-accent);font-weight:400;}

/* Terminal: barra de arquivo + linhas de saída. */
.e-term{background:var(--s-dark);border-radius:var(--s-radius);overflow:hidden;width:100%;}
.e-term .bar{display:flex;align-items:center;gap:12px;padding:20px 30px;
  border-bottom:1px solid rgba(255,255,255,0.10);}
.e-term .bar u{width:13px;height:13px;border-radius:50%;background:rgba(255,255,255,0.22);text-decoration:none;}
.e-term .bar span{font-family:var(--s-font-mono);font-size:17px;color:rgba(255,255,255,0.55);margin-left:8px;}
.e-term .lines{padding:30px;display:flex;flex-direction:column;gap:14px;}
.e-term .l{font-family:var(--s-font-mono);font-size:var(--s-mono);line-height:1.5;color:#e9e9e9;}
.e-term .l.cmd{color:var(--s-accent);font-weight:700;}

/* Lista numerada do slide de habilidades. */
.e-nums{display:flex;flex-direction:column;gap:0;width:100%;}
.e-nums .row{display:flex;align-items:center;gap:32px;padding:30px 0;border-bottom:1px solid var(--s-border);}
.e-nums .row:last-child{border-bottom:none;}
.e-nums .n{font-family:var(--s-font-accent);font-style:italic;font-size:52px;font-weight:400;
  color:var(--s-accent);min-width:88px;line-height:1;}
.e-nums .t{font-family:var(--s-font-display);font-size:40px;font-weight:700;
  letter-spacing:-0.02em;color:var(--s-ink);}

/* Caixa de corpo com altura DEFINIDA, para o ajuste automático poder agir.

   O script de ajuste mede a altura disponível ANTES de trocar a fonte, o que só
   faz sentido num bloco de altura definida: ele foi escrito para os blocos
   posicionados do painel, que têm caixa fixa. Num bloco de altura automática,
   "altura disponível" é a altura do texto no tamanho atual, então o script nunca
   deixa o texto crescer e o corpo fica preso no valor do token, medido em 26px.

   A capa não sofre disso porque a caixa da manchete é fracionada em 60% do
   campo. Esta caixa é o mesmo recurso para o slide de conteúdo. */
.e-corpo{flex:0 0 46%;display:flex;flex-direction:column;justify-content:flex-start;}

/* Duas colunas, para a comparação. É a única primitiva de LADO A LADO da folha:
   nenhuma das variantes anteriores precisava de duas colunas, e uma comparação
   empilhada em duas linhas deixa de ser comparação, porque quem lê perde o eixo
   do que está sendo confrontado. A régua no meio é o que faz o olho ler em par.

   A coluna é fracionária e não em pixel de propósito: a largura do canvas vem
   de token, e coluna em pixel quebraria a peça se o token mudar. */
.e-duo{display:grid;grid-template-columns:1fr 1px 1fr;gap:0 40px;width:100%;align-items:start;}
.e-duo .col{display:flex;flex-direction:column;gap:18px;}
.e-duo .risco{background:var(--s-border);width:1px;align-self:stretch;}
.e-duo .rot{font-family:var(--s-font-body);font-weight:800;font-size:26px;letter-spacing:3px;
  text-transform:uppercase;color:var(--s-accent);}
.e-duo .val{font-family:var(--s-font-display);font-size:38px;font-weight:700;
  letter-spacing:-0.02em;line-height:1.24;color:var(--s-ink);}

.e-quote{border-left:4px solid var(--s-accent);padding-left:34px;
  font-family:var(--s-font-accent);font-style:italic;font-weight:400;
  font-size:38px;line-height:1.32;color:var(--s-ink);}

/* Palavra-chave do CTA — o que a pessoa comenta. */
.e-kw{display:inline-flex;align-items:center;justify-content:center;background:var(--s-accent);color:#fff;
  font-family:var(--s-font-body);font-weight:800;font-size:44px;letter-spacing:5px;
  padding:20px 46px;border-radius:8px;width:fit-content;text-transform:uppercase;}
.e-kw-line{font-size:34px;line-height:1.45;color:var(--s-ink);font-weight:500;max-width:820px;}
.e-kw-line b{font-weight:800;color:var(--s-accent);}

/* --- gramatica de jornal -------------------------------------------------
   Um gabarito so, usado na capa e no miolo: foto sangrando, marca no alto a
   esquerda, e no rodape o chapeu de editoria com a manchete em caixa alta.
   A capa e a mesma peca com a bolha por cima.

   As medidas nao sao estimadas. Foram lidas de tres referencias: o bloco de
   texto ocupa de 70 a 90,5 por cento da altura, a margem lateral e 9 por
   cento da largura, e o degrade comeca a escurecer na metade.

   A foto fica COLORIDA. O tratamento em cinza que a capa anterior usa e uma
   escolha de outra peca; aqui a cor da foto e parte do formato. */
/* Sem foto o fundo e azul-marinho, e nao o creme que o shell usa por padrao:
   o texto desta gramatica e branco, e branco sobre creme nao se le. */
.j-fundo{position:absolute;inset:0;z-index:0;background:#0A3161;}
.j-foto{position:absolute;inset:0;z-index:1;}
.j-foto .s-photo{width:100%;height:100%;object-fit:cover;}

/* O degrade nasce em 64 por cento e fecha embaixo: e ele que garante contraste
   para a manchete branca sobre qualquer foto, clara ou escura. */
.j-grad{position:absolute;inset:0;z-index:2;background:linear-gradient(to top,
  rgba(0,0,0,0.95) 0%,rgba(0,0,0,0.92) 22%,rgba(0,0,0,0.72) 40%,
  rgba(0,0,0,0.30) 55%,rgba(0,0,0,0) 70%);}

/* A sombra existe para o caso intermediario, que e o mais comum: foto com ceu
   claro em cima e predio escuro embaixo, onde a media fica no meio da regua e
   a troca de arquivo sozinha nao resolve. Ela e suave o bastante para nao
   aparecer como caixa, e forte o bastante para destacar a letra.
   Cada versao pede a sombra oposta: a marca branca pede sombra escura, a de
   tinta escura pede halo claro. */
.j-marca{position:absolute;top:7.5%;left:9%;z-index:4;height:52px;width:auto;
  filter:drop-shadow(0 2px 7px rgba(0,0,0,0.45));}
.j-marca[data-sobre="claro"]{filter:drop-shadow(0 2px 7px rgba(255,255,255,0.75));}

/* A bolha: segunda imagem em circulo, com anel branco, na altura do terco
   superior. Ela existe para a capa dizer duas coisas ao mesmo tempo, o
   personagem e o assunto, sem dividir a foto ao meio. */
.j-bolha{position:absolute;z-index:3;left:4%;top:19%;width:44%;aspect-ratio:1;
  border-radius:50%;overflow:hidden;box-shadow:0 0 0 7px rgba(255,255,255,0.95),
  0 18px 60px rgba(0,0,0,0.45);}
.j-bolha img{width:100%;height:100%;object-fit:cover;display:block;}

/* A faixa do texto tem altura DEFINIDA, e isso nao e detalhe.
   O script de ajuste encolhe a manchete enquanto o conteudo nao couber na
   caixa, e ele mede clientHeight. Com a caixa de altura automatica, o
   clientHeight e a propria altura do conteudo: a condicao nunca e verdadeira,
   o script nunca encolhe nada, e a manchete longa sobe por cima da bolha.
   Foi o que aconteceu na primeira renderizacao. */
/* A faixa comeca em 64 por cento, e nao em 58, e o corpo do tipo caiu de 74
   para 54. As duas medidas foram REMEDIDAS nas capas de referencia em
   16/09/2026, depois que o dono apontou que o nosso texto estava grande demais:
   la a manchete de tres linhas ocupa cerca de 12 por cento da altura da peca, e
   aqui ocupava mais de 20. A foto e que manda na peca; o texto e a base dela. */
.j-texto{position:absolute;left:9%;right:9%;top:54%;bottom:14%;z-index:4;
  display:flex;flex-direction:column;justify-content:flex-end;}

.j-chapeu{flex:0 0 auto;display:block;font-family:var(--s-font-display);font-size:22px;
  font-weight:700;letter-spacing:0.19em;text-transform:uppercase;color:#fff;
  margin-bottom:16px;}

/* Caixa alta, peso 800, entrelinha curta. O tamanho e um teto: quem decide e o
   navegador, pelo mesmo script que os layouts desenhados usam, porque manchete
   de 60 e de 120 caracteres nao cabem no mesmo corpo. */
/* O teto vem de max-height, e nao de flex:1.
   Com flex:1 a manchete ocupava a faixa inteira e empurrava o chapeu para o
   topo dela: manchete curta ficava com um buraco no meio. Com max-height os
   dois se apoiam na base, encostados, e o script de ajuste continua tendo uma
   caixa definida para medir, porque a faixa tem topo e base fixos. */
.j-manchete{flex:0 0 auto;max-height:82%;overflow:hidden;display:block;
  font-family:"Cifrao",var(--s-font-display);font-size:54px;font-weight:800;line-height:1.1;
  letter-spacing:-0.005em;text-transform:uppercase;color:#fff;}
.j-manchete > span{display:block;}
/* Bullet do miolo: uma linha por item, dentro do MESMO bloco que o ajuste
   mede. Fora dele, o script mediria o titulo e ignoraria a lista, que e
   justamente o caso em que o texto transborda. */
.j-manchete i{display:block;font-style:normal;margin-top:0.35em;}
.j-manchete i::before{content:"· ";}

/* --- chamada da newsletter ------------------------------------------------ */
/* As cores aqui sao escritas, e nao lidas dos tokens, de proposito.
   Os tokens carregam a paleta da vertical anterior: fundo creme e acento
   laranja. A primeira renderizacao desta peca saiu com texto branco sobre
   creme, ou seja invisivel. A gramatica de jornal e da marca nova, e usa o
   azul-marinho e o vermelho da bandeira. Quando os tokens forem migrados
   para a marca nova, estas tres linhas voltam a ser var(). */
/* Apoiado na base, e nao centrado. Centrado, o bloco ficava no meio e sobrava
   um terco de vazio embaixo, que le como peca que nao terminou de carregar.
   Na base, ele segue a mesma regra das outras pecas do carrossel: o texto mora
   embaixo, e o que sobra em cima e respiro sob a marca. */
.j-cta{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;
  justify-content:flex-end;padding:0 9% 11% 9%;background:#0A3161;}
.j-cta-titulo{font-family:var(--s-font-display);font-size:86px;font-weight:800;
  line-height:1.06;letter-spacing:-0.02em;color:#fff;}
.j-cta-titulo em{font-style:normal;color:#E4344A;}
.j-cta-linha{margin-top:36px;font-family:var(--s-font-display);font-size:34px;
  font-weight:500;line-height:1.4;color:rgba(255,255,255,0.78);}
.j-cta-palavra{align-self:flex-start;margin-top:56px;padding:22px 42px;
  background:#E4344A;color:#fff;font-family:var(--s-font-display);
  font-size:40px;font-weight:800;letter-spacing:0.02em;text-transform:uppercase;}

/* --- noticia em carrossel (06/10/2026) -------------------------------------
   O miolo da noticia, no metodo do Not Journal: foto sangrando, marca no alto,
   chapeu pequeno e espacado, e o texto em caixa alta branca na METADE de baixo,
   sobre um degrade escuro e suave. O degrade sobe mais que o da capa porque o
   texto aqui ocupa a metade da peca, e nao a base dela. */
.jn-grad{position:absolute;inset:0;z-index:2;background:linear-gradient(to top,
  rgba(0,0,0,0.92) 0%,rgba(0,0,0,0.86) 30%,rgba(0,0,0,0.62) 46%,
  rgba(0,0,0,0.22) 60%,rgba(0,0,0,0) 72%);}
/* Faixa de topo e base fixos: o script de ajuste mede a caixa, e caixa sem
   altura definida nao e medivel (a licao da manchete que subia sobre a bolha). */
.jn-texto{position:absolute;left:9%;right:9%;top:42%;bottom:14%;z-index:4;
  display:flex;flex-direction:column;justify-content:flex-end;}
.jn-blocos{flex:0 0 auto;max-height:90%;overflow:hidden;display:block;
  font-family:"Cifrao",var(--s-font-display);font-size:54px;font-weight:800;line-height:1.16;
  letter-spacing:-0.003em;text-transform:uppercase;color:#fff;}
.jn-blocos > span{display:block;}
.jn-blocos p{margin:0 0 0.7em;}
.jn-blocos p:last-child{margin-bottom:0;}
/* A bolha do segundo personagem, menor que a da capa e acima do texto. A base
   e a classe da capa; o tamanho e o lugar sao daqui. Desde 06/10/2026 o lugar
   vem inline, decidido pelos rostos da foto, e isto e so o padrao. */
.j-bolha.jn-bolha{left:63%;top:15%;width:30%;}

/* --- convite para assinar ---------------------------------------------------
   Fundo preto, marca de fundo escuro, e uma caixa de entrada desenhada em HTML
   com a NOSSA edicao no topo. As outras linhas sao barras cinzas, sem
   remetente: nada de imitar outra marca. */
.ja-fundo{position:absolute;inset:0;z-index:0;background:#000;}
.ja-celular{position:absolute;z-index:2;left:17%;right:17%;top:15%;height:43%;
  border-radius:56px 56px 0 0;border:10px solid #2b2b2b;border-bottom:none;
  background:#111;overflow:hidden;}
.ja-celular::after{content:"";position:absolute;left:0;right:0;bottom:0;height:38%;
  background:linear-gradient(to top,#000 0%,rgba(0,0,0,0) 100%);}
.ja-tela{position:absolute;inset:0;padding:44px 34px 0 34px;}
.ja-topo{font-family:var(--s-font-display);font-size:26px;font-weight:700;color:#fff;
  margin-bottom:26px;letter-spacing:0.01em;}
.ja-linha{display:flex;gap:20px;align-items:flex-start;padding:22px 0;
  border-top:1px solid rgba(255,255,255,0.10);}
.ja-linha u{flex:0 0 64px;height:64px;border-radius:50%;background:#2a2a2a;}
.ja-linha i{display:block;height:18px;border-radius:9px;background:#2a2a2a;margin:8px 0 14px;width:88%;}
.ja-linha i + i{width:62%;}
.ja-nossa{border-top:none;}
.ja-ava{flex:0 0 64px;width:64px;height:64px;border-radius:50%;object-fit:cover;display:block;}
.ja-msg{flex:1 1 auto;min-width:0;}
.ja-de{display:flex;justify-content:space-between;font-family:var(--s-font-display);
  font-size:25px;font-weight:800;color:#fff;}
.ja-de span{font-weight:500;color:rgba(255,255,255,0.55);font-size:21px;}
.ja-assunto{margin-top:6px;font-family:var(--s-font-display);font-size:23px;font-weight:700;
  color:#fff;}
.ja-previa{margin-top:6px;font-family:var(--s-font-display);font-size:21px;font-weight:500;
  color:rgba(255,255,255,0.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ja-texto{position:absolute;z-index:3;left:9%;right:9%;bottom:9%;display:flex;
  flex-direction:column;}
.ja-titulo{font-family:var(--s-font-display);font-size:72px;font-weight:800;
  line-height:1.06;letter-spacing:-0.02em;color:#fff;}
.ja-titulo em{font-style:normal;color:#E4344A;}
.ja-linha-sub{margin-top:28px;font-family:var(--s-font-display);font-size:32px;
  font-weight:500;line-height:1.4;color:rgba(255,255,255,0.78);}
.ja-inteiro{white-space:nowrap;}
.ja-palavra{align-self:flex-start;margin-top:40px;padding:20px 38px;
  background:#E4344A;color:#fff;font-family:var(--s-font-display);
  font-size:32px;font-weight:800;letter-spacing:0.02em;text-transform:uppercase;}

/* O cifrao, so ele. O "$" da fonte de display e mais curto que as capitais e a
   barra nao atravessa o S, e em "R$ 5,40" ele saia espremido contra o R. Esta
   face cobre apenas U+0024 e usa uma grotesca do sistema, de modo que o resto
   do texto continua na fonte da marca. Sem nenhuma das fontes na maquina, o
   navegador cai na fonte de display, como antes. */
@font-face{font-family:"Cifrao";font-weight:800;font-style:normal;unicode-range:U+0024;
  src:local("Helvetica Neue Bold"),local("HelveticaNeue-Bold"),local("Helvetica Bold"),
  local("Helvetica-Bold"),local("Arial Bold"),local("Arial-BoldMT"),
  local("Liberation Sans Bold"),local("LiberationSans-Bold");}

/* --- convite para seguir o perfil -------------------------------------------
   Reusa o fundo e o texto do convite de assinar. So muda o botao: o arroba
   fica como esta, em minusculas, e o bloco sobe para o meio da tela. */
.js-siga{top:0;bottom:0;justify-content:center;}
.js-handle{text-transform:none;letter-spacing:0;}

/* Versao com a marca grande, a frase e o perfil desenhado num celular que sai
   pela base (referencia: o ultimo slide da Not Journal, 27/10/2026). */
.js-logo{position:absolute;z-index:3;top:6.5%;left:50%;transform:translateX(-50%);width:66%;display:block;}
.js-topo{position:absolute;z-index:3;left:6%;right:6%;top:11%;text-align:center;}
.js-topo .ja-titulo{font-size:78px;}
.js-tag{margin-top:18px;font-family:var(--s-font-display);font-size:38px;font-weight:800;
  line-height:1.25;color:#E4344A;letter-spacing:-0.005em;}
.js-cel{position:absolute;z-index:2;left:17%;right:17%;top:29%;bottom:-16%;transform:rotate(-4deg);transform-origin:50% 100%;background:#0b0b0c;
  border:12px solid #3b3b3f;border-bottom:none;border-radius:72px 72px 0 0;overflow:hidden;}
.js-perfil{display:flex;align-items:center;gap:30px;padding:46px 38px 0 38px;}
.js-ava{flex:0 0 132px;width:132px;height:132px;border-radius:50%;object-fit:cover;
  border:5px solid #0b0b0c;box-shadow:0 0 0 4px #E4344A;}
.js-nome{font-family:var(--s-font-display);font-size:38px;font-weight:800;color:#fff;
  letter-spacing:-0.01em;}
.js-bio{margin-top:8px;font-family:var(--s-font-display);font-size:24px;font-weight:500;
  line-height:1.3;color:rgba(255,255,255,0.7);}
.js-botao{margin:30px 38px 0 38px;padding:20px 0;border-radius:16px;background:#E4344A;
  color:#fff;text-align:center;font-family:var(--s-font-display);font-size:30px;font-weight:800;}
.js-grade{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:34px 0 0 0;}
.js-grade i{display:block;aspect-ratio:3/4;background:#1c1c1e;overflow:hidden;}
.js-grade img{width:100%;height:100%;object-fit:cover;display:block;}

`;