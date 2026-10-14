import { MARCA } from "@/lib/marca";
import { editoriaPeloNome, hrefDaEditoria } from "@/lib/editorias";
import { escapeHtml } from "./html";
import { camposDeIndexacaoNoJsonLd, indexacaoValidadaDoArtigo } from "@/lib/indexacao-do-artigo";
import { imagensDaCapaParaJsonLd, semImagemDaCapaNoCorpo } from "@/lib/imagem-da-capa";
import { ASSINATURA_DA_REDACAO, areaDoAutor, pessoaDoAutor, urlDoAutor, type Autor, type AutorDaAssinatura } from "@/lib/autores";

/**
 * O que a busca e os assistentes leem da matéria, montado num lugar só
 * (05/10/2026).
 *
 * Até aqui a página escrevia um `NewsArticle` mínimo à mão: sem autor, sem
 * `dateModified`, sem editoria, sem caminho de navegação, e com o
 * `JSON.stringify` cru, que a documentação do Next manda escapar (`<` vira
 * `<`) para um título com `</script>` não fechar a tag. A auditoria de
 * artigos e a página usam ESTA função, para o relatório medir o que a página
 * de fato publica, e não uma cópia da regra (a lição da "mesma regra em três
 * cópias").
 *
 * O que é decisão, e não descuido:
 *
 * - **Autor é a Redação, como Organization.** Não existe repórter com nome; o
 *   texto é da casa. Inventar pessoa seria o tipo de dado com cara de medida
 *   que o projeto recusa. (06/10/2026: a matéria que o dono atribuiu a um
 *   autor cadastrado sai com ele como Person; sem autor, segue a Redação.)
 * - **`dateModified` só muda quando o conteúdo mudou.** Vem de `updated_at`, e
 *   só quando ele é posterior à publicação por mais que a folga abaixo; senão
 *   é a própria data de publicação. Atualizar a data sem mudar o texto é o
 *   "atualizar todo mês" que o `PROCEDENCIA.md` registra como conselho que não
 *   vale para notícia.
 * - **`FAQPage` só com pergunta VISÍVEL.** A skill `ai-seo` diz o mesmo:
 *   marcação de pergunta que o leitor não vê é marcação enganosa.
 * - **Sem capa, sem `image`.** O logotipo não representa a matéria, e pôr ele
 *   ali só para o campo existir é preencher por obrigação. A auditoria aponta.
 */

/** A matéria como a página a recebe, nos nomes do banco. */
export type ArtigoParaBusca = {
  slug: string;
  title: string;
  seo_title?: string | null;
  seo_description?: string | null;
  description?: string | null;
  excerpt?: string | null;
  category?: string | null;
  cover_image?: string | null;
  published_at?: string | null;
  updated_at?: string | null;
  content_html?: string | null;
  aeo_questions?: unknown;
  /** Assuntos e entidades (`assunto:`, `sobre:`, `menciona:`), de `indexacao-do-artigo.ts`. */
  tags?: string[] | null;
};

export type PerguntaVisivel = { pergunta: string; resposta: string };

export const ID_DA_ORGANIZACAO = `${MARCA.site}/#organizacao`;
export const ID_DO_SITE = `${MARCA.site}/#site`;

/**
 * A organização que publica, a mesma em toda página (auditoria de SEO,
 * 05/10/2026): o logotipo com a medida do arquivo (800 por 142) e o perfil do
 * Instagram em `sameAs`, que é o único perfil oficial que existe hoje. Perfil
 * que não existe não entra.
 */
export function organizacaoDoSite(): Record<string, unknown> {
  return {
    "@type": "Organization",
    "@id": ID_DA_ORGANIZACAO,
    name: MARCA.nome,
    url: MARCA.site,
    logo: { "@type": "ImageObject", url: MARCA.logoClaro, width: 800, height: 142 },
    sameAs: [MARCA.instagram],
  };
}

/** O site, para a home: sem `SearchAction`, porque o portal não tem busca. */
export function siteDoPortal(): Record<string, unknown> {
  return {
    "@type": "WebSite",
    "@id": ID_DO_SITE,
    name: MARCA.nome,
    url: MARCA.site,
    description: MARCA.descricao,
    inLanguage: "pt-BR",
    publisher: { "@id": ID_DA_ORGANIZACAO },
  };
}

/** O grafo da home: o site e quem o publica. */
export function dadosEstruturadosDaHome(): Record<string, unknown> {
  return { "@context": "https://schema.org", "@graph": [organizacaoDoSite(), siteDoPortal()] };
}

/**
 * O grafo da página de uma editoria: CollectionPage com a lista das matérias
 * que ela mostra (só as que têm página no portal) e o caminho de navegação.
 */
export function dadosEstruturadosDaEditoria(
  editoria: { nome: string; descricao: string; url: string },
  materias: Array<{ url: string; titulo: string }>,
): Record<string, unknown> {
  const lista = materias.slice(0, 30);
  return {
    "@context": "https://schema.org",
    "@graph": [
      organizacaoDoSite(),
      {
        "@type": "CollectionPage",
        "@id": `${editoria.url}#pagina`,
        url: editoria.url,
        name: `${editoria.nome} | ${MARCA.nome}`,
        description: editoria.descricao,
        inLanguage: "pt-BR",
        isPartOf: { "@id": ID_DO_SITE },
        publisher: { "@id": ID_DA_ORGANIZACAO },
        breadcrumb: { "@id": `${editoria.url}#caminho` },
        ...(lista.length
          ? {
              mainEntity: {
                "@type": "ItemList",
                itemListElement: lista.map((m, i) => ({ "@type": "ListItem", position: i + 1, url: m.url, name: m.titulo })),
              },
            }
          : {}),
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${editoria.url}#caminho`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Início", item: MARCA.site },
          { "@type": "ListItem", position: 2, name: editoria.nome, item: editoria.url },
        ],
      },
    ],
  };
}

/**
 * O grafo da página de um autor (06/10/2026): ProfilePage com a pessoa como
 * `mainEntity`, a organização para quem ela escreve e, quando há, a lista das
 * matérias que a página mostra.
 */
export function dadosEstruturadosDoAutor(
  autor: Pick<Autor, "slug" | "nome" | "cargo" | "minibio" | "foto_url" | "redes" | "area">,
  materias: Array<{ url: string; titulo: string }>,
): Record<string, unknown> {
  const url = urlDoAutor(autor.slug);
  const lista = materias.slice(0, 30);
  const area = areaDoAutor(autor.area);
  const pessoa = {
    ...pessoaDoAutor(autor),
    ...(autor.minibio ? { description: autor.minibio } : {}),
    ...(area ? { knowsAbout: area.nome } : {}),
  };
  return {
    "@context": "https://schema.org",
    "@graph": [
      organizacaoDoSite(),
      {
        "@type": "ProfilePage",
        "@id": `${url}#pagina`,
        url,
        name: `${autor.nome} | ${MARCA.nome}`,
        inLanguage: "pt-BR",
        isPartOf: { "@id": ID_DO_SITE },
        mainEntity: pessoa,
      },
      ...(lista.length
        ? [
            {
              "@type": "ItemList",
              "@id": `${url}#materias`,
              name: `Matérias de ${autor.nome}`,
              itemListElement: lista.map((m, i) => ({ "@type": "ListItem", position: i + 1, url: m.url, name: m.titulo })),
            },
          ]
        : []),
    ],
  };
}

/** Folga entre publicar e "modificar": gravações da mesma rodada não contam. */
const FOLGA_DE_MODIFICACAO_MS = 10 * 60 * 1000;

/**
 * As perguntas gravadas, nos dois formatos que existem no banco: o do ramo
 * (`pergunta`, `resposta`) e o do painel antigo (`question`, `answer`).
 */
export function perguntasDoArtigo(aeo: unknown): PerguntaVisivel[] {
  if (!Array.isArray(aeo)) return [];
  return aeo
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const r = item as Record<string, unknown>;
      const pergunta = String(r.pergunta ?? r.question ?? "").trim();
      const resposta = String(r.resposta ?? r.answer ?? "").trim();
      return pergunta && resposta ? { pergunta, resposta } : null;
    })
    .filter((p): p is PerguntaVisivel => p !== null);
}

/** O corpo já traz a seção de perguntas (o ramo do portal a escreve no HTML). */
export function corpoJaTemPerguntas(html: string | null | undefined): boolean {
  /*
   * Pela classe, e não só pelo título (14/10/2026): o ramo escreve "Entenda em
   * 4 perguntas", e a busca por "Perguntas e respostas" não achava a seção. A
   * página acrescentava outra igual embaixo, e a matéria saía com as mesmas
   * quatro perguntas duas vezes.
   */
  return /<section[^>]*class="perguntas"/i.test(html ?? "") || /<h2[^>]*>\s*Perguntas e respostas\s*<\/h2>/i.test(html ?? "");
}

function textoSimples(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, e: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'" })[e] ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * As perguntas que o leitor VÊ na página: as gravadas em `aeo_questions`, ou,
 * sem elas, as que o ramo já escreveu dentro do corpo. É a mesma lista que
 * decide o `FAQPage` e que a auditoria confere.
 */
export function perguntasVisiveisDoArtigo(a: { aeo_questions?: unknown; content_html?: string | null }): PerguntaVisivel[] {
  const gravadas = perguntasDoArtigo(a.aeo_questions);
  if (gravadas.length > 0) return gravadas;
  const html = a.content_html ?? "";
  if (!corpoJaTemPerguntas(html)) return [];
  const secao =
    html.match(/<section[^>]*class="perguntas"[^>]*>([\s\S]*?)<\/section>/i)?.[1] ??
    html.match(/<h2[^>]*>\s*Perguntas e respostas\s*<\/h2>([\s\S]*?)<\/section>/i)?.[1] ??
    "";
  return [...secao.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => ({
    pergunta: textoSimples(m[1]),
    resposta: textoSimples(m[2]),
  }));
}

function semNegrito(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*/g, "");
}

/**
 * O corpo com a seção "Perguntas e respostas" visível, antes do crédito da
 * fonte, no mesmo molde que `renderizarArtigoHtml` usa. Quando o corpo já tem
 * a seção, nada muda: duas seções iguais na mesma página é defeito.
 */
export function corpoComPerguntas(html: string, perguntas: PerguntaVisivel[]): string {
  if (perguntas.length === 0 || corpoJaTemPerguntas(html)) return html;
  const secao = `<section class="perguntas"><h2>Perguntas e respostas</h2>${perguntas
    .map((p) => `<h3>${escapeHtml(semNegrito(p.pergunta))}</h3><p>${escapeHtml(semNegrito(p.resposta))}</p>`)
    .join("")}</section>`;
  const fonte = html.search(/<p[^>]*class="fonte"|<section[^>]*class="fontes"/i);
  return fonte >= 0 ? `${html.slice(0, fonte)}${secao}${html.slice(fonte)}` : `${html}${secao}`;
}

/**
 * O "Leia também" para a matéria que nasceu sem ele (auditoria de SEO,
 * 05/10/2026).
 *
 * Medido no banco: 61 das 62 matérias publicadas vieram do desmonte das
 * edições e não têm link para nenhuma outra matéria no corpo, só o menu. O
 * bloco é o mesmo que `renderizarArtigoHtml` escreve (mesma classe, para a
 * auditoria e a indexação o ignorarem igual), montado na página com as
 * relacionadas lidas do banco, antes das perguntas e da fonte. Corpo que já
 * tem o bloco não muda; sem relacionada e sem editoria, nada entra.
 */
export function corpoComLeiaTambem(
  html: string,
  relacionadas: ReadonlyArray<{ slug: string; titulo: string }>,
  editoria: { nome: string; href: string } | null,
): string {
  /*
   * O "Leia também" é sempre refeito na hora de desenhar, com as matérias
   * PUBLICADAS agora (06/10/2026). O gravado no corpo é o retrato do dia em que
   * a matéria foi escrita: quando as matérias antigas saíram do ar, o de
   * Chicago apontava para três páginas que não existiam mais.
   */
  html = html.replace(/<section[^>]*class="leia-tambem"[^>]*>[\s\S]*?<\/section>/gi, "");
  if (relacionadas.length === 0 && !editoria) return html;
  const lista = relacionadas.length
    ? `<ul>${relacionadas.map((r) => `<li><a href="/artigos/${encodeURIComponent(r.slug)}">${escapeHtml(r.titulo)}</a></li>`).join("")}</ul>`
    : "";
  const mais = editoria ? `<p class="mais-da-editoria"><a href="${escapeHtml(editoria.href)}">Mais de ${escapeHtml(editoria.nome)}</a></p>` : "";
  const secao = `<section class="leia-tambem"><h2>Leia também</h2>${lista}${mais}</section>`;
  const antes = html.search(/<section[^>]*class="perguntas"|<p[^>]*class="fonte"|<section[^>]*class="fontes"/i);
  return antes >= 0 ? `${html.slice(0, antes)}${secao}${html.slice(antes)}` : `${html}${secao}`;
}

function iso(d: string | null | undefined): string | undefined {
  if (!d) return undefined;
  const t = Date.parse(d);
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

/** A data de modificação honesta: `updated_at` só quando houve mudança depois de publicar. */
export function dataDeModificacao(publicada: string | null | undefined, atualizada: string | null | undefined): string | undefined {
  const p = iso(publicada);
  const u = iso(atualizada);
  if (!p) return u;
  if (!u) return p;
  return Date.parse(u) - Date.parse(p) > FOLGA_DE_MODIFICACAO_MS ? u : p;
}

/**
 * O `<title>` com a marca só quando ela cabe (auditoria de SEO, 05/10/2026).
 * Medido: 34 das 62 matérias têm título de busca acima de 60 caracteres, e
 * com " | eua.journal" (14) quase todas passavam do corte do Google, que
 * comia o fim do título, que é onde fica a jurisdição (regra 4 do
 * `modelo-de-titulo.md`). O nome do site o Google tira do WebSite do JSON-LD.
 */
export function tituloDaAba(tituloDeBusca: string): string {
  const comMarca = `${tituloDeBusca} | ${MARCA.nome}`;
  return comMarca.length <= 60 ? comMarca : tituloDeBusca;
}

export function urlDoArtigo(slug: string): string {
  return `${MARCA.site}/artigos/${slug}`;
}

export function descricaoParaBusca(a: ArtigoParaBusca): string {
  return (a.seo_description || a.description || a.excerpt || MARCA.tagline || "").trim();
}

/**
 * O grafo da matéria: NewsArticle, a organização, o caminho de navegação e,
 * quando há pergunta visível, o FAQPage.
 */
export function dadosEstruturadosDoArtigo(
  a: ArtigoParaBusca,
  opcoes: {
    perguntasVisiveis: PerguntaVisivel[];
    autor?: AutorDaAssinatura | null;
    /**
     * As dimensões do original da capa, quando quem chama as resolveu (a
     * página do arquivo no Commons). Ausentes, valem as do crédito gravado no
     * corpo (`data-largura`, `data-altura`).
     */
    dimensoesDaCapa?: { largura: number; altura: number } | null;
  },
): Record<string, unknown> {
  const url = urlDoArtigo(a.slug);
  const editoria = editoriaPeloNome(a.category);
  const secao = editoria?.nome ?? (a.category || undefined);
  /*
   * Limpa (`&amp%3B` do Pexels) e na miniatura de 1280 do Commons, nunca o
   * original de 9 MB. Desde 06/10/2026 como `ImageObject` com largura e altura
   * sempre que a medida é conhecida (`imagensDaCapaParaJsonLd`).
   */
  const dimensoes = opcoes.dimensoesDaCapa ?? semImagemDaCapaNoCorpo(a.content_html ?? "", null).dimensoesDaCapa;
  const imagens = imagensDaCapaParaJsonLd(a.cover_image, dimensoes);
  const publicada = iso(a.published_at);
  const idOrganizacao = ID_DA_ORGANIZACAO;

  const caminho: Array<{ "@type": string; position: number; name: string; item: string }> = [
    { "@type": "ListItem", position: 1, name: "Início", item: MARCA.site },
    ...(editoria
      ? [{ "@type": "ListItem", position: 2, name: editoria.nome, item: `${MARCA.site}${hrefDaEditoria(editoria.id)}` }]
      : []),
  ];
  caminho.push({ "@type": "ListItem", position: caminho.length + 1, name: a.title, item: url });

  const grafo: Record<string, unknown>[] = [
    organizacaoDoSite(),
    siteDoPortal(),
    {
      "@type": "NewsArticle",
      "@id": `${url}#materia`,
      headline: a.title,
      description: descricaoParaBusca(a),
      ...(publicada ? { datePublished: publicada } : {}),
      ...(publicada ? { dateModified: dataDeModificacao(a.published_at, a.updated_at) } : {}),
      ...(imagens.length ? { image: imagens } : {}),
      ...(secao ? { articleSection: secao } : {}),
      // `keywords`, `about` e `mentions` só com o que a matéria gravou; nunca
      // meta keywords, que nenhum buscador lê. Passam pelo validador na
      // leitura (06/10/2026): assunto genérico gravado antes da regra não
      // aparece, e entidade que o corpo não nomeia não entra.
      ...camposDeIndexacaoNoJsonLd(indexacaoValidadaDoArtigo(a)),
      author: opcoes.autor
        ? pessoaDoAutor(opcoes.autor)
        : { "@type": "Organization", name: ASSINATURA_DA_REDACAO, url: MARCA.site },
      publisher: { "@id": idOrganizacao },
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      url,
      inLanguage: "pt-BR",
      isAccessibleForFree: true,
      isPartOf: { "@id": ID_DO_SITE },
    },
    { "@type": "BreadcrumbList", "@id": `${url}#caminho`, itemListElement: caminho },
  ];

  if (opcoes.perguntasVisiveis.length > 0) {
    grafo.push({
      "@type": "FAQPage",
      "@id": `${url}#perguntas`,
      mainEntity: opcoes.perguntasVisiveis.map((p) => ({
        "@type": "Question",
        name: semNegrito(p.pergunta),
        acceptedAnswer: { "@type": "Answer", text: semNegrito(p.resposta) },
      })),
    });
  }

  return { "@context": "https://schema.org", "@graph": grafo };
}

/**
 * O JSON-LD pronto para ir dentro de `<script>`: `<` vira `<`, como a
 * documentação do Next indica, para nenhum texto do banco fechar a tag.
 */
export function jsonLdSeguro(dados: unknown): string {
  return JSON.stringify(dados).replace(/</g, "\\u003c");
}

/** O título do bloco de perguntas, com a quantidade (06/10/2026). */
export function tituloDasPerguntas(quantas: number): string {
  if (quantas <= 0) return "Perguntas e respostas";
  return quantas === 1 ? "Entenda em 1 pergunta" : `Entenda em ${quantas} perguntas`;
}

const ORDEM_DO_FIM = ["perguntas", "fontes", "leia-tambem"] as const;

/**
 * O fim da matéria sempre na mesma ordem: perguntas, fontes, "Leia também".
 *
 * Decisão do dono em 06/10/2026, olhando a página: as perguntas são conteúdo
 * (respondem o leitor sobre o assunto) e ficam coladas no texto; "Leia também"
 * é navegação e fecha a página. Feito na hora de desenhar, e não só no
 * redator, para valer também para o que já está gravado. As seções que não são
 * do fim ficam onde estão, na ordem em que vieram.
 */
export function corpoNaOrdemDoFim(html: string): string {
  const secao = /<section class="([a-z-]+)"[^>]*>[\s\S]*?<\/section>/g;
  const doFim = new Map<string, string>();
  let resto = html.replace(secao, (bloco, classe: string) => {
    if ((ORDEM_DO_FIM as readonly string[]).includes(classe) && !doFim.has(classe)) {
      doFim.set(classe, bloco);
      return "";
    }
    return bloco;
  });
  const perguntas = doFim.get("perguntas");
  if (perguntas) {
    const quantas = (perguntas.match(/<h3[\s>]/g) ?? []).length;
    doFim.set("perguntas", perguntas.replace(/<h2>[^<]*<\/h2>/, `<h2>${tituloDasPerguntas(quantas)}</h2>`));
  }
  resto = resto.trimEnd();
  return resto + ORDEM_DO_FIM.map((c) => doFim.get(c) ?? "").join("");
}

