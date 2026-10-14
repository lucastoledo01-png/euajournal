import { ehFamosoParaOPublico } from "../social/manchete-com-contexto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AssetVisual,
  CaminhoDaFoto,
  CandidatoRecusado,
  DegrauDaCena,
  EntidadeVisual,
  ResultadoVisual,
} from "./tipos";
import { MOTIVOS_DE_RECUSA, ehPessoa, normalizarEntidade } from "./tipos";
import { criarBiblioteca, usadoRecentemente } from "./biblioteca";
import type { AssetGuardado, Biblioteca } from "./biblioteca";
import { escolherEntidadeVisual, entidadeConceitual } from "./entidade-visual";
import { buscarNoCommons, candidatoParaAsset } from "./wikimedia";
import { buscarNoOpenverse, candidatoParaAsset as candidatoDoOpenverse } from "./openverse";
import { buscarEmFonteOficial } from "./fonte-oficial";
import { escolherBandeira } from "./bandeira";
import {
  carregarConfigDeImagem,
  pisoDeRelevancia,
  pontuarImagem,
  temIdentidade,
  type NotaDaImagem,
} from "./relevancia";
import { avaliarLicenca, montarAtribuicao } from "./licencas";
import { bancoConfigurado, buscarFotosDeBanco, identidadeDaFoto } from "../prompt-system/stock";
import { consultaConceitual } from "./conceitual";
import { cenaDaPauta, type CenaDaPauta } from "./cena-da-pauta";
import { conferirImagem } from "./conferencia-visual";
import type { VeredictoVisual } from "./conferencia-visual";
import { getAIProviderConfig } from "../newsroom/ai-provider";
import { analisarTemporalidade, figuraNaoCentralNaImagem, retratoNaoCentral } from "./temporalidade";
import type { Acervo } from "./acervo/acervo";
import { paisDoAcervo } from "./acervo/catalogo-de-cenas";
import {
  anotarFalta,
  assetDoAcervo,
  assuntosDaEntidade,
  escolherDoAcervo,
  marcarUso,
  type ContextoDaBusca,
} from "./acervo/na-resolucao";
import {
  buscarCenaNosBancosOficiais,
  buscarNosBancosOficiais,
  cenaDeGovernoPara,
  entidadeElegivel,
  oficiaisPrimeiro,
} from "./bancos-oficiais";
import { BANCOS_OFICIAIS } from "./bancos-oficiais/registro";
import type { DefinicaoDoBanco, PaisDoBanco } from "./bancos-oficiais/tipos";
import { resolverProtagonista } from "./protagonista";
import { conferirIdentidade, conferirMarca } from "./verificacao-do-protagonista";
import { dadosDaMarca, type Representante } from "./wikidata";
import { arquivoDoCommons } from "./wikimedia";
import { baixarLogotipo, comporCartaoDaMarca, urlDoCartaoDaMarca, urlDoLogotipoNoCommons } from "./cartao-da-marca";
import type { VerificacaoDoProtagonista } from "./tipos";

/**
 * A imagem de uma pauta, resolvida pela entidade.
 *
 * Esta é a porta única: newsletter e, no futuro, Instagram entram por aqui.
 * Dois sistemas de busca de imagem no mesmo projeto viram duas regras de
 * licença diferentes, e uma delas vai estar errada.
 *
 * A ordem não é preferência estética, é hierarquia de direito e de verdade:
 *
 *   biblioteca interna   já validado, já creditado, e ainda não repetido
 *   Wikimedia Commons    licença explícita, arquivo estável, autor conhecido
 *   fonte oficial        só quando a página declara o reuso
 *   press kit            idem, no material que a instituição publica para imprensa
 *   banco conceitual     e SÓ quando a pauta não é sobre uma pessoa
 *
 * Nenhuma imagem é melhor que imagem errada. Quando nada passa, devolve
 * NO_VALID_IMAGE com o motivo, e isso não é falha de pipeline.
 */

export type PautaParaImagem = {
  storyId: string;
  titulo: string;
  /**
   * A manchete da PEÇA, quando ela já existe (06/10/2026): a refação de imagem
   * e o script da fila a conhecem. O protagonista é lido dela antes do título
   * da fonte, porque é ela que vai ao ar: o post "Bret Taylor: ..." nasceu de
   * uma fonte cujo título fala da Meta.
   */
  manchete?: string;
  /** Resumo da matéria. Entra no contexto que desambigua lugar. */
  resumo?: string;
  categoria: string;
  /** `pais` desempata homônimo: sem ele, "ICE" numa pauta americana vira trem alemão. */
  classificacao: { atores: string[]; lugares: string[]; acontecimento: string[]; pais?: string };
};

export type OpcoesDeResolucao = {
  client?: SupabaseClient;
  biblioteca?: Biblioteca;
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  /** Assets já escolhidos nesta mesma edição, para não repetir dentro do dia. */
  jaUsadosNestaEdicao?: Set<string>;
  /**
   * Fotos que já saíram em dias anteriores, por identidade.
   *
   * `jaUsadosNestaEdicao` protege dentro do dia. Esta protege entre dias, e é
   * o que faltava para o banco conceitual, que escolhe por conceito e por isso
   * nunca disputa a chave de entidade da biblioteca.
   */
  jaUsadasRecentemente?: Iterable<string>;
  /** Não grava nada. O dry-run usa isto. */
  somenteLeitura?: boolean;
  /**
   * Quem abre a imagem e diz se ela sustenta a manchete.
   *
   * Injetável para o teste poder decidir o veredicto sem rede. `false` desliga
   * a conferência, e só o dry-run e a medição de capacidade usam isso.
   *
   * Quando não vem nada, o resolvedor usa a conferência de verdade SE houver
   * credencial de modelo configurada. Sem credencial ele pula, e isso não é
   * brecha: o pipeline inteiro morre antes, em `callOpenAIJSON`, porque
   * conteúdo fabricado nunca é resultado aceitável. Em produção a chave existe
   * sempre; em teste não existe nunca.
   */
  conferenciaVisual?: Conferente | false;
  /**
   * O acervo próprio (decisão de 29/09/2026), ou nada.
   *
   * Ausente ou `null` é o caminho de antes, byte a byte: nenhuma consulta a
   * mais, e a pergunta da cena sai com o prompt de sempre. Quem decide se ele
   * vem é a capacidade `acervo` do projeto, em `acervo/acervo.ts`.
   */
  acervo?: Acervo | null;
  /**
   * Por que o editor recusou fotos NESTE canal (06/10/2026, aprendizado da
   * fila). Vai para a pergunta da cena, para a busca mudar de assunto e não só
   * de arquivo. Ausente ou vazio, a pergunta sai byte a byte como antes.
   */
  recusasDoEditor?: string[];
  /**
   * Os bancos de imagem oficiais (06/10/2026), ou nada.
   *
   * Ausente ou `false` é o caminho de antes, byte a byte: nenhuma consulta a
   * mais. Quem decide é `settings.imagens.bancos_oficiais` do projeto
   * (`bancosOficiaisLigados`), lido por `imagemDaPauta` e pelo ciclo social.
   * Uma lista de bancos no lugar do `true` é para o teste trocar a rede.
   */
  bancosOficiais?: boolean | DefinicaoDoBanco[];
  /**
   * Protagonistas da manchete já tentados sem foto verificada (06/10/2026).
   * Uso interno: o resolvedor se chama de novo com o nome seguinte da
   * manchete, e quem chama de fora não passa nada.
   */
  protagonistasExcluidos?: string[];
};

/** Os bancos que esta resolução consulta, ou nenhum. */
function bancosDaResolucao(opcoes: OpcoesDeResolucao): DefinicaoDoBanco[] | null {
  if (!opcoes.bancosOficiais) return null;
  return opcoes.bancosOficiais === true ? BANCOS_OFICIAIS : opcoes.bancosOficiais;
}

export type Conferente = (
  asset: AssetVisual,
  pauta: {
    titulo: string;
    resumo?: string;
    eixo?: string;
    uso?: "fundo" | "bolha";
    /**
     * `identidade`, `marca` e `logotipo` (06/10/2026) são as perguntas do
     * protagonista da manchete: é a MESMA pessoa do retrato de referência? o
     * nome da organização está legível? Ver `verificacao-do-protagonista.ts`.
     */
    papel?: "assunto" | "cena" | "identidade" | "marca" | "logotipo";
    /** Para `identidade`: quem, e o retrato de referência (P18 ou banco oficial). */
    referencia?: { nome: string; url: string };
    /** Para `marca` e `logotipo`: o nome da organização. */
    marca?: { nome: string; apelidos?: string[]; instituicao?: boolean };
  },
) => Promise<VeredictoVisual>;

export async function resolveVisualAsset(
  pauta: PautaParaImagem,
  opcoes: OpcoesDeResolucao = {}
): Promise<ResultadoVisual> {
  const env = opcoes.env ?? process.env;
  const config = carregarConfigDeImagem(env);
  const biblioteca = opcoes.biblioteca ?? (opcoes.client ? criarBiblioteca(opcoes.client) : null);
  const usadosAgora = opcoes.jaUsadosNestaEdicao ?? new Set<string>();
  const usadasAntes = new Set(
    [...(opcoes.jaUsadasRecentemente ?? [])].map((u) => identidadeDaFoto(u)).filter(Boolean),
  );
  const jaSaiu = (imageUrl: string) => usadasAntes.has(identidadeDaFoto(imageUrl));

  const fontesConsultadas: ResultadoVisual["fontesConsultadas"] = [];
  const recusados: CandidatoRecusado[] = [];

  /*
   * Sem foto DA PAUTA, mas nunca sem foto.
   *
   * A regra é do dono, de 17/09/2026, depois de um post sair como peça de
   * texto puro: nenhuma peça fica sem imagem. Quando a entidade não tem foto e
   * nem o banco conceitual entrega, entra a bandeira da publicação.
   *
   * O `status` e o `motivo` continuam dizendo a verdade: NO_VALID_IMAGE com a
   * razão real. Isso é deliberado, e tem consequência prática: a newsletter
   * pergunta por `status === "SELECTED"` antes de usar a imagem, então ela
   * segue sem foto neste caso, e só a peça do Instagram recebe a bandeira. O
   * relatório também continua contando este dia como dia sem foto da pauta,
   * que é o número que interessa para melhorar a busca.
   */
  const semFotoDaPauta = (
    entidade: EntidadeVisual | null,
    motivo: ResultadoVisual["motivo"],
  ): ResultadoVisual => {
    const bandeira = escolherBandeira({
      eixo: pauta.categoria,
      evitar: new Set([...usadosAgora, ...(opcoes.jaUsadasRecentemente ?? [])]),
    });

    fontesConsultadas.push({
      fonte: "ultimo_recurso",
      encontrados: 1,
      nota: String(bandeira.metadata?.descricao ?? "bandeira da publicação"),
    });

    return {
      storyId: pauta.storyId,
      entidade,
      asset: bandeira,
      assetSecundario: null,
      status: "NO_VALID_IMAGE",
      motivo,
      fontesConsultadas,
      recusados,
      legenda: "",
    };
  };

  /*
   * 0. O PROTAGONISTA da manchete (06/10/2026, "imagem certeira").
   *
   * Regra do dono depois da fila de 07/10/2026: manchete que nomeia uma pessoa
   * mostra ESSA pessoa, com a identidade conferida; manchete que nomeia uma
   * organização mostra a marca dela ou quem a representa. Cena no lugar do
   * protagonista nomeado não existe mais. O protagonista é decidido antes de
   * tudo, pela manchete, e não pela lista de atores: foi a lista (os quatro
   * nomes mais longos, depois um empate de centralidade) que trocou o Caiado
   * por um salão de casamento. Ver `protagonista.ts`.
   */
  const protagonista = await resolverProtagonista(
    {
      titulo: pauta.titulo,
      manchete: pauta.manchete,
      resumo: pauta.resumo,
      atores: pauta.classificacao.atores,
      lugares: pauta.classificacao.lugares,
      pais: pauta.classificacao.pais,
    },
    { env, fetcher: opcoes.fetcher, excluir: opcoes.protagonistasExcluidos },
  );
  for (const nota of protagonista.notas) fontesConsultadas.push({ fonte: "biblioteca_interna", encontrados: 0, nota });
  /*
   * Já houve protagonista na manchete, sem foto conferida, e não sobrou outro:
   * a pauta continua sendo SOBRE quem a manchete nomeia, e não vira cena.
   */
  if (protagonista.indeterminado || (!protagonista.entidade && opcoes.protagonistasExcluidos?.length)) {
    return { ...semFotoDaPauta(null, MOTIVOS_DE_RECUSA.FOTO_DO_PROTAGONISTA_NAO_VERIFICADA), protagonista: null };
  }
  const estrito = Boolean(protagonista.entidade);

  // 1. Quem é o assunto visual. Com protagonista na manchete, é ele, e a lista de atores não decide.
  const escolha = protagonista.entidade
    ? { entidade: protagonista.entidade, tentativas: [], ambigua: false }
    : await escolherEntidadeVisual(
        {
          ...pauta.classificacao,
          titulo: pauta.titulo,
          resumo: pauta.resumo ?? "",
          contexto: `${pauta.titulo} ${pauta.resumo ?? ""} ${pauta.categoria}`,
        },
        { env, fetcher: opcoes.fetcher }
      );

  /*
   * Ambiguidade não vira palpite.
   *
   * Havendo dois lugares plausíveis e nada no contexto que decida, a pauta sai
   * sem imagem. Foto do estado de Washington numa matéria sobre a embaixada em
   * Washington D.C. é um erro que o leitor percebe.
   */
  /*
   * ATUALIZADO em 06/10/2026: ambiguidade continua não virando palpite sobre
   * a ENTIDADE, mas deixou de matar a pauta. Ela segue como pauta sem
   * entidade, pela escada da cena: a foto de contexto não afirma qual das duas
   * Washington é, e é por isso que ela pode ficar. Medido no catálogo do
   * evergreen: "paridade regional" morria aqui toda vez.
   */
  if (!escolha.entidade && escolha.ambigua) {
    fontesConsultadas.push({
      fonte: "biblioteca_interna",
      encontrados: 0,
      nota: `entidade ambígua, a pauta segue pela cena: ${escolha.tentativas.map((t) => t.resultado).join(" ; ")}`,
    });
  }

  const entidade =
    escolha.entidade ?? entidadeConceitual(pauta.classificacao.acontecimento, pauta.categoria);

  fontesConsultadas.push({
    fonte: "biblioteca_interna",
    encontrados: 0,
    nota:
      `entidade: ${entidade.nome} (${entidade.tipo}), confiança ${entidade.confianca}, ` +
      `via ${entidade.origem}`,
  });

  const piso = pisoDeRelevancia(entidade, config);

  /*
   * Quem confere as imagens, decidido uma vez e usado em dois lugares.
   *
   * Ele governa as DUAS chamadas de modelo deste módulo: a pergunta sobre o
   * que fotografar, lá no banco conceitual, e a conferência que abre a imagem,
   * aqui embaixo. Ficava declarado só antes da segunda, e a primeira nasceu
   * sem interruptor nenhum: o `dry-run-imagens`, que roda sobre até 40 pautas
   * reais para medir sem custo, passaria a gastar 40 chamadas invisíveis.
   */
  const conferir = conferenteDe(opcoes);
  const aprovar = (asset: AssetVisual, id?: string, segundo?: AssetVisual | null): ResultadoVisual => ({
    storyId: pauta.storyId,
    entidade,
    asset: {
      ...asset,
      id: id ?? asset.id,
      entityConfidence: entidade.confianca,
      entityEvidence: entidade.evidencias,
    },
    assetSecundario: segundo ?? null,
    status: "SELECTED",
    motivo: null,
    fontesConsultadas,
    recusados,
    legenda: asset.attribution,
    // A etapa da cena sobrescreve; aqui é a foto que veio pela entidade, ou a cena da pauta sem entidade.
    caminho: entidade.tipo === "conceptual" ? "cena" : "entidade",
    protagonista: protagonista.entidade
      ? { nome: protagonista.entidade.nome, tipo: protagonista.entidade.tipo, qid: protagonista.entidade.qid }
      : null,
  });

  /*
   * 1.5. O acervo próprio, pela ENTIDADE (decisão de 29/09/2026).
   *
   * Entidade nomeada e o acervo tem: sai daqui, sem conferência visual, porque
   * a foto foi conferida na entrada. Entidade nomeada e o acervo não tem: a
   * falta vai para a lista de compras e a resolução segue para as fontes de
   * sempre. A CENA não é consultada aqui de propósito: ela só entra depois de a
   * entidade falhar nos dois lados, senão uma foto genérica de "tecnologia"
   * mascararia a falta da foto do produto que a pauta cita.
   */
  const acervo = opcoes.acervo ?? null;
  const buscaNoAcervo: ContextoDaBusca = {
    storyId: pauta.storyId,
    titulo: pauta.titulo,
    janelaEmDias: config.janelaEmDias,
    usadosAgora,
    jaSaiu,
  };
  const daPrateleira = async (
    candidatas: Awaited<ReturnType<Acervo["porTag"]>>,
    tipo: "cena" | "entidade",
    chave: string,
    pais: string,
  ): Promise<ResultadoVisual | null> => {
    const busca = escolherDoAcervo(candidatas, buscaNoAcervo);
    const notas = [`${tipo} "${chave}": ${busca.nota}`];

    if (!busca.escolhida) {
      const anotada = await anotarFalta(acervo!, tipo, chave, pais, busca.falta ?? "vazio", buscaNoAcervo);
      if (anotada) notas.push(anotada);
      fontesConsultadas.push({ fonte: "acervo_proprio", encontrados: busca.encontradas, nota: notas.join(" ; ") });
      return null;
    }

    if (acervo!.modo !== "enforce") {
      fontesConsultadas.push({
        fonte: "acervo_proprio",
        encontrados: busca.encontradas,
        nota: `${notas.join(" ; ")} ; ENSAIO (dry_run): escolheria esta, e a cadeia externa segue decidindo`,
      });
      return null;
    }

    const uso = await marcarUso(acervo!, busca.escolhida);
    if (uso) notas.push(uso);
    fontesConsultadas.push({ fonte: "acervo_proprio", encontrados: busca.encontradas, nota: notas.join(" ; ") });
    usadosAgora.add(busca.escolhida.urlPublica);
    // Foto de CENA nunca leva o nome da entidade, nem quando a pauta tem uma e chegou aqui pela etapa da cena.
    return aprovar(assetDoAcervo(busca.escolhida, tipo === "cena" || entidade.tipo === "conceptual" ? null : entidade));
  };

  if (acervo && entidade.tipo !== "conceptual") {
    const chaves = assuntosDaEntidade(entidade);
    try {
      const candidatas = await acervo.porAssunto(chaves);
      const doAcervo = await daPrateleira(candidatas, "entidade", chaves[0] ?? entidade.normalizado, "");
      if (doAcervo) return doAcervo;
    } catch (erro) {
      fontesConsultadas.push({
        fonte: "acervo_proprio",
        encontrados: 0,
        nota: `acervo indisponível: ${(erro as Error).message}`,
      });
    }
  }

  const guardadasParaVerificar: AssetVisual[] = [];

  // 2. A biblioteca primeiro. O que já foi validado não precisa de busca nova.
  if (biblioteca && entidade.tipo !== "conceptual") {
    try {
      const guardados = await biblioteca.daEntidade(entidade.normalizado);
      const disponiveis: AssetGuardado[] = [];

      for (const g of guardados) {
        const quando = usadoRecentemente(g, config.janelaEmDias);
        if (quando) {
          recusados.push({
            origem: "biblioteca_interna",
            identificacao: g.sourceAssetId,
            motivo: MOTIVOS_DE_RECUSA.USADA_RECENTEMENTE,
            detalhe: `usada em ${quando.slice(0, 10)}, janela de ${config.janelaEmDias} dias`,
          });
          continue;
        }
        if (usadosAgora.has(g.imageUrl)) {
          recusados.push({
            origem: "biblioteca_interna",
            identificacao: g.sourceAssetId,
            motivo: MOTIVOS_DE_RECUSA.USADA_RECENTEMENTE,
            detalhe: "já escolhida por outra pauta desta edição",
          });
          continue;
        }
        disponiveis.push(g);
      }

      /*
       * Com os bancos oficiais ligados (06/10/2026), a biblioteca só devolve
       * na hora o que veio de banco oficial. A foto do Commons guardada antes
       * continua existindo e volta pela busca do Commons, mas não passa na
       * frente: o pedido do dono é a foto atual da Agência Brasil ou da Casa
       * Branca ANTES da do Commons, e a biblioteca devolvendo a de 2019 seria
       * o Commons passando na frente por ter chegado antes.
       */
      const soOficiais = bancosDaResolucao(opcoes) && entidadeElegivel(entidade);
      const daBiblioteca = soOficiais ? disponiveis.filter((g) => g.source === "banco_oficial") : disponiveis;

      fontesConsultadas.push({
        fonte: "biblioteca_interna",
        encontrados: guardados.length,
        nota:
          `${disponiveis.length} disponível(is) depois da janela de repetição` +
          (soOficiais ? `, ${daBiblioteca.length} de banco oficial (bancos oficiais ligados: as outras esperam a busca)` : ""),
      });

      /*
       * Com protagonista na manchete, a foto guardada não sai daqui direto: ela
       * foi aprovada por uma régua que não conferia identidade, e entra na fila
       * da verificação junto com as fontes externas (06/10/2026).
       */
      if (estrito) {
        guardadasParaVerificar.push(...daBiblioteca);
      }
      const { melhor } = estrito
        ? { melhor: null }
        : melhorPontuado(daBiblioteca, entidade, piso, recusados, config.larguraMinima, {
            titulo: pauta.titulo,
            resumo: pauta.resumo,
            atores: pauta.classificacao.atores,
          });
      if (melhor) {
        if (!opcoes.somenteLeitura && melhor.id) await biblioteca.registrarUso(melhor.id);
        usadosAgora.add(melhor.imageUrl);
        return aprovar(melhor, melhor.id);
      }
    } catch (erro) {
      fontesConsultadas.push({
        fonte: "biblioteca_interna",
        encontrados: 0,
        nota: `biblioteca indisponível: ${(erro as Error).message}`,
      });
    }
  }

  const novos: AssetVisual[] = [...guardadasParaVerificar];

  /*
   * 2.5. Os bancos de imagem oficiais (06/10/2026), antes do Commons.
   *
   * Pessoa e instituição pública: Agência Brasil, Câmara, Senado e Planalto
   * para a política brasileira, a Casa Branca e os órgãos federais para a
   * americana. As fotos entram na MESMA fila do Commons e da fonte oficial,
   * pontuadas pela mesma régua; o que muda é a ordem de conferência, mais
   * abaixo (`oficiaisPrimeiro`): a foto do banco que a legenda prova ser da
   * pessoa, e mais recente, é aberta antes.
   *
   * Falha de banco nunca derruba a pauta: vira nota, e o Commons segue.
   */
  const bancos = bancosDaResolucao(opcoes);
  if (bancos && entidadeElegivel(entidade)) {
    try {
      const busca = await buscarNosBancosOficiais(
        entidade,
        { atores: pauta.classificacao.atores, pais: pauta.classificacao.pais },
        { env, fetcher: opcoes.fetcher, bancos },
      );
      novos.push(...busca.assets);
      recusados.push(...busca.recusados);
      fontesConsultadas.push({ fonte: "banco_oficial", encontrados: busca.assets.length, nota: busca.notas.join(" ; ") });
    } catch (erro) {
      fontesConsultadas.push({ fonte: "banco_oficial", encontrados: 0, nota: `falhou: ${(erro as Error).message}` });
    }
  }

  // 3. Wikimedia Commons.
  if (entidade.tipo !== "conceptual") {
    try {
      const busca = await buscarNoCommons(entidade, { env, fetcher: opcoes.fetcher });
      fontesConsultadas.push({
        fonte: "wikimedia_commons",
        encontrados: busca.candidatos.length,
        nota: busca.caminhos.join(" ; "),
      });

      for (const candidato of busca.candidatos) {
        const conversao = candidatoParaAsset(candidato, entidade, env);
        if (!conversao.ok) {
          recusados.push({
            origem: "wikimedia_commons",
            identificacao: candidato.arquivo,
            motivo: conversao.motivo.includes("licença")
              ? MOTIVOS_DE_RECUSA.LICENCA_DESCONHECIDA
              : MOTIVOS_DE_RECUSA.FONTE_NAO_PERMITIDA,
            detalhe: conversao.motivo,
          });
          continue;
        }

        const asset = conversao.asset;
        if (entidade.imagemPrincipal && candidato.arquivo.endsWith(entidade.imagemPrincipal)) {
          asset.metadata = { ...asset.metadata, origem_declarada: true };
        }
        novos.push(asset);
      }
    } catch (erro) {
      fontesConsultadas.push({
        fonte: "wikimedia_commons",
        encontrados: 0,
        nota: `falhou: ${(erro as Error).message}`,
      });
    }
  }

  /*
   * 4. Fonte oficial e press kit.
   *
   * A condição era `novos.length === 0`, e ela é a causa provável da foto
   * genérica que o dono apontou em 16/09/2026. Bastava o Commons devolver UM
   * candidato convertido, ainda que ele fosse recusado depois na pontuação por
   * relevância, resolução ou datação, para o site oficial nunca ser consultado.
   * O resolvedor terminava com um único candidato ruim na mão e devolvia
   * NO_VALID_IMAGE, como se não houvesse foto no mundo.
   *
   * Agora as duas fontes são SOMADAS antes de pontuar: quem escolhe é a nota,
   * e não a ordem de chegada. O banco conceitual continua atrás de todas, e
   * continua sendo o último recurso, porque ele é metáfora e não fato.
   */
  if (entidade.tipo !== "conceptual") {
    const oficial = await buscarEmFonteOficial(entidade, { env, fetcher: opcoes.fetcher, comPressKit: true });
    fontesConsultadas.push({
      fonte: "fonte_oficial",
      encontrados: oficial.assets.length,
      nota: oficial.notas.join(" ; ") || "sem site oficial declarado",
    });
    novos.push(...oficial.assets);
  }

  /*
   * 5. Openverse: um endpoint, cinco acervos.
   *
   * Entra ao lado do Commons e da fonte oficial, e não depois: ele indexa
   * Flickr, Wikimedia, Europeana, Smithsonian e NASA, e é onde mora a foto que
   * o Commons não tem. Quem decide continua sendo a nota.
   *
   * Falha dele não derruba a resolução: o índice é de terceiro, tem limite
   * anônimo de 200 buscas por dia, e um dia sem ele é um dia com as fontes de
   * sempre.
   */
  if (entidade.tipo !== "conceptual") {
    try {
      const busca = await buscarNoOpenverse(entidade, { env, fetcher: opcoes.fetcher });
      let convertidos = 0;

      for (const candidato of busca.candidatos) {
        const conversao = candidatoDoOpenverse(candidato, entidade, env);
        if (!conversao.ok) {
          recusados.push({
            origem: "openverse",
            identificacao: candidato.id,
            motivo: MOTIVOS_DE_RECUSA.LICENCA_DESCONHECIDA,
            detalhe: conversao.motivo,
          });
          continue;
        }
        novos.push(conversao.asset);
        convertidos += 1;
      }

      fontesConsultadas.push({
        fonte: "openverse",
        encontrados: convertidos,
        nota: busca.caminhos.join(" ; "),
      });
    } catch (erro) {
      fontesConsultadas.push({
        fonte: "openverse",
        encontrados: 0,
        nota: `falhou: ${(erro as Error).message}`,
      });
    }
  }

  /*
   * 6. As fontes de FATO decidem primeiro, e sozinhas.
   *
   * Até 06/10/2026 o banco conceitual entrava aqui misturado com as fontes de
   * fato, pontuado contra a ENTIDADE nomeada. Uma foto de banco nunca tem o
   * nome do Fed no arquivo, então somava 33 pontos (qualidade, proporção,
   * licença e origem) contra o piso de 45, e caía como LOW_RELEVANCE sem
   * ninguém abrir a imagem. E quando a foto do órgão passava na pontuação e a
   * conferência visual a recusava, o banco nem era consultado. Nos dois casos a
   * pauta com entidade morria em NO_VALID_IMAGE, enquanto a pauta SEM entidade
   * ganhava a foto da cena. Foi isso que fez o catálogo do evergreen tirar a
   * entidade de credit score, 401(k), aluguel e Artemis.
   *
   * Agora são duas etapas. Esta é a da entidade, com a régua de sempre. A
   * seguinte é a da cena, que só roda quando esta não entregou foto aprovada.
   */
  /*
   * 5.5. O PROTAGONISTA da manchete decide sozinho, e não desce para a cena
   * (06/10/2026, "imagem certeira"). Ver `fotoDoProtagonista`.
   */
  if (estrito) {
    const r = await fotoDoProtagonista({
      pauta,
      entidade,
      candidatas: novos.filter((a) => !usadosAgora.has(a.imageUrl) && !jaSaiu(a.imageUrl)),
      piso,
      config,
      bancos,
      conferir,
      env,
      opcoes,
      recusados,
      fontesConsultadas,
      livre: (url) => !usadosAgora.has(url) && !jaSaiu(url),
    });
    if (r) {
      usadosAgora.add(r.asset.imageUrl);
      const aprovado = aprovar({ ...r.asset, metadata: { ...r.asset.metadata, verificacao: r.verificacao } });
      return aprovado;
    }
    /*
     * A manchete nomeia mais alguém: a vez passa para ele, com a mesma régua.
     * As notas desta tentativa vão junto, para o relatório dizer por que o
     * primeiro nome ficou sem foto.
     */
    if (protagonista.nomeNaManchete && (protagonista.restantes ?? 0) > 0) {
      const seguinte = await resolveVisualAsset(pauta, {
        ...opcoes,
        jaUsadosNestaEdicao: usadosAgora,
        protagonistasExcluidos: [...(opcoes.protagonistasExcluidos ?? []), protagonista.nomeNaManchete],
      });
      return {
        ...seguinte,
        fontesConsultadas: [
          ...fontesConsultadas.filter((f) => f.fonte !== "ultimo_recurso"),
          { fonte: "biblioteca_interna", encontrados: 0, nota: `${entidade.nome} sem foto verificada; a vez passa ao nome seguinte da manchete` },
          ...seguinte.fontesConsultadas,
        ],
        recusados: [...recusados, ...seguinte.recusados],
      };
    }
    return {
      ...semFotoDaPauta(entidade, MOTIVOS_DE_RECUSA.FOTO_DO_PROTAGONISTA_NAO_VERIFICADA),
      protagonista: { nome: entidade.nome, tipo: entidade.tipo, qid: entidade.qid },
    };
  }

  const disponiveisDeFato = novos.filter((a) => !usadosAgora.has(a.imageUrl) && !jaSaiu(a.imageUrl));
  const desta = [] as CandidatoRecusado[];
  const { aprovadas: pontuadasDeFato } = melhorPontuado(disponiveisDeFato, entidade, piso, desta, config.larguraMinima, {
    titulo: pauta.titulo,
    resumo: pauta.resumo,
    atores: pauta.classificacao.atores,
  });
  /*
   * Com os bancos oficiais, a foto do banco cuja legenda nomeia a entidade é
   * conferida primeiro, da mais recente para a mais antiga. Sem eles, a ordem
   * é a da nota, como sempre foi.
   */
  const aprovadasDeFato = bancos ? oficiaisPrimeiro(pontuadasDeFato) : pontuadasDeFato;

  /*
   * 6.1. Alguém abre a imagem antes de ela virar peça.
   *
   * Até aqui nenhuma barreira olhou a foto: todas comparam texto com texto. É o
   * que deixou passar, em 17/09/2026, a Escola Superior de Economia de Perm, na
   * Rússia, numa pauta sobre o programa PERM do Departamento do Trabalho
   * americano, com `semanticContextFit` 100.
   *
   * Por isso a escolha virou LAÇO e não carimbo: a primeira colocada é
   * conferida, e se reprovar a vez passa para a seguinte. A recusa é barata,
   * porque existe a bandeira como reserva; a aprovação errada é cara, porque o
   * perfil publica sozinho.
   */
  const escolhidoDeFato = await primeiraAprovada(
    aprovadasDeFato.map((x) => x.item),
    conferir,
    pauta,
    desta,
    TETO_DE_CONFERENCIAS,
  );
  const vice = escolhidoDeFato
    ? await primeiraAprovada(
        escolherVice(aprovadasDeFato, escolhidoDeFato).map((x) => x.item),
        conferir,
        pauta,
        desta,
        TETO_DE_CONFERENCIAS_DA_BOLHA,
        "bolha",
      )
    : null;

  /*
   * Recusas sem duplicata.
   *
   * O mesmo arquivo pode chegar por duas fontes (Commons e Openverse) e ser
   * recusado duas vezes pelo mesmo motivo. Relatório que conta duas vezes a
   * mesma coisa é relatório que ninguém confere.
   */
  const anotarRecusas = (lista: CandidatoRecusado[]) => {
    for (const r of lista) {
      if (!recusados.some((x) => x.identificacao === r.identificacao && x.motivo === r.motivo)) recusados.push(r);
    }
  };
  anotarRecusas(desta);

  if (escolhidoDeFato) {
    usadosAgora.add(escolhidoDeFato.imageUrl);

    // 7. Guardar na biblioteca. Só o que foi efetivamente escolhido.
    if (biblioteca && !opcoes.somenteLeitura) {
      try {
        const guardado = await biblioteca.guardar(escolhidoDeFato);
        if (guardado?.id) {
          await biblioteca.registrarUso(guardado.id);
          return aprovar(escolhidoDeFato, guardado.id, vice);
        }
      } catch (erro) {
        fontesConsultadas.push({
          fonte: "biblioteca_interna",
          encontrados: 0,
          nota: `não foi possível guardar: ${(erro as Error).message}`,
        });
      }
    }

    return aprovar(escolhidoDeFato, undefined, vice);
  }

  // A manchete da peça conta junto com a da fonte (06/10/2026): o post "Bret Taylor: ..." veio de "Meta joins...".
  if (ehPessoa(entidade.tipo) && pessoaNaManchete(entidade, `${pauta.manchete ?? ""} ${pauta.titulo}`)) {
    /*
     * Pessoa continua sem cena no lugar, e isso não mudou com a etapa da cena.
     *
     * Foto conceitual no lugar de uma pessoa é a mentira mais fácil de cometer
     * (`TIPOS_DE_PESSOA`, em `tipos.ts`): a matéria sobre um político ilustrada
     * com o prédio onde ele trabalha sugere que o prédio é o assunto.
     *
     * ATUALIZADO em 06/10/2026: a regra vale para a pauta SOBRE a pessoa, e a
     * prova disso é a manchete nomeá-la. No replay de 60 pautas reais, as
     * únicas que ainda ficavam sem foto eram de pessoa que a manchete não cita
     * ("EUA flexibilizam normas sobre economia de combustível", com Trump
     * entre os atores): a conferência recusava a foto dele porque ele não está
     * na manchete, e a regra recusava a cena porque ele era a entidade. Quando
     * a manchete não nomeia a pessoa, a pauta é sobre o fato, e o fato tem cena.
     */
    fontesConsultadas.push({
      fonte: "banco_conceitual",
      encontrados: 0,
      nota: "bloqueado por regra: pauta sobre pessoa não aceita foto conceitual no lugar",
    });
    return semFotoDaPauta(
      entidade,
      aprovadasDeFato.length > 0 ? MOTIVOS_DE_RECUSA.RELEVANCIA_BAIXA : MOTIVOS_DE_RECUSA.SEM_IMAGEM_DA_ENTIDADE,
    );
  }

  /*
   * 8. A CENA, para a pauta sem entidade e, desde 06/10/2026, para a pauta cuja
   * entidade não deu foto.
   *
   * Pedido do dono depois das amostras do evergreen: o órgão citado (o Fed, o
   * IRS) não pode ser motivo de a pauta morrer sem foto quando a mesma pauta,
   * sem o nome do órgão, ganharia a foto da cena. As barreiras são as mesmas
   * da pauta sem entidade, sem desconto nenhum: a cena descrita pelo conteúdo
   * (sem pessoa identificável e sem texto, na instrução e no filtro), o acervo
   * pela tag com a régua de país, e a conferência visual abrindo a imagem.
   *
   * A pontuação desta etapa é contra a ENTIDADE CONCEITUAL da pauta, e não
   * contra o órgão: a foto da cena não tem o nome do Fed, e cobrar isso dela é
   * exatamente o defeito que esta etapa corrige. O resultado continua dizendo
   * qual é a entidade da pauta, porque é ela que a bolha procura.
   */
  const depoisDaEntidade = entidade.tipo !== "conceptual";
  const entidadeDaCena = depoisDaEntidade
    ? entidadeConceitual(pauta.classificacao.acontecimento, pauta.categoria)
    : entidade;
  const caminhoDaCena: CaminhoDaFoto = depoisDaEntidade ? "cena_depois_da_entidade" : "cena";
  if (depoisDaEntidade) {
    const motivoDaEntidade =
      aprovadasDeFato.length > 0
        ? `${Math.min(aprovadasDeFato.length, TETO_DE_CONFERENCIAS)} foto(s) da entidade reprovada(s) na conferência visual`
        : "nenhuma foto da entidade passou na pontuação";
    fontesConsultadas.push({
      fonte: "banco_conceitual",
      encontrados: 0,
      nota: `fallback de cena: ${entidade.nome} sem foto aprovada (${motivoDaEntidade}); a pauta segue pela cena`,
    });
  }

  const aprovarDaCena = (asset: AssetVisual, degrau: DegrauDaCena): ResultadoVisual => {
    const r = aprovar(asset, undefined, null);
    return {
      ...r,
      asset: {
        ...r.asset!,
        entityConfidence: entidadeDaCena.confianca,
        entityEvidence: entidadeDaCena.evidencias,
        metadata: { ...r.asset!.metadata, degrau, ...(depoisDaEntidade ? { fallback_de_cena: true } : {}) },
      },
      caminho: caminhoDaCena,
      degrau,
    };
  };

  let cenaPerguntada: CenaDaPauta | null = null;

  /*
   * 8.1. O acervo próprio, pela CENA (decisão de 29/09/2026).
   *
   * Chega aqui a pauta sem entidade, ou com entidade que falhou no acervo E
   * nas fontes externas: é exatamente a ordem da decisão, em que a cena só
   * é consultada depois de a entidade falhar nos dois lados.
   *
   * A pergunta da cena é feita AQUI quando há acervo, antes do teste de
   * chave do banco de terceiro: o acervo não depende do Pexels, e sem esta
   * antecipação um deploy sem `PEXELS_API_KEY` nunca consultaria o nosso.
   * A mesma resposta é reaproveitada lá embaixo, então a pergunta continua
   * sendo UMA por pauta.
   */
  if (acervo && conferir) {
    cenaPerguntada = await cenaDaPauta(
      {
        titulo: pauta.titulo,
        resumo: pauta.resumo,
        categoria: pauta.categoria,
        pais: pauta.classificacao.pais,
      },
      { env, fetcher: opcoes.fetcher, comTag: true, recusasDoEditor: opcoes.recusasDoEditor },
    );
    const pais = paisDoAcervo(pauta.classificacao.pais);
    if (!cenaPerguntada.tag) {
      fontesConsultadas.push({
        fonte: "acervo_proprio",
        encontrados: 0,
        // `undefined` é "a chamada nem voltou"; `null` é "voltou sem cena no cardápio".
        nota: cenaPerguntada.tag === undefined
          ? `sem tag de cena: ${cenaPerguntada.motivo}`
          : "o modelo não achou cena do cardápio para esta pauta",
      });
    } else {
      try {
        const candidatas = await acervo.porTag(cenaPerguntada.tag, pais);
        const doAcervo = await daPrateleira(candidatas, "cena", cenaPerguntada.tag, pais);
        if (doAcervo) return { ...doAcervo, caminho: caminhoDaCena, degrau: "acervo" };
      } catch (erro) {
        fontesConsultadas.push({
          fonte: "acervo_proprio",
          encontrados: 0,
          nota: `acervo indisponível: ${(erro as Error).message}`,
        });
      }
    }
  } else if (acervo) {
    fontesConsultadas.push({
      fonte: "acervo_proprio",
      encontrados: 0,
      nota: "cena não perguntada: chamadas de modelo desligadas, e sem a tag não há busca por cena",
    });
  }

  if (!bancoConfigurado(env)) {
    fontesConsultadas.push({ fonte: "banco_conceitual", encontrados: 0, nota: "sem chave configurada" });
    return semFotoDaPauta(entidade, MOTIVOS_DE_RECUSA.SEM_IMAGEM_VALIDA);
  }

  /*
   * 8.2. A ESCADA da cena (06/10/2026).
   *
   * Pedido do dono, com estas palavras: "o ideal é que nunca haja falha de
   * imagem; sempre tem que ter foto de contexto". Até aqui a cena era UMA
   * busca de três fotos, feitas em três chamadas iguais ao banco, e a pauta
   * morria quando a conferência recusava as três. Medido no catálogo do
   * evergreen: todas as pautas que ficaram sem foto tinham exatamente três
   * candidatas recusadas, e nenhum outro lugar onde procurar.
   *
   * Agora a cena desce degraus, do mais específico para o mais largo, e para
   * no primeiro que entrega foto aprovada:
   *
   *   cena        a busca que descreve o objeto da pauta
   *   cena_ampla  o ambiente do mesmo assunto, mais o tema fixo, e o Openverse
   *   editoria    o contexto da editoria (o Capitólio para política, servidores
   *               para tecnologia), que serve a qualquer pauta dela
   *   reuso       os mesmos pedidos, aceitando foto que saiu nos últimos 30
   *               dias; nunca a que saiu hoje
   *
   * As regras duras NÃO descem com a escada. Toda candidata passa pela mesma
   * pontuação e pela conferência visual, que abre a imagem e recusa pessoa
   * identificável, texto como assunto, outro país e logotipo de terceiro. O
   * que muda é a pergunta: a conferência sabe que a foto é de CONTEXTO
   * (`papel: "cena"`), e "é genérica" ou "não mostra o órgão" deixam de ser
   * motivo de recusa, porque não é isso que se pede a uma foto de contexto.
   */
  /*
   * A consulta conceitual descreve coisa, não gente.
   *
   * Foto de pessoa anônima não tem como ser verificada: escolher alguém
   * para ilustrar "brasileiros nos EUA" é decidir quem parece brasileiro,
   * e isso é inferir nacionalidade por aparência. O caminho não é acertar
   * melhor, é não fazer.
   */
  /*
   * Primeiro perguntar o que fotografar, e só depois cair no tema fixo.
   *
   * O tema fixo é uma lista de 16 gavetas casadas por radical de palavra,
   * na ordem, primeiro que casar vence. Ela erra de três jeitos medidos em
   * 18/09/2026: radical que não cobre a flexão ("imovel" não casa com
   * "imóveis"), tema anterior que rouba o assunto ("economia" levando uma
   * pauta de aluguel para notas de dólar) e assunto que não tem gaveta
   * nenhuma, caindo no skyline genérico.
   *
   * A pergunta olha a matéria. A lista continua embaixo, como rede: quando
   * a chamada falha, o comportamento é o de antes, e não o vazio.
   */
  /*
   * O mesmo interruptor das duas chamadas de modelo deste módulo.
   *
   * `conferenciaVisual: false` desliga a conferência, e o comentário do
   * tipo diz para que serve: dry-run e medição de capacidade, que rodam
   * sobre dezenas de pautas reais e não devem gastar chamada cobrada.
   * A pergunta da cena nasceu sem interruptor, e o `dry-run-imagens` roda
   * sobre até 40 pautas: seriam 40 chamadas a mais, invisíveis, num script
   * feito justamente para medir sem custo.
   *
   * Reusar o interruptor que existe é melhor que inventar o segundo: quem
   * desliga as chamadas de modelo do visual desliga as duas, e não fica
   * uma ligada por descuido.
   */
  const cena = cenaPerguntada
    ? cenaPerguntada
    : conferir
    ? await cenaDaPauta(
        {
          titulo: pauta.titulo,
          resumo: pauta.resumo,
          categoria: pauta.categoria,
          pais: pauta.classificacao.pais,
        },
        { env, fetcher: opcoes.fetcher, recusasDoEditor: opcoes.recusasDoEditor },
      )
    : { consulta: "", objeto: "", falhou: true, motivo: "chamadas de modelo desligadas", custoUsd: 0 };
  const temaFixo = consultaConceitual(pauta.titulo, pauta.categoria, pauta.classificacao.pais);
  const especifica = cena.falhou ? temaFixo : cena.consulta;
  const contextoDaEditoria = contextoDaEditoriaPara(pauta.categoria, pauta.classificacao.pais);

  /*
   * O lugar do governo, nos bancos oficiais (06/10/2026), no degrau da
   * editoria: a fachada do Congresso para a política brasileira, a Casa
   * Branca para a americana. Só com os bancos ligados e só em pauta de
   * governo; a conferência continua recusando o plenário cheio de rostos.
   */
  const cenaDeGoverno = bancos ? cenaDeGovernoPara(pauta.categoria, pauta.classificacao.pais) : null;

  const degraus: Array<{
    degrau: DegrauDaCena;
    consultas: string[];
    openverse?: string;
    reuso?: boolean;
    oficial?: { consulta: string; pais: PaisDoBanco } | null;
  }> = [
    { degrau: "cena", consultas: [especifica] },
    {
      degrau: "cena_ampla",
      consultas: [cena.falhou ? "" : (cena.consultaAmpla ?? ""), cena.falhou ? "" : temaFixo],
      openverse: (!cena.falhou && cena.consultaAmpla) || especifica,
    },
    { degrau: "editoria", consultas: [contextoDaEditoria], oficial: cenaDeGoverno },
    { degrau: "reuso", consultas: [especifica, contextoDaEditoria], reuso: true },
  ];

  const pedidas = new Set<string>();
  const vistas = new Set<string>();
  const recusasDaCena = [] as CandidatoRecusado[];
  let conferidasNaEscada = 0;

  for (const passo of degraus) {
    if (conferidasNaEscada >= TETO_DE_CONFERENCIAS_DA_ESCADA) break;
    const daCena: AssetVisual[] = [];
    const notas: string[] = [];

    for (const consulta of passo.consultas) {
      const chave = `${passo.reuso ? "reuso:" : ""}${consulta.trim().toLowerCase()}`;
      if (!consulta.trim() || pedidas.has(chave)) continue;
      pedidas.add(chave);
      try {
        /*
         * No degrau de reuso, a régua de 30 dias sai e só a do dia fica: a
         * foto que saiu hoje em outra pauta continua proibida, a que saiu na
         * semana passada passa a valer. É o último degrau de propósito:
         * repetir foto é melhor que pauta sem foto, e pior que foto nova.
         */
        const evitar = passo.reuso ? [...usadosAgora, ...vistas] : [...usadasAntes, ...usadosAgora, ...vistas];
        const fotos = await buscarFotosDeBanco(consulta, CANDIDATAS_DO_BANCO, { env, fetcher: opcoes.fetcher, evitar });
        notas.push(`"${consulta}": ${fotos.length}`);
        for (const foto of fotos) daCena.push(assetDoBanco(foto, entidadeDaCena, env));
      } catch (erro) {
        notas.push(`"${consulta}": falhou (${(erro as Error).message})`);
      }
    }

    if (passo.openverse) {
      try {
        const busca = await buscarNoOpenverse({ ...entidadeDaCena, nome: passo.openverse }, { env, fetcher: opcoes.fetcher });
        let convertidos = 0;
        for (const c of busca.candidatos) {
          const conversao = candidatoDoOpenverse(c, entidadeDaCena, env);
          if (!conversao.ok) continue;
          daCena.push({ ...conversao.asset, entityType: "conceptual", imageContextType: "conceptual" });
          convertidos += 1;
        }
        notas.push(`openverse "${passo.openverse}": ${convertidos}`);
      } catch (erro) {
        notas.push(`openverse falhou: ${(erro as Error).message}`);
      }
    }

    if (passo.oficial && bancos) {
      try {
        const busca = await buscarCenaNosBancosOficiais(passo.oficial.consulta, passo.oficial.pais, entidadeDaCena, {
          env,
          fetcher: opcoes.fetcher,
          bancos,
        });
        daCena.push(...busca.assets);
        notas.push(`bancos oficiais: ${busca.notas.join(", ") || "nenhum do país"}`);
      } catch (erro) {
        notas.push(`bancos oficiais falharam: ${(erro as Error).message}`);
      }
    }

    /*
     * Duas memórias, e as duas cortam aqui.
     *
     * `usadosAgora` impede a mesma foto em duas pautas do mesmo dia. `jaSaiu`
     * impede a mesma foto em dias diferentes, que é o caso que o banco
     * conceitual produzia sozinho, e só o degrau de reuso a dispensa.
     */
    const disponiveis = daCena.filter((a) => {
      const id = identidadeDaFoto(a.imageUrl);
      if (!id || vistas.has(id) || usadosAgora.has(a.imageUrl)) return false;
      if (!passo.reuso && jaSaiu(a.imageUrl)) return false;
      vistas.add(id);
      return true;
    });

    fontesConsultadas.push({
      fonte: "banco_conceitual",
      encontrados: disponiveis.length,
      nota:
        `${depoisDaEntidade ? "fallback de cena, " : ""}degrau ${passo.degrau}: ${notas.join(" ; ") || "nada a pedir"}` +
        (passo.degrau === "cena"
          ? cena.falhou
            ? ` (tema fixo: a cena não veio, ${cena.motivo})`
            : ` (cena da pauta "${cena.objeto}", custo ${cena.custoUsd.toFixed(5)} USD)`
          : ""),
    });

    const { aprovadas } = melhorPontuado(
      disponiveis,
      entidadeDaCena,
      pisoDeRelevancia(entidadeDaCena, config),
      recusasDaCena,
      config.larguraMinima,
      { titulo: pauta.titulo, resumo: pauta.resumo, atores: pauta.classificacao.atores },
    );
    const teto = Math.min(TETO_DE_CONFERENCIAS, TETO_DE_CONFERENCIAS_DA_ESCADA - conferidasNaEscada);
    conferidasNaEscada += conferir ? Math.min(aprovadas.length, teto) : 0;
    const escolhido = await primeiraAprovada(
      aprovadas.map((x) => x.item),
      conferir,
      pauta,
      recusasDaCena,
      teto,
      "fundo",
      "cena",
    );

    if (escolhido) {
      anotarRecusas(recusasDaCena);
      usadosAgora.add(escolhido.imageUrl);
      // Foto de banco não vai para a biblioteca: ela indexa por entidade, e esta foto é de conceito.
      return aprovarDaCena(escolhido, passo.degrau);
    }
  }

  anotarRecusas(recusasDaCena);
  return semFotoDaPauta(
    entidade,
    recusados.length > 0 ? MOTIVOS_DE_RECUSA.RELEVANCIA_BAIXA : MOTIVOS_DE_RECUSA.SEM_IMAGEM_DA_ENTIDADE
  );
}

/** Quantas candidatas cada degrau da verificação do protagonista abre. */
const TETO_DA_VERIFICACAO = 4;
/** Quantos representantes (CEO, fundador) são tentados antes de desistir. */
const TETO_DE_REPRESENTANTES = 2;

type EntradaDoProtagonista = {
  pauta: PautaParaImagem;
  entidade: EntidadeVisual;
  candidatas: AssetVisual[];
  piso: number;
  config: ReturnType<typeof carregarConfigDeImagem>;
  bancos: DefinicaoDoBanco[] | null;
  conferir: Conferente | null;
  env: Record<string, string | undefined>;
  opcoes: OpcoesDeResolucao;
  recusados: CandidatoRecusado[];
  fontesConsultadas: ResultadoVisual["fontesConsultadas"];
  livre: (url: string) => boolean;
};

type FotoVerificada = { asset: AssetVisual; verificacao: VerificacaoDoProtagonista };

/** O retrato de referência de uma pessoa: o P18 do Wikidata, pelo endereço que o modelo consegue abrir. */
async function retratoDeReferencia(
  arquivo: string | null,
  candidatas: AssetVisual[],
  env: Record<string, string | undefined>,
  fetcher?: typeof fetch,
): Promise<{ arquivo: string; url: string } | null> {
  if (!arquivo) return null;
  const jaVeio = candidatas.find((c) => c.source === "wikimedia_commons" && c.sourceAssetId.endsWith(arquivo));
  if (jaVeio) return { arquivo, url: jaVeio.imageUrl };
  try {
    const c = await arquivoDoCommons(arquivo, { env, fetcher, tempoLimiteMs: 12_000 });
    return c ? { arquivo, url: c.imageUrl } : null;
  } catch {
    return null;
  }
}

/** A candidata é o próprio retrato de referência (o P18)? Então a identidade é a da fonte. */
function ehOProprioRetrato(c: AssetVisual, arquivo: string | null): boolean {
  return Boolean(arquivo && c.source === "wikimedia_commons" && c.sourceAssetId.replace(/^File:/i, "") === arquivo.replace(/^File:/i, ""));
}

/**
 * A primeira foto DA PESSOA, com a identidade provada.
 *
 * Três provas aceitas, nesta ordem de força:
 *
 *   1. a candidata É o retrato que o Wikidata declara para a pessoa (P18);
 *   2. a candidata foi comparada com esse retrato pelo modelo, que respondeu
 *      "mesma pessoa, em destaque" com confiança de 85 ou mais;
 *   3. sem retrato de referência, a foto de banco oficial cuja legenda põe a
 *      pessoa como PROTAGONISTA (`protagonistaDaLegenda`, que já filtrou a fila).
 *
 * Toda candidata passa também pela conferência de sempre, que recusa outro
 * país, texto dominando, logotipo de terceiro. Na dúvida, não.
 */
async function pessoaVerificada(
  e: EntradaDoProtagonista,
  pessoa: { nome: string; qid: string | null; imagemPrincipal: string | null },
  fila: AssetVisual[],
  tipo: "identidade" | "representante",
  representante: VerificacaoDoProtagonista["representante"],
): Promise<FotoVerificada | null> {
  /*
   * A referência é o P18. Sem ele, a foto de banco oficial cuja legenda põe a
   * pessoa como protagonista (a fila já foi filtrada por
   * `protagonistaDaLegenda`): é a outra fonte confiável que o dono aceitou.
   */
  const p18 = await retratoDeReferencia(pessoa.imagemPrincipal, fila, e.env, e.opcoes.fetcher);
  const doBanco = p18 ? null : (fila.find((c) => c.source === "banco_oficial") ?? null);
  const ref = p18 ?? (doBanco ? { arquivo: "", url: doBanco.imageUrl } : null);
  e.fontesConsultadas.push({
    fonte: "wikimedia_commons",
    encontrados: ref ? 1 : 0,
    nota: p18
      ? `retrato de referência de ${pessoa.nome}: P18 "${p18.arquivo}"`
      : doBanco
        ? `${pessoa.nome} sem P18: a referência é a foto de banco oficial cuja legenda o põe como protagonista (${doBanco.sourceAssetId})`
        : `${pessoa.nome} sem retrato de referência (nem P18 nem banco oficial): nenhuma foto pode ter a identidade conferida`,
  });

  let abertas = 0;
  for (const c of fila) {
    if (abertas >= TETO_DA_VERIFICACAO) break;
    const proprio = ehOProprioRetrato(c, p18?.arquivo ?? null) || c === doBanco;
    const pelaLegenda = c === doBanco;
    if (!proprio && !ref) {
      e.recusados.push({
        origem: c.source,
        identificacao: c.sourceAssetId,
        motivo: MOTIVOS_DE_RECUSA.IDENTIDADE_NAO_CONFERIDA,
        detalhe: `sem retrato de referência de ${pessoa.nome} para comparar`,
      });
      continue;
    }
    abertas += 1;
    if (!e.conferir) {
      // Sem conferente (ensaio sem chamada de modelo): a primeira da fila, como no resto do resolvedor.
      return {
        asset: c,
        verificacao: {
          regra: "protagonista_da_manchete",
          protagonista: e.entidade.nome,
          qid: e.entidade.qid,
          tipo,
          como: "NÃO CONFERIDA: ensaio sem conferência visual",
          referencia: ref?.url ?? null,
          representante,
        },
      };
    }

    let como: string;
    let veredicto: VeredictoVisual | null = null;
    if (pelaLegenda) {
      como = `banco oficial: a legenda põe ${pessoa.nome} como protagonista da foto (sem P18 para comparar)`;
    } else if (proprio) {
      como = `é o retrato que o Wikidata declara para ${pessoa.nome} (P18${pessoa.qid ? ` de ${pessoa.qid}` : ""})`;
    } else if (ref) {
      veredicto = await e.conferir(c, {
        titulo: e.pauta.manchete || e.pauta.titulo,
        resumo: e.pauta.resumo,
        eixo: e.pauta.categoria,
        papel: "identidade",
        referencia: { nome: pessoa.nome, url: ref.url },
      });
      if (!veredicto.aprovada) {
        e.recusados.push({
          origem: c.source,
          identificacao: c.sourceAssetId,
          motivo: veredicto.falhou ? MOTIVOS_DE_RECUSA.CONFERENCIA_VISUAL_INDISPONIVEL : MOTIVOS_DE_RECUSA.IDENTIDADE_NAO_CONFERIDA,
          detalhe: veredicto.descricao ? `viu "${veredicto.descricao}": ${veredicto.motivo}` : veredicto.motivo,
        });
        continue;
      }
      como =
        `comparada com o retrato de referência de ${pessoa.nome} (${p18 ? "P18" : "banco oficial"}): ` +
        `mesma pessoa, em destaque, confiança ${veredicto.confianca}`;
    } else {
      continue;
    }

    /*
     * A conferência de sempre, para as recusas duras (outro país, texto,
     * logotipo de terceiro). Para o representante ela não roda: a pergunta
     * dela recusa "pessoa identificável que a manchete não cita", e o CEO não
     * está na manchete por definição; a da identidade já recusa montagem,
     * texto dominando e baixa qualidade.
     */
    if (tipo === "identidade") {
      /*
       * A conferência de sempre recusa "pessoa identificável que a manchete não
       * cita", e ela não sabe quem é o rosto: no ensaio de 06/10/2026 ela
       * recusou o retrato P18 do Bret Taylor numa manchete que abre com "Bret
       * Taylor:". Ela recebe o que já foi provado, e segue julgando o resto.
       */
      const provado = `IDENTIDADE JÁ CONFERIDA: a pessoa em destaque na foto é ${pessoa.nome}, que a manchete nomeia (${
        proprio ? "retrato declarado no Wikidata" : pelaLegenda ? "legenda do banco oficial" : "comparada com o retrato de referência"
      }). Não recuse por ser pessoa identificável; julgue o resto.`;
      const geral = await e.conferir(c, {
        titulo: e.pauta.manchete || e.pauta.titulo,
        resumo: [provado, e.pauta.resumo ?? ""].filter(Boolean).join("\n"),
        eixo: e.pauta.categoria,
      });
      if (!geral.aprovada) {
        e.recusados.push({
          origem: c.source,
          identificacao: c.sourceAssetId,
          motivo: geral.falhou ? MOTIVOS_DE_RECUSA.CONFERENCIA_VISUAL_INDISPONIVEL : MOTIVOS_DE_RECUSA.CONFERENCIA_VISUAL_REPROVOU,
          detalhe: geral.descricao ? `viu "${geral.descricao}": ${geral.motivo}` : geral.motivo,
        });
        continue;
      }
      veredicto = veredicto ?? geral;
      c.conferenciaVisual = { descricao: geral.descricao, motivo: geral.motivo, paisAparente: geral.paisAparente, confianca: geral.confianca };
    } else if (veredicto) {
      c.conferenciaVisual = { descricao: veredicto.descricao, motivo: veredicto.motivo, paisAparente: null, confianca: veredicto.confianca };
    }

    return {
      asset: c,
      verificacao: {
        regra: "protagonista_da_manchete",
        protagonista: e.entidade.nome,
        qid: e.entidade.qid,
        tipo,
        como,
        referencia: ref?.url ?? null,
        representante,
        veredicto: veredicto
          ? { confianca: veredicto.confianca, descricao: veredicto.descricao, motivo: veredicto.motivo }
          : undefined,
      },
    };
  }
  return null;
}

/**
 * A foto do protagonista da manchete, verificada, ou nada (06/10/2026).
 *
 * PESSOA: a foto é dela, com a identidade provada (`pessoaVerificada`).
 *
 * ORGANIZAÇÃO, nesta ordem, e a ordem é do dono:
 *
 *   1. foto com a MARCA legível (a fachada da SpaceX com o nome na parede foi o
 *      exemplo aprovado na fila de 07/10/2026);
 *   2. o LOGOTIPO oficial (P154), no cartão neutro de `cartao-da-marca.ts`;
 *   3. quem a REPRESENTA: o CEO (P169), depois o fundador (P112), com a
 *      identidade provada.
 *
 * O representante vem por último de propósito. O dono reprovou duas vezes a
 * capa da Anduril com o fundador num palco: "não tem a marca Anduril e tem um
 * rapaz que não tem contexto nenhum! Enquanto não tiver a marca ou contexto ou
 * produto da marca, não será aprovado". Rosto sem marca só serve quando a
 * marca não tem foto nem logotipo publicável.
 *
 * Nada aqui desce para a cena. Sem foto verificada, `null`, e a pauta não vira
 * conteúdo.
 */
async function fotoDoProtagonista(e: EntradaDoProtagonista): Promise<FotoVerificada | null> {
  const { entidade, pauta } = e;
  const desta: CandidatoRecusado[] = [];
  const pontuar = (lista: AssetVisual[], alvo: EntidadeVisual) => {
    const { aprovadas } = melhorPontuado(lista, alvo, pisoDeRelevancia(alvo, e.config), desta, e.config.larguraMinima, {
      titulo: pauta.titulo,
      resumo: pauta.resumo,
      atores: pauta.classificacao.atores,
    });
    return (e.bancos ? oficiaisPrimeiro(aprovadas) : aprovadas).map((x) => x.item);
  };
  const fechar = <T>(r: T): T => {
    for (const x of desta) {
      if (!e.recusados.some((y) => y.identificacao === x.identificacao && y.motivo === x.motivo)) e.recusados.push(x);
    }
    return r;
  };

  if (ehPessoa(entidade.tipo)) {
    const fila = pontuar(e.candidatas, entidade);
    e.fontesConsultadas.push({
      fonte: "biblioteca_interna",
      encontrados: fila.length,
      nota: `protagonista ${entidade.nome} (pessoa): ${fila.length} foto(s) passaram na pontuação; a identidade é conferida uma a uma`,
    });
    return fechar(await pessoaVerificada(e, entidade, fila, "identidade", null));
  }

  // 1. Foto com a marca legível.
  const fila = pontuar(e.candidatas, entidade);
  let abertas = 0;
  for (const c of fila) {
    if (abertas >= TETO_DA_VERIFICACAO) break;
    abertas += 1;
    if (!e.conferir) {
      return fechar({
        asset: c,
        verificacao: { regra: "protagonista_da_manchete", protagonista: entidade.nome, qid: entidade.qid, tipo: "marca", como: "NÃO CONFERIDA: ensaio sem conferência visual" },
      });
    }
    const marca = await e.conferir(c, { titulo: pauta.manchete || pauta.titulo, eixo: pauta.categoria, papel: "marca", marca: { nome: entidade.nome, instituicao: entidade.tipo !== "company" } });
    if (!marca.aprovada) {
      desta.push({
        origem: c.source,
        identificacao: c.sourceAssetId,
        motivo: marca.falhou ? MOTIVOS_DE_RECUSA.CONFERENCIA_VISUAL_INDISPONIVEL : MOTIVOS_DE_RECUSA.MARCA_NAO_CONFERIDA,
        detalhe: marca.descricao ? `viu "${marca.descricao}": ${marca.motivo}` : marca.motivo,
      });
      continue;
    }
    const geral = await e.conferir(c, { titulo: pauta.manchete || pauta.titulo, resumo: pauta.resumo, eixo: pauta.categoria });
    if (!geral.aprovada) {
      desta.push({
        origem: c.source,
        identificacao: c.sourceAssetId,
        motivo: geral.falhou ? MOTIVOS_DE_RECUSA.CONFERENCIA_VISUAL_INDISPONIVEL : MOTIVOS_DE_RECUSA.CONFERENCIA_VISUAL_REPROVOU,
        detalhe: geral.descricao ? `viu "${geral.descricao}": ${geral.motivo}` : geral.motivo,
      });
      continue;
    }
    c.conferenciaVisual = { descricao: geral.descricao, motivo: geral.motivo, paisAparente: geral.paisAparente, confianca: geral.confianca };
    const lido = (marca as VeredictoVisual & { textoLido?: string }).textoLido;
    return fechar({
      asset: c,
      verificacao: {
        regra: "protagonista_da_manchete",
        protagonista: entidade.nome,
        qid: entidade.qid,
        tipo: "marca",
        como: `foto com a marca legível${lido ? `: leu "${lido}"` : ""}`,
        veredicto: { confianca: marca.confianca, descricao: marca.descricao, motivo: marca.motivo, ...(lido ? { textoLido: lido } : {}) },
      },
    });
  }
  e.fontesConsultadas.push({
    fonte: "biblioteca_interna",
    encontrados: fila.length,
    nota: `protagonista ${entidade.nome} (organização): ${Math.min(fila.length, TETO_DA_VERIFICACAO)} foto(s) abertas, nenhuma com a marca legível`,
  });

  const marca = entidade.qid ? await dadosDaMarca(entidade.qid, { env: e.env, fetcher: e.opcoes.fetcher }) : null;
  if (marca) e.fontesConsultadas.push({ fonte: "biblioteca_interna", encontrados: marca.representantes.length + (marca.logotipo ? 1 : 0), nota: marca.nota });

  // 2. O logotipo oficial, no cartão.
  if (marca?.logotipo) {
    const logo = await assetDoLogotipo(marca.logotipo, entidade, e);
    /*
     * O modelo confere o CARTÃO, e não o arquivo cru: o logotipo do Commons é
     * PNG com fundo transparente, e o da Anduril, claro sobre transparente,
     * chegava ao modelo como um quadrado vazio ("a marca não aparece"). O
     * cartão é composto aqui e vai como `data:`; é exatamente o que a rota
     * publica.
     */
    let cartao: string | null = null;
    try {
      const png = (await comporCartaoDaMarca(await baixarLogotipo(marca.logotipo, { env: e.env, fetcher: e.opcoes.fetcher }))).png;
      cartao = `data:image/png;base64,${png.toString("base64")}`;
    } catch (erro) {
      e.fontesConsultadas.push({ fonte: "wikimedia_commons", encontrados: 0, nota: `cartão do logotipo não composto: ${(erro as Error).message}` });
    }
    if (logo && cartao && e.livre(logo.imageUrl)) {
      const fonteDoLogotipo = { ...logo, imageUrl: cartao };
      const v = e.conferir
        ? await e.conferir(fonteDoLogotipo, { titulo: pauta.manchete || pauta.titulo, eixo: pauta.categoria, papel: "logotipo", marca: { nome: entidade.nome } })
        : null;
      if (!v || v.aprovada) {
        const lido = (v as (VeredictoVisual & { textoLido?: string }) | null)?.textoLido;
        return fechar({
          asset: logo,
          verificacao: {
            regra: "protagonista_da_manchete",
            protagonista: entidade.nome,
            qid: entidade.qid,
            tipo: "logotipo",
            como: v
              ? `logotipo oficial declarado no Wikidata (P154 "${marca.logotipo}")${lido ? `, e o modelo leu "${lido}"` : ""}`
              : "NÃO CONFERIDA: ensaio sem conferência visual",
            veredicto: v ? { confianca: v.confianca, descricao: v.descricao, motivo: v.motivo, ...(lido ? { textoLido: lido } : {}) } : undefined,
          },
        });
      }
      desta.push({
        origem: "wikimedia_commons",
        identificacao: `File:${marca.logotipo}`,
        motivo: v.falhou ? MOTIVOS_DE_RECUSA.CONFERENCIA_VISUAL_INDISPONIVEL : MOTIVOS_DE_RECUSA.MARCA_NAO_CONFERIDA,
        detalhe: v.motivo,
      });
    }
  }

  /*
   * 3. Quem representa a organização, com a identidade provada, e SÓ se o
   * público brasileiro reconhece o rosto (dono, 14/10/2026). O fundador da
   * Social Security era Franklin Roosevelt, e a matéria do reajuste de 2027
   * saiu com o retrato dele; Satya Nadella foi recusado pelo mesmo motivo.
   * Rosto que ninguém reconhece não conta a história: a pauta segue sem foto
   * (capa tipográfica no portal e na newsletter; no Instagram ela cai).
   */
  const reconheciveis = (marca?.representantes ?? []).filter((rep) => ehFamosoParaOPublico(rep.nome));
  for (const rep of reconheciveis.slice(0, TETO_DE_REPRESENTANTES)) {
    const doRepresentante = await fotosDoRepresentante(rep, e);
    const fila = pontuar(doRepresentante.candidatas, doRepresentante.entidade);
    const achada = await pessoaVerificada(e, { nome: rep.nome, qid: rep.qid, imagemPrincipal: rep.imagemPrincipal }, fila, "representante", {
      nome: rep.nome,
      papel: rep.papel,
      qid: rep.qid,
    });
    if (achada) {
      return fechar({
        ...achada,
        asset: { ...achada.asset, entityName: entidade.nome, entityNormalized: entidade.normalizado },
      });
    }
  }
  return fechar(null);
}

/** O logotipo (P154) como asset: o cartão é a imagem publicada; a licença é a do arquivo no Commons. */
async function assetDoLogotipo(arquivo: string, entidade: EntidadeVisual, e: EntradaDoProtagonista): Promise<AssetVisual | null> {
  let info: Awaited<ReturnType<typeof arquivoDoCommons>> = null;
  try {
    info = await arquivoDoCommons(arquivo, { env: e.env, fetcher: e.opcoes.fetcher, tempoLimiteMs: 12_000 });
  } catch (erro) {
    e.fontesConsultadas.push({ fonte: "wikimedia_commons", encontrados: 0, nota: `logotipo "${arquivo}" não lido: ${(erro as Error).message}` });
    return null;
  }
  if (!info) return null;
  const veredicto = avaliarLicenca(info.licenca, e.env);
  if (!veredicto.aceita) {
    e.recusados.push({
      origem: "wikimedia_commons",
      identificacao: `File:${arquivo}`,
      motivo: MOTIVOS_DE_RECUSA.LICENCA_DESCONHECIDA,
      detalhe: veredicto.motivo,
    });
    return null;
  }
  const agora = new Date().toISOString();
  return {
    entityName: entidade.nome,
    entityNormalized: entidade.normalizado,
    entityType: entidade.tipo,
    source: "wikimedia_commons",
    sourceAssetId: info.arquivo,
    imageUrl: urlDoCartaoDaMarca(arquivo),
    sourcePageUrl: info.paginaUrl,
    author: info.autor,
    license: veredicto.nome,
    licenseUrl: info.licencaUrl,
    attribution: montarAtribuicao({ autor: info.autor, fonte: "Wikimedia Commons", licenca: veredicto.nome, exigeAtribuicao: veredicto.exigeAtribuicao }),
    rightsStatement: info.licenca,
    rightsStatus: "verified",
    rightsCheckedAt: agora,
    sourceLastCheckedAt: agora,
    width: 1600,
    height: 1600,
    mimeType: "image/png",
    storagePath: null,
    perceptualHash: null,
    imageRelevanceScore: 100,
    imageContextType: "company",
    metadata: { tratamento: "cartao_do_logotipo", logotipo: arquivo, logotipo_url: urlDoLogotipoNoCommons(arquivo) },
  };
}

/** As fotos de um representante: Commons (P18 e categoria) e os bancos oficiais, pelas mesmas conversões. */
async function fotosDoRepresentante(
  rep: Representante,
  e: EntradaDoProtagonista,
): Promise<{ entidade: EntidadeVisual; candidatas: AssetVisual[] }> {
  const pessoa: EntidadeVisual = {
    nome: rep.nome,
    normalizado: normalizarEntidade(rep.nome),
    tipo: "person",
    qid: rep.qid,
    imagemPrincipal: rep.imagemPrincipal,
    categoriaCommons: rep.categoriaCommons,
    siteOficial: null,
    origem: `representante de ${e.entidade.nome} no Wikidata (${rep.papel})`,
    confianca: 80,
    evidencias: [`${rep.papel} de ${e.entidade.nome} (Wikidata ${rep.qid})`],
  };
  const candidatas: AssetVisual[] = [];
  try {
    const busca = await buscarNoCommons(pessoa, { env: e.env, fetcher: e.opcoes.fetcher });
    for (const c of busca.candidatos) {
      const conv = candidatoParaAsset(c, pessoa, e.env);
      if (conv.ok && e.livre(conv.asset.imageUrl)) candidatas.push(conv.asset);
    }
    e.fontesConsultadas.push({ fonte: "wikimedia_commons", encontrados: candidatas.length, nota: `representante ${rep.nome}: ${busca.caminhos.join(" ; ")}` });
  } catch (erro) {
    e.fontesConsultadas.push({ fonte: "wikimedia_commons", encontrados: 0, nota: `representante ${rep.nome}: ${(erro as Error).message}` });
  }
  return { entidade: pessoa, candidatas };
}

/**
 * A manchete nomeia a pessoa? Basta o sobrenome ou qualquer parte do nome com
 * mais de três letras ("Trump", "Altman"), sem acento nem caixa.
 */
function pessoaNaManchete(entidade: EntidadeVisual, titulo: string): boolean {
  const manchete = ` ${normalizarEntidade(titulo)} `;
  return normalizarEntidade(entidade.nome)
    .split(" ")
    .filter((parte) => parte.length > 3)
    .some((parte) => manchete.includes(` ${parte} `));
}

/**
 * O contexto de uma editoria inteira, para o degrau em que a pauta já não tem
 * cena própria que renda.
 *
 * Lugar e objeto, nunca gente nem letreiro: as mesmas regras da cena. Cada
 * consulta foi escolhida para servir a QUALQUER pauta da editoria sem afirmar
 * nada que a pauta não diz. Pauta do Brasil ganha cena do Brasil, pela régua de
 * país.
 */
const CONTEXTO_DA_EDITORIA: Record<string, string> = {
  economia: "new york financial district buildings",
  trabalho: "modern office interior empty desks",
  tecnologia: "data center server racks",
  custo_de_vida: "american suburban neighborhood houses",
  politica: "united states capitol building washington",
  seguranca: "american city street night",
  cultura: "american city street daytime",
  brasil: "brasilia national congress building",
};

export function contextoDaEditoriaPara(eixo: string, pais?: string): string {
  if (/brasil/i.test(pais ?? "") && eixo !== "brasil") return "brazil city skyline";
  return CONTEXTO_DA_EDITORIA[eixo] ?? "american flag waving blue sky";
}

function assetDoBanco(
  foto: Awaited<ReturnType<typeof buscarFotosDeBanco>>[number],
  entidade: EntidadeVisual,
  env: Record<string, string | undefined>,
): AssetVisual {
  const licenca = foto.credito.provedor === "pexels" ? "Pexels License" : "Unsplash License";
  const veredicto = avaliarLicenca(licenca, env);
  const agora = new Date().toISOString();
  return {
    entityName: entidade.nome,
    entityNormalized: entidade.normalizado,
    entityType: "conceptual",
    source: "banco_conceitual",
    sourceAssetId: foto.imagemUrl,
    imageUrl: foto.imagemUrl,
    sourcePageUrl: foto.credito.fotoUrl,
    author: foto.credito.fotografo,
    // A licença do provedor não está na allowlist do Commons e não
    // precisa estar: ela é do provedor, e o que importa é a obrigação de
    // crédito que ele declara.
    license: licenca,
    licenseUrl: foto.credito.fotoUrl,
    attribution: foto.credito.atribuicao ?? "",
    rightsStatement: veredicto.motivo,
    rightsStatus: "verified",
    rightsCheckedAt: agora,
    sourceLastCheckedAt: agora,
    width: 1200,
    height: 800,
    mimeType: "image/jpeg",
    storagePath: null,
    perceptualHash: null,
    imageRelevanceScore: 0,
    imageContextType: "conceptual",
    metadata: { provedor: foto.credito.provedor, conceitual: true },
  };
}

/**
 * Quantas conferências a escada inteira pode abrir.
 *
 * Quatro por degrau e doze no total: o pior caso de uma pauta que desce os
 * quatro degraus custa doze chamadas de visão, e só acontece quando nada
 * antes serviu. O caso comum para no primeiro degrau, como antes.
 */
const TETO_DE_CONFERENCIAS_DA_ESCADA = 12;

/**
 * Quantas imagens chegam a ser abertas por pauta.
 *
 * O teto existe por custo e por latência, não por confiança: uma pauta cuja
 * quarta colocada ainda é incoerente não tem foto boa, tem lista ruim, e a
 * resposta certa para ela é a bandeira. A bolha ganha teto menor porque ela é
 * opcional: capa sem bolha é peça publicável, capa com bolha errada não é.
 */
/**
 * Quantas fotos o banco conceitual entrega por pauta.
 *
 * Elas existem para a conferência visual ter o que percorrer: com uma só, a
 * primeira recusa manda a pauta para a bandeira. Três é teto de custo, porque
 * cada candidata é uma chamada ao banco e a conferência abre no máximo quatro
 * imagens por pauta de qualquer jeito.
 */
/*
 * ATUALIZADO em 06/10/2026: seis, e numa chamada só por provedor. O custo por
 * candidata deixou de existir quando `buscarFotosDeBanco` passou a usar a
 * resposta inteira da busca, e três candidatas recusadas eram exatamente o
 * perfil de toda pauta do evergreen que ficava sem foto.
 */
const CANDIDATAS_DO_BANCO = 6;

const TETO_DE_CONFERENCIAS = 4;
const TETO_DE_CONFERENCIAS_DA_BOLHA = 2;

/**
 * Quem confere, considerando o que foi injetado e o que existe no ambiente.
 *
 * `false` desliga. Função injetada manda. Sem nada, usa a conferência de
 * verdade se houver credencial, e pula se não houver: em teste não há chave, e
 * em produção o pipeline já teria morrido antes sem ela.
 */
function conferenteDe(opcoes: OpcoesDeResolucao): Conferente | null {
  if (opcoes.conferenciaVisual === false) return null;
  if (typeof opcoes.conferenciaVisual === "function") return opcoes.conferenciaVisual;
  const env = opcoes.env ?? process.env;
  if (!getAIProviderConfig(env).isConfigured) return null;
  return conferenteDeVerdade({ env, fetcher: opcoes.fetcher });
}

/**
 * A conferência de verdade, com as três perguntas: a de sempre, a de
 * identidade e a de marca (06/10/2026). Exportada para os scripts de medição
 * contarem o custo pelo próprio `fetcher` sem perder as perguntas novas.
 */
export function conferenteDeVerdade(o: { env?: Record<string, string | undefined>; fetcher?: typeof fetch }): Conferente {
  return (asset, contexto) => {
    // As perguntas do protagonista (06/10/2026) têm instrução própria; sem o dado que pedem, é recusa.
    if (contexto.papel === "identidade") {
      return contexto.referencia
        ? conferirIdentidade(asset, contexto.referencia, o)
        : Promise.resolve({ aprovada: false, descricao: "", motivo: "sem retrato de referência", paisAparente: null, confianca: 0, falhou: true });
    }
    if (contexto.papel === "marca" || contexto.papel === "logotipo") {
      return contexto.marca
        ? conferirMarca(asset, { ...contexto.marca, tipo: contexto.papel === "logotipo" ? "logotipo" : "foto" }, o)
        : Promise.resolve({ aprovada: false, descricao: "", motivo: "sem o nome da marca", paisAparente: null, confianca: 0, falhou: true });
    }
    const papel = contexto.papel === "cena" ? "cena" : "assunto";
    return conferirImagem(asset, { ...contexto, papel }, o);
  };
}

/**
 * A primeira da fila que passa na conferência visual.
 *
 * Sem conferente, devolve a primeira da fila: é o comportamento antigo, e é o
 * que o dry-run e o teste querem.
 */
async function primeiraAprovada<T extends AssetVisual>(
  candidatas: T[],
  conferir: Conferente | null,
  pauta: PautaParaImagem,
  recusados: CandidatoRecusado[],
  teto: number,
  uso: "fundo" | "bolha" = "fundo",
  papel: "assunto" | "cena" = "assunto",
): Promise<T | null> {
  if (candidatas.length === 0) return null;
  if (!conferir) return candidatas[0] ?? null;

  const contexto = { titulo: pauta.titulo, resumo: pauta.resumo, eixo: pauta.categoria, uso, papel };

  for (const candidata of candidatas.slice(0, teto)) {
    const veredicto = await conferir(candidata, contexto);

    if (veredicto.aprovada) {
      candidata.conferenciaVisual = {
        descricao: veredicto.descricao,
        motivo: veredicto.motivo,
        paisAparente: veredicto.paisAparente,
        confianca: veredicto.confianca,
      };
      return candidata;
    }

    recusados.push({
      origem: candidata.source,
      identificacao: candidata.sourceAssetId,
      motivo: veredicto.falhou
        ? MOTIVOS_DE_RECUSA.CONFERENCIA_VISUAL_INDISPONIVEL
        : MOTIVOS_DE_RECUSA.CONFERENCIA_VISUAL_REPROVOU,
      detalhe: veredicto.descricao
        ? `viu "${veredicto.descricao}": ${veredicto.motivo}`
        : veredicto.motivo,
    });
  }

  return null;
}

/**
 * O melhor candidato acima do piso, ou nada.
 *
 * Recusa por resolução vem antes da pontuação porque é objetiva: foto de 300px
 * esticada no bloco do e-mail fica ruim independentemente de ser a foto certa.
 */
function melhorPontuado<T extends AssetVisual>(
  candidatos: T[],
  entidade: EntidadeVisual,
  piso: number,
  recusados: CandidatoRecusado[],
  larguraMinima: number,
  pauta?: { titulo: string; resumo?: string; atores?: string[] }
): { melhor: T | null; vice: T | null; aprovadas: Array<{ item: T; nota: NotaDaImagem }> } {
  /*
   * A vice existe porque a capa quer DUAS imagens.
   *
   * A bolha da capa mostra um segundo assunto ao lado do personagem, e ela
   * precisa de uma foto que tenha passado pelas MESMAS barreiras da primeira:
   * resolução, licença, temporalidade, figura não central e piso de
   * relevância. Pegar a segunda da lista bruta traria de volta exatamente o
   * que cada barreira recusou.
   *
   * Por isso a vice sai daqui, e não de um segundo filtro em outro lugar:
   * quem sabe quais candidatas foram aprovadas é este laço.
   */
  const aprovadas: Array<{ item: T; nota: NotaDaImagem }> = [];

  for (const c of candidatos) {
    // Largura zero significa dimensão desconhecida (fonte oficial não informa),
    // e aí a pontuação decide sozinha.
    if (c.width > 0 && c.width < larguraMinima) {
      recusados.push({
        origem: c.source,
        identificacao: c.sourceAssetId,
        motivo: MOTIVOS_DE_RECUSA.RESOLUCAO_BAIXA,
        detalhe: `${c.width}px de largura, mínimo ${larguraMinima}`,
      });
      continue;
    }

    /*
     * Tempo e sentido vêm ANTES da pontuação, e é isso que os torna barreira.
     *
     * Se entrassem como peso, a correspondência de entidade compensaria: uma
     * foto perfeita do Bureau of Labor Statistics somaria 45 pontos de
     * entidade e perderia 12 de tempo, e a fotografia de 1937 sobre a QUEDA de
     * 1,5 milhão de empregos continuaria ilustrando a criação de 162 mil.
     * Correspondência de entidade não compensa sentido invertido.
     */
    if (pauta) {
      const temporal = analisarTemporalidade(c, { ...pauta, entidade });

      c.assetDate = temporal.assetDate;
      c.assetAgeYears = temporal.assetAgeYears;
      c.temporalRelevanceScore = temporal.temporalRelevanceScore;
      c.semanticContextFit = temporal.semanticContextFit;
      c.archiveImage = temporal.archiveImage;
      c.historicalEventSpecific = temporal.historicalEventSpecific;

      if (temporal.recusa) {
        recusados.push({
          origem: c.source,
          identificacao: c.sourceAssetId,
          motivo: temporal.recusa as CandidatoRecusado["motivo"],
          detalhe: temporal.detalhe,
        });
        continue;
      }

      const figura = retratoNaoCentral(c, entidade, entidade.confianca);
      if (figura.recusa) {
        recusados.push({
          origem: c.source,
          identificacao: c.sourceAssetId,
          motivo: figura.recusa as CandidatoRecusado["motivo"],
          detalhe: figura.detalhe,
        });
        continue;
      }

      /*
       * A mesma regra, para qualquer contexto declarado.
       *
       * `retratoNaoCentral` acima só alcança `official_portrait` e
       * `entity_portrait`. Uma foto de painel de congresso classificada como
       * `institution` passava por ele com quatro pessoas identificáveis
       * dentro, nenhuma delas assunto da pauta. Quem vê o post vê o rosto, não
       * o campo `image_context_type`.
       *
       * As referências são o que a pauta afirma: a entidade visual escolhida
       * mais os atores da classificação.
       */
      const naImagem = figuraNaoCentralNaImagem(c, [
        entidade.nome,
        ...(pauta?.atores ?? []),
        pauta?.titulo ?? "",
        pauta?.resumo ?? "",
      ]);
      if (naImagem.recusa) {
        recusados.push({
          origem: c.source,
          identificacao: c.sourceAssetId,
          motivo: naImagem.recusa as CandidatoRecusado["motivo"],
          detalhe: naImagem.detalhe,
        });
        continue;
      }
    }

    const nota = pontuarImagem(c, entidade);
    c.imageRelevanceScore = nota.total;

    if (nota.total < piso) {
      recusados.push({
        origem: c.source,
        identificacao: c.sourceAssetId,
        motivo: MOTIVOS_DE_RECUSA.RELEVANCIA_BAIXA,
        detalhe: `${nota.explicacao}, piso ${piso}`,
      });
      continue;
    }

    aprovadas.push({ item: c, nota });
  }

  aprovadas.sort((a, b) => b.nota.total - a.nota.total);

  /*
   * A vice não pode ser a mesma imagem da vencedora.
   *
   * Duas fontes diferentes devolvem o mesmo arquivo do Commons com frequência,
   * e a capa ficaria com a mesma foto no fundo e dentro do círculo, que é pior
   * que não ter bolha nenhuma.
   */
  const melhor = aprovadas[0]?.item ?? null;
  const vice =
    aprovadas.find(
      (a) =>
        a.item !== melhor &&
        identidadeDaFoto(a.item.imageUrl) !== identidadeDaFoto(melhor?.imageUrl ?? "") &&
        /*
         * A bolha exige MAIS do que a foto de fundo, e não o mesmo.
         *
         * O fundo pode ser a cena: a rua, o prédio, o plano aberto. Ele ocupa
         * a peça inteira e o degradê come metade dele. A bolha é um círculo de
         * 44 por cento de largura no terço superior, e o que não é
         * reconhecível ali vira mancha. Passar na mesma régua do fundo não
         * basta; a vice precisa mostrar quem ou o que a pauta cita.
         */
        temIdentidade(a.nota) &&
        /*
         * E a vice NUNCA é do banco conceitual.
         *
         * O banco conceitual entra como último caso para a foto de fundo: numa
         * pauta sem rosto e sem lugar, uma imagem de apoio ainda é melhor que
         * peça vazia. Para a bolha o cálculo é outro. O círculo é pequeno,
         * fica no terço superior e é a primeira coisa que o olho encontra: ali
         * uma foto genérica de banco não reforça nada, ela anuncia que a peça
         * não tinha o que mostrar. Melhor capa sem bolha do que bolha sem
         * assunto, e foi exatamente esta a correção pedida em 16/09/2026.
         */
        a.item.source !== "banco_conceitual" &&
        a.item.imageContextType !== "conceptual",
    )?.item ?? null;

  return { melhor, vice, aprovadas };
}

/**
 * A vice para uma vencedora que pode não ser a primeira da lista.
 *
 * Quando a conferência visual reprova a primeira colocada, a vencedora passa a
 * ser outra, e a vice tem que ser recalculada contra ELA: senão a bolha pode
 * repetir a mesma foto do fundo, que é o defeito que a régua original já
 * existia para evitar.
 */
function escolherVice<T extends AssetVisual>(
  aprovadas: Array<{ item: T; nota: NotaDaImagem }>,
  vencedora: T | null,
): Array<{ item: T; nota: NotaDaImagem }> {
  return aprovadas.filter(
    (a) =>
      a.item !== vencedora &&
      identidadeDaFoto(a.item.imageUrl) !== identidadeDaFoto(vencedora?.imageUrl ?? "") &&
      temIdentidade(a.nota) &&
      a.item.source !== "banco_conceitual" &&
      a.item.imageContextType !== "conceptual",
  );
}

/**
 * Quantas imagens a busca extra da bolha abre na conferência visual.
 *
 * O dobro do teto da vice comum, e só quando é a vez da bolha: é aqui que a
 * alternância deixa de ser acaso e vira alvo (pedido do dono, 06/10/2026).
 */
const TETO_DE_CONFERENCIAS_DA_BUSCA_EXTRA = 4;

/** Quantos arquivos o Commons devolve na busca extra, contra 12 da busca comum. */
const LIMITE_DO_COMMONS_NA_BUSCA_EXTRA = 30;

export type SegundaFotoBuscada = { asset: AssetVisual | null; nota: string };

/**
 * Mais uma tentativa de achar a foto do círculo, quando é a vez da bolha.
 *
 * Em 06/10/2026 só 1 das 12 últimas capas tinha bolha, e parte da causa está
 * neste arquivo: a vice só existia no caminho das fontes externas. Quando a
 * foto de fundo saía do acervo ou da biblioteca, a resolução terminava ali e
 * ninguém procurava segunda foto; e no caminho externo a vice tinha duas
 * conferências e doze arquivos do Commons.
 *
 * A régua NÃO muda, e esse é o ponto. A busca é mais funda, não mais frouxa:
 *
 *   - só para pauta com entidade nomeada (a bolha mostra quem a pauta cita);
 *   - o acervo primeiro, pelo assunto da entidade, que é identidade por
 *     construção e foi conferido na entrada;
 *   - depois biblioteca, Commons (30 arquivos) e Openverse, somados, pelas
 *     MESMAS barreiras da vice: resolução, tempo, figura não central, piso de
 *     relevância e o piso de identidade, nunca banco conceitual;
 *   - e a conferência visual abrindo até quatro delas. Sem conferente (sem
 *     chave), nada é aprovado: falha de conferência é recusa.
 *
 * Nunca devolve a foto de fundo nem foto já usada hoje ou na janela.
 */
export async function buscarSegundaFoto(
  pauta: PautaParaImagem,
  principal: Pick<AssetVisual, "imageUrl">,
  entidade: EntidadeVisual | null,
  opcoes: OpcoesDeResolucao = {},
): Promise<SegundaFotoBuscada> {
  if (!entidade || entidade.tipo === "conceptual") {
    return { asset: null, nota: "pauta sem entidade nomeada: a bolha mostra quem a pauta cita, e aqui não há quem" };
  }

  const env = opcoes.env ?? process.env;
  const config = carregarConfigDeImagem(env);
  const usadosAgora = opcoes.jaUsadosNestaEdicao ?? new Set<string>();
  const usadasAntes = new Set(
    [...(opcoes.jaUsadasRecentemente ?? [])].map((u) => identidadeDaFoto(u)).filter(Boolean),
  );
  const daFotoDeFundo = identidadeDaFoto(principal.imageUrl);
  const livre = (url: string) =>
    Boolean(url) &&
    identidadeDaFoto(url) !== daFotoDeFundo &&
    !usadosAgora.has(url) &&
    !usadasAntes.has(identidadeDaFoto(url));

  const notas: string[] = [];

  // 1. O acervo, pelo assunto da entidade.
  if (opcoes.acervo && opcoes.acervo.modo === "enforce") {
    try {
      const imagens = await opcoes.acervo.porAssunto(assuntosDaEntidade(entidade));
      const livres = imagens.filter((i) => livre(i.urlPublica));
      notas.push(`acervo: ${imagens.length} da entidade, ${livres.length} livre(s)`);
      if (livres[0]) return { asset: assetDoAcervo(livres[0], entidade), nota: notas.join(" ; ") };
    } catch (erro) {
      notas.push(`acervo indisponível: ${(erro as Error).message}`);
    }
  }

  const conferir = conferenteDe(opcoes);
  if (!conferir) {
    notas.push("sem conferência visual: a busca externa não aprova nada sem alguém olhar");
    return { asset: null, nota: notas.join(" ; ") };
  }

  // 2. Biblioteca, Commons e Openverse, somados antes de pontuar.
  const candidatos: AssetVisual[] = [];
  const biblioteca = opcoes.biblioteca ?? (opcoes.client ? criarBiblioteca(opcoes.client) : null);
  if (biblioteca) {
    try {
      const guardados = (await biblioteca.daEntidade(entidade.normalizado)).filter(
        (g) => !usadoRecentemente(g, config.janelaEmDias),
      );
      candidatos.push(...guardados);
      notas.push(`biblioteca: ${guardados.length}`);
    } catch (erro) {
      notas.push(`biblioteca indisponível: ${(erro as Error).message}`);
    }
  }
  try {
    const busca = await buscarNoCommons(entidade, {
      env,
      fetcher: opcoes.fetcher,
      limite: LIMITE_DO_COMMONS_NA_BUSCA_EXTRA,
    });
    let convertidos = 0;
    for (const c of busca.candidatos) {
      const conversao = candidatoParaAsset(c, entidade, env);
      if (conversao.ok) {
        candidatos.push(conversao.asset);
        convertidos += 1;
      }
    }
    notas.push(`commons: ${convertidos}`);
  } catch (erro) {
    notas.push(`commons falhou: ${(erro as Error).message}`);
  }
  try {
    const busca = await buscarNoOpenverse(entidade, { env, fetcher: opcoes.fetcher });
    let convertidos = 0;
    for (const c of busca.candidatos) {
      const conversao = candidatoDoOpenverse(c, entidade, env);
      if (conversao.ok) {
        candidatos.push(conversao.asset);
        convertidos += 1;
      }
    }
    notas.push(`openverse: ${convertidos}`);
  } catch (erro) {
    notas.push(`openverse falhou: ${(erro as Error).message}`);
  }
  // Os bancos oficiais (06/10/2026): a mesma régua da vice, e na frente da fila.
  const bancos = bancosDaResolucao(opcoes);
  if (bancos && entidadeElegivel(entidade)) {
    try {
      const busca = await buscarNosBancosOficiais(
        entidade,
        { atores: pauta.classificacao.atores, pais: pauta.classificacao.pais },
        { env, fetcher: opcoes.fetcher, bancos },
      );
      candidatos.push(...busca.assets);
      notas.push(`bancos oficiais: ${busca.assets.length}`);
    } catch (erro) {
      notas.push(`bancos oficiais falharam: ${(erro as Error).message}`);
    }
  }

  const vistos = new Set<string>();
  const disponiveis = candidatos.filter((c) => {
    const id = identidadeDaFoto(c.imageUrl);
    if (!livre(c.imageUrl) || vistos.has(id)) return false;
    vistos.add(id);
    return true;
  });

  const recusados: CandidatoRecusado[] = [];
  const { aprovadas } = melhorPontuado(
    disponiveis,
    entidade,
    pisoDeRelevancia(entidade, config),
    recusados,
    config.larguraMinima,
    { titulo: pauta.titulo, resumo: pauta.resumo, atores: pauta.classificacao.atores },
  );
  const comIdentidade = escolherVice(bancos ? oficiaisPrimeiro(aprovadas) : aprovadas, {
    imageUrl: principal.imageUrl,
  } as AssetVisual);
  notas.push(`${disponiveis.length} candidata(s), ${comIdentidade.length} com identidade`);

  /*
   * A bolha mostra quem a pauta cita, e a mesma régua do protagonista vale
   * para ela (06/10/2026, "imagem certeira"): rosto no círculo é rosto
   * conferido contra o retrato de referência; organização no círculo é marca
   * legível. Sem retrato de referência, bolha de pessoa não sai.
   */
  const daPessoa = ehPessoa(entidade.tipo);
  const ref = daPessoa
    ? await retratoDeReferencia(entidade.imagemPrincipal, comIdentidade.map((x) => x.item), env, opcoes.fetcher)
    : null;
  if (daPessoa && !ref) {
    notas.push(`${entidade.nome} sem retrato de referência (P18): bolha de pessoa exige identidade conferida`);
    return { asset: null, nota: notas.join(" ; ") };
  }
  const conferirNaBolha: Conferente = async (asset, ctx) => {
    if (daPessoa && ref && !ehOProprioRetrato(asset, ref.arquivo)) {
      const v = await conferir(asset, { ...ctx, papel: "identidade", referencia: { nome: entidade.nome, url: ref.url } });
      if (!v.aprovada) return v;
    }
    if (!daPessoa && entidade.tipo !== "place") {
      const v = await conferir(asset, { ...ctx, papel: "marca", marca: { nome: entidade.nome, instituicao: entidade.tipo !== "company" } });
      if (!v.aprovada) return v;
    }
    return conferir(asset, ctx);
  };
  const vice = await primeiraAprovada(
    comIdentidade.map((x) => x.item),
    conferirNaBolha,
    pauta,
    recusados,
    TETO_DE_CONFERENCIAS_DA_BUSCA_EXTRA,
    "bolha",
  );
  if (!vice) {
    const conferidas = Math.min(comIdentidade.length, TETO_DE_CONFERENCIAS_DA_BUSCA_EXTRA);
    notas.push(`${conferidas} conferida(s), nenhuma aprovada`);
  }
  return { asset: vice, nota: notas.join(" ; ") };
}
