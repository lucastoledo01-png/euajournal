import type { FotoDaCapa } from "../arte";
import { varianteDaCapa } from "../arte";

/**
 * O que o worker precisa achar numa linha do social-v2, e o que ele faz quando
 * não acha.
 *
 * O V2 chega ao worker PRONTO: a copy passou pelo Social Guard, a imagem foi
 * aprovada pelo resolvedor visual, e a arte é reproduzível a partir do que
 * ficou gravado. O worker não é um segundo autor — ele lê, confere, renderiza
 * pelo caminho determinístico e publica.
 *
 * Daí a assimetria deliberada deste módulo: ele não conserta nada. Faltando
 * qualquer peça obrigatória, ele devolve o que falta e o post não publica. A
 * alternativa seria o worker "completar" o que faltasse, e completar significa
 * gerar — exatamente o que o V2 existe para não fazer.
 */

export const GERACAO_V2 = "social-v2";

/** Vai no `error_message`, na mesma convenção de `PUBLICAÇÃO INCERTA:`. */
export const MOTIVO_CARGA_INCOMPLETA = "SOCIAL_V2_PAYLOAD_INCOMPLETE";

/** Outro giro pegou a mesma vaga primeiro. Não é falha: é a disputa resolvida. */
export const MOTIVO_VAGA_DISPUTADA = "SOCIAL_V2_SLOT_TAKEN";

/**
 * Versão de geração escrita, mas não reconhecida.
 *
 * O caso perigoso não é o valor errado, é para onde ele cai. `generation_version`
 * vazia significa post legado, e o ramo legado REGENERA a copy. Então um
 * `social_v2` com underscore, ou um `social-v3` de amanhã, cairia no caminho
 * que destrói o conteúdo aprovado — o pior desfecho possível para um erro de
 * digitação.
 */
export const MOTIVO_VERSAO_DESCONHECIDA = "SOCIAL_V2_UNKNOWN_GENERATION";

/** O que a linha precisa ter para publicar sem regenerar nada. */
export type CargaV2 = {
  /** Manchete da arte. Vem da coluna `title`, imutável a partir daqui. */
  headline: string;
  /** Legenda final, com hashtags já embutidas pelo Social Guard. */
  legenda: string;
  hashtags: string[];
  /** Sobrancelha da capa de texto. String vazia é válida: significa "sem eixo". */
  eixo: string;
  /** A foto aprovada, ou null quando a decisão foi capa de texto. */
  foto: FotoDaCapa | null;
  /** Por que não há foto. Só faz sentido quando `foto` é null. */
  motivoSemFoto: string;
  storyId: string;
  eventFingerprint: string | null;
  visualAssetId: string | null;
  originChannel: string;
  /**
   * Imagem única ou carrossel, como a linha declara.
   *
   * O worker NÃO deduz isso da contagem de artefatos. Deduzir faria um payload
   * de carrossel com um artefato perdido virar um post de imagem única
   * publicado, em vez de uma recusa: o post sairia, com um slide, e nada
   * indicaria que cinco slides aprovados ficaram de fora.
   */
  formato: FormatoDaLinha;
  /** O arquivo da CAPA, que é o que aparece no feed. */
  artefato: ArtefatoDaLinha;
  /**
   * Todos os arquivos, na ordem de leitura. Um só quando é imagem única.
   *
   * A lista é sempre a fonte da publicação, inclusive no caso de um arquivo.
   * Ter dois caminhos, um para peça única e outro para carrossel, é como a
   * proteção de um deles envelhece sem ninguém notar.
   */
  artefatos: ArtefatoDaLinha[];
};

export type FormatoDaLinha = "static" | "carousel";

/** Limites do carrossel, repetidos aqui porque o worker não importa o gerador. */
const MINIMO_DE_SLIDES = 2;
const MAXIMO_DE_SLIDES = 7;

/**
 * O artefato como a linha o registra.
 *
 * `sha256` é o campo que muda a natureza do contrato: sem ele, `url` seria só
 * mais um recurso remoto que pode ter mudado desde a aprovação — o mesmo
 * problema da foto do Commons, um nível acima.
 */
export type ArtefatoDaLinha = {
  url: string;
  path: string;
  filename: string;
  mime: string;
  sha256: string;
  bytes: number;
  /** Posição na peça, começando em 1. Sempre 1 na imagem única. */
  index: number;
};

/** A linha, como o worker a lê do banco. */
export type LinhaDePost = {
  generation_version?: unknown;
  dry_run?: unknown;
  title?: unknown;
  caption?: unknown;
  story_id?: unknown;
  event_fingerprint?: unknown;
  visual_asset_id?: unknown;
  origin_channel?: unknown;
  social_guard_status?: unknown;
  content_json?: unknown;
  /** O manifesto, que na retentativa carrega os containers já criados. */
  slides_manifest?: unknown;
};

/**
 * Este post foi gerado pelo pipeline V2.
 *
 * A pergunta é feita pela coluna, não pela forma do `content_json`: adivinhar
 * pelo conteúdo faria uma linha legada com as chaves parecidas entrar no ramo
 * novo, e uma linha V2 com uma chave a menos cair no ramo antigo, que
 * regeneraria tudo. A coluna é declaração explícita de quem gravou.
 *
 * A comparação ignora caixa e espaço porque o custo dos dois lados é
 * assimétrico: reconhecer um `SOCIAL-V2` a mais não faz mal nenhum, e deixar
 * de reconhecer joga o post no ramo que reescreve a copy aprovada.
 */
export function ehSocialV2(linha: LinhaDePost): boolean {
  return normalizarVersao(linha) === GERACAO_V2;
}

function normalizarVersao(linha: LinhaDePost): string {
  return String(linha.generation_version ?? "").trim().toLowerCase();
}

/**
 * Post legado é o que NÃO declara versão nenhuma.
 *
 * Esta é a outra metade de `ehSocialV2`, e ela existe porque "não é V2" e "é
 * legado" não são a mesma coisa. Uma linha com `generation_version = social_v3`
 * não é V2, e tratá-la como legada a mandaria para o gerador antigo, que
 * reescreveria tudo. Versão escrita e não reconhecida tem que parar, não seguir.
 */
export function ehLegado(linha: LinhaDePost): boolean {
  return normalizarVersao(linha) === "";
}

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function objeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * As três conferências que fazem um artefato ser publicável.
 *
 * Uma função só, usada pela peça única e por cada slide, porque duas cópias
 * desta regra é como o carrossel passaria a aceitar um hash que a peça única
 * recusa.
 */
function conferirArtefato(bruto: Record<string, unknown>, onde: string, faltando: string[]): void {
  if (!texto(bruto.url)) faltando.push(`${onde}.url`);

  const sha = texto(bruto.sha256).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha)) {
    faltando.push(`${onde}.sha256 inválido: "${texto(bruto.sha256)}"`);
  }

  const bytes = Number(bruto.bytes);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    faltando.push(`${onde}.bytes inválido: "${String(bruto.bytes)}"`);
  }
}

function comoArtefato(bruto: Record<string, unknown>, index: number): ArtefatoDaLinha {
  return {
    url: texto(bruto.url),
    path: texto(bruto.path),
    /* Os padrões vinham da leitura de peça única e continuam valendo: nenhum
       dos dois é conferido, e um nome vazio só apareceria em log. */
    filename: texto(bruto.filename) || "social-v2.png",
    mime: texto(bruto.mime) || "image/png",
    sha256: texto(bruto.sha256).toLowerCase(),
    bytes: Number(bruto.bytes),
    index,
  };
}

/**
 * Ensaio não vai ao ar, e isto é conferido ANTES de tudo.
 *
 * `lerCargaV2` roda depois da reconciliação com a Meta, que pode republicar um
 * container de uma tentativa anterior. Uma linha marcada como ensaio que, por
 * qualquer motivo, tenha um container registrado seria publicada por esse
 * caminho sem passar por nenhuma guarda do V2. A pergunta é barata e a resposta
 * não depende de mais nada, então ela vem primeiro.
 */
export function ehEnsaio(linha: LinhaDePost): boolean {
  return linha.dry_run !== false;
}

export type LeituraDaCarga =
  | { ok: true; carga: CargaV2 }
  | { ok: false; faltando: string[]; motivo: string };

/**
 * Lê e confere a carga. Não completa, não deduz, não gera.
 *
 * O que é exigido, e por quê:
 *
 *   - `title` e `caption`: são a manchete e a legenda aprovadas. Sem elas não
 *     existe post, e reconstruí-las é gerar.
 *   - `hashtags`: a LISTA, que pode vir vazia desde que as hashtags foram
 *     desligadas por padrão (06/10/2026). Sem o campo, a linha não passou
 *     pela guarda que diz que passou.
 *   - `content_json.arte`: o bloco que registra COMO a peça foi desenhada.
 *     Exigir o bloco, e não o eixo dentro dele, é o que separa "eixo ausente
 *     do registro" de "eixo registrado como nenhum" — o segundo é uma decisão
 *     editorial legítima e imprime uma peça sem sobrancelha.
 *   - `content_json.visual`: ou uma foto com URL, ou a decisão explícita de
 *     capa de texto. A ausência das duas é registro incompleto, não capa de
 *     texto por omissão.
 *   - `social_guard_status = passed`: post que a guarda reprovou não publica,
 *     por mais completo que o resto esteja.
 *   - `dry_run = false`: ensaio não vai ao ar. O worker legado ignora esta
 *     coluna, e é justamente por isso que o V2 a confere.
 */
export function lerCargaV2(linha: LinhaDePost): LeituraDaCarga {
  const faltando: string[] = [];

  /*
   * A única guarda que poderia falhar ABERTA, e o default do banco é o valor
   * perigoso.
   *
   * A coluna é `dry_run boolean not null default true`. Escrito como
   * `=== true`, um `undefined` — coluna fora do select, coluna fora do schema,
   * linha vinda de outro caminho — apagaria a guarda em silêncio e publicaria
   * um ensaio. Exigir `false` explicitamente inverte o erro para o lado que
   * não põe nada no ar.
   */
  if (ehEnsaio(linha)) {
    const bruto = linha.dry_run;
    faltando.push(
      `dry_run=${typeof bruto === "string" ? `"${bruto}"` : String(bruto)} (${typeof bruto}): ` +
        `só publica com o booleano false`,
    );
  }

  const guarda = texto(linha.social_guard_status);
  if (guarda !== "passed") {
    faltando.push(`social_guard_status=${guarda || "vazio"}: só publica o que a guarda aprovou`);
  }

  const headline = texto(linha.title);
  if (!headline) faltando.push("title");

  const legenda = typeof linha.caption === "string" ? linha.caption : "";
  if (!legenda.trim()) faltando.push("caption");

  const storyId = texto(linha.story_id);
  if (!storyId) faltando.push("story_id");

  const conteudo = objeto(linha.content_json);
  if (!conteudo) faltando.push("content_json");

  const hashtags = Array.isArray(conteudo?.hashtags)
    ? (conteudo!.hashtags as unknown[]).map((h) => texto(h)).filter(Boolean)
    : [];
  /*
   * A LISTA é exigida, vazia ou não (14/10/2026). As hashtags estão
   * desligadas por padrão desde 06/10 (`settings.instagram.hashtags`), e o
   * Social Guard grava `[]`. Exigir ao menos uma recusava todo post na hora
   * de publicar: nenhum saiu de 06 a 14/10. O campo ausente continua sendo
   * registro incompleto.
   */
  if (!Array.isArray(conteudo?.hashtags)) faltando.push("content_json.hashtags");

  const arte = objeto(conteudo?.arte);
  if (!arte) faltando.push("content_json.arte");

  /*
   * O artefato é obrigatório, e é o coração do contrato.
   *
   * Uma linha `scheduled` sem arquivo aprovado obrigaria o worker a produzir a
   * peça, que é exatamente o que o V2 existe para não fazer. E sem `sha256` o
   * arquivo seria mais um recurso remoto que pode ter mudado.
   */
  const artefatoBruto = objeto(arte?.artefato);
  const url = texto(artefatoBruto?.url);

  if (!artefatoBruto) faltando.push("content_json.arte.artefato");
  else conferirArtefato(artefatoBruto, "content_json.arte.artefato", faltando);

  /*
   * O formato é lido, nunca deduzido.
   *
   * Valor desconhecido não cai em `static`: cair no conhecido seria publicar
   * uma peça de um slide no lugar de um payload que esta versão do worker não
   * entende. Fechar aqui é o mesmo princípio de `generation_version`.
   */
  const formatoBruto = texto(conteudo?.formato) || "static";
  const formato: FormatoDaLinha | null =
    formatoBruto === "static" || formatoBruto === "carousel" ? formatoBruto : null;
  if (!formato) faltando.push(`content_json.formato desconhecido: "${formatoBruto}"`);

  const artefatos: ArtefatoDaLinha[] = [];

  if (formato === "carousel") {
    const lista = Array.isArray(arte?.artefatos) ? (arte!.artefatos as unknown[]) : null;

    if (!lista) faltando.push("content_json.arte.artefatos");
    else if (lista.length < MINIMO_DE_SLIDES || lista.length > MAXIMO_DE_SLIDES) {
      faltando.push(
        `content_json.arte.artefatos tem ${lista.length} item(ns): o carrossel vai de ` +
          `${MINIMO_DE_SLIDES} a ${MAXIMO_DE_SLIDES}`,
      );
    } else {
      lista.forEach((bruto, i) => {
        const item = objeto(bruto);
        const onde = `content_json.arte.artefatos[${i}]`;
        if (!item) {
          faltando.push(onde);
          return;
        }
        conferirArtefato(item, onde, faltando);

        /*
         * A ORDEM é dado, não é a ordem do array.
         *
         * Um carrossel publicado fora de ordem responde antes de perguntar, e o
         * array pode ter sido reordenado por qualquer serialização no caminho.
         * Exigir que o índice gravado seja exatamente a posição é o que faz a
         * ordem ser verificável em vez de presumida.
         */
        if (Number(item.index) !== i + 1) {
          faltando.push(`${onde}.index=${String(item.index)}: esperado ${i + 1}`);
        }

        artefatos.push(comoArtefato(item, i + 1));
      });

      const primeiro = objeto(lista[0]);
      if (primeiro && url && texto(primeiro.url) !== url) {
        faltando.push(
          "content_json.arte.artefato não é o primeiro de content_json.arte.artefatos: " +
            "a capa registrada e o slide 1 do carrossel têm que ser o mesmo arquivo",
        );
      }
    }
  } else if (artefatoBruto) {
    artefatos.push(comoArtefato(artefatoBruto, 1));
  }

  const visual = objeto(conteudo?.visual);
  if (!visual) faltando.push("content_json.visual");

  /*
   * Foto ou capa de texto, e a diferença tem que estar escrita.
   *
   * `capa: "texto"` é o registro de que o resolvedor rodou e não achou imagem
   * publicável, com o motivo do lado. Sem foto E sem essa marca, o que existe
   * é uma linha pela metade, e publicar assim seria adivinhar qual dos dois
   * casos era.
   */
  const urlDaFoto = texto(visual?.imageUrl);
  const capaDeTexto = texto(visual?.capa) === "texto";
  let foto: FotoDaCapa | null = null;

  if (urlDaFoto && capaDeTexto) {
    /*
     * Os dois ao mesmo tempo é registro contraditório, e ele bloqueia.
     *
     * A primeira versão disto resolvia pela foto, com o argumento de que a foto
     * é o que foi aprovado. Só que a mesma linha afirma que a decisão foi capa
     * de texto: uma das duas informações está errada, e escolher qual é
     * adivinhar. É a mesma disciplina da variante logo abaixo, e não faria
     * sentido bloquear lá e adivinhar aqui.
     */
    faltando.push(
      `content_json.visual tem imageUrl E capa="texto" ao mesmo tempo: ` +
        `o registro se contradiz sobre a peça que foi aprovada`,
    );
  } else if (urlDaFoto) {
    foto = { imageUrl: urlDaFoto, attribution: texto(visual?.attribution) };
  } else if (!capaDeTexto && visual) {
    faltando.push("content_json.visual: nem imageUrl nem capa=texto");
  }

  /*
   * A variante gravada tem que concordar com a foto gravada.
   *
   * `content_json.arte.variante` estava sendo escrita e nunca lida — dado morto,
   * que é pior que dado ausente, porque parece uma conferência. Ela serve para
   * exatamente uma coisa: pegar linha internamente contraditória.
   *
   * O caso concreto: a linha diz `fullbleed_portrait`, que é a peça com foto de
   * fundo, e o registro visual não tem `imageUrl`. Uma das duas informações
   * está errada, e publicar significaria escolher qual — que é adivinhar.
   */
  if (arte) {
    const variante = texto(arte.variante);
    /*
     * A esperada vem de `varianteDaCapa`, e não escrita aqui.
     *
     * Ela estava escrita, e virou a terceira cópia da mesma regra: uma no
     * desenho, uma no store e esta na conferência. Quando o desenho mudou para
     * a gramática de jornal, as outras duas continuaram falando de
     * `fullbleed_portrait`, e a conferência passou a acusar contradição entre
     * uma peça correta e um campo velho.
     *
     * Conferência que guarda a própria cópia da regra não confere a regra:
     * confere se as duas cópias envelheceram juntas.
     */
    /*
     * A gramática vem do REGISTRO, e não do eixo.
     *
     * A capa pode ter sido pedida em recorte e desenhada em jornal, porque o
     * recorte tem orçamento de caracteres e cai para jornal quando o texto
     * estoura. Deduzir a gramática aqui recusaria exatamente a peça que fez a
     * coisa certa ao cair.
     *
     * Registro ausente é "jornal", que é o que toda peça anterior a 18/09/2026
     * usou.
     */
    const gramatica = texto(arte.gramatica) === "recorte" ? "recorte" : "jornal";
    const esperada = varianteDaCapa(Boolean(foto), gramatica);
    if (variante && variante !== esperada) {
      faltando.push(
        `content_json.arte.variante="${variante}" contradiz o registro visual ` +
          `(${foto ? "tem foto" : "sem foto"}, seria "${esperada}")`,
      );
    }
  }

  if (faltando.length > 0) {
    return {
      ok: false,
      faltando,
      motivo: `${MOTIVO_CARGA_INCOMPLETA}: ${faltando.join("; ")}`,
    };
  }

  return {
    ok: true,
    carga: {
      headline,
      legenda,
      hashtags,
      eixo: texto(arte!.eixo),
      foto,
      motivoSemFoto: foto ? "" : texto(visual!.motivo) || "NO_VALID_VISUAL_ASSET",
      storyId,
      eventFingerprint: texto(linha.event_fingerprint) || null,
      visualAssetId: texto(linha.visual_asset_id) || null,
      originChannel: texto(linha.origin_channel) || "social",
      formato: formato!,
      artefato: comoArtefato(artefatoBruto!, 1),
      artefatos,
    },
  };
}
