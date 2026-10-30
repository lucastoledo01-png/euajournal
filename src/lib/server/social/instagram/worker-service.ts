import { type Project, requireActiveProject } from "../../projects";
import { getSupabaseAdminClient } from "../../supabase-admin";
import { loadEdition } from "./edition-loader";
import {
  TETO_DE_FILHOS_DO_CARROSSEL,
  createCarouselContainer,
  createCarouselItemContainer,
  createReelContainer,
  createSingleImageContainer,
} from "./meta-client";
import { renderOpenDesignSlides, uploadOpenDesignSlideToStorage } from "./opendesign-renderer";
import {
  generateInstagramCarouselPipeline,
  generateTutorialCarouselPipeline,
  type TutorialArticleInput,
} from "./pipeline";
import { envDoInstagram } from "../../credenciais-do-projeto";
import { markPostFailed } from "./scheduler";
import {
  GERACAO_V2,
  ehEnsaio,
  ehLegado,
  ehSocialV2,
  lerCargaV2,
  MOTIVO_CARGA_INCOMPLETA,
  MOTIVO_VAGA_DISPUTADA,
  MOTIVO_VERSAO_DESCONHECIDA,
  type LinhaDePost,
} from "./carga-v2";
import { verificarArtefatos } from "./worker-v2";
import { getArticleBySlug } from "../../articles-service";
import { montarCarrosselDeCampanha } from "../../prompt-system/carrossel-de-campanha";
import { concluirCampanhaPublicada } from "../../prompt-system/pos-publicacao";
import { garantirFunilPermanente } from "../../prompt-system/funil-permanente";
import { garantirLegendaSocial, type ContextoDaLegenda } from "../legenda";
import {
  gravarOuFalhar,
  publicarComRegistro,
  reconciliarTentativaAnterior,
  reivindicarVaga,
} from "./publicacao-segura";
import { formatError, sendAlert } from "../../alerts";
import {
  conferirPostNoWorker,
  ehMensagemDoPortao,
  hashDosArtefatosConferidos,
  segurarPostNaFila,
} from "../../aprovacao/integracao";
import type { CarouselFormat, InstagramCarouselContent } from "./schemas";
import type { AITokenUsage } from "../../newsroom/ai-provider";

/**
 * Geração, renderização e publicação dos posts.
 *
 * Só o worker carrega este módulo. Ele importa o renderizador, que depende do
 * Playwright — ausente na hospedagem que serve o site, onde nem o build passa
 * se algo do lado web alcançar esta cadeia.
 */

export type InstagramRunResult = {
  ok: boolean;
  projectId: string;
  socialPostId: string;
  status: string;
  providerPostId?: string;
  carousel?: InstagramCarouselContent;
  slideUrls?: string[];
  executionTimeMs: number;
  error?: string;
};

type CarrosselGerado = {
  carousel: InstagramCarouselContent;
  usage: AITokenUsage;
  /** Do que a pauta trata, para a hashtag sair do assunto e não do perfil. */
  contexto: Omit<ContextoDaLegenda, "fechamentoDaNewsletter">;
};

/**
 * Gera o roteiro do post conforme o formato. Cada um parte de uma origem
 * diferente: notícia da edição diária, tutorial de um artigo já revisado,
 * prompt dos assets já gerados da campanha.
 */
async function gerarCarrossel(
  format: CarouselFormat,
  meta: Record<string, unknown>,
  project: Project,
  editionDate: string,
  env: Record<string, string | undefined>,
  fetcher: typeof fetch,
): Promise<CarrosselGerado> {
  if (format === "prompt") {
    const campaignId = String(meta.campaign_id ?? "").trim();
    if (!campaignId) throw new Error("Post de prompt sem campaign_id no content_json.");

    // Sem LLM: parte de dados que já existem (hook do conceito, aplicações e
    // as imagens geradas). Ver `carrossel-de-campanha.ts`.
    const { carousel, campanha } = await montarCarrosselDeCampanha(campaignId);
    // Zerado porque não houve chamada de modelo — o custo deste formato está
    // na geração das imagens (etapa 4), contabilizada lá.
    return {
      carousel,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
      contexto: {
        titulo: carousel.title,
        resumo: carousel.caption.intro_summary,
        categoria: carousel.primary_topic,
        keyword: campanha.keyword,
      },
    };
  }

  if (format === "tutorial") {
    const slug = String(meta.article_slug ?? "").trim();
    if (!slug) throw new Error("Post de tutorial sem article_slug no content_json.");

    const article = await getArticleBySlug(slug);
    if (!article) throw new Error(`Artigo "${slug}" não encontrado.`);

    const input: TutorialArticleInput = {
      title: article.title,
      slug: article.slug,
      excerpt: article.excerpt,
      primaryTopic: article.category || "Claude Code",
      sections: article.content,
      keyword: String(meta.keyword ?? "TUTORIAL"),
    };
    const gerado = await generateTutorialCarouselPipeline(input, editionDate, env, fetcher);
    return {
      ...gerado,
      contexto: {
        titulo: article.title,
        resumo: article.excerpt,
        categoria: article.category ?? "",
        keyword: input.keyword,
      },
    };
  }

  const storyIndex = Number((meta.story_index as number) ?? 0);
  const edition = await loadEdition(project, editionDate);
  const story = edition.stories[storyIndex];
  if (!story) {
    throw new Error(
      `A edição de ${editionDate} tem ${edition.stories.length} pautas; a posição ${storyIndex} não existe.`,
    );
  }
  // A marca vem do projeto pelo mesmo motivo da redação: o sistema é
  // multi-projeto e o nome, o público e a keyword do CTA estavam escritos
  // dentro da constante do prompt.
  const keyword = String(project.settings?.instagram_keyword ?? "").trim() || "NEWS";

  /*
   * A assinatura da newsletter NÃO entra aqui.
   *
   * Ela entrava, como `assinatura`, e o prompt mandava encerrar a legenda com
   * ela: foi assim que "Até amanhã. Equipe imigra.us." apareceu embaixo do CTA
   * de um post. Newsletter tem uma despedida por dia; um perfil que publica
   * várias vezes por dia não tem nenhuma. O fechamento do e-mail agora só
   * aparece no `garantirLegendaSocial`, como texto a remover.
   */
  const gerado = await generateInstagramCarouselPipeline(edition, editionDate, env, fetcher, story, {
    nome: project.brand.displayName || project.name,
    nicho: project.niche,
    extra: project.editorialPromptExtra,
    keyword,
  });

  return {
    ...gerado,
    contexto: {
      titulo: story.title,
      resumo: `${story.summary} ${story.context ?? ""}`.trim(),
      categoria: story.category,
      keyword,
    },
  };
}

/**
 * O roteiro do post, com a legenda já auditada.
 *
 * Ponto único: os três formatos passam por aqui antes de a legenda ser gravada
 * em `social_posts` e antes de ir para a Meta. Era a falta desse ponto que
 * permitia a um formato sair com hashtag fixa e a outro sair sem nenhuma.
 */
async function generateCarouselForPost(
  format: CarouselFormat,
  meta: Record<string, unknown>,
  project: Project,
  editionDate: string,
  env: Record<string, string | undefined>,
  fetcher: typeof fetch,
): Promise<{ carousel: InstagramCarouselContent; usage: AITokenUsage }> {
  const gerado = await gerarCarrossel(format, meta, project, editionDate, env, fetcher);

  const auditada = garantirLegendaSocial(gerado.carousel, {
    ...gerado.contexto,
    fechamentoDaNewsletter: String(project.settings?.final_line ?? "").trim(),
  });

  for (const problema of auditada.problemas) {
    console.warn(`[INSTAGRAM LEGENDA] ${problema.motivo}: ${problema.detalhe}`);
  }
  if (auditada.reparos.length > 0) {
    console.log(`[INSTAGRAM LEGENDA] Reparos aplicados: ${auditada.reparos.join(" ; ")}.`);
  }

  return { carousel: auditada.carousel, usage: gerado.usage };
}

/**
 * Renderiza os slides e sobe para o Storage, devolvendo as URLs públicas.
 *
 * Os PNGs eram gravados em base64 numa coluna jsonb: uma linha passava de
 * 20 MB e servir uma imagem carregava o manifesto inteiro do banco.
 */
async function renderAndUploadSlides(
  project: Project,
  carousel: InstagramCarouselContent,
  editionDate: string,
  socialPostId: string,
): Promise<Array<{ index: number; url: string; filename: string }>> {
  const rendered = await renderOpenDesignSlides(carousel);
  const uploaded: Array<{ index: number; url: string; filename: string }> = [];

  for (const slide of rendered) {
    const filepath = `${project.slug}/${editionDate}/${socialPostId}/${slide.filename}`;
    const url = await uploadOpenDesignSlideToStorage(slide.pngBuffer, filepath);

    if (!url) {
      throw new Error(`Falha ao subir o slide ${slide.index} para o Storage.`);
    }

    uploaded.push({ index: slide.index, url, filename: slide.filename });
  }

  return uploaded;
}

/**
 * Publica o post, aguardando o container ficar pronto.
 *
 * Um slide vira post de imagem única; dois ou mais viram carrossel. A escolha
 * sai da quantidade de slides, não do formato: é a contagem que a API da Meta
 * exige que case com o tipo de container, e derivar dela evita um formato
 * novo publicar pelo caminho errado sem ninguém lembrar de atualizar aqui.
 */
/**
 * O que já foi criado na Meta numa tentativa anterior, e como registrar o novo.
 *
 * Sem isso, um retry depois de criar três dos seis filhos criaria seis filhos
 * novos: os três primeiros ficariam pendurados na conta e, mais importante, o
 * trabalho seria refeito a cada tentativa. Container filho é inerte, então
 * recriar não publica nada duas vezes; o que se evita aqui é o desperdício e a
 * sujeira, não uma publicação dupla.
 *
 * `registrar` grava ANTES de o pai existir. É a mesma disciplina de
 * `publicarComRegistro`: gravar o efeito externo assim que ele acontece, para
 * que a próxima tentativa saiba o que já foi feito.
 */
export type EstadoDosFilhos = {
  conhecidos: Map<number, string>;
  registrar: (index: number, creationId: string) => Promise<void>;
};

/** Vídeo leva mais que imagem para a Meta processar: 10 minutos, e não os 2 da imagem. */
const ESPERA_DO_REEL_MS = 10 * 60_000;

/**
 * O container do Reel: um vídeo, sem filhos e sem a escolha por contagem.
 *
 * Fica separado de `montarContainer` de propósito. Aquele decide o tipo pela
 * quantidade de slides, e um vídeo só cairia no ramo da imagem única: a Meta
 * recusaria o `.mp4` como `image_url`. O formato declarado na linha é quem
 * manda aqui.
 */
async function montarContainerDeReel(
  videoUrl: string | undefined,
  caption: string,
  env: Record<string, string | undefined>,
  fetcher: typeof fetch,
): Promise<string> {
  if (!videoUrl) throw new Error("O Reel não tem vídeo aprovado, não há o que publicar.");
  const reel = await createReelContainer(videoUrl, caption, env, fetcher);
  if (!reel.ok || !reel.creationId) {
    throw new Error(`Falha ao criar o container de Reel: ${reel.error}`);
  }
  return reel.creationId;
}

async function montarContainer(
  imageUrls: string[],
  caption: string,
  env: Record<string, string | undefined>,
  fetcher: typeof fetch,
  filhos?: EstadoDosFilhos,
): Promise<string> {
  if (imageUrls.length === 0) {
    throw new Error("Nenhum slide foi renderizado, não há o que publicar.");
  }

  if (imageUrls.length === 1) {
    const unico = await createSingleImageContainer(imageUrls[0], caption, env, fetcher);
    if (!unico.ok || !unico.creationId) {
      throw new Error(`Falha ao criar o container de imagem única: ${unico.error}`);
    }
    return unico.creationId;
  }

  /*
   * O teto da Meta, conferido antes da primeira chamada.
   *
   * Estourar aqui custaria N containers criados para depois o pai ser recusado,
   * e a recusa chegaria como erro genérico de API. Nosso gerador já limita
   * bem abaixo disso; esta guarda existe para o caso de a peça chegar aqui por
   * outro caminho.
   */
  if (imageUrls.length > TETO_DE_FILHOS_DO_CARROSSEL) {
    throw new Error(
      `Carrossel com ${imageUrls.length} slides: a Meta aceita no máximo ${TETO_DE_FILHOS_DO_CARROSSEL}.`,
    );
  }

  const containerIds: string[] = [];

  for (const [i, url] of imageUrls.entries()) {
    const posicao = i + 1;
    const reaproveitado = filhos?.conhecidos.get(posicao);

    if (reaproveitado) {
      console.log(`[INSTAGRAM WORKER] slide ${posicao}: reusando o container ${reaproveitado}`);
      containerIds.push(reaproveitado);
      continue;
    }

    const item = await createCarouselItemContainer(url, env, fetcher);
    if (!item.ok || !item.creationId) {
      throw new Error(`Falha ao criar o container do slide ${posicao}: ${item.error}`);
    }
    containerIds.push(item.creationId);
    if (filhos) await filhos.registrar(posicao, item.creationId);
  }

  const pai = await createCarouselContainer(containerIds, caption, env, fetcher);

  if (!pai.ok || !pai.creationId) {
    /*
     * Filho reaproveitado pode ter vencido, e o pai é onde isso aparece.
     *
     * Container da Meta expira em 24h. Uma tentativa de ontem deixa ids
     * gravados que a API já não conhece, e o erro chega na criação do PAI, não
     * na do filho. Uma segunda passada com filhos novos é segura porque filho
     * não publica nada, e sem ela o post ficaria preso para sempre num id
     * vencido gravado por nós mesmos.
     */
    const houveReuso = imageUrls.some((_, i) => filhos?.conhecidos.has(i + 1));
    if (!houveReuso) {
      throw new Error(`Falha ao criar o container de carrossel: ${pai.error}`);
    }

    console.warn(
      `[INSTAGRAM WORKER] o pai recusou os filhos reaproveitados (${pai.error}); ` +
        `recriando todos os ${imageUrls.length} slides`,
    );
    filhos!.conhecidos.clear();
    return montarContainer(imageUrls, caption, env, fetcher, filhos);
  }

  return pai.creationId;
}

type SlideSubido = { index: number; url: string; filename: string };

/**
 * Registra "publicação incerta" e ESCALA se nem isso puder ser registrado.
 *
 * Este é o pior estado do sistema: a Meta pode ter publicado, e daqui não se
 * sabe. A linha marcada como `failed` com o motivo é o que impede o próximo
 * giro de tentar de novo e possivelmente duplicar o post.
 *
 * Se a gravação desse registro falhar, a linha continua `scheduled`,
 * `findDuePosts` a pega no giro seguinte, e o risco de post duplicado volta.
 * Não há nada no código que resolva isso sozinho: o que existe é avisar
 * alguém, com o id do container na mão, enquanto ainda dá para reconciliar.
 */
async function registrarRevisao(
  socialPostId: string,
  motivo: string,
  creationId?: string | null,
): Promise<void> {
  const r = await markPostFailed(socialPostId, `PUBLICAÇÃO INCERTA: ${motivo}`);
  console.error(`[INSTAGRAM WORKER] ${socialPostId} precisa de revisão: ${motivo}`);

  if (!r.gravado) {
    await sendAlert(
      "critical",
      "Publicação incerta que NÃO consegui registrar",
      `Post ${socialPostId} teve desfecho incerto e a marcação falhou: ${r.erro}.\n` +
        `A linha continua elegível para o worker, então há risco de post duplicado.\n` +
        `Motivo original: ${motivo}` +
        (creationId ? `\nContainer: ${creationId}` : ""),
    );
  }
}

/**
 * O que os dois ramos entregam à parte irreversível.
 *
 * `carousel` só existe no legado: é o roteiro que ele acabou de gerar, e o
 * resultado da execução o devolve para quem chamou. O V2 não tem roteiro novo
 * para devolver, e inventar um vazio só para preencher o campo faria o
 * chamador achar que houve geração.
 */
type PreparoDaPublicacao = {
  legenda: string;
  slides: SlideSubido[];
  /** Só o Reel declara isto: o vídeo vai por outro container e espera mais. */
  tipo?: "reel";
  carousel?: InstagramCarouselContent;
  /** Só no carrossel: o que já foi criado na Meta e onde registrar o resto. */
  filhos?: EstadoDosFilhos;
  /**
   * Só no V2: o SHA-256 de cada arquivo baixado e conferido, na ordem.
   *
   * É com eles que o worker pergunta ao portão da fila pela segunda vez: a
   * versão aprovada tem de ser a versão que está nas mãos do worker AGORA, e
   * não a que o manifesto diz que deveria estar.
   */
  hashesConferidos?: string[];
};

/**
 * Caminho legado, sem uma vírgula de diferença.
 *
 * Este bloco saiu de dentro de `processScheduledPost` inteiro e na mesma
 * ordem: gera o roteiro, grava título/legenda/content_json e marca
 * `generated`, renderiza pelo renderizador antigo, grava o manifesto. O motivo
 * de virar função é ter um irmão do outro lado do `if`, não melhorar nada
 * aqui — post legado tem que continuar publicando exatamente como publicava.
 */
async function prepararLegado(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  meta: Record<string, unknown>,
  project: Project,
  editionDate: string,
  socialPostId: string,
  env: Record<string, string | undefined>,
  fetcher: typeof fetch,
): Promise<PreparoDaPublicacao> {
  const format: CarouselFormat = (meta.format as CarouselFormat) ?? "noticia";

  const pipelineResult = await generateCarouselForPost(format, meta, project, editionDate, env, fetcher);

  console.log(
    `[INSTAGRAM WORKER] ${project.slug} ${editionDate} formato ${format}: ${pipelineResult.carousel.title}`,
  );

  await gravarOuFalhar(
    supabase,
    socialPostId,
    {
      title: pipelineResult.carousel.title,
      caption: pipelineResult.carousel.caption.full_caption,
      // preserva os metadados de origem (format, story_index, article_slug, keyword…)
      content_json: { ...pipelineResult.carousel, ...meta },
      tokens_input: pipelineResult.usage.promptTokens,
      tokens_output: pipelineResult.usage.completionTokens,
      cost_estimate_usd: pipelineResult.usage.estimatedCostUsd,
      status: "generated",
    },
    "o roteiro gerado",
  );

  const slides = await renderAndUploadSlides(project, pipelineResult.carousel, editionDate, socialPostId);

  await gravarOuFalhar(
    supabase,
    socialPostId,
    { slides_manifest: slides, asset_paths: slides.map((s) => s.url) },
    "o manifesto dos slides",
  );

  return {
    legenda: pipelineResult.carousel.caption.full_caption,
    slides,
    carousel: pipelineResult.carousel,
  };
}

/**
 * Caminho social-v2: ler, conferir, materializar.
 *
 * Nenhuma chamada a modelo de linguagem, nenhuma escrita em `title`,
 * `caption` ou nas chaves editoriais de `content_json`. O que o worker grava é
 * só o rastro da própria execução — onde a arte foi parar.
 *
 * Carga incompleta não é tratada como erro técnico: é decisão de não publicar.
 * Ela sobe com o código `SOCIAL_V2_PAYLOAD_INCOMPLETE` e a lista do que
 * faltou, para o `catch` de fora gravar em `error_message` e o post ficar
 * parado até alguém olhar. Consertar aqui significaria gerar.
 */
async function prepararV2(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  linha: LinhaDePost,
  project: Project,
  editionDate: string,
  socialPostId: string,
  fetcher: typeof fetch,
): Promise<PreparoDaPublicacao> {
  const leitura = lerCargaV2(linha);

  if (!leitura.ok) {
    console.error(`[INSTAGRAM WORKER V2] ${socialPostId} bloqueado: ${leitura.motivo}`);
    throw new Error(leitura.motivo);
  }

  const { carga } = leitura;

  /*
   * Reivindica a vaga ANTES de falar com a Meta, e de forma atômica.
   *
   * `findDuePosts` seleciona por `status = scheduled`. Sem a reivindicação, a
   * linha seguia elegível durante todo o trabalho e dois giros concorrentes
   * publicariam o mesmo post.
   *
   * Gravar o status sem condição não resolveria: `UPDATE ... WHERE id = X` dá
   * certo nos dois giros. `reivindicarVaga` põe o estado anterior no WHERE,
   * então quem chega depois não afeta linha nenhuma e para aqui. Quem decide é
   * o Postgres, não a ordem em que dois processos acordaram.
   *
   * O estado novo é `generated` e não um `processing`: o CHECK da tabela aceita
   * ('draft','generated','approved','scheduled','published','failed'), e
   * inventar valor fora disso exigiria migration.
   */
  const posse = await reivindicarVaga(supabase, socialPostId, "scheduled", "generated");
  if (!posse.ganhou) throw new Error(`${MOTIVO_VAGA_DISPUTADA}: ${posse.motivo}`);

  console.log(
    `[INSTAGRAM WORKER V2] ${project.slug} ${editionDate}: "${carga.headline.slice(0, 60)}" ` +
      `(${carga.foto ? "com foto" : `capa de texto, ${carga.motivoSemFoto}`}, origem ${carga.originChannel})`,
  );

  /*
   * A arte não é desenhada aqui: ela foi congelada quando o post foi aprovado.
   *
   * O que resta é conferir que o arquivo no Storage continua sendo aquele. É
   * isso que tira o tema do banco, o desenho do painel, as fontes da rede e a
   * foto do Commons do caminho da publicação — quatro coisas que podiam ter
   * mudado entre a aprovação e agora.
   */
  const artefatos = await verificarArtefatos(carga, { socialPostId, fetcher });

  const slides: SlideSubido[] = artefatos.map((a, i) => ({
    index: i + 1,
    url: a.url,
    filename: a.filename,
  }));

  for (const a of artefatos) {
    console.log(
      `[INSTAGRAM WORKER V2] artefato conferido: ${a.filename}, ` +
        `${(a.bytes / 1024).toFixed(0)} KB, sha ${a.sha256.slice(0, 12)}`,
    );
  }

  if (carga.formato === "carousel") {
    console.log(`[INSTAGRAM WORKER V2] carrossel de ${slides.length} slides, todos conferidos`);
  }

  /*
   * Os containers filhos já criados, lidos do manifesto da linha.
   *
   * O manifesto é gravado por quem aprovou o post e reescrito aqui a cada
   * filho criado. Numa retentativa depois de o processo morrer no meio, é
   * daqui que sai o que não precisa ser refeito.
   */
  const doManifesto = new Map<number, string>();
  if (Array.isArray(linha.slides_manifest)) {
    for (const bruto of linha.slides_manifest as unknown[]) {
      if (!bruto || typeof bruto !== "object") continue;
      const item = bruto as { index?: unknown; provider_child_id?: unknown };
      const index = Number(item.index);
      const child = typeof item.provider_child_id === "string" ? item.provider_child_id.trim() : "";
      if (Number.isFinite(index) && child) doManifesto.set(index, child);
    }
  }

  const manifesto = slides.map((s) => ({
    index: s.index,
    url: s.url,
    filename: s.filename,
    sha256: artefatos[s.index - 1].sha256,
    bytes: artefatos[s.index - 1].bytes,
    provider_child_id: doManifesto.get(s.index) ?? null,
  }));

  /*
   * A gravação do manifesto é SÓ do carrossel, e isso não é economia.
   *
   * Na peça única o manifesto já foi gravado por quem aprovou o post, e não há
   * container filho para registrar. Gravar de novo aqui acrescentava uma
   * escrita no banco entre a conferência do hash e a criação do container no
   * caminho da NOTÍCIA, que hoje publica em produção: uma falha de PostgREST
   * naquele instante passaria a derrubar um post que antes saía, e o post
   * terminaria em `failed`, fora da fila.
   *
   * Foi apontado na revisão adversarial, e a correção é não tocar no caminho
   * que não precisa da escrita.
   */
  if (carga.formato === "carousel") {
    await gravarOuFalhar(
      supabase,
      socialPostId,
      { slides_manifest: manifesto, asset_paths: manifesto.map((m) => m.url) },
      "o manifesto dos artefatos conferidos",
    );
  }

  const filhos: EstadoDosFilhos = {
    conhecidos: doManifesto,
    registrar: async (index, creationId) => {
      const alvo = manifesto.find((m) => m.index === index);
      if (alvo) alvo.provider_child_id = creationId;
      await gravarOuFalhar(
        supabase,
        socialPostId,
        { slides_manifest: manifesto },
        `o container do slide ${index}`,
      );
    },
  };

  return {
    legenda: carga.legenda,
    slides,
    ...(carga.formato === "reel" ? { tipo: "reel" as const } : {}),
    filhos: carga.formato === "carousel" ? filhos : undefined,
    hashesConferidos: artefatos.map((a) => a.sha256),
  };
}

/** Quanto tempo uma vaga pode ficar em `generated` antes de ser considerada órfã. */
const MINUTOS_PARA_ORFA = 30;

export type ResultadoDaRecuperacao = {
  examinadas: number;
  devolvidasParaFila: number;
  publicadasNaReconciliacao: number;
  mandadasParaRevisao: number;
  linhas: string[];
};

/**
 * Vagas do V2 que ficaram presas em `generated`, e como cada caso volta.
 *
 * O worker reivindica a vaga trocando `scheduled` por `generated` antes de
 * falar com a Meta. Isso é o que impede dois giros de publicarem o mesmo post,
 * e cria um estado do qual não se sai sozinho: `findDuePosts` só devolve
 * `scheduled`, então um processo que morra no meio deixa a linha parada para
 * sempre. Antes disto, a saída era SQL na mão.
 *
 * Os dois casos são diferentes e não podem receber o mesmo tratamento:
 *
 *   - SEM `provider_creation_id`: nenhum container foi criado, então nada foi
 *     publicado nem pode ter sido. Devolver para a fila é seguro.
 *
 *   - COM `provider_creation_id`: existe um container na Meta e o desfecho é
 *     desconhecido. Devolver para a fila sem perguntar seria autorizar uma
 *     segunda publicação do mesmo post. Aqui a reconciliação vem PRIMEIRO, com
 *     o token efetivo, e ela é que decide: publicado, para revisão, ou livre
 *     para refazer.
 *
 * Só linhas explicitamente `social-v2` entram. O caminho legado tem a mesma
 * propriedade e não é tocado: mexer nele aumentaria risco de republicação em
 * troca de nada, já que o V2 é o que vai entrar em produção.
 */
export async function recuperarOrfaosV2(
  opcoes: {
    projectId?: string;
    minutos?: number;
    limite?: number;
    env?: Record<string, string | undefined>;
    fetcher?: typeof fetch;
  } = {},
): Promise<ResultadoDaRecuperacao> {
  const env = opcoes.env ?? process.env;
  const fetcher = opcoes.fetcher ?? fetch;
  const supabase = getSupabaseAdminClient();
  const r: ResultadoDaRecuperacao = {
    examinadas: 0,
    devolvidasParaFila: 0,
    publicadasNaReconciliacao: 0,
    mandadasParaRevisao: 0,
    linhas: [],
  };

  const corte = new Date(Date.now() - (opcoes.minutos ?? MINUTOS_PARA_ORFA) * 60_000).toISOString();

  const { data, error } = await supabase
    .from("social_posts")
    .select("id, project_id, provider_creation_id, provider_post_id, publish_attempted_at, caption")
    .eq("platform", "instagram")
    .eq("generation_version", GERACAO_V2)
    .eq("status", "generated")
    .lt("updated_at", corte)
    .limit(opcoes.limite ?? 5);

  if (error) {
    r.linhas.push(`[RECUPERAÇÃO V2] não consegui listar as órfãs: ${error.message}`);
    return r;
  }

  for (const linha of data ?? []) {
    const id = linha.id as string;
    r.examinadas += 1;

    /*
     * Reivindica ANTES de qualquer coisa, e de forma atômica.
     *
     * Dois workers rodando a recuperação ao mesmo tempo disputam esta linha, e
     * quem perde não afeta registro nenhum e sai. Sem isso, os dois
     * reconciliariam o mesmo container em paralelo.
     */
    const posse = await reivindicarVaga(supabase, id, "generated", "scheduled");
    if (!posse.ganhou) {
      r.linhas.push(`[RECUPERAÇÃO V2] ${id}: ${posse.motivo}`);
      continue;
    }

    const creationId = (linha.provider_creation_id as string | null) ?? null;

    if (!creationId) {
      // Nenhum container: nada foi publicado, e a fila resolve.
      r.devolvidasParaFila += 1;
      r.linhas.push(`[RECUPERAÇÃO V2] ${id} voltou para a fila: nenhum container foi criado.`);
      continue;
    }

    /*
     * Com container, a Meta é quem sabe. E a pergunta vai com o token efetivo:
     * a semente da env está vencida em regime, e perguntar com ela devolveria
     * "não consegui consultar" para todo container saudável.
     */
    const projectId = (linha.project_id as string) ?? opcoes.projectId ?? "";
    const igEnv = await envDoInstagram(projectId, env);

    const desfecho = await reconciliarTentativaAnterior(
      supabase,
      id,
      {
        providerPostId: (linha.provider_post_id as string | null) ?? null,
        providerCreationId: creationId,
        publishAttemptedAt: (linha.publish_attempted_at as string | null) ?? null,
        caption: (linha.caption as string | null) ?? "",
      },
      igEnv,
      fetcher,
    );

    if (desfecho?.desfecho === "publicado") {
      r.publicadasNaReconciliacao += 1;
      r.linhas.push(`[RECUPERAÇÃO V2] ${id} já estava publicado (${desfecho.mediaId}); registro acertado.`);
      continue;
    }

    if (desfecho?.desfecho === "revisar") {
      await registrarRevisao(id, desfecho.motivo, creationId);
      r.mandadasParaRevisao += 1;
      continue;
    }

    // Container expirado ou nada a reconciliar: refazer do zero é seguro.
    r.devolvidasParaFila += 1;
    r.linhas.push(`[RECUPERAÇÃO V2] ${id} voltou para a fila: o container anterior não publicou.`);
  }

  for (const l of r.linhas) console.log(l);
  return r;
}

/** Processa uma vaga agendada de ponta a ponta. */
export async function processScheduledPost(
  socialPostId: string,
  options: { autoPost?: boolean } = {},
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): Promise<InstagramRunResult> {
  const startTime = Date.now();
  const supabase = getSupabaseAdminClient();

  const { data: post, error: postErr } = await supabase
    .from("social_posts")
    /*
     * As colunas do V2 entram aqui, e o VALOR delas não muda o caminho legado:
     * numa linha antiga voltam nulas, `ehSocialV2` diz não, o fluxo segue.
     *
     * A EXISTÊNCIA delas, porém, é compartilhada. PostgREST recusa a consulta
     * inteira com 42703 se uma única coluna do select não existir no schema, e
     * isso derrubaria todo post, legado incluído. Conferido contra o banco de
     * produção: as 17 estão lá. É por isso que a falha abaixo virou alerta em
     * vez de exceção muda — a próxima coluna que alguém acrescentar aqui não
     * pode falhar em silêncio.
     */
    // Uma linha só, e literal: o cliente tipado do Supabase infere as colunas
    // lendo esta string em tempo de compilação, e concatená-la apaga os tipos.
    .select("id, project_id, edition_date, status, content_json, title, caption, provider_post_id, provider_creation_id, publish_attempted_at, generation_version, dry_run, story_id, event_fingerprint, visual_asset_id, origin_channel, social_guard_status, slides_manifest")
    .eq("id", socialPostId)
    .maybeSingle();

  /*
   * Falha de leitura não é o mesmo que post inexistente, e as duas ficavam com
   * a mesma frase.
   *
   * Este `throw` acontece ANTES do `try` que trata o resto do fluxo, então ele
   * não passa por `markPostFailed` nem por `sendAlert`: a linha continua
   * `scheduled`, elegível no giro seguinte, sem rastro. Para um post que não
   * existe isso é correto e inofensivo. Para um erro de schema ou de conexão
   * seria um laço silencioso a cada giro, e é o tipo de coisa que se descobre
   * pelo Instagram vazio.
   */
  if (postErr) {
    const motivo = `Não consegui ler o post ${socialPostId}: ${postErr.message}`;
    console.error(`[INSTAGRAM WORKER] ${motivo}`);
    await sendAlert("critical", "Worker do Instagram não conseguiu ler a vaga", motivo);
    throw new Error(motivo);
  }

  if (!post) {
    throw new Error(`Post ${socialPostId} não encontrado.`);
  }

  const projectId = post.project_id as string;
  const linha = post as LinhaDePost;

  try {
    /*
     * Duas perguntas que vêm antes de falar com a Meta.
     *
     * A reconciliação de tentativa anterior pode REPUBLICAR um container que
     * ficou pendente, e ela roda antes da bifurcação — de propósito, porque
     * "isto já foi ao ar?" não depende de quem gerou o post. O efeito colateral
     * é que as guardas do V2, que moram em `lerCargaV2`, ficam depois dela.
     *
     * Então o que não pode esperar sobe para cá: um ensaio nunca vai ao ar, e
     * uma versão de geração escrita e não reconhecida nunca vai para o gerador
     * antigo. Nos dois casos o post para, com código no `error_message`, e
     * alguém olha.
     */
    if (!ehLegado(linha) && !ehSocialV2(linha)) {
      throw new Error(
        `${MOTIVO_VERSAO_DESCONHECIDA}: generation_version="${String(post.generation_version)}" ` +
          `não é reconhecida. Não mando para o gerador antigo, que reescreveria a copy.`,
      );
    }

    if (ehSocialV2(linha) && ehEnsaio(linha)) {
      throw new Error(`${MOTIVO_CARGA_INCOMPLETA}: dry_run=${String(post.dry_run)}, é ensaio e não publica`);
    }

    if (post.status === "published") {
      return {
        ok: true,
        projectId,
        socialPostId,
        status: "published",
        executionTimeMs: Date.now() - startTime,
      };
    }

    /*
     * O token efetivo é resolvido AQUI, e não depois, porque a reconciliação
     * também fala com a Meta.
     *
     * `INSTAGRAM_ACCESS_TOKEN` na env é semente: o token que vale mora em
     * `project_credentials` e é trocado pelo cron a cada ~60 dias. Ninguém
     * atualiza a env depois da primeira troca, então em regime a semente está
     * vencida — que é o estado normal, não a exceção.
     *
     * Enquanto isto era resolvido 78 linhas abaixo, a reconciliação consultava
     * o container com a semente vencida, recebia "Session has expired", e
     * devolvia "revisar". O efeito: um post que ESTÁ publicado no Instagram
     * nunca tinha o `media_id` reconciliado, ficava sem insights e sem
     * automação de Direct, e a linha era marcada como falha. O container estava
     * saudável; só o token da pergunta é que não.
     */
    const igEnv = await envDoInstagram(projectId, env);

    /*
     * Antes de gastar um centavo, perguntar se já foi.
     *
     * `status` não é prova de nada: se a Meta publicou e a gravação seguinte
     * falhou, a linha ficou em `generated` com o post no ar. Quem sabe a
     * verdade é o container, e é a ele que se pergunta. Nada abaixo desta
     * verificação roda para um post que já está publicado.
     */
    const jaTentado = await reconciliarTentativaAnterior(
      supabase,
      socialPostId,
      {
        providerPostId: (post.provider_post_id as string | null) ?? null,
        providerCreationId: (post.provider_creation_id as string | null) ?? null,
        publishAttemptedAt: (post.publish_attempted_at as string | null) ?? null,
        caption: (post.caption as string | null) ?? "",
      },
      igEnv,
      fetcher,
    );

    if (jaTentado?.desfecho === "publicado") {
      console.log(
        `[INSTAGRAM WORKER] Post ${socialPostId} já estava publicado (mídia ${jaTentado.mediaId}). Nada refeito.`,
      );
      return {
        ok: true,
        projectId,
        socialPostId,
        status: "published",
        providerPostId: jaTentado.mediaId,
        executionTimeMs: Date.now() - startTime,
      };
    }

    if (jaTentado?.desfecho === "revisar") {
      await registrarRevisao(socialPostId, jaTentado.motivo, post.provider_creation_id ?? undefined);
      return {
        ok: false,
        projectId,
        socialPostId,
        status: "needs_review",
        error: jaTentado.motivo,
        executionTimeMs: Date.now() - startTime,
      };
    }

    const project = await requireActiveProject(projectId);

    /*
     * O portão da fila de aprovação, primeira pergunta (05/10/2026, RF-20).
     *
     * Antes de reivindicar a vaga e antes de gerar ou baixar qualquer coisa:
     * post sem aprovação registrada da versão que está na linha não sai. Com a
     * fila desligada no projeto a função não lê o banco e libera, que é o
     * worker de antes. Quando segura, lança com o prefixo do portão, e o
     * `catch` abaixo devolve o post para `draft` em vez de marcá-lo `failed`.
     *
     * Vale para as três origens de `scheduled`, inclusive o carrossel de
     * campanha do Sistema PROMPT, que está congelado e grava sem perguntar: é
     * aqui que ele é barrado.
     */
    await conferirPostNoWorker(supabase, project, { ...linha, id: socialPostId });

    const editionDate = post.edition_date as string;
    const meta = (post.content_json ?? {}) as Record<string, unknown>;

    /*
     * A bifurcação, e por que ela mora exatamente aqui.
     *
     * Acima desta linha está o que vale para os dois ramos: achar a linha,
     * desistir se já publicou, e reconciliar uma tentativa anterior — a
     * pergunta "isto já foi ao ar?" não depende de quem gerou o post.
     *
     * Abaixo dela está a única diferença real: o legado PRODUZ o post, este
     * ramo o MATERIALIZA. Da montagem do container para baixo os dois voltam a
     * ser o mesmo código, porque a parte irreversível não deve ter duas
     * implementações se envelhecendo em paralelo.
     */
    const ehV2 = ehSocialV2(linha);
    const preparo = ehV2
      ? await prepararV2(supabase, linha, project, editionDate, socialPostId, fetcher)
      : await prepararLegado(supabase, meta, project, editionDate, socialPostId, env, fetcher);

    const slides = preparo.slides;

    /*
     * Segunda pergunta ao portão, agora com os bytes na mão.
     *
     * A primeira comparou a aprovação com o manifesto da linha. Esta compara
     * com o hash de cada arquivo que o worker baixou e conferiu, mais a legenda
     * que vai para a Meta. Arquivo trocado depois da aprovação não chega a
     * virar container (cenário 3 do PRD).
     */
    if (ehV2 && preparo.hashesConferidos) {
      await conferirPostNoWorker(
        supabase,
        project,
        { id: socialPostId },
        hashDosArtefatosConferidos(preparo.legenda, preparo.hashesConferidos),
      );
    }

    const autoPost = options.autoPost ?? env.INSTAGRAM_AUTO_POST !== "false";

    if (!autoPost) {
      return {
        ok: true,
        projectId,
        socialPostId,
        status: "generated",
        ...(preparo.carousel ? { carousel: preparo.carousel } : {}),
        slideUrls: slides.map((s) => s.url),
        executionTimeMs: Date.now() - startTime,
      };
    }


    /*
     * Container primeiro, publicação depois, e o registro no meio.
     *
     * Montar o container não publica nada: é a etapa reversível. A partir de
     * `publicarComRegistro` tudo é irreversível, e é por isso que o
     * `creation_id` é gravado antes da chamada, não depois.
     */
    const creationId =
      preparo.tipo === "reel"
        ? await montarContainerDeReel(slides[0]?.url, preparo.legenda, igEnv, fetcher)
        : await montarContainer(
            slides.map((s) => s.url),
            preparo.legenda,
            igEnv,
            fetcher,
            preparo.filhos,
          );

    const publicacao =
      preparo.tipo === "reel"
        ? await publicarComRegistro(supabase, socialPostId, creationId, igEnv, fetcher, ESPERA_DO_REEL_MS)
        : await publicarComRegistro(supabase, socialPostId, creationId, igEnv, fetcher);

    if (publicacao.desfecho === "revisar") {
      await registrarRevisao(socialPostId, publicacao.motivo, publicacao.creationId);
      return {
        ok: false,
        projectId,
        socialPostId,
        status: "needs_review",
        error: publicacao.motivo,
        executionTimeMs: Date.now() - startTime,
      };
    }

    const mediaId = publicacao.mediaId;
    console.log(`[INSTAGRAM WORKER] Publicado com sucesso. Media ID: ${mediaId}`);

    // Post de campanha do Sistema PROMPT: é aqui, e só aqui, que o
    // `ig_media_id` existe sem ninguém ter que procurá-lo no Instagram. A
    // automação do OpenReply é criada agora, com a copy do Direct preenchida
    // por padrão — o painel deixa de exigir os dois à mão.
    const campaignId = String((post.content_json as Record<string, unknown> | null)?.campaign_id ?? "").trim();
    if (campaignId) {
      const r = await concluirCampanhaPublicada(campaignId, mediaId, projectId);
      console.log(
        `[INSTAGRAM WORKER] Campanha ${campaignId}: automação ${r.automacaoCriada ? "criada" : "não criada"}` +
          (r.erro ? ` (${r.erro})` : ""),
      );
    } else {
      /*
       * Post que não vem de campanha, que é o caso de toda notícia.
       *
       * O funil permanente do projeto entra aqui: a mesma keyword em toda
       * publicação, levando ao mesmo destino. Sem isto o CTA do post pede um
       * comentário que não dispara nada.
       */
      const f = await garantirFunilPermanente(projectId);
      console.log(
        f.ligado
          ? `[INSTAGRAM WORKER] Funil "${f.keyword}" ativo (automação ${f.automationId}` +
              `${f.criadaAgora ? ", criada agora" : ""}).`
          : `[INSTAGRAM WORKER] Funil permanente indisponível: ${f.motivo}`,
      );
    }

    return {
      ok: true,
      projectId,
      socialPostId,
      status: "published",
      providerPostId: mediaId,
      ...(preparo.carousel ? { carousel: preparo.carousel } : {}),
      slideUrls: slides.map((s) => s.url),
      executionTimeMs: Date.now() - startTime,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    /*
     * Vaga disputada sai ANTES de qualquer gravação, e a ordem aqui é o ponto.
     *
     * Quem perdeu a reivindicação atômica perdeu porque outro giro está
     * publicando este post agora. Se o perdedor seguisse para o
     * `markPostFailed` abaixo, ele marcaria `failed` justamente a linha que o
     * vencedor acabou de reivindicar, e o desfecho seria uma linha marcada como
     * falha com um post no ar. A disputa resolvida não é falha de ninguém.
     */
    /*
     * O portão da fila segurou o post: isto não é falha (cenário 2 do PRD).
     *
     * A linha volta para `draft` com o motivo, sai do caminho do worker, e
     * só volta a `scheduled` quando a fila a liberar. Marcar `failed` aqui
     * misturaria "esperando o editor" com "a Meta recusou" na mesma coluna.
     */
    if (ehMensagemDoPortao(message)) {
      await segurarPostNaFila(supabase, socialPostId, message);
      console.log(`[INSTAGRAM WORKER] ${socialPostId} segurado pela fila de aprovação: ${message}`);
      return {
        ok: true,
        projectId,
        socialPostId,
        status: "aguardando_aprovacao",
        error: message,
        executionTimeMs: Date.now() - startTime,
      };
    }

    if (message.startsWith(MOTIVO_VAGA_DISPUTADA)) {
      console.log(`[INSTAGRAM WORKER] ${socialPostId}: ${message}`);
      return {
        ok: true,
        projectId,
        socialPostId,
        status: "skipped",
        error: message,
        executionTimeMs: Date.now() - startTime,
      };
    }

    // O motivo fica gravado: as colunas error_message existiam e nunca eram
    // preenchidas, então uma falha só era descoberta olhando o Instagram.
    await markPostFailed(socialPostId, message);
    console.error(`[INSTAGRAM WORKER] Post ${socialPostId} falhou: ${message}`);

    /*
     * Carga V2 incompleta não é o sistema quebrando, é o sistema se recusando.
     *
     * Chamar isso de crítico junto com "a Meta caiu" e "o Chromium morreu"
     * ensina a ignorar o canal de alerta, que é como um alerta crítico morre
     * de verdade. O post fica parado, o código está no `error_message`, e o
     * aviso diz que é decisão e não incêndio.
     */
    const cargaIncompleta = message.startsWith(MOTIVO_CARGA_INCOMPLETA);

    await sendAlert(
      cargaIncompleta ? "warning" : "critical",
      cargaIncompleta ? "Post social-v2 bloqueado por carga incompleta" : "Post do Instagram falhou",
      `Post ${socialPostId}\n${cargaIncompleta ? message : formatError(err)}`,
    );

    return {
      ok: false,
      projectId,
      socialPostId,
      status: "failed",
      error: message,
      executionTimeMs: Date.now() - startTime,
    };
  }
}
