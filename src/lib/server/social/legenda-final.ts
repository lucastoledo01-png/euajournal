import { MARCA } from "@/lib/marca";
import { autorComBanco, semSufixoDeBanco } from "../visual/bancos-oficiais/credito";

/**
 * O fecho de toda legenda do Instagram, e as duas regras do dono que moram em
 * código (06/10/2026).
 *
 * As regras:
 *
 * 1. O crédito de foto é UMA linha curta, a última da legenda, montada pelo
 *    código a partir do autor gravado no asset: "Foto: Daniel Torok", e só
 *    quando a licença exige mais que o nome (CC BY, CC BY-SA), a sigla entre
 *    parênteses: "Foto: Gage Skidmore (CC BY-SA 4.0)". Várias fotos: "Fotos:
 *    A, B e C", sem repetir, até três nomes e depois "e outros". Sem autor
 *    conhecido, sem linha (nunca "Foto: desconhecido"). Nada de "via Wikimedia
 *    Commons", link, "Licença Pexels" ou texto jurídico. Qualquer OUTRA linha
 *    com cara de crédito, em qualquer lugar do corpo, é tirada: o único
 *    crédito é o que este módulo põe.
 *
 *    Histórico do mesmo dia: a primeira regra do dono foi "não quero que fique
 *    colocando crédito na descrição do instagram", e o código chegou a tirar o
 *    crédito da legenda inteira. O dono trocou a regra horas depois: crédito
 *    na legenda, junto da obra, na forma curta; e nenhuma tira na arte.
 * 2. Depois do corpo, uma linha em branco e "Siga @eua.journal", uma vez só.
 *    Abaixo dele, só a linha do crédito, quando há.
 *
 *    ATUALIZADO em 06/10/2026, à noite, por escolha explícita do dono depois
 *    de ler a fila de 07/10: a linha leva SÓ o nome de quem fez a foto. "Fotos:
 *    Lucio Bernardo Jr./Câmara dos Deputados (CC BY) e Leonardo Prado/Câmara
 *    dos Deputados (CC BY)" virou "Fotos: Lucio Bernardo Jr. e Leonardo
 *    Prado". Sem banco nem agência, sem sigla de licença, sem barra, sem o
 *    "from Washington, DC, USA" do Flickr. Sem pessoa (o banco assina sozinho,
 *    "NASA"), o nome da instituição. A atribuição inteira continua gravada em
 *    `content_json.visual` (`attribution`, `license`, `creditosDasFotos`), que
 *    é onde a licença fica registrada; a legenda é só a linha curta. O texto
 *    acima, com a sigla entre parênteses, fica como registro do que valeu até
 *    esta data.
 *
 * Por que em código, e não no prompt: a instrução editorial é editável no
 * painel e fica gravada no banco como versão ativa. Uma versão antiga (ou uma
 * edição à mão) que pedisse o crédito ou outro fecho venceria o prompt novo.
 * Pedido reduz a frequência; código fecha o caminho. Este módulo é o último
 * passo antes de a legenda ser gravada, e é idempotente: passar duas vezes dá o
 * mesmo texto, o que deixa qualquer escritor de `social_posts.caption` chamá-lo
 * sem medo de empilhar o fecho.
 *
 * O handle sai de `MARCA.instagramHandle`, nunca escrito à mão: a marca já
 * mudou quatro vezes, e o handle errado já saiu impresso em cada peça.
 */

/** O fecho. Abaixo dele, só a linha curta do crédito. */
export const CTA_DA_LEGENDA = `Siga ${MARCA.instagramHandle}`;

/**
 * O teto da legenda inteira.
 *
 * O Instagram aceita 2200; o schema do caminho legado recusa acima de 2000, e o
 * resto da casa usa 2000 (`LIMITE_DA_LEGENDA` em `legenda.ts`). Ficar no menor
 * deixa os dois caminhos com a mesma régua.
 */
export const LIMITE_DA_LEGENDA_FINAL = 2000;

function normalizar(texto: string): string {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Marcadores de lista que o modelo (ou o código antigo, com "· ") põe antes da linha. */
const MARCADOR = /^[\s·•\-\u2013\u2014*>|]+/;

/*
 * As formas de crédito, medidas no que a casa já gravou e no que o modelo
 * costuma escrever. A lista é de CRÉDITO, não de palavra: "foto" sozinha é
 * palavra legítima numa notícia ("a foto viralizou"); "Foto: Fulano" e
 * "Fulano / Wikimedia Commons / CC BY-SA 4.0" são crédito.
 */

/** A linha que ABRE com o rótulo de crédito: "Foto: X", "Créditos: X", "Photo by X", "Imagem de X". */
const ABRE_COM_ROTULO =
  /^(fotos?|imagem|imagens|creditos?( d[ae]s? (fotos?|imagem|imagens))?|photos?|images?|credits?|ilustrac(ao|oes))\s*(:|\/|\||\bde\b|\bby\b|\bpor\b|\bcourtesy\b)/;

/** Bancos e acervos de onde as fotos vêm. Sozinhos não são crédito; com um rótulo de licença ou de autoria, são. */
const ACERVOS = /\b(wikimedia|commons|pexels|unsplash|openverse|flickr|getty images|shutterstock|istock|alamy)\b/;
const ROTULO_DE_CREDITO =
  /\b(via|licenca|license|licensed|cc[ -]?by|cc[ -]?0|cc0|dominio publico|public domain|foto|fotos|imagem|photo|autor|author|reproducao|divulgacao|credito)\b/;

/** Licença Creative Commons escrita como sigla: "CC BY-SA 4.0", "CC0". */
const SIGLA_DE_LICENCA = /\bcc[ -]?(by|0)\b(-[a-z]{2})*/;

/** "Reprodução/Instagram", "Divulgação": a linha inteira é crédito quando é curta. */
const SO_REPRODUCAO = /^(reproducao|divulgacao)\b/;

function palavras(texto: string): number {
  return texto.split(/\s+/).filter(Boolean).length;
}

/**
 * Esta linha é um crédito de foto?
 *
 * A régua é conservadora do lado certo: linha curta que fala de acervo junto de
 * licença ou autoria é crédito; parágrafo de notícia que cita a Getty Images
 * como empresa passa, porque é longo e não tem rótulo de crédito.
 */
export function ehLinhaDeCredito(linha: string): boolean {
  const n = normalizar(linha.replace(MARCADOR, ""));
  if (!n) return false;
  if (ABRE_COM_ROTULO.test(n)) return true;
  if (SO_REPRODUCAO.test(n) && palavras(n) <= 8) return true;
  if (palavras(n) <= 25) {
    if (SIGLA_DE_LICENCA.test(n)) return true;
    if (ACERVOS.test(n) && ROTULO_DE_CREDITO.test(n)) return true;
  }
  return false;
}

/**
 * Crédito embutido no meio de um parágrafo: "(Foto: Fulano)", "[Crédito: X]",
 * ou a última frase da linha começando com "Foto:".
 */
const CREDITO_ENTRE_PARENTESES =
  /\s*[([]\s*(fotos?|imagem|imagens|cr[eé]ditos?|photos?|credits?)\s*[:/][^)\]]*[)\]]/gi;
const CREDITO_NO_FIM_DA_LINHA = /(?<=[.!?])\s+(fotos?|imagem|imagens|cr[eé]ditos?|photos?|credits?)\s*:\s*[^\n]*$/i;

/** "Fonte: Reuters". A atribuição mora DENTRO da frase ("segundo a Reuters"), nunca numa linha à parte. */
const LINHA_DE_FONTE = /^(fontes?|sources?)\s*:/;

/** Fechos que não são o nosso: outro "Siga @...", o convite de comentário antigo, "link na bio", "leia mais". */
function ehOutroFecho(linha: string, keyword: string): boolean {
  const n = normalizar(linha.replace(MARCADOR, ""));
  if (!n) return false;
  if (/^(siga|segue|follow)\b.*@/.test(n)) return true;
  if (/^(link na bio|leia mais|saiba mais|confira (o link|no link))\b/.test(n)) return true;
  // O CTA de comentário de antes de 06/10/2026, em qualquer das quatro formas.
  const alvo = normalizar(keyword);
  if (/\bcomente\b/.test(n) && (/\bdirect\b|\bdm\b/.test(n) || (alvo && n.includes(alvo)))) return true;
  return false;
}

/*
 * A separação de hashtag mora aqui, e não importada de `legenda.ts`, porque
 * `legenda.ts` chama este módulo: importar de volta faria um ciclo, e ciclo de
 * módulo é o tipo de defeito que só aparece na ordem de carga de um teste.
 */
const TOKEN_DE_HASHTAG = /#[\p{L}\p{N}_]+/gu;

function tirarHashtags(texto: string): { corpo: string; tags: string[] } {
  const vistas = new Set<string>();
  const tags: string[] = [];
  for (const t of texto.match(TOKEN_DE_HASHTAG) ?? []) {
    const chave = t.toLowerCase();
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    tags.push(t);
  }
  const corpo = texto
    .split("\n")
    .map((l) => (l.match(TOKEN_DE_HASHTAG) ? l.replace(TOKEN_DE_HASHTAG, "").replace(/[ \t]+/g, " ").trim() : l))
    .join("\n");
  return { corpo, tags };
}

/* ------------------------------------------------------------------ */
/* O crédito curto                                                     */
/* ------------------------------------------------------------------ */

/** O que o crédito precisa saber de uma foto: o que o asset grava. */
export type FotoCreditavel = {
  author?: string | null;
  license?: string | null;
  attribution?: string | null;
};

/** Nomes que não são autor: o que o módulo de licenças escreve quando não sabe. */
const AUTOR_DESCONHECIDO =
  /^(autor n[aã]o identificado|desconhecido|unknown|anonymous|an[oô]nimo|n\/a|none|sem autor|unknown author)$/i;

function limparNome(bruto: string): string {
  return (bruto || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(foto|fotos|photo|by|por)\s*:?\s+/i, "")
    .replace(/[.,;:]+$/, "")
    .trim();
}

/**
 * A sigla da licença, só quando ela exige atribuição além do nome.
 *
 * CC BY e CC BY-SA pedem a licença junto do crédito; Pexels, Unsplash, CC0 e
 * domínio público não pedem nada, e escrever "Licença Pexels" é o texto
 * jurídico que o dono não quer na legenda. A versão vai quando o asset a tem.
 */
export function siglaDaLicenca(texto: string): string {
  const m = /\bcc[ -]?by(?:[ -]?(sa|nd|nc))*(?:[ -]?(\d\.\d))?\b/i.exec(texto || "");
  if (!m) return "";
  if (/\bcc[ -]?by[ -]?(nc|nd)/i.test(m[0])) return "";
  const sa = /sa/i.test(m[0].slice(5)) ? "-SA" : "";
  return `CC BY${sa}${m[2] ? ` ${m[2]}` : ""}`;
}

/**
 * O nome do autor de uma foto, ou vazio.
 *
 * O campo `author` manda. Sem ele, o primeiro pedaço da atribuição gravada
 * ("Foto: Fulano / Wikimedia Commons / CC BY-SA 4.0" ou "Fulano, CC BY-SA
 * 4.0, via Wikimedia Commons"), que é o formato dos dois montadores da casa.
 */
export function autorDaFoto(foto: FotoCreditavel): string {
  /*
   * Foto de banco oficial (06/10/2026): o crédito leva o banco, no formato que
   * o próprio banco exige e que o dono pediu, "Kayo Magalhães/Câmara dos
   * Deputados". A licença CC BY da Câmara pede exatamente isso, e sem o banco
   * a linha não cumpriria a licença. O resolvedor grava esse formato em
   * `attribution` ("Foto: Nome/Banco"), e só os bancos da lista o têm.
   */
  /*
   * ATUALIZADO na mesma noite (regra do dono): do "Nome/Banco" fica só o nome.
   * O banco sozinho, sem fotógrafo, fica: é a instituição que assina.
   */
  const comBanco = autorComBanco(foto.attribution ?? "");
  if (comBanco) {
    const nomeDoCredito = soONomeDoCredito(comBanco);
    return nomeDoCredito.length > 60 ? nomeDoCredito.slice(0, 60).replace(/\s+\S*$/, "") : nomeDoCredito;
  }
  let nome = soONomeDoCredito(limparNome(foto.author ?? ""));
  if (!nome) {
    const atribuicao = limparNome(foto.attribution ?? "");
    nome = soONomeDoCredito(limparNome(atribuicao.split(/\s+\/\s+|,\s*|\s+via\s+/i)[0] ?? ""));
  }
  if (!nome || AUTOR_DESCONHECIDO.test(nome)) return "";
  if (/https?:\/\/|www\./i.test(nome)) return "";
  if (/^(wikimedia|commons|pexels|unsplash|openverse|flickr)\b/i.test(nome)) return "";
  if (siglaDaLicenca(nome) || /^cc0$|dom[ií]nio p[uú]blico|public domain/i.test(nome)) return "";
  return nome.length > 60 ? nome.slice(0, 60).replace(/\s+\S*$/, "") : nome;
}

/**
 * A linha do crédito: "Foto: A", "Foto: A (CC BY-SA 4.0)", "Fotos: A, B e C",
 * "Fotos: A, B, C e outros". Vazia quando nenhuma foto tem autor conhecido.
 */
export function linhaDeCredito(fotos: Array<FotoCreditavel | null | undefined>): string {
  const nomes: string[] = [];
  for (const foto of fotos) {
    if (!foto) continue;
    const autor = autorDaFoto(foto);
    if (autor) nomes.push(autor);
  }
  // Sem sigla de licença desde 06/10/2026 à noite (regra do dono): só o nome.
  return montarLinha(nomes, false);
}

/** "Foto: A", "Fotos: A e B", "Fotos: A, B e C", "Fotos: A, B, C e outros", sem repetir nome. */
function montarLinha(brutos: string[], temOutros: boolean): string {
  const vistos = new Set<string>();
  const nomes: string[] = [];
  for (const n of brutos) {
    const chave = normalizar(n);
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    nomes.push(n);
  }
  if (nomes.length === 0) return "";
  if (nomes.length === 1 && !temOutros) return `Foto: ${nomes[0]}`;
  if (nomes.length <= 3 && !temOutros) return `Fotos: ${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
  return `Fotos: ${nomes.slice(0, 3).join(", ")} e outros`;
}

/*
 * "from Washington, DC, USA": o Flickr escreve de onde o fotógrafo é, e o
 * Commons copia para o campo de autor. A cauda em caixa alta (DC, USA, UK) é
 * parte do lugar; o próximo nome, com minúscula depois da inicial, não é.
 */
const DE_ONDE = /\s+from\s+[^,()/]+?(?:,\s*\p{Lu}{2,}\.?)*(?=\s*(?:,|\(|\/|\s+e\s|$))/gu;

/**
 * Só o nome da pessoa que fez a foto, a partir do que o crédito gravado traz
 * (regra do dono, 06/10/2026, noite): "Lucio Bernardo Jr./Câmara dos
 * Deputados (CC BY)" vira "Lucio Bernardo Jr."; "Bruno Sanchez-Andrade Nuño
 * from Washington, DC, USA" vira "Bruno Sanchez-Andrade Nuño". Sem pessoa
 * antes da barra, fica a instituição depois dela.
 */
export function soONomeDoCredito(bruto: string): string {
  const semParenteses = (bruto || "")
    .replace(/\s*\([^)]*\)/g, "")
    .replace(DE_ONDE, "")
    .replace(/\s+via\s+.*$/i, "")
    .trim();
  const partes = semParenteses.split(/\s*\/\s*/).map((p) => p.trim()).filter(Boolean);
  const nome = (partes[0] ?? "").replace(/[,;:]+$/, "").trim();
  if (!nome || siglaDaLicenca(nome)) return "";
  return nome;
}

/**
 * A linha de crédito que já existe, reescrita na regra de agora: só os nomes.
 *
 * É a rede de quem não tem as fotos na mão e recebe uma linha pronta: a
 * refação do texto na fila lê `visual.creditoNaLegenda`, que os posts
 * gravados antes desta noite têm no formato antigo, e a edição à mão do painel
 * preserva a linha que estava abaixo do fecho. Os dois passam por aqui dentro
 * de `fecharLegenda`, então nenhum caminho grava o formato antigo de novo.
 */
export function linhaDeCreditoSoComNomes(linha: string): string {
  const m = /^\s*fotos?\s*:\s*(.+)$/i.exec(linha || "");
  if (!m) return (linha || "").trim();
  let corpo = m[1].replace(/\s*\([^)]*\)/g, "").replace(DE_ONDE, "").trim();
  const temOutros = /\s+e\s+outros\s*$/i.test(corpo);
  if (temOutros) corpo = corpo.replace(/\s+e\s+outros\s*$/i, "");
  const nomes = corpo
    .split(/,\s*|\s+e\s+(?=\p{Lu})/u)
    .map((n) => soONomeDoCredito(n))
    .filter((n) => n && !AUTOR_DESCONHECIDO.test(n));
  return montarLinha(nomes, temOutros);
}

/**
 * A linha que este módulo escreveu, reconhecida para quem só sanea um texto já
 * fechado (edição à mão no painel): "Foto: X" sem acervo, sem link e sem
 * texto de licença comprido. Fora desse formato, é crédito a tirar.
 */
const CREDITO_CURTO = /^fotos?: [^\n]{1,240}$/i;
function ehCreditoCurto(linha: string): boolean {
  const t = linha.trim();
  if (!CREDITO_CURTO.test(t)) return false;
  // O "/Banco" de banco oficial é o formato exigido, e não sobra de outra origem.
  const n = normalizar(semSufixoDeBanco(t));
  return !/\bvia\b|https?|www|licenca|license|wikimedia|commons|pexels|unsplash|\//.test(n);
}

export type OpcoesDoFecho = {
  /**
   * O que fazer com hashtag.
   *
   * `"remover"` é o padrão desde 06/10/2026: o Not Journal não usa nenhuma, e a
   * legenda segue o método dele. Com `settings.instagram.hashtags` ligado, quem
   * chama passa a lista final (ou `"manter"`, para preservar as que o texto já
   * traz, que é o caso de quem só sanea um texto já montado), e elas entram num
   * bloco logo ANTES do fecho: o fecho é a última linha, sempre.
   */
  hashtags?: "remover" | "manter" | string[];
  /** A palavra do funil de comentário, para reconhecer o CTA antigo e tirá-lo. */
  keyword?: string;
  /**
   * A linha do crédito (`linhaDeCredito`), que vai abaixo do fecho. Vazia ou
   * ausente, sem crédito. `"manter"` preserva a linha curta que já estava logo
   * abaixo do fecho, que é o caso de quem sanea uma legenda já fechada sem ter
   * as fotos na mão (a edição à mão do painel).
   */
  credito?: string | "manter";
  limite?: number;
};

export type FechoDaLegenda = {
  texto: string;
  removidos: { creditos: string[]; fontes: string[]; fechos: string[]; hashtags: string[] };
};

/**
 * Corta o corpo para caber, preferindo perder parágrafo inteiro a perder meia
 * frase: o fecho nunca é cortado, quem cede é o corpo.
 */
function caber(corpo: string, espaco: number): string {
  if (corpo.length <= espaco) return corpo;
  if (espaco <= 0) return "";
  const paragrafos = corpo.split("\n\n");
  let saida = "";
  for (const p of paragrafos) {
    const proxima = saida ? `${saida}\n\n${p}` : p;
    if (proxima.length > espaco) break;
    saida = proxima;
  }
  if (saida) return saida;
  // Nem o primeiro parágrafo cabe: corta na última frase inteira, ou na palavra.
  const bruto = corpo.slice(0, espaco);
  const fimDeFrase = Math.max(bruto.lastIndexOf(". "), bruto.lastIndexOf("! "), bruto.lastIndexOf("? "));
  if (fimDeFrase > espaco * 0.5) return bruto.slice(0, fimDeFrase + 1).trimEnd();
  const espaco_ = bruto.lastIndexOf(" ");
  return (espaco_ > espaco * 0.6 ? bruto.slice(0, espaco_) : bruto).trimEnd();
}

/**
 * Deixa a legenda no formato que vai ao ar: sem crédito, sem "Fonte:", sem o
 * fecho de outra época, parágrafos separados por uma linha em branco, hashtags
 * só se o projeto ligou, e "Siga @eua.journal" como última linha, uma vez.
 */
export function fecharLegenda(texto: string, opcoes: OpcoesDoFecho = {}): FechoDaLegenda {
  const keyword = opcoes.keyword ?? "";
  const limite = opcoes.limite ?? LIMITE_DA_LEGENDA_FINAL;
  const removidos: FechoDaLegenda["removidos"] = { creditos: [], fontes: [], fechos: [], hashtags: [] };

  const unificado = (texto || "").replace(/\r\n?/g, "\n");
  const { corpo: semTags, tags } = tirarHashtags(unificado);
  removidos.hashtags = opcoes.hashtags === "manter" || Array.isArray(opcoes.hashtags) ? [] : tags;

  // A linha curta logo abaixo do fecho, para `credito: "manter"`.
  const todas = semTags.split("\n");
  let creditoExistente = "";
  todas.forEach((l, i) => {
    if (ehCreditoCurto(l) && i > 0 && ehOutroFecho(todas[i - 1], keyword)) creditoExistente = l.trim();
  });

  const linhas: string[] = [];
  for (const bruta of todas) {
    let linha = bruta.replace(/[ \t]+$/g, "");
    if (!linha.trim()) {
      linhas.push("");
      continue;
    }
    /*
     * Primeiro o crédito embutido ("(Foto: X)", ou "Foto: X" colado no fim da
     * frase), depois a linha inteira: senão o "(Foto: Fulano/Wikimedia)" no
     * meio de um parágrafo faria o parágrafo todo parecer crédito.
     */
    const original = linha;
    linha = linha.replace(CREDITO_ENTRE_PARENTESES, "").replace(CREDITO_NO_FIM_DA_LINHA, "");
    if (ehLinhaDeCredito(linha)) {
      removidos.creditos.push(original.trim());
      continue;
    }
    if (linha !== original) removidos.creditos.push(original.trim());
    if (LINHA_DE_FONTE.test(normalizar(linha.replace(MARCADOR, "")))) {
      removidos.fontes.push(linha.trim());
      continue;
    }
    if (ehOutroFecho(linha, keyword)) {
      // O nosso próprio fecho também sai daqui: ele volta uma vez, no fim.
      if (normalizar(linha) !== normalizar(CTA_DA_LEGENDA)) removidos.fechos.push(linha.trim());
      continue;
    }
    if (linha.trim()) linhas.push(linha.trim());
  }

  // Parágrafos: uma linha em branco entre eles, nunca duas, nada nas pontas.
  const corpo = linhas.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  const tagsFinais =
    // Nunca mais que cinco, venham de onde vierem (regra do dono, 14/10/2026).
    (opcoes.hashtags === "manter" ? tags : Array.isArray(opcoes.hashtags) ? opcoes.hashtags.filter(Boolean) : []).slice(0, 5);
  // Toda linha de crédito sai só com os nomes, venha de onde vier (regra do dono, 06/10/2026, noite).
  const credito = linhaDeCreditoSoComNomes((opcoes.credito === "manter" ? creditoExistente : (opcoes.credito ?? "")).trim());
  if (opcoes.credito === "manter" && creditoExistente) {
    removidos.creditos = removidos.creditos.filter((c) => c !== creditoExistente);
  }
  // O fecho e o crédito ficam juntos, em linhas seguidas: o crédito é a última linha.
  const fecho = [CTA_DA_LEGENDA, credito].filter(Boolean).join("\n");
  const cauda = [tagsFinais.join(" "), fecho].filter(Boolean).join("\n\n");
  const corpoCabendo = caber(corpo, limite - cauda.length - 2);

  return { texto: [corpoCabendo, cauda].filter(Boolean).join("\n\n"), removidos };
}

/** Atalho para quem só quer o texto. */
export function legendaDoInstagram(texto: string, opcoes: OpcoesDoFecho = {}): string {
  return fecharLegenda(texto, opcoes).texto;
}

/**
 * O projeto ligou hashtag na legenda? (`settings.instagram.hashtags`, padrão
 * desligado desde 06/10/2026.)
 *
 * Só `true` liga. Qualquer outra coisa, inclusive a chave ausente, desliga:
 * o padrão é o método do Not Journal, que não usa hashtag.
 */
export function hashtagsLigadasNoProjeto(settings: unknown): boolean {
  const s = (settings ?? {}) as { instagram?: { hashtags?: unknown } };
  return s.instagram?.hashtags === true;
}
