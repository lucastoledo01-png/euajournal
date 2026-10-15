import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lerNomeDoArquivo, type NomeLido } from "./nome-do-arquivo";
import {
  ALTURA_DO_DERIVADO,
  LARGURA_DO_DERIVADO,
  produzirDerivado,
  type Medida,
} from "./medida";
import { BUCKET_DO_ACERVO, TABELA_DO_ACERVO } from "./acervo";

/**
 * A ingestão do acervo: pasta local de arquivos nomeados, para Storage e linha.
 *
 * O designer nomeia o arquivo e mais nada (decisão de 29/09/2026). Daqui sai a
 * tag e o país lidos do nome, o tom e a orientação medidos nos pixels, e o
 * derivado de 2160x2880 que é o único arquivo que o sistema lê.
 *
 * Separado em PLANEJAR e APLICAR para o ensaio ser o mesmo código do real: o
 * plano é o que seria gravado, campo por campo, e aplicar só envia o plano.
 */

/**
 * Quanto o derivado pode ampliar o original.
 *
 * Ampliar até 2x ainda entrega 1080x1440 de pixel real, que é o canvas do
 * feed. Acima disso a foto fica mole na própria peça, e a recusa na porta é
 * mais barata que a foto borrada no ar.
 */
export const AMPLIACAO_MAXIMA = 2;

export type ArquivoPlanejado = {
  ok: true;
  origem: string;
  nome: NomeLido;
  medida: Medida;
  sha256: string;
  caminho: string;
  derivado: Buffer;
  avisos: string[];
};

export type ArquivoRecusado = { ok: false; origem: string; motivo: string };

export type PlanoDoArquivo = ArquivoPlanejado | ArquivoRecusado;

/** Onde o derivado mora no bucket. Sempre `.jpg`, que é o que o derivado é. */
export function caminhoNoBucket(projectId: string, nome: NomeLido): string {
  const base = nome.arquivo.replace(/\.[a-z0-9]+$/i, "");
  return `${projectId}/${nome.grupo}/${base}.jpg`;
}

export function ampliacaoNecessaria(largura: number, altura: number): number {
  if (largura <= 0 || altura <= 0) return Infinity;
  return Math.max(LARGURA_DO_DERIVADO / largura, ALTURA_DO_DERIVADO / altura);
}

export async function planejarArquivo(projectId: string, origem: string): Promise<PlanoDoArquivo> {
  const leitura = lerNomeDoArquivo(origem);
  if (!leitura.ok) return { ok: false, origem, motivo: leitura.motivo };

  let bruto: Buffer;
  try {
    bruto = await fs.readFile(origem);
  } catch (erro) {
    return { ok: false, origem, motivo: `não foi possível ler: ${(erro as Error).message}` };
  }

  let derivado: Awaited<ReturnType<typeof produzirDerivado>>;
  try {
    derivado = await produzirDerivado(bruto);
  } catch (erro) {
    return { ok: false, origem, motivo: `arquivo não é imagem legível: ${(erro as Error).message}` };
  }

  const { medida } = derivado;
  const ampliacao = ampliacaoNecessaria(medida.larguraOriginal, medida.alturaOriginal);
  if (ampliacao > AMPLIACAO_MAXIMA) {
    return {
      ok: false,
      origem,
      motivo:
        `original de ${medida.larguraOriginal}x${medida.alturaOriginal} precisaria ser ampliado ` +
        `${ampliacao.toFixed(1)}x para ${LARGURA_DO_DERIVADO}x${ALTURA_DO_DERIVADO}, teto ${AMPLIACAO_MAXIMA}x`,
    };
  }

  const avisos: string[] = [];
  if (ampliacao > 1) avisos.push(`ampliado ${ampliacao.toFixed(2)}x`);
  if (medida.orientacao === "paisagem") {
    avisos.push("original deitado: o corte para 3:4 tirou as laterais, conferir o enquadramento");
  }
  if (!leitura.nome.noCatalogo && leitura.nome.grupo !== "pessoas") {
    avisos.push(
      `tag "${leitura.nome.tag}" fora do cardápio da cena: só será alcançada pela entidade ` +
        `(assunto "${leitura.nome.assunto}"). Acrescente em catalogo-de-cenas.ts se for cena.`,
    );
  }

  return {
    ok: true,
    origem,
    nome: leitura.nome,
    medida,
    // O hash é do ORIGINAL: é ele que diz "este arquivo já entrou com outro nome".
    sha256: createHash("sha256").update(bruto).digest("hex"),
    caminho: caminhoNoBucket(projectId, leitura.nome),
    derivado: derivado.buffer,
    avisos,
  };
}

export type OpcoesDaLinha = {
  autor?: string;
  licenca?: string;
  /** Onde está o original em resolução cheia. O sistema nunca o lê. */
  originalRef?: string | null;
};

/** A linha exatamente como será gravada. O ensaio imprime isto. */
export function linhaDoAcervo(
  projectId: string,
  plano: ArquivoPlanejado,
  urlPublica: string,
  opcoes: OpcoesDaLinha = {},
) {
  return {
    project_id: projectId,
    arquivo: plano.nome.arquivo,
    grupo: plano.nome.grupo,
    pais: plano.nome.pais,
    assunto: plano.nome.assunto,
    detalhe: plano.nome.detalhe,
    numero: plano.nome.numero,
    tag: plano.nome.tag,
    no_catalogo: plano.nome.noCatalogo,
    repositorio: "supabase_storage",
    bucket: BUCKET_DO_ACERVO,
    caminho: plano.caminho,
    url_publica: urlPublica,
    original_repositorio: "drive",
    original_ref: opcoes.originalRef ?? null,
    largura: LARGURA_DO_DERIVADO,
    altura: ALTURA_DO_DERIVADO,
    largura_original: plano.medida.larguraOriginal,
    altura_original: plano.medida.alturaOriginal,
    orientacao: plano.medida.orientacao,
    tom: plano.medida.tom,
    luminancia: plano.medida.luminancia,
    luminancia_topo: plano.medida.luminanciaDoTopo,
    autor: opcoes.autor ?? "",
    licenca: opcoes.licenca ?? "acervo próprio",
    rights_status: "verified",
    sha256: plano.sha256,
    status: "ativa",
  };
}

/** Os arquivos de imagem da pasta, em ordem, sem descer em subpastas ocultas. */
export async function listarPasta(pasta: string): Promise<string[]> {
  const saida: string[] = [];
  const entradas = await fs.readdir(pasta, { withFileTypes: true });
  for (const e of entradas.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name.startsWith(".")) continue;
    const completo = path.join(pasta, e.name);
    if (e.isDirectory()) saida.push(...(await listarPasta(completo)));
    else if (/\.(jpe?g|png|webp|tiff?|heic)$/i.test(e.name)) saida.push(completo);
  }
  return saida;
}

/**
 * Duplicatas DENTRO do lote: mesmo nome, ou mesmo arquivo com nomes diferentes.
 *
 * As duas viram recusa da segunda ocorrência. Mesmo original com dois nomes
 * é a mesma foto em duas prateleiras, e a janela de repetição, que olha a
 * linha, deixaria ela sair duas vezes dentro do mês.
 */
export function recusarDuplicatas(planos: PlanoDoArquivo[]): PlanoDoArquivo[] {
  const nomes = new Set<string>();
  const hashes = new Map<string, string>();
  return planos.map((p) => {
    if (!p.ok) return p;
    if (nomes.has(p.nome.arquivo)) {
      return { ok: false, origem: p.origem, motivo: `nome repetido no lote: ${p.nome.arquivo}` };
    }
    const anterior = hashes.get(p.sha256);
    if (anterior) {
      return { ok: false, origem: p.origem, motivo: `mesmo arquivo que ${anterior}, com outro nome` };
    }
    nomes.add(p.nome.arquivo);
    hashes.set(p.sha256, p.nome.arquivo);
    return p;
  });
}

export type ResultadoDaAplicacao = { enviados: number; pulados: string[]; erros: string[] };

/**
 * Envia o plano. Só roda com `--aplicar`, e quem roda é o dono.
 *
 * Linha que já existe (mesmo projeto e mesmo nome) é pulada, nunca
 * sobrescrita: trocar a foto de um nome que já foi publicado faria a peça
 * antiga apontar para outra imagem. Para trocar, o designer muda o número.
 *
 * O upload vem ANTES da linha. Linha sem arquivo seria foto quebrada no ar;
 * arquivo sem linha é só espaço ocupado, e a próxima ingestão o reaproveita
 * (`upsert` no Storage).
 */
export async function aplicarPlano(
  client: SupabaseClient,
  projectId: string,
  planos: ArquivoPlanejado[],
  /** Uma opção para o lote, ou uma por arquivo (o crédito de cada foto, 14/10/2026). */
  opcoes: OpcoesDaLinha | ((plano: ArquivoPlanejado) => OpcoesDaLinha) = {},
): Promise<ResultadoDaAplicacao> {
  const resultado: ResultadoDaAplicacao = { enviados: 0, pulados: [], erros: [] };

  for (const plano of planos) {
    const { data: existente, error: erroDeLeitura } = await client
      .from(TABELA_DO_ACERVO)
      .select("id")
      .eq("project_id", projectId)
      .eq("arquivo", plano.nome.arquivo)
      .maybeSingle();
    if (erroDeLeitura) {
      resultado.erros.push(`${plano.nome.arquivo}: leitura falhou: ${erroDeLeitura.message}`);
      continue;
    }
    if (existente) {
      resultado.pulados.push(plano.nome.arquivo);
      continue;
    }

    const envio = await client.storage
      .from(BUCKET_DO_ACERVO)
      .upload(plano.caminho, plano.derivado, { contentType: "image/jpeg", upsert: true });
    if (envio.error) {
      resultado.erros.push(`${plano.nome.arquivo}: upload falhou: ${envio.error.message}`);
      continue;
    }

    const url = client.storage.from(BUCKET_DO_ACERVO).getPublicUrl(plano.caminho).data.publicUrl;
    const { error } = await client.from(TABELA_DO_ACERVO).insert(linhaDoAcervo(projectId, plano, url, typeof opcoes === "function" ? opcoes(plano) : opcoes));
    if (error) {
      resultado.erros.push(`${plano.nome.arquivo}: linha não gravada: ${error.message}`);
      continue;
    }
    resultado.enviados += 1;
  }

  return resultado;
}
