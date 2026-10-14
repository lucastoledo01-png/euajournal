import { BotaoVoltar } from "@/components/BotaoVoltar";
import { ArticleComments } from "@/components/ArticleComments";
import { CaixaDeAssinatura, MolduraDoPortal } from "@/components/PortalChrome";
import { SubstackArticleRenderer } from "@/components/SubstackArticleRenderer";
import { creditoDoCommons, enderecoLimpoDaImagem, fotoNaLargura, miniaturaDoCommons, semImagemDaCapaNoCorpo } from "@/lib/imagem-da-capa";
import { creditoPorEndereco, legendaNeutra, textoDoCredito, type CreditoDaFoto } from "@/lib/credito-da-capa";
import { editoriaPeloNome, hrefDaEditoria } from "@/lib/editorias";
import { indexacaoValidadaDoArtigo } from "@/lib/indexacao-do-artigo";
import { hrefDoAutor, type AutorDaAssinatura } from "@/lib/autores";
import {
  corpoComLeiaTambem,
  corpoComPerguntas,
  corpoNaOrdemDoFim,
  dadosEstruturadosDoArtigo,
  dataDeModificacao,
  jsonLdSeguro,
  perguntasDoArtigo,
  perguntasVisiveisDoArtigo,
  urlDoArtigo,
} from "@/lib/server/dados-estruturados-do-artigo";

/**
 * O corpo da página da matéria, separado da rota (05/10/2026).
 *
 * A rota `/artigos/[slug]` busca a matéria e chama isto. Separado para a
 * página e qualquer prévia desenharem a MESMA coisa, com o mesmo JSON-LD, sem
 * uma segunda cópia do molde.
 */

/** A matéria como a página recebe, nos dois formatos que `getArticleBySlug` devolve. */
export type MateriaDaPagina = {
  slug: string;
  title: string;
  description?: string;
  excerpt?: string;
  seo_title?: string;
  seo_description?: string;
  category: string;
  author?: string;
  cover_image?: string | null;
  published_at?: string | null;
  updated_at?: string | null;
  content?: Array<{ heading: string; paragraphs: string[] }>;
  content_html?: string;
  age_summary?: string;
  aeo_questions?: unknown;
  /** Inclui os assuntos e as entidades, no formato de `indexacao-do-artigo.ts`. */
  tags?: string[] | null;
  /** O autor cadastrado (06/10/2026). A rota lê o autor por ele; a página recebe o autor pronto. */
  author_id?: string | null;
};

/**
 * Tempo de leitura medido no texto, e não lido de `reading_minutes`.
 *
 * O campo do banco nasce com 5 quando ninguém o preenche, e a página
 * imprimia esse 5 como se fosse medida. Aqui é a contagem de palavras do
 * corpo que vai à tela, a 200 por minuto. Sem texto, sem linha.
 */
function minutosDeLeitura(a: MateriaDaPagina): number | null {
  const bruto = a.content_html?.trim()
    ? a.content_html
    : (a.content ?? []).map((s) => `${s.heading} ${s.paragraphs.join(" ")}`).join(" ");
  const texto = bruto
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ");
  const palavras = texto.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  if (palavras === 0) return null;
  return Math.max(1, Math.round(palavras / 200));
}

/** Uma data por extenso, no fuso do projeto, ou nada. */
function porExtenso(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric", month: "long", year: "numeric" });
}

/**
 * As datas que o leitor vê, iguais às do JSON-LD (auditoria de SEO,
 * 05/10/2026): a de publicação sempre, e "Atualizado em" só quando a
 * modificação honesta (`dataDeModificacao`, a mesma do NewsArticle) cai em
 * outro DIA. Mesmo dia é ruído; dia diferente o leitor precisa saber.
 */
function datasDaMateria(a: MateriaDaPagina): { publicada?: { iso: string; texto: string }; atualizada?: { iso: string; texto: string } } {
  const textoPublicada = porExtenso(a.published_at);
  if (!a.published_at || !textoPublicada) return {};
  const publicada = { iso: new Date(a.published_at).toISOString(), texto: textoPublicada };
  const modificada = dataDeModificacao(a.published_at, a.updated_at);
  const textoModificada = porExtenso(modificada);
  if (!modificada || !textoModificada || textoModificada === textoPublicada) return { publicada };
  /*
   * Decisão do dono em 06/10/2026: na tela, só a data de publicação. A data
   * de modificação continua no NewsArticle (`dateModified`), que é onde o
   * Google e os buscadores de IA a leem; na página ela soava como errata.
   */
  return { publicada };
}

/**
 * As fotos do corpo e a capa pela miniatura do Commons, e não pelo original.
 * O motivo e o caminho estão em `miniaturaDoCommons`. Desde a auditoria de
 * SEO de 05/10/2026 o JSON-LD e o Open Graph também usam a miniatura (1280),
 * por `imagemParaCompartilhar`.
 */
function corpoComMiniaturas(html: string | undefined): string | undefined {
  if (!html) return html;
  /*
   * E carregadas só perto da tela (06/10/2026): a foto do corpo vem depois da
   * capa, que é o LCP, e não deve disputar banda com ela.
   */
  return html
    // "O que você precisa saber" é da newsletter (dono, 14/10/2026); some também das matérias já gravadas com ele.
    .replace(/<section class="essencial">[\s\S]*?<\/section>/g, "")
    .replace(/(<img[^>]+src=")([^"]+)(")/g, (_, antes: string, src: string, depois: string) =>
      `${antes}${miniaturaDoCommons(src.replace(/&amp;/g, "&"), 1280)}${depois}`,
    )
    .replace(/<img\b(?![^>]*\bloading=)/gi, '<img loading="lazy" decoding="async"');
}

function semMarcas(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

/**
 * A linha fina só aparece quando acrescenta (05/10/2026). No desmonte das
 * edições a descrição É a primeira frase do lide, e a página imprimia a mesma
 * frase duas vezes, uma embaixo da outra. É a régua "cada linha acrescenta"
 * do `decisoes.md`, aplicada à página.
 */
function linhaFinaQueAcrescenta(descricao: string | undefined, corpo: string | undefined, titulo?: string): string | undefined {
  const fina = semMarcas(descricao ?? "");
  if (!fina) return undefined;
  // A linha fina igual ao título também não aparece (14/10/2026: "Social Security terá maior aumento..." duas vezes).
  if (titulo && semMarcas(titulo).replace(/\W+/g, " ").trim().toLowerCase() === fina.replace(/\W+/g, " ").trim().toLowerCase()) return undefined;
  const primeiro = semMarcas(corpo?.match(/<p\b(?![^>]*class="(?:fonte|credito-da-foto|legenda-da-capa)")[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "");
  return primeiro.startsWith(fina) ? undefined : descricao;
}

/** A descrição automática da foto, escrita pela conferência visual, começa assim. */
export function ehDescricaoDeFoto(legenda: string): boolean {
  return /^\s*(close|retrato|imagem|foto|vista|fachada de um|fachada de uma|um |uma |homem|mulher|pessoa|pessoas|grupo|duas |dois |tr[eê]s |pr[eé]dio|edif[ií]cio|cena|plano)/i.test(legenda);
}

export function PaginaDaMateria({
  article,
  comComentarios = true,
  relacionadas = [],
  creditoResolvido = null,
  autor = null,
  moldura = true,
}: {
  article: MateriaDaPagina;
  comComentarios?: boolean;
  /**
   * Sem a moldura do portal (barra, cabeçalho, rodapé, "Voltar" e a caixa de
   * assinatura), só a matéria. É a prévia embutida na fila de aprovação
   * (06/10/2026): no celular, o cabeçalho do portal ocupava a janela inteira
   * da prévia antes do título. A rota pública nunca passa isto.
   */
  moldura?: boolean;
  /** O autor cadastrado e ativo da matéria, lido pela rota. `null` assina como a Redação. */
  autor?: AutorDaAssinatura | null;
  /** Para o "Leia também" da matéria que nasceu sem ele. Lidas pela rota; vazio não acrescenta nada. */
  relacionadas?: ReadonlyArray<{ slug: string; titulo: string }>;
  /**
   * O crédito da capa resolvido na origem pela rota (`resolverCreditoDaCapa`),
   * para a linha que não gravou crédito. O gravado no corpo vence.
   */
  creditoResolvido?: CreditoDaFoto | null;
}) {
  // Limpa do `&amp%3B` que 15 capas do Pexels gravaram (auditoria de 05/10/2026).
  const capa = enderecoLimpoDaImagem(article.cover_image);
  const editoria = editoriaPeloNome(article.category);

  /*
   * A capa não se repete no corpo (05/10/2026). A edição antiga publicada
   * como artigo traz a foto da primeira pauta dentro do HTML do e-mail, e a
   * página desenhava a mesma foto como capa logo acima. O crédito que vinha
   * colado na foto passa para baixo da capa, que é onde a obra está agora.
   */
  const { html: corpoSemCapa, creditoDaCapa, creditoDaCapaHref, dimensoesDaCapa, legendaDaCapa } = semImagemDaCapaNoCorpo(article.content_html, capa);

  /*
   * Perguntas e respostas VISÍVEIS, e só então o FAQPage. As gravadas em
   * `aeo_questions` entram como seção antes do crédito da fonte; quando o
   * corpo já traz a seção (o ramo a escreve no HTML), nada é acrescentado.
   */
  const perguntasGravadas = perguntasDoArtigo(article.aeo_questions);
  const comPerguntas = corpoSemCapa ? corpoComPerguntas(corpoSemCapa, perguntasGravadas) : corpoSemCapa;
  const comLeiaTambem = comPerguntas
    ? corpoComLeiaTambem(comPerguntas, relacionadas, editoria ? { nome: editoria.nome, href: hrefDaEditoria(editoria.id) } : null)
    : comPerguntas;
  const corpo = comLeiaTambem ? corpoNaOrdemDoFim(comLeiaTambem) : comLeiaTambem;

  /*
   * Foto do Commons sem crédito gravado ganha o link para a página do
   * arquivo, onde estão autor e licença (auditoria de 05/10/2026: 41 capas
   * do Commons, nenhuma com crédito, e a mais usada é CC BY-SA 4.0).
   */
  /*
   * Desde 06/10/2026 toda capa tem crédito com autor, licença e link: o
   * gravado no corpo primeiro; depois o que a rota resolveu na origem (página
   * do arquivo no Commons, API do Pexels); por último o que o endereço deixa
   * saber, que tem a origem e o link da página do arquivo.
   */
  const creditoPadrao = creditoDaCapa ? null : creditoDoCommons(capa);
  const piso = capa ? creditoPorEndereco(capa) : null;
  const credito: { texto?: string; href?: string } = creditoDaCapa
    ? { texto: creditoDaCapa, href: creditoDaCapaHref ?? piso?.href ?? undefined }
    : creditoResolvido && (creditoResolvido.autor || creditoResolvido.licenca)
      ? { texto: textoDoCredito(creditoResolvido), href: creditoResolvido.href || undefined }
      : creditoPadrao
        ? { texto: creditoPadrao.texto, href: creditoPadrao.href }
        : piso
          ? { texto: textoDoCredito(piso), href: piso.href || undefined }
          : {};
  /*
   * Capa sem legenda gravada (a matéria anterior a 06/10/2026, ou a do ramo
   * antes desta data) ganha a legenda neutra, que não afirma nada sobre a
   * foto: só o assunto. É a mesma saída do ramo quando a descrição não passa
   * na ancoragem.
   */
  const assuntos = indexacaoValidadaDoArtigo(article).assuntos;
  /*
   * Legenda que DESCREVE a foto ("Close do rosto de um homem idoso...") não
   * vai ao leitor (dono, 14/10/2026): é texto de acessibilidade, não legenda
   * de matéria. Fica só a legenda que diz quem ou o que está na foto; sem ela,
   * só o crédito. A neutra ("Imagem ilustrativa: ...") saiu pelo mesmo motivo.
   */
  void legendaNeutra;
  void assuntos;
  const legenda = legendaDaCapa && !ehDescricaoDeFoto(legendaDaCapa) ? legendaDaCapa : undefined;
  const dimensoes =
    dimensoesDaCapa ??
    (creditoResolvido?.largura && creditoResolvido?.altura ? { largura: creditoResolvido.largura, altura: creditoResolvido.altura } : null);
  const datas = datasDaMateria(article);
  const perguntasNaPagina = perguntasVisiveisDoArtigo({ aeo_questions: article.aeo_questions, content_html: corpo });

  /*
   * NewsArticle, organização, caminho de navegação e, com pergunta visível,
   * FAQPage, num `@graph` só. O `<` é escapado como a documentação do Next
   * indica para JSON-LD: o conteúdo vem do banco, e um título com
   * `</script>` fecharia a tag.
   */
  const dadosEstruturados = dadosEstruturadosDoArtigo(article, { perguntasVisiveis: perguntasNaPagina, dimensoesDaCapa: dimensoes, autor });
  const minutos = minutosDeLeitura(article);

  const conteudo = (
      <main>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdSeguro(dadosEstruturados) }}
        />

        <div className={`mx-auto max-w-[720px] px-5 sm:px-6 ${moldura ? "pb-20 pt-6 md:pt-10" : "pb-10 pt-5"}`}>
          {moldura ? (
            <div className="mb-2">
              <BotaoVoltar className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.14em] text-marca-texto hover:underline" />
            </div>
          ) : null}

          <SubstackArticleRenderer
            title={article.title}
            subtitle={linhaFinaQueAcrescenta(article.description, corpo, article.title)}
            date={datas.publicada?.texto}
            dateTime={datas.publicada?.iso}
            updated={datas.atualizada?.texto}
            updatedTime={datas.atualizada?.iso}
            category={article.category}
            categoryHref={editoria ? hrefDaEditoria(editoria.id) : undefined}
            readTime={minutos ? `${minutos} min` : undefined}
            coverImage={capa ? fotoNaLargura(capa, 1280) : null}
            coverCredit={credito.texto}
            coverCreditHref={credito.href}
            coverDescription={legenda}
            coverAlt={legendaDaCapa ?? article.title}
            shareUrl={urlDoArtigo(article.slug)}
            topics={assuntos}
            contentHtml={corpoComMiniaturas(corpo)}
            sections={article.content}
            quote={article.age_summary}
            author={article.author}
            autor={autor ? { nome: autor.nome, href: hrefDoAutor(autor.slug), foto: autor.foto_url } : null}
          />

          {moldura ? <CaixaDeAssinatura origem="portal-artigo" className="my-12" /> : null}

          {comComentarios ? <ArticleComments articleSlug={article.slug} /> : null}
        </div>
      </main>
  );

  return moldura ? (
    <MolduraDoPortal>{conteudo}</MolduraDoPortal>
  ) : (
    <div className="portal bg-white font-portal text-[#0A0A0A]">{conteudo}</div>
  );
}
