import type { CarouselFormat, InstagramSlide } from "@/lib/carousel-templates/types";
import { disfarcarPalavrasPesadas } from "./palavras-pesadas";
import type { Layout } from "@/lib/carousel-templates/layout";
import type { Affordance } from "@/lib/carousel-templates/chrome";
import type { AssetVisual } from "../visual/tipos";
import { cabeNoRecorte } from "@/lib/carousel-templates/variants";
import type { CaixaNormalizada } from "@/lib/carousel-templates/bolha";
import { ANEL_DA_BOLHA_PX, cruzaAlgumRosto } from "./bolha-sem-rosto";
import { temasNoTexto } from "@/lib/temas";
import type { EditoriaId } from "@/lib/editorias";

/**
 * A arte do post do feed, e a única regra que ela não negocia.
 *
 * Este módulo existe separado do renderer do carrossel por um motivo só: o
 * caminho antigo, quando não tem foto, cai em banco de imagem e depois em
 * geração por IA. Para notícia factual isso é proibido, e proibido não é o
 * mesmo que "evitado quando dá" — a única forma de garantir é uma superfície
 * onde esse caminho não existe.
 *
 * Aqui `bg_image_url` recebe exatamente uma coisa: a URL do asset que o
 * resolvedor visual aprovou. Não há segunda atribuição, não há fallback, não
 * há consulta a banco de imagem. Sem asset aprovado, a capa é de texto.
 *
 * Capa de texto não é um erro nem um degradê de qualidade: é a forma honesta
 * de publicar uma notícia para a qual não existe imagem legítima disponível.
 */

/**
 * Qual formato sobrevive sem fotografia.
 *
 * A regra do dono do produto: pauta editorialmente valida sem imagem valida
 * PODE publicar. `NO_VALID_VISUAL_ASSET` deixa de ser motivo de descarte e
 * passa a ser uma decisao editorial registrada. So impede a publicacao quando
 * o formato exige fotografia e nao existe versao textual segura dele.
 *
 * `noticia` e capa unica e tem capa de texto propria: publica.
 * `tutorial` e carrossel de texto desde sempre: publica.
 * `prompt` mostra o resultado visual de um prompt. Sem imagem nao ha o que
 * mostrar, e um card escrito "aqui teria uma imagem" e pior que nao postar.
 */
const FORMATOS_QUE_SOBREVIVEM_SEM_FOTO: Record<CarouselFormat, boolean> = {
  noticia: true,
  tutorial: true,
  prompt: false,
};

export function publicavelSemFoto(formato: CarouselFormat): boolean {
  return FORMATOS_QUE_SOBREVIVEM_SEM_FOTO[formato] ?? false;
}

export type CapaDoPost = {
  slide: InstagramSlide;
  /**
   * Variante do template.
   *
   * Na CAPA ela muda com a presença da foto, e só com ela. Num slide de
   * conteúdo do carrossel, ela é a variante que o papel declarou, e por isso o
   * tipo é aberto: fechá-lo nas duas capas obrigaria a listar aqui todas as
   * variantes de conteúdo, que são decisão de quem monta o carrossel.
   */
  variante: string;
  comFoto: boolean;
  /** Crédito a ser impresso na arte. Vazio quando a licença não exige. */
  credito: string;
  /** Preenchido quando não há foto, para o preview dizer por quê. */
  motivoSemFoto: string;
};

/**
 * O layout desenhado no painel sabe carregar a foto?
 *
 * Layout desenhado vence a variante de código, e vence inteiro: quem
 * posicionou os blocos decidiu tudo. Só que o desenho de `noticia/cover` em
 * produção tem três blocos — degradê, marca e manchete em branco — e **nenhum
 * bloco de imagem**. Com ele, a foto aprovada não aparece em lugar nenhum e a
 * manchete branca cai sobre o creme do canvas: texto invisível.
 *
 * Isso apareceu na primeira arte renderizada de verdade, e não apareceria em
 * nenhum teste de unidade: o layout vem do banco.
 *
 * A regra aqui é de capacidade, não de gosto. O desenho manda quando consegue
 * mostrar o que recebeu. Quando não consegue, a variante de código assume, que
 * é a que sabe desenhar os dois estados.
 */
export const DIAGNOSTICOS_DE_LAYOUT = {
  /** Nenhum desenho salvo: a variante de codigo e o caminho normal. */
  AUSENTE: "LAYOUT_NOT_DESIGNED",
  /** Ha desenho e ele carrega a foto. Foi usado. */
  USADO: "LAYOUT_USED",
  /** Ha desenho, mas sem bloco de imagem de fundo: a foto sumiria nele. */
  SEM_SLOT_DE_IMAGEM: "LAYOUT_MISSING_IMAGE_SLOT",
  /** Capa de texto: o desenho nao entra em jogo, com ou sem slot. */
  SEM_FOTO: "LAYOUT_NOT_APPLICABLE_NO_PHOTO",
} as const;

export type DiagnosticoDeLayout = (typeof DIAGNOSTICOS_DE_LAYOUT)[keyof typeof DIAGNOSTICOS_DE_LAYOUT];

export function layoutCarregaAFoto(layout: Layout | null | undefined): boolean {
  if (!layout || layout.blocks.length === 0) return false;
  return layout.blocks.some((b) => b.tipo === "imagem" && (b.imagem ?? "fundo") === "fundo");
}

/**
 * O veredito sobre o desenho, nomeado.
 *
 * "Nao usou o layout" e ambiguo: pode ser que nao exista desenho nenhum, pode
 * ser que exista e esteja incompleto, e as duas coisas pedem acoes diferentes.
 * `LAYOUT_MISSING_IMAGE_SLOT` e a que precisa aparecer no relatorio, porque e a
 * unica que descreve um desenho salvo que nao serve para o conteudo que
 * recebeu. O codigo nao depende da correcao para funcionar; o diagnostico
 * existe para que a correcao possa ser feita no painel, depois, sabendo o que
 * corrigir.
 */
export function diagnosticarLayout(
  layout: Layout | null | undefined,
  comFoto: boolean,
): DiagnosticoDeLayout {
  const desenhado = Boolean(layout && layout.blocks.length > 0);
  if (!comFoto) return desenhado ? DIAGNOSTICOS_DE_LAYOUT.SEM_FOTO : DIAGNOSTICOS_DE_LAYOUT.AUSENTE;
  if (!desenhado) return DIAGNOSTICOS_DE_LAYOUT.AUSENTE;
  return layoutCarregaAFoto(layout)
    ? DIAGNOSTICOS_DE_LAYOUT.USADO
    : DIAGNOSTICOS_DE_LAYOUT.SEM_SLOT_DE_IMAGEM;
}

/**
 * A arte lê duas coisas do asset, e o tipo diz só essas duas.
 *
 * Exigir `AssetVisual` inteiro aqui obrigava quem só tem o registro
 * persistido em `content_json.visual` a inventar vinte campos ou a mentir com
 * um `as`. O que a capa usa é a URL da foto e o crédito da licença; o resto do
 * asset existe para o registro de direito, não para o desenho.
 */
/**
 * Qual variante desenha a capa. UMA regra, num lugar só.
 *
 * Ela existia duas vezes: aqui, decidindo o desenho, e em
 * `social-posts-store.ts`, decidindo o que gravar no `content_json`. As duas
 * envelheceram separadas, e em 16/09/2026 a linha gravada dizia
 * `fullbleed_portrait` enquanto a peça publicada era `capa_jornal`.
 *
 * O campo gravado é o que se olha para saber o que foi ao ar sem baixar o PNG.
 * Campo que descreve uma decisão sem TOMAR a decisão é campo que mente, e
 * mentiu por vinte minutos de diagnóstico.
 */
export type GramaticaDaCapa = "jornal" | "recorte";

/**
 * Qual desenho a capa usa.
 *
 * São duas gramáticas, e a diferença entre elas não é de gosto. O JORNAL
 * afirma: foto sangrando, chapéu de editoria, manchete em caixa alta sobre o
 * degradê. O RECORTE comenta: fundo branco, autor no topo, texto corrido em
 * caixa baixa, com a foto como cartão no meio da fala.
 *
 * O recorte não tem versão sem foto, e o ritmo só o pede quando há foto. Este
 * comentário já afirmou que sem foto "o corpo do tipo cresce": não cresce. O
 * `.r-texto` é faixa fixa de 76% com o tipo travado em 46px, e um gancho curto
 * deixa dois terços da peça em branco. Descoberto renderizando, em 18/09/2026.
 * Sem foto quem desenha é a capa tipográfica do jornal, que mede e enche.
 */
export function varianteDaCapa(comFoto: boolean, gramatica: GramaticaDaCapa = "jornal"): string {
  if (gramatica === "recorte") return "recorte_post";
  return comFoto ? "capa_jornal" : "noticia_sem_foto";
}

/*
 * Autor e licença vão junto desde 06/10/2026: a linha curta do crédito na
 * legenda ("Foto: X") sai deles, inclusive para Pexels, cuja `attribution` vem
 * vazia. Opcionais para quem monta a foto sem o asset inteiro.
 */
export type FotoDaCapa = Pick<AssetVisual, "imageUrl" | "attribution"> & Partial<Pick<AssetVisual, "author" | "license">>;

export type EntradaDaCapa = {
  headline: string;
  /**
   * A segunda foto, desenhada em círculo na capa.
   *
   * Vem da vice-campeã do resolvedor, que passou pelas mesmas barreiras da
   * vencedora. Nula na maioria dos dias, e a capa sai inteira sem ela: a bolha
   * é reforço, não requisito.
   */
  assetSecundario?: FotoDaCapa | null;
  /**
   * Onde a bolha fica, decidido pelos rostos da foto de fundo (06/10/2026).
   *
   * Chave de `POSICOES_DA_BOLHA`. Ausente é a posição de sempre, que é o que
   * a capa fazia antes de alguém perguntar onde estão os rostos.
   */
  posicaoDaBolha?: string;
  /**
   * Os rostos da foto de fundo, em fração do canvas, como a decisão os viu.
   *
   * O render confere de novo com a bolha JÁ desenhada, medindo o círculo na
   * página. Se o círculo medido encostar num rosto, a bolha é tirada antes do
   * screenshot. Ver `renderizarCapas`.
   */
  rostosDaBolha?: CaixaNormalizada[];
  /** Categoria editorial, usada como sobrancelha na capa sem foto. */
  eixo?: string;
  /**
   * O chapéu já decidido, com o tema quando a pauta tem (06/10/2026).
   *
   * Vem de `chapeuDaPeca`, chamada por quem conhece o texto da pauta. Ausente,
   * o chapéu é a editoria do eixo, como antes.
   */
  chapeu?: string;
  /**
   * Slide de conteúdo que SÓ existe com foto (06/10/2026).
   *
   * O miolo da notícia em carrossel nunca sai como texto sobre azul-marinho:
   * sem foto, o slide sai do carrossel antes do render. Se a foto aprovada não
   * baixar na hora do render, a peça falha em vez de virar slide de texto, e
   * quem chamou decide o que fazer com o carrossel.
   */
  exigeFoto?: boolean;
  /**
   * Qual das duas capas desenhar.
   *
   * `noticia` é a serifa preta sobre creme, e é o padrão. `carrossel` é a faixa
   * escura com a frase-chave marcada. A diferença é de produto, não de gosto:
   * notícia do dia e material de referência são coisas distintas no feed, e a
   * capa é onde o leitor percebe isso antes de ler.
   */
  estiloDaCapa?: "noticia" | "carrossel";
  /**
   * Jornal ou recorte de post. Ausente é jornal, que é o desenho padrão.
   *
   * Ver {@link varianteDaCapa}: a escolha é de gramática, não de tema. O
   * recorte serve à pauta que precisa de leitura, e não só de fato.
   */
  gramatica?: GramaticaDaCapa;
  /**
   * O segundo parágrafo, que só o recorte desenha.
   *
   * Na gramática de jornal a capa é manchete e foto, e não há onde pôr um
   * parágrafo de leitura. No recorte ele é metade da peça: é o que separa o
   * fato do que o fato significa. Vazio, o recorte sai só com a abertura, e
   * continua de pé.
   */
  corpo?: string;
  /**
   * Moldura discreta: sem colchetes de corte e sem contador no cabeçalho.
   *
   * Vale para o carrossel inteiro, capa e miolo. A capa é sangrada e não tem
   * moldura; quando o miolo vinha emoldurado, a peça mudava de regra na virada
   * do slide 1 para o 2. A continuidade fica nos pontos do rodapé, que são o
   * indicador discreto, e some a paginação repetida no topo.
   */
  molduraDiscreta?: boolean;
  /**
   * O trecho da manchete que sai marcado, na capa de carrossel.
   *
   * Só é usado por ela, e só é pintado se for encontrado na própria manchete.
   * A guarda do carrossel já exige que o destaque seja trecho literal, então
   * aqui não há nada a conferir de novo: há o que respeitar.
   */
  destaque?: string;
  asset: FotoDaCapa | null;
  motivoSemFoto?: string;
  /**
   * Um slide que NÃO é a capa, já montado por quem conhece o formato.
   *
   * Existe para o carrossel: os slides de conteúdo não têm manchete, eixo nem
   * foto, e montá-los aqui obrigaria este módulo a conhecer papéis, estruturas
   * e variantes de conteúdo permanente. Quem sabe disso monta o slide e passa
   * pronto; aqui ele só é desenhado.
   */
  slidePronto?: InstagramSlide;
  /** Posição e total, para a paginação. Peça única é 1 de 1. */
  posicao?: number;
  total?: number;
  /**
   * Quanto o rodapé promete.
   *
   * O chrome de `noticia` é o editorial, e o rodapé dele escreve "SWIPE" com
   * seta quando há mais de um slide. Na peça única isso nunca aparecia, porque
   * `total` é 1; no carrossel apareceu em todos os slides, e o pedido é
   * explícito em não usar. `discreta` mantém a paginação e tira o convite.
   */
  affordance?: Affordance;
};

/**
 * A sobrancelha da capa sem foto.
 *
 * Sem imagem, o título fica sozinho num campo claro e perde a referência do
 * que se está lendo. O eixo editorial devolve essa referência sem afirmar
 * nada além do que a classificação já afirmou.
 *
 * O rótulo é escrito aqui, e não derivado do valor: o eixo é vocabulário de
 * máquina, e `decisao_judicial` impresso na arte sai sem acento e com
 * underscore. Trocar `_` por espaço não resolve — resolve o acento errado.
 * A lista é fechada (ver o enum do classificador), então escrevê-la inteira
 * custa seis linhas e não deixa caso solto.
 */
const ROTULO_DO_EIXO: Record<string, string> = {
  economia: "ECONOMIA",
  trabalho: "TRABALHO",
  custo_de_vida: "CUSTO DE VIDA",
  politica: "POLÍTICA",
  tecnologia: "TECNOLOGIA",
  cultura: "CULTURA",
  seguranca: "SEGURANÇA",
  imigracao: "IMIGRAÇÃO",
  brasil: "BRASIL",
  // "outro" não tem rótulo: nomear o que a classificação não soube nomear
  // seria inventar uma editoria.
};

export function sobrancelha(eixo: string | undefined): string {
  return ROTULO_DO_EIXO[(eixo ?? "").trim()] ?? "";
}

/** O eixo do classificador na editoria do portal, que é como os temas estão organizados. */
const EDITORIA_DO_EIXO: Record<string, EditoriaId> = {
  economia: "economia",
  trabalho: "trabalho",
  tecnologia: "tecnologia",
  custo_de_vida: "custo-de-vida",
  politica: "governo",
  brasil: "brasil",
};

/**
 * O chapéu da peça do feed: o TEMA quando a pauta tem um, e a editoria quando
 * não tem (06/10/2026).
 *
 * O Not Journal imprime o assunto, e não a seção: "DATA CENTERS", "JUSTIÇA",
 * "ELEIÇÕES". O nosso chapéu dizia sempre a editoria ("POLÍTICA"), que é
 * verdade e é larga demais para orientar quem rola o feed. O tema sai da lista
 * FECHADA de `src/lib/temas.ts`, a mesma da fileira "Assuntos" do portal, e
 * só quando o texto da pauta o trata de verdade: duas menções ou mais (nome ou
 * sinônimo), a régua conservadora de `temasNoTexto`, e uma delas na manchete,
 * que é o primeiro texto. Uma citação de passagem não faz de um tema o
 * assunto, e chapéu errado é pior que chapéu largo.
 *
 * Sem tema, vale a editoria de sempre; eixo sem rótulo continua sem chapéu.
 * Determinístico: a mesma pauta dá o mesmo chapéu na capa, no miolo e na
 * refação.
 */
export function chapeuDaPeca(entrada: { eixo?: string; textos?: Array<string | null | undefined> }): string {
  const textos = (entrada.textos ?? []).map((t) => String(t ?? "")).filter((t) => t.trim());
  if (textos.length > 0) {
    const editoria = EDITORIA_DO_EIXO[(entrada.eixo ?? "").trim()] ?? null;
    /*
     * E o tema tem que estar na MANCHETE, que é o primeiro texto. Medido nas
     * amostras de 06/10/2026: a pauta das ações climáticas contra petroleiras
     * citava "petróleo" duas vezes na legenda e saía com "PREÇO DO PETRÓLEO",
     * que não é o assunto. O chapéu fica em cima da manchete, e diz de que ela
     * trata.
     */
    const naManchete = new Set(temasNoTexto(textos[0], { editoria, minimo: 1 }).map((t) => t.slug));
    const tema = temasNoTexto(textos.join("\n"), { editoria, minimo: 2 }).find((t) => naManchete.has(t.slug));
    if (tema) return tema.nome.toLocaleUpperCase("pt-BR");
  }
  return sobrancelha(entrada.eixo);
}

/** O chapéu que a entrada pede: o já decidido, ou a editoria. */
function chapeuDaEntrada(entrada: { chapeu?: string; eixo?: string }): string {
  return (entrada.chapeu ?? "").trim() || sobrancelha(entrada.eixo);
}

/**
 * A gramática que a peça VAI usar, que nem sempre é a pedida.
 *
 * Existe uma regra só, e ela mora aqui, porque três lugares precisam da mesma
 * resposta: o desenho, que renderiza; o store, que grava `arte.variante`; e a
 * conferência da publicação, que recusa o post quando os dois discordam.
 *
 * Já houve o caso de a regra existir em três cópias. Quando o desenho mudou
 * para a gramática de jornal, as outras duas continuaram falando de
 * `fullbleed_portrait`, e a conferência passou a acusar contradição entre uma
 * peça correta e um campo velho. Vinte minutos de diagnóstico num post que
 * estava certo.
 *
 * O recorte tem o corpo do tipo travado em 46px, porque carrossel com um
 * tamanho por slide denuncia peça de máquina. O preço é um orçamento de
 * caracteres, e quando o texto o estoura só existem três saídas: encolher o
 * tipo, que desfaz a regra; cortar a frase, que foi o defeito da primeira
 * renderização; ou desenhar na gramática de jornal, que se vira com texto de
 * qualquer tamanho. A terceira é a única sem mentira, e é a que está aqui.
 */
export function gramaticaEfetiva(entrada: {
  pedida?: GramaticaDaCapa;
  eixo?: string;
  /** O chapéu decidido, quando há; o orçamento do recorte conta com ele. */
  chapeu?: string;
  headline?: string;
  corpo?: string;
  comFoto: boolean;
}): GramaticaDaCapa {
  const pedida = entrada.pedida ?? "jornal";
  if (pedida !== "recorte") return "jornal";

  return cabeNoRecorte({
    chapeu: chapeuDaEntrada(entrada),
    titulo: entrada.headline,
    corpo: entrada.corpo,
    temFoto: entrada.comFoto,
  })
    ? "recorte"
    : "jornal";
}

export function montarCapaDoPost(entrada: EntradaDaCapa): CapaDoPost {
  /*
   * Slide pronto passa direto, sem foto e sem crédito.
   *
   * Só a capa carrega imagem nesta superfície, e por isso o slide de conteúdo
   * não tem de onde puxar foto: `comFoto` falso aqui não é degradação, é o
   * formato do slide.
   */
  if (entrada.slidePronto) {
    /*
     * O slide de notícia do carrossel TEM foto (06/10/2026).
     *
     * No método do Not Journal todo slide é foto sangrando, e não só a capa. A
     * foto chega por `asset`, como na capa, e não escrita no slide pronto: é
     * assim que ela passa pelo mesmo download embutido de `renderizarCapas`, e
     * que download falho vira slide sem foto em vez de buraco branco. A bolha
     * chega por `assetSecundario` e segue a mesma regra da capa: nunca a
     * mesma foto do fundo.
     */
    const fotoDoSlide = (entrada.asset?.imageUrl ?? "").trim();
    const bolhaDoSlide = (entrada.assetSecundario?.imageUrl ?? "").trim();
    const comBolha = Boolean(fotoDoSlide && bolhaDoSlide && bolhaDoSlide !== fotoDoSlide);
    return {
      slide: {
        ...entrada.slidePronto,
        bg_image_url: fotoDoSlide,
        inset_image_url: comBolha ? bolhaDoSlide : "",
        // Onde a bolha do miolo fica, decidido pelos rostos (06/10/2026).
        ...(comBolha && entrada.posicaoDaBolha ? { inset_position: entrada.posicaoDaBolha } : {}),
      },
      variante: entrada.slidePronto.variant || entrada.slidePronto.type,
      comFoto: Boolean(fotoDoSlide),
      credito: "",
      motivoSemFoto: "",
    };
  }

  const asset = entrada.asset;
  const comFoto = Boolean(asset && asset.imageUrl);

  /*
   * A capa do carrossel é a mesma com e sem foto.
   *
   * Na capa da notícia, foto e ausência de foto são duas variantes diferentes,
   * porque a peça sem foto precisa ser inteira de tipo. Aqui não: a faixa
   * escura já é a peça, e a foto entra por cima dela quando existe. Uma
   * variante só significa que o dia sem imagem não muda a cara do feed.
   */
  /*
   * Uma gramatica so, com e sem foto, carrossel ou imagem unica.
   *
   * Eram tres variantes para a mesma pergunta, e a diferenca entre elas era
   * historica, nao editorial: `fullbleed_portrait` traz o cartao de perfil da
   * fase 1, `capa_destaque` marca uma palavra da manchete, `noticia_sem_foto`
   * e uma peca inteira de tipo. Tres desenhos diferentes no mesmo feed fazem o
   * perfil parecer tres perfis.
   *
   * `capa_jornal` cobre os dois casos COM foto, carrossel ou imagem unica, que
   * antes eram dois desenhos diferentes sem motivo editorial.
   *
   * Sem foto continua sendo `noticia_sem_foto`, e isso nao e omissao. Aquela
   * peca e tipografica de proposito, e faz coisas que a gramatica de jornal
   * nao faz: mede o corpo do tipo no navegador e impede que "I-765" quebre no
   * meio. Pintar um fundo azul e escrever a manchete em cima seria a mesma
   * peca pior.
   */
  const doCarrossel = entrada.estiloDaCapa === "carrossel";

  /*
   * A gramática pedida pode não caber, e aí ela não é usada.
   *
   * O recorte tem o corpo do tipo travado em 46px, porque carrossel com um
   * tamanho por slide denuncia peça de máquina. O preço disso é um orçamento
   * de caracteres, e quando o texto o estoura só existem três saídas:
   * encolher o tipo, que desfaz a regra; cortar a frase, que foi o defeito que
   * a primeira renderização mostrou; ou desenhar a peça na gramática de
   * jornal, que se vira com texto de qualquer tamanho.
   *
   * A terceira é a única sem mentira, e é a que está aqui.
   */
  const gramatica = gramaticaEfetiva({
    pedida: entrada.gramatica,
    eixo: entrada.eixo,
    chapeu: entrada.chapeu,
    headline: entrada.headline,
    corpo: entrada.corpo,
    comFoto,
  });

  const variante = varianteDaCapa(comFoto, gramatica);

  /*
   * A bolha, e as duas condições para ela existir.
   *
   * Precisa de foto principal, porque sem ela a capa é a peça tipográfica e
   * não tem onde pôr um círculo. E precisa ser outra foto: o resolvedor já
   * recusa a repetição, e a regra é reafirmada aqui porque é aqui que ela
   * aparece para quem vê. Mesma imagem no fundo e no círculo é pior que capa
   * sem bolha, e a mesma foto chega por dois caminhos com frequência, já que
   * fontes diferentes servem o mesmo arquivo do Commons.
   */
  /*
   * E a gramática tem que ser a de jornal: o recorte não desenha bolha, e até
   * 06/10/2026 o campo ia preenchido assim mesmo, o que podia gravar
   * `bolha: true` numa peça sem círculo e tirar a vez da peça seguinte.
   */
  const segunda = (entrada.assetSecundario?.imageUrl ?? "").trim();
  const bolha = comFoto && gramatica === "jornal" && segunda && segunda !== asset!.imageUrl ? segunda : "";

  const slide: InstagramSlide = {
    index: 1,
    type: "cover",
    /*
     * O chapéu sai SEMPRE, com foto ou sem, peça única ou carrossel.
     *
     * Ele ficava de fora justamente no caso mais comum, a peça única com foto,
     * herança do desenho anterior em que a capa com foto não tinha onde
     * colocá-lo. Na gramática de jornal ele é parte da peça: é a linha que diz
     * ao leitor de que editoria é aquilo antes de ele ler a manchete, e nas
     * três capas de referência medidas ela está nas três.
     *
     * Eixo sem rótulo continua sem chapéu. Nomear o que a classificação não
     * soube nomear seria inventar editoria, e isso não mudou.
     */
    eyebrow: chapeuDaEntrada(entrada),
    title: entrada.headline,
    /*
     * O corpo só existe no recorte.
     *
     * A capa de jornal imprime manchete e foto, e mandar um parágrafo para ela
     * faria o texto entrar na mesma caixa da manchete, com o mesmo corpo de
     * tipo: a peça viraria um bloco só, que é o defeito que o miolo do jornal
     * já teve.
     */
    body: gramatica === "recorte" ? (entrada.corpo ?? "").trim() : "",
    bullet_points: [],
    highlight_text: doCarrossel ? (entrada.destaque ?? "").trim() : "",
    variant: variante,
    cover_variant: "dark_speaker",
    headline_style: "clean",
    // Vazio sempre, e de propósito: é este campo que o renderer antigo usa
    // como consulta ao banco de imagem e como prompt de geração.
    cover_image_prompt: "",
    // A ÚNICA origem possível de imagem nesta superfície.
    bg_image_url: comFoto ? asset!.imageUrl : "",
    /*
     * A bolha só existe quando HÁ foto principal.
     *
     * Sem foto a capa é a peça tipográfica, que não tem onde pôr um círculo:
     * mandar a segunda imagem assim mesmo faria a peça de texto carregar um
     * campo que ela ignora, e alguém depois acharia que ela deveria usá-lo.
     */
    inset_image_url: bolha,
    ...(bolha && entrada.posicaoDaBolha ? { inset_position: entrada.posicaoDaBolha } : {}),
    cta_text: "",
  };

  return {
    slide,
    variante,
    comFoto,
    /*
     * O crédito NÃO é queimado na imagem. Ele vai para a legenda do post.
     *
     * CC BY e CC BY-SA exigem atribuição junto da obra, e isso continua sendo
     * cumprido: a licença pede atribuição "de maneira razoável", e crédito na
     * legenda do post é a prática corrente de quem publica em rede social.
     * O que muda é onde ele aparece, nunca se aparece.
     *
     * A tira ficava por cima da foto, no rodapé da peça, e foi o dono quem
     * pediu para tirar, em 18/09/2026. Ela entrou em 06/09 por um motivo
     * legítimo, que era a licença não estar sendo cumprida em lugar nenhum: o
     * autor era gravado numa coluna do banco e ninguém desenhava nada. Coluna
     * de banco não cumpre licença; legenda de post cumpre.
     *
     * Quem monta a legenda é `creditoParaLegenda`, e ele lê o MESMO
     * `asset.attribution` que esta linha lia. Uma origem só para o texto.
     *
     * ATUALIZADO em 06/10/2026: regra do dono, para TODA licença e para todo
     * slide (capa, miolo, convite): a arte do Instagram não leva tira de
     * crédito. O crédito é a última linha da legenda, curta ("Foto: X", com a
     * sigla CC só quando a licença exige), montada por `linhaDeCredito` em
     * `legenda-final.ts`; `creditoParaLegenda` saiu. Isto substitui, para o
     * Instagram, o "requisito de RENDER" do incidente de 06/09. Portal e
     * newsletter continuam com o crédito deles.
     */
    credito: "",
    motivoSemFoto: comFoto ? "" : (entrada.motivoSemFoto || "NO_VALID_VISUAL_ASSET").trim(),
  };
}

/**
 * Render da arte.
 *
 * Fica neste arquivo, e não no renderer do carrossel, pela mesma razão do
 * resto do módulo: lá o laço de render é o dono da cadeia de fallback. Aqui o
 * laço não tem cadeia nenhuma para cair.
 */

export type ArteRenderizada = {
  capa: CapaDoPost;
  html: string;
  /** O arquivo que subiria para a Meta: 2x, sem perda. */
  png: Buffer;
  /*
   * A mesma arte em JPEG, só para caber numa página de preview.
   *
   * O PNG em 2x passa de 4 MB por peça; dez deles embutidos numa página fazem
   * um arquivo de 40 MB que o navegador engasga para abrir — e preview que não
   * abre não é preview.
   */
  jpeg: Buffer;
  /** A mesma peça em 2x, JPEG de qualidade fixa. Alternativa quando o PNG estoura. */
  jpegPublicavel: Buffer;
  /** Dimensão real da peça, em pixels do arquivo. */
  largura: number;
  altura: number;
  /**
   * As fontes que o navegador NÃO tinha na hora de medir e desenhar.
   *
   * `document.fonts.ready` resolve mesmo quando o Google Fonts não respondeu:
   * ele promete que o carregamento terminou, não que deu certo. Sem esta
   * conferência, uma peça renderizada com a serifa do sistema em vez de
   * Playfair Display sairia com outra medida de tipo, outro número de linhas e
   * outro desenho — sem erro, sem log, e visualmente parecida o suficiente para
   * ninguém notar num relatório.
   *
   * Vazio é o caso normal.
   */
  fontesQueFaltaram: string[];
  /**
   * Se os tokens do desenho não vieram do banco.
   *
   * Canvas, paleta e fontes saem deles. Cair no default do repo produz uma peça
   * de outra proporção e outras cores, e `resolveTokens` fazia isso em silêncio.
   */
  temaDegradado: string;
  /** Se o desenho do painel foi usado, ou se a variante de código assumiu. */
  usouLayoutDesenhado: boolean;
  /** Por que foi ou não foi usado. Ver `diagnosticarLayout`. */
  diagnosticoDoLayout: DiagnosticoDeLayout;
  /**
   * A bolha como ela saiu no ARQUIVO, e não como foi pedida.
   *
   * Pedida e desenhada são coisas diferentes, e já foram tratadas como uma:
   * a foto do círculo que não baixa vira capa sem bolha, e a linha do banco
   * continuava dizendo `bolha: true`. Quem grava o ritmo lê `desenhada`.
   */
  bolha: BolhaNoRender;
};

export type BolhaNoRender = {
  pedida: boolean;
  desenhada: boolean;
  /** Vazio quando saiu como pedida. */
  motivo: string;
  /** O círculo medido na página, em pixels do canvas, sem o anel. */
  medida: { cx: number; cy: number; raio: number; posicao: string } | null;
};

/**
 * Baixa a foto e embute como data URL.
 *
 * A página do render roda offline, sem rede, e uma URL remota simplesmente não
 * carregaria a tempo do screenshot. Falha vira capa sem foto, não capa com
 * retângulo vazio: quem chama decide o que fazer com isso.
 */
async function baixarComoDataUrl(
  url: string,
  fetcher: typeof fetch,
  tetoMs = 30_000,
): Promise<string | null> {
  try {
    const r = await fetcher(url, {
      headers: { "User-Agent": "imigra.us/1.0 (contato@imigra.us)" },
      signal: AbortSignal.timeout(tetoMs),
    });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.byteLength === 0) return null;
    const mime = r.headers.get("content-type") || "image/jpeg";
    if (!mime.startsWith("image/")) return null;
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Uma face de fonte como o navegador a reporta. */
export type FaceDeFonte = { family: string; status: string };

/**
 * Quais famílias o navegador não tinha, decidido fora do navegador.
 *
 * A decisão mora aqui, e não dentro do `page.evaluate`, para poder ser testada
 * nas duas direções sem subir Chromium. O navegador só reporta o que tem.
 *
 * Como o sinal foi escolhido, porque não é óbvio:
 *
 *   - `document.fonts.check("16px 'Playfair Display'")` NÃO serve. Sem peso na
 *     especificação, `check` pergunta por 400, e o Playfair deste projeto
 *     carrega 600 a 900: a resposta era `false` com a fonte perfeitamente
 *     carregada, e a primeira versão desta guarda bloqueava toda publicação.
 *
 *   - Contar faces carregadas também não serve. O carregamento é sob demanda:
 *     numa peça só de manchete, das 70 faces declaradas só 2 carregam, e as
 *     outras 68 ficam `unloaded` sem que nada esteja errado.
 *
 *   - O que distingue os dois mundos, medido: com a rede normal há 70 faces
 *     registradas e nenhuma em erro. Com o Google Fonts bloqueado há ZERO
 *     faces, porque a folha de estilo não chegou, e a mesma manchete passa a
 *     ocupar 709px de altura onde ocupava 557px.
 *
 * Então: família que não aparece no conjunto, ou face que terminou em erro.
 */
export function familiasQueFaltaram(faces: FaceDeFonte[], esperadas: string[]): string[] {
  const registradas = new Set(faces.map((f) => f.family));
  const ausentes = esperadas.filter((f) => !registradas.has(f));
  const comErro = faces.filter((f) => f.status === "error").map((f) => f.family);
  return [...new Set([...ausentes, ...comErro])];
}

export async function renderizarCapas(
  entradas: EntradaDaCapa[],
  opcoes?: { fetcher?: typeof fetch },
): Promise<ArteRenderizada[]> {
  if (entradas.length === 0) return [];
  // O texto da arte do Instagram com as palavras pesadas disfarçadas (29/10/2026), como a legenda.
  entradas = entradas.map((e) => ({
    ...e,
    headline: disfarcarPalavrasPesadas(e.headline),
    ...(e.corpo ? { corpo: disfarcarPalavrasPesadas(e.corpo) } : {}),
  }));

  const { chromium } = await import("playwright-core");
  const { assembleSlide } = await import("@/lib/carousel-templates/assemble");
  const { resolveFormatConfigFromDb, resolveLayout, resolveTokensComDiagnostico } = await import(
    "@/lib/carousel-templates/resolve"
  );

  const fetcher = opcoes?.fetcher ?? fetch;
  const [tema, formatConfig, layout] = await Promise.all([
    resolveTokensComDiagnostico("noticia"),
    resolveFormatConfigFromDb("noticia"),
    resolveLayout("noticia", "cover"),
  ]);
  const tokens = tema.tokens;

  /*
   * Tema que não veio do banco é peça diferente da aprovada.
   *
   * Canvas, paleta e fontes saem dos tokens. Se a leitura falhar, `resolveTokens`
   * cai no default do repo em silêncio, e a arte sai com outra proporção e
   * outras cores — parecida o bastante para passar num relatório.
   */
  if (tema.degradado) console.warn(`[ARTE] ${tema.motivo}`);

  const { primeiraFamilia } = await import("@/lib/carousel-templates/fonts");
  const familiasEsperadas = [
    ...new Set([tokens.fonts.display, tokens.fonts.body, tokens.fonts.accent].map(primeiraFamilia)),
  ];

  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?.trim() || undefined;
  const browser = await chromium.launch({ headless: true, executablePath });
  const feitas: ArteRenderizada[] = [];

  try {
    const page = await browser.newPage({
      viewport: { width: tokens.canvas.width, height: tokens.canvas.height },
      deviceScaleFactor: 2,
    });

    for (const entrada of entradas) {
      let capa = montarCapaDoPost(entrada);

      // O slide que só existe com foto não vira slide de texto (06/10/2026).
      if (entrada.exigeFoto && !capa.comFoto) {
        throw new Error(`o slide ${entrada.posicao ?? "?"} exige foto e chegou sem nenhuma`);
      }

      if (capa.comFoto) {
        const dataUrl = await baixarComoDataUrl(capa.slide.bg_image_url, fetcher);
        if (dataUrl) {
          capa = { ...capa, slide: { ...capa.slide, bg_image_url: dataUrl } };
        } else if (entrada.exigeFoto) {
          throw new Error(`a foto do slide ${entrada.posicao ?? "?"} não baixou, e o slide não sai sem ela`);
        } else {
          // Download falho não vira outra imagem. Vira capa de texto, igual a
          // qualquer outra ausência de foto.
          capa = montarCapaDoPost({ ...entrada, asset: null, motivoSemFoto: "ASSET_DOWNLOAD_FAILED" });
        }
      }

      /*
       * A bolha também é embutida, e não apontada.
       *
       * A foto de fundo virava data URL logo acima; a do círculo ia como
       * endereço remoto direto no HTML. Se o host recusasse o pedido no
       * instante do screenshot, e o Commons recusa pedido sem User-Agent com
       * alguma frequência, o PNG aprovado saía com um círculo branco vazio no
       * terço superior, e o hash congelava esse defeito.
       *
       * Bolha que não baixa vira capa sem bolha. É o mesmo tratamento que a
       * foto de fundo recebe, e pelo mesmo motivo: ausência é melhor que
       * buraco.
       */
      const bolhaNoRender: BolhaNoRender = {
        pedida: Boolean(capa.slide.inset_image_url),
        desenhada: false,
        motivo: "",
        medida: null,
      };
      if (capa.slide.inset_image_url) {
        const bolha = await baixarComoDataUrl(capa.slide.inset_image_url, fetcher);
        capa = { ...capa, slide: { ...capa.slide, inset_image_url: bolha ?? "" } };
        if (!bolha) bolhaNoRender.motivo = "a foto da bolha não baixou: capa sem bolha";
      }

      // Ver `layoutCarregaAFoto`: sem bloco de imagem, o desenho engole a foto
      // e deixa a manchete branca sobre fundo claro.
      const diagnosticoDoLayout = diagnosticarLayout(layout, capa.comFoto);
      /*
       * O desenho do painel é da CAPA, e vale só para a capa.
       *
       * `resolveLayout` foi consultado para o par (noticia, cover). Aplicá-lo a
       * um slide de conteúdo desenharia a manchete no lugar do corpo e o corpo
       * em lugar nenhum: o desenho posiciona blocos por nome, e os nomes são os
       * da capa.
       */
      /*
       * E o desenho é da capa de NOTÍCIA, que é a única que ele conhece.
       *
       * `resolveLayout` foi consultado para o par (noticia, cover), e o desenho
       * salvo posiciona a manchete, a marca e a foto do jeito da notícia. A capa
       * do carrossel é outra peça de propósito, com faixa escura e marca-texto
       * na frase-chave, e deixar o desenho vencer faria ela sumir exatamente
       * quando há foto, que é o caso em que ela deveria estar melhor.
       *
       * Isso não foi previsto e foi encontrado renderizando: sem foto o desenho
       * é recusado por não ter bloco de imagem, então a capa nova aparecia; com
       * foto o desenho passava a valer e a capa nova nunca era desenhada.
       */
      const usaDesenho =
        diagnosticoDoLayout === DIAGNOSTICOS_DE_LAYOUT.USADO &&
        !entrada.slidePronto &&
        entrada.estiloDaCapa !== "carrossel";

      const html = assembleSlide(capa.slide, {
        format: "noticia",
        tokens,
        formatConfig,
        slideIndex: entrada.posicao ?? 1,
        total: entrada.total ?? 1,
        layout: usaDesenho ? layout : null,
        credito: capa.credito,
        affordance: entrada.affordance,
        molduraDiscreta: entrada.molduraDiscreta,
      });

      await page.setContent(html, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);

      /*
       * O ajuste de corpo do texto roda depois das fontes, e o screenshot tem
       * que esperar por ELE, não por um cronômetro. `SCRIPT_DE_AJUSTE` marca o
       * documento quando termina; sem esperar essa marca, uma manchete longa
       * podia ser capturada ainda no corpo máximo, estourando a caixa.
       */
      await page
        .waitForFunction(() => document.documentElement.getAttribute("data-ajuste-pronto") === "1", null, {
          timeout: 5_000,
        })
        .catch(() => undefined);
      await page.waitForTimeout(120);

      /*
       * A bolha conferida DEPOIS de desenhada, medindo o círculo na página.
       *
       * A decisão da posição foi tomada em fração do canvas, contra a tabela de
       * `carousel-templates/bolha.ts`. O que vai para o arquivo é o que o CSS
       * desenhou, e as duas coisas só coincidem enquanto ninguém mexer numa
       * delas: uma regra de CSS nova, um layout desenhado no painel ou um
       * canvas de outro tamanho deslocam o círculo sem erro nenhum. É a lição
       * das medidas relativas: medir na peça montada, não confiar na conta.
       *
       * Se o círculo medido encosta num rosto, a bolha sai da página antes do
       * screenshot, e o motivo vai junto da arte.
       */
      if (capa.slide.inset_image_url) {
        const caixa = await page.evaluate(() => {
          const el = document.querySelector(".j-bolha");
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.left, y: r.top, w: r.width, h: r.height, posicao: el.getAttribute("data-posicao") ?? "" };
        });
        if (!caixa || caixa.w <= 0) {
          bolhaNoRender.motivo = "a variante não desenhou o círculo";
        } else {
          const medida = { cx: caixa.x + caixa.w / 2, cy: caixa.y + caixa.h / 2, raio: caixa.w / 2, posicao: caixa.posicao };
          bolhaNoRender.medida = medida;
          const comAnel = { cx: medida.cx, cy: medida.cy, raio: medida.raio + ANEL_DA_BOLHA_PX };
          if (cruzaAlgumRosto(comAnel, entrada.rostosDaBolha ?? [], tokens.canvas)) {
            await page.evaluate(() => document.querySelector(".j-bolha")?.remove());
            bolhaNoRender.motivo = "o círculo medido no render encosta num rosto: bolha tirada da peça";
          } else {
            bolhaNoRender.desenhada = true;
          }
        }
      }

      /*
       * Quais famílias o navegador realmente tem, depois de `fonts.ready`.
       *
       * `document.fonts.check("16px 'Playfair Display'")` NÃO serve, e a
       * primeira versão disto usava justamente ele: sem peso na especificação,
       * `check` pergunta por 400, e o Playfair deste projeto carrega 600 a 900.
       * A resposta era `false` com a fonte perfeitamente carregada, e a guarda
       * bloqueava toda publicação.
       *
       * O sinal certo saiu de medir os dois casos. Com a rede normal: 70 faces
       * declaradas, 2 carregadas (só as que a peça usa, porque o carregamento é
       * sob demanda), nenhuma com erro. Com o Google Fonts bloqueado: NENHUMA
       * face registrada, porque a própria folha de estilo não chegou — e o
       * texto passou a ocupar 709px onde ocupava 557px, 27% mais alto na
       * serifa do sistema.
       *
       * Então a pergunta é presença no conjunto, mais faces em erro. Nada de
       * peso: exigir peso reprovaria uma peça correta, e é sempre pior errar
       * para o lado de bloquear o que funciona.
       */
      const faces = await page.evaluate(() =>
        [...(document.fonts as unknown as Set<FontFace>)].map((f) => ({
          family: f.family,
          status: String(f.status),
        })),
      );
      const fontesQueFaltaram = familiasQueFaltaram(faces, familiasEsperadas);

      if (fontesQueFaltaram.length > 0) {
        console.warn(`[ARTE] Fontes ausentes no render: ${fontesQueFaltaram.join(", ")}`);
      }

      const png = await page.screenshot({ type: "png", fullPage: false });
      const jpeg = await page.screenshot({ type: "jpeg", quality: 70, fullPage: false, scale: "css" });
      /*
       * O mesmo desenho em 2x, em JPEG de qualidade fixa.
       *
       * É a alternativa determinística quando o PNG passa do limite: mesma
       * resolução, mesma peça, e um arquivo várias vezes menor. Qualidade
       * fixada em 92 justamente para ser determinística — deixar o compressor
       * escolher tornaria o hash do artefato imprevisível, e o hash é o que
       * amarra o que foi aprovado ao que vai ao ar.
       */
      const jpegPublicavel = await page.screenshot({ type: "jpeg", quality: 92, fullPage: false });
      feitas.push({
        capa,
        html,
        png,
        jpeg,
        jpegPublicavel,
        largura: tokens.canvas.width * 2,
        altura: tokens.canvas.height * 2,
        fontesQueFaltaram,
        temaDegradado: tema.degradado ? tema.motivo : "",
        usouLayoutDesenhado: usaDesenho,
        diagnosticoDoLayout,
        bolha: bolhaNoRender,
      });
    }
  } finally {
    await browser.close();
  }

  return feitas;
}
