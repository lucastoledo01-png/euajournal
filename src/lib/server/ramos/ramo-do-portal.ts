import type { PautaAvaliada } from "../editorial/guarda";
import type { ConfigEditorial } from "../editorial/config";
import type { PacoteFactual } from "../editorial/pacote-factual";
import { montarPacotesDasPautas } from "../editorial/pacote-factual";
import type { RegistroHistorico } from "../editorial/history";
import type { LivroDeCustos } from "./custos";
import { montarPeca } from "./peca";
import type { PecaPronta } from "./peca";
import { selecionarParaPortal } from "./selecao";
import type { SelecaoDoRamo } from "./selecao";
import { categoriaDoArtigo, escreverArtigoDaPauta, indexacaoDoArtigoEscrito, renderizarArtigoHtml } from "./artigo";
import type { MarcaDoArtigo, MateriaRelacionada, ResultadoDoArtigo } from "./artigo";
import type { AlvoDaRelacao } from "../materias-relacionadas";
import { editoriaPeloNome, hrefDaEditoria } from "@/lib/editorias";
import { tagsDeIndexacao } from "@/lib/indexacao-do-artigo";
import { horariosDosArtigos, slugDoArtigo } from "./portal";
import { linhasDasQuedas, selecionarComFoto, temFotoDaPauta } from "./sem-foto";
import type { FotosDoDia, QuedaSemFoto } from "./sem-foto";
import type { ConteudoDoArtigo } from "./portal";
import type { AmpliadorDePacote } from "./materia-profunda";
import { creditoDoAsset, htmlDoCredito, legendaNeutra } from "@/lib/credito-da-capa";
import { enderecoLimpoDaImagem } from "@/lib/imagem-da-capa";
import { htmlDaLegenda, legendaDaFoto } from "../legenda-da-capa";
import { MARCA } from "@/lib/marca";

/**
 * O pacote factual é da camada comum, e é montado UMA vez por pauta.
 *
 * Newsletter e portal podem escolher a mesma pauta. Sem o cache, cada ramo
 * pagaria a extração de novo e, pior, receberia uma extração DIFERENTE do mesmo
 * texto, porque o extrator é um modelo. Dois canais escrevendo sobre o mesmo
 * fato a partir de duas listas de fatos é o começo de uma contradição pública.
 */
export async function garantirPacotes(
  pautas: PautaAvaliada[],
  cache: Map<string, PacoteFactual>,
  opcoes: { env?: Record<string, string | undefined>; fetcher?: typeof fetch; livro?: LivroDeCustos } = {},
): Promise<{ montados: number; falhas: string[] }> {
  const faltam = pautas.filter((p) => !cache.has(p.grupo.primary.url));
  if (faltam.length === 0) return { montados: 0, falhas: [] };

  const r = await montarPacotesDasPautas(
    faltam.map((p) => ({
      url: p.grupo.primary.url,
      titulo: p.grupo.primary.title,
      texto: p.enriquecimento.texto,
      urls: [p.grupo.primary.url, ...p.grupo.secondary_urls],
    })),
    opcoes.env ?? process.env,
    opcoes.fetcher ?? fetch,
  );
  for (const [url, pacote] of r.pacotes) cache.set(url, pacote);
  opcoes.livro?.lancar("pacote_factual", "comum", r.custoUsd, r.tokens);
  return { montados: r.pacotes.size, falhas: r.falhas };
}

export type EntradaDoRamoDoPortal = {
  pool: PautaAvaliada[];
  pacotes: Map<string, PacoteFactual>;
  historico: RegistroHistorico[];
  config: ConfigEditorial;
  marca: MarcaDoArtigo;
  data: string;
  timezone: string;
  horarios: string[];
  livro?: LivroDeCustos;
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  /**
   * A foto de cada pauta, da camada comum de imagem, com memória do dia.
   *
   * Presente, ela decide duas coisas (05/10/2026): a capa da matéria e se a
   * pauta pode virar matéria. Pauta sem foto real cai ANTES da redação, e a
   * vaga vai para a próxima elegível (`sem-foto.ts`). Ausente, o ramo roda sem
   * capa e sem a régua, que é o caminho dos testes que não falam de imagem.
   */
  fotos?: FotosDoDia<PautaAvaliada>;
  /** Trocado em teste, para não chamar o modelo. */
  escrever?: typeof escreverArtigoDaPauta;
  /**
   * O "Leia também": matérias publicadas da mesma editoria. Ausente, a matéria
   * sai só com o link da página da editoria.
   */
  buscarRelacionadas?: (alvo: AlvoDaRelacao) => Promise<MateriaRelacionada[]>;
  /**
   * Junta as outras fontes do mesmo fato ao pacote da matéria (06/10/2026,
   * `fontes-da-materia.ts`). Ausente, a matéria é escrita só com o pacote da
   * camada comum, como antes. O pacote da camada comum NÃO muda: a newsletter
   * e o post seguem com o deles.
   */
  ampliarPacote?: AmpliadorDePacote;
  /**
   * A descrição da foto da capa, pela conferência visual sem a manchete
   * (06/10/2026). Ausente, ou sem descrição que passe na ancoragem, a legenda
   * é a neutra.
   */
  descreverCapa?: (url: string) => Promise<string | null>;
};

export type ResultadoDoRamoDoPortal = {
  selecao: SelecaoDoRamo;
  /** As pautas que a seleção quis e caíram por falta de foto, com o motivo. */
  semFoto: QuedaSemFoto[];
  pecas: Array<PecaPronta<ConteudoDoArtigo>>;
  linhasDeLog: string[];
};

/**
 * Seleciona, escreve e audita as matérias do dia. NÃO grava nada.
 *
 * Gravar é decisão de quem chama, pelo modo: em `dry_run` o resultado vira
 * diagnóstico, em `enforce` vira linha `scheduled` em `articles`. Separar as
 * duas coisas é o que permite o ensaio rodar exatamente o caminho de produção.
 */
export async function rodarRamoDoPortal(e: EntradaDoRamoDoPortal): Promise<ResultadoDoRamoDoPortal> {
  const escrever = e.escrever ?? escreverArtigoDaPauta;
  let selecao: SelecaoDoRamo;
  let semFoto: QuedaSemFoto[] = [];
  if (e.fotos) {
    const r = await selecionarComFoto({
      selecionar: (excluir) => selecionarParaPortal(e.pool, e.pacotes, e.historico, e.config, undefined, excluir),
      escolhidas: (s) => s.escolhidas,
      chave: (p) => p.storyId,
      titulo: (p) => p.grupo.primary.title,
      fotos: e.fotos,
      // Sem foto, a matéria sai com capa tipográfica (14/10/2026); a capa fica nula logo abaixo.
      exigirFoto: false,
    });
    selecao = r.selecao;
    semFoto = r.semFoto;
  } else {
    selecao = selecionarParaPortal(e.pool, e.pacotes, e.historico, e.config);
  }
  const linhas = [...linhasDasQuedas("artigo", semFoto), ...selecao.linhasDeLog];
  const horarios = horariosDosArtigos(selecao.escolhidas.length, e.data, e.timezone, e.horarios);

  const pecas: Array<PecaPronta<ConteudoDoArtigo>> = [];

  for (const [i, pauta] of selecao.escolhidas.entries()) {
    const pacoteDaPauta = e.pacotes.get(pauta.grupo.primary.url);
    // A seleção já exige pacote. Isto é o cinto: sem pacote, não se escreve.
    if (!pacoteDaPauta) continue;

    /*
     * A matéria profunda (06/10/2026): o pacote desta matéria junta as outras
     * fontes do mesmo fato. É uma CÓPIA para o portal; o do cache segue o da
     * camada comum. Falha aqui não derruba a matéria: ela sai com a fonte de
     * sempre.
     */
    let pacote = pacoteDaPauta;
    if (e.ampliarPacote) {
      try {
        const r = await e.ampliarPacote({ storyId: pauta.storyId, vetor: pauta.vetor ?? null, grupo: pauta.grupo }, pacoteDaPauta);
        pacote = r.pacote;
        linhas.push(...r.linhasDeLog.map((l) => `${l} :: ${pauta.grupo.primary.title.slice(0, 50)}`));
      } catch (erro) {
        linhas.push(`[RAMO artigo] fontes extras não lidas, segue com a principal: ${(erro as Error).message}`);
      }
    }

    let r: ResultadoDoArtigo;
    try {
      r = await escrever(pauta, pacote, e.marca, { env: e.env, fetcher: e.fetcher, livro: e.livro });
    } catch (erro) {
      linhas.push(`[RAMO artigo] falha técnica, a matéria não sai: ${(erro as Error).message} :: ${pauta.grupo.primary.title.slice(0, 60)}`);
      continue;
    }
    if (!r.artigo) {
      linhas.push(`[RAMO artigo] não escrita: ${r.erro} :: ${pauta.grupo.primary.title.slice(0, 60)}`);
      continue;
    }

    const conteudo = await materiaDaPauta(e, pauta, pacote, { ...r, artigo: r.artigo }, horarios[i], linhas);

    pecas.push(
      montarPeca({
        ramo: "artigo",
        referenciaId: conteudo.slug,
        storyIds: [pauta.storyId],
        titulo: r.artigo.titulo,
        conteudo,
        avisos: r.veredicto.avisos,
        aprovadaPeloAuditor: r.veredicto.aprovado,
        bloqueios: r.veredicto.bloqueios,
      }),
    );
    linhas.push(
      `[RAMO artigo] ${r.veredicto.aprovado ? "aprovada" : "BLOQUEADA"} em ${r.tentativas} tentativa(s) :: ${r.artigo.titulo.slice(0, 70)}` +
        (r.veredicto.bloqueios.length ? ` :: ${r.veredicto.bloqueios.join(" | ")}` : ""),
    );
  }

  return { selecao, semFoto, pecas, linhasDeLog: linhas };
}

/**
 * A matéria montada a partir do texto escrito e auditado: capa, legenda,
 * crédito, fontes, "Leia também", tags e horário (extraído em 29/10/2026 para
 * a matéria do Claude sair pelo mesmo caminho da esteira).
 */
export async function materiaDaPauta(
  e: Pick<EntradaDoRamoDoPortal, "fotos" | "descreverCapa" | "data" | "buscarRelacionadas" | "pool">,
  pauta: PautaAvaliada,
  pacote: PacoteFactual,
  r: ResultadoDoArtigo & { artigo: NonNullable<ResultadoDoArtigo["artigo"]> },
  publicarEm: string,
  linhas: string[],
): Promise<ConteudoDoArtigo> {
  /*
   * A capa é a foto que a seleção já conferiu, lida da memória do dia: a
   * mesma resposta, sem resolver de novo. Só a foto real vira capa; a
   * bandeira nunca (a seleção acima já tirou a pauta que só tinha ela).
   */
  let capa: string | null = null;
  let cabecaDaCapa = "";
  if (e.fotos) {
    const { visual } = await e.fotos.resultado(pauta);
    /*
     * Desde 06/10/2026 a capa é gravada limpa de `&amp;`, e leva no corpo a
     * legenda e o crédito (autor, licença e link, do asset que o resolvedor
     * escolheu), que a página desenha embaixo dela.
     */
    capa = temFotoDaPauta(visual) ? enderecoLimpoDaImagem(visual?.asset?.imageUrl) || null : null;
    if (capa) {
      const credito = creditoDoAsset(visual?.asset ?? null, `acervo ${MARCA.nome}`);
      let descricao: string | null = null;
      if (e.descreverCapa) {
        try {
          descricao = await e.descreverCapa(capa);
        } catch {
          descricao = null;
        }
      }
      const legenda = legendaDaFoto(descricao, pacote) ?? legendaNeutra((r.artigo.assuntos ?? [])[0]);
      cabecaDaCapa = `${htmlDaLegenda(legenda)}${credito ? htmlDoCredito(credito) : ""}`;
    }
  }

  const fonte = { nome: pauta.grupo.primary.source_name, url: enderecoLimpoDaImagem(pauta.grupo.primary.url) };
  // Todas as fontes usadas, na seção "Fontes" e no link de cada uma dentro do texto.
  const fontesDoPacote = pacote.fontes?.length ? pacote.fontes : null;
  const slug = slugDoArtigo(r.artigo.titulo, e.data);
  const categoria = categoriaDoArtigo(pauta, r.artigo.titulo);
  const editoria = editoriaPeloNome(categoria);
  let relacionadas: MateriaRelacionada[] = [];
  if (e.buscarRelacionadas) {
    try {
      relacionadas = await e.buscarRelacionadas({
        slug,
        categoria,
        texto: [r.artigo.titulo, ...(r.artigo.assuntos ?? [])].join(" "),
      });
    } catch (erro) {
      linhas.push(`[RAMO artigo] leia também não lido: ${(erro as Error).message}`);
    }
  }
  const conteudo: ConteudoDoArtigo = {
    origem: {
      storyId: pauta.storyId,
      titulo: pauta.grupo.primary.title,
      resumo: pauta.enriquecimento?.texto ?? "",
      eixo: String(pauta.classificacao.eixo ?? ""),
      pais: String(pauta.classificacao.pais ?? ""),
      atores: pauta.classificacao.atores ?? [],
      lugares: pauta.classificacao.lugares ?? [],
      acontecimento: pauta.classificacao.acontecimento ?? [],
      fonteNome: pauta.grupo.primary.source_name,
      fonteUrl: pauta.grupo.primary.url,
      pacote,
    },
    artigo: r.artigo,
    html: `${cabecaDaCapa}${renderizarArtigoHtml(r.artigo, fonte, {
      fontes: fontesDoPacote ? fontesDoPacote.map((f) => ({ nome: f.nome, url: f.url })) : [fonte],
      ...(fontesDoPacote ? { fontesDoTexto: fontesDoPacote.map((f) => ({ id: f.id, nome: f.nome, url: f.url })) } : {}),
      relacionadas,
      ...(editoria ? { editoria: { nome: editoria.nome, href: hrefDaEditoria(editoria.id) } } : {}),
    })}`,
    categoria,
    // Entidades só as que o texto final nomeia; assuntos pelo validador (06/10/2026).
    tags: (() => {
      const ix = indexacaoDoArtigoEscrito(r.artigo, pacote, { editoria: categoria });
      return tagsDeIndexacao({ assuntos: ix.assuntos, entidades: ix.entidades });
    })(),
    fonte,
    sourceUrls: pacote.source_urls.map((u) => enderecoLimpoDaImagem(u)).filter(Boolean),
    capa,
    publicarEm,
    slug,
    poolDoDia: e.pool.map((p) => p.storyId),
  };

  return conteudo;
}
