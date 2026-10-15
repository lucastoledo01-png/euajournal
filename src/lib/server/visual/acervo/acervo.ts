import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaisDaCobertura } from "./catalogo-de-cenas";
import { capacidadeDoAcervo, type ModoDoAcervo } from "./modo";
import type { ProjetoComCapacidades } from "../../capacidades";

/**
 * O acervo próprio, visto pelo resolvedor.
 *
 * É uma PORTA, e não um cliente de banco, pelo mesmo motivo da `Biblioteca`:
 * o teste dos cinco casos decide o que o acervo tem sem rede e sem Supabase, e
 * a implementação de verdade fica num lugar só.
 *
 * Três tabelas, todas novas e todas com `project_id not null` sem default
 * (lição de 03/09/2026: default de projeto grava no projeto errado em
 * silêncio). O DDL está em `supabase/migrations/20261005120000_acervo_proprio.sql`.
 */

export const TABELA_DO_ACERVO = "acervo_imagens";
export const TABELA_DE_FALTAS = "acervo_faltas";
export const BUCKET_DO_ACERVO = "acervo";

export type ImagemDoAcervo = {
  id: string;
  arquivo: string;
  grupo: string;
  pais: string;
  assunto: string;
  detalhe: string;
  tag: string;
  repositorio: string;
  caminho: string;
  urlPublica: string;
  largura: number;
  altura: number;
  orientacao: string | null;
  tom: string | null;
  luminanciaDoTopo: number | null;
  autor: string;
  licenca: string;
  /** Página do original (Commons, banco oficial) ou o link do Drive. */
  originalRef?: string | null;
  /**
   * Gravado e nunca lido como barreira (decisão de 29/09/2026: "as travas de
   * licença saem, o registro fica"). Anotar de onde a imagem veio custa zero e
   * é o que permite responder se alguém perguntar.
   */
  rightsStatus: string;
  usos: number;
  ultimoUsoEm: string | null;
};

export type TipoDeFalta = "cena" | "entidade";

/**
 * Por que o acervo não atendeu.
 *
 *   vazio   não existe nenhuma foto desta tag (ou desta entidade)
 *   janela  existe, mas todas já saíram dentro da janela de repetição
 *
 * Os dois entram na lista de compras, e o motivo fica separado porque pedem
 * providências diferentes: "vazio" é cena a produzir, "janela" é cena a
 * aprofundar.
 */
export type MotivoDaFalta = "vazio" | "janela";

export type FaltaNoAcervo = {
  storyId: string;
  tipo: TipoDeFalta;
  /** A tag (`grupo/assunto`) ou o assunto da entidade (`donald_trump`). */
  chave: string;
  pais: string;
  motivo: MotivoDaFalta;
  titulo?: string;
};

export type Acervo = {
  modo: ModoDoAcervo;
  /** Marca uso da escolhida. Só em `enforce`: no ensaio nada foi usado. */
  gravarUso: boolean;
  /** Grava a lista de compras. Vale também no ensaio, que é quando ela mais ensina. */
  gravarFaltas: boolean;
  /** Fotos cujo `assunto` é uma destas chaves, de qualquer grupo e país. */
  porAssunto(assuntos: string[]): Promise<ImagemDoAcervo[]>;
  /** Fotos desta tag, neste país. */
  porTag(tag: string, pais: PaisDaCobertura): Promise<ImagemDoAcervo[]>;
  registrarUso(id: string): Promise<void>;
  registrarFalta(falta: FaltaNoAcervo): Promise<void>;
};

const COLUNAS =
  "id,arquivo,grupo,pais,assunto,detalhe,tag,repositorio,caminho,url_publica,largura,altura," +
  "orientacao,tom,luminancia_topo,autor,licenca,original_ref,rights_status,usos,ultimo_uso_em";

type Linha = {
  id: string;
  arquivo: string;
  grupo: string;
  pais: string;
  assunto: string;
  detalhe: string | null;
  tag: string;
  repositorio: string;
  caminho: string;
  url_publica: string;
  largura: number;
  altura: number;
  orientacao: string | null;
  tom: string | null;
  luminancia_topo: number | string | null;
  autor: string | null;
  licenca: string | null;
  original_ref?: string | null;
  rights_status: string | null;
  usos: number | null;
  ultimo_uso_em: string | null;
};

export function daLinha(l: Linha): ImagemDoAcervo {
  return {
    id: l.id,
    arquivo: l.arquivo,
    grupo: l.grupo,
    pais: l.pais,
    assunto: l.assunto,
    detalhe: l.detalhe ?? "",
    tag: l.tag,
    repositorio: l.repositorio,
    caminho: l.caminho,
    urlPublica: l.url_publica,
    largura: Number(l.largura ?? 0),
    altura: Number(l.altura ?? 0),
    orientacao: l.orientacao,
    tom: l.tom,
    luminanciaDoTopo: l.luminancia_topo === null ? null : Number(l.luminancia_topo),
    autor: l.autor ?? "",
    licenca: l.licenca ?? "",
    originalRef: l.original_ref ?? null,
    rightsStatus: l.rights_status ?? "unknown",
    usos: Number(l.usos ?? 0),
    ultimoUsoEm: l.ultimo_uso_em,
  };
}

export type OpcoesDoAcervo = {
  gravarUso?: boolean;
  gravarFaltas?: boolean;
};

export function criarAcervo(
  client: SupabaseClient,
  projectId: string,
  modo: ModoDoAcervo,
  opcoes: OpcoesDoAcervo = {},
): Acervo {
  /*
   * A ordem é "menos usada recentemente primeiro", com nunca usada na frente.
   * É o que espalha o uso pela tag inteira em vez de gastar sempre a primeira
   * foto que entrou, que foi o defeito da busca de uma foto só em 13/09/2026.
   */
  const ordenar = { ascending: true, nullsFirst: true } as const;

  return {
    modo,
    gravarUso: opcoes.gravarUso ?? modo === "enforce",
    gravarFaltas: opcoes.gravarFaltas ?? true,

    async porAssunto(assuntos) {
      const chaves = [...new Set(assuntos.filter(Boolean))];
      if (chaves.length === 0) return [];
      const { data, error } = await client
        .from(TABELA_DO_ACERVO)
        .select(COLUNAS)
        .eq("project_id", projectId)
        .eq("status", "ativa")
        .in("assunto", chaves)
        .order("ultimo_uso_em", ordenar)
        .limit(50);
      if (error) throw new Error(`Acervo, leitura por assunto falhou: ${error.message}`);
      return ((data ?? []) as unknown as Linha[]).map(daLinha);
    },

    async porTag(tag, pais) {
      const { data, error } = await client
        .from(TABELA_DO_ACERVO)
        .select(COLUNAS)
        .eq("project_id", projectId)
        .eq("status", "ativa")
        .eq("tag", tag)
        .eq("pais", pais)
        .order("ultimo_uso_em", ordenar)
        .limit(50);
      if (error) throw new Error(`Acervo, leitura por tag falhou: ${error.message}`);
      return ((data ?? []) as unknown as Linha[]).map(daLinha);
    },

    async registrarUso(id) {
      const { data, error: erroDeLeitura } = await client
        .from(TABELA_DO_ACERVO)
        .select("usos")
        .eq("id", id)
        .eq("project_id", projectId)
        .maybeSingle();
      if (erroDeLeitura) throw new Error(`Acervo, uso não lido: ${erroDeLeitura.message}`);
      const atual = Number((data as { usos?: number } | null)?.usos ?? 0);

      const { error } = await client
        .from(TABELA_DO_ACERVO)
        .update({ usos: atual + 1, ultimo_uso_em: new Date().toISOString() })
        .eq("id", id)
        .eq("project_id", projectId);
      if (error) throw new Error(`Acervo, uso não registrado: ${error.message}`);
    },

    async registrarFalta(falta) {
      /*
       * Uma linha por (pauta, tipo, chave). A mesma pauta resolvida duas vezes
       * (newsletter e Instagram, ou uma retentativa) contaria em dobro, e a
       * lista de compras é ordenada justamente por frequência.
       */
      const { error } = await client.from(TABELA_DE_FALTAS).upsert(
        {
          project_id: projectId,
          story_id: falta.storyId,
          tipo: falta.tipo,
          chave: falta.chave,
          pais: falta.pais,
          motivo: falta.motivo,
          titulo: (falta.titulo ?? "").slice(0, 300),
        },
        { onConflict: "project_id,story_id,tipo,chave", ignoreDuplicates: true },
      );
      if (error) throw new Error(`Acervo, falta não registrada: ${error.message}`);
    },
  };
}

/**
 * O acervo do projeto, ou nada quando a capacidade não está ligada.
 *
 * `null` é o caminho de amanhã: projeto que não declara `acervo` não recebe
 * acervo nenhum, e o resolvedor roda exatamente como antes desta mudança.
 */
export function acervoDoProjeto(
  client: SupabaseClient | null | undefined,
  projeto: (ProjetoComCapacidades & { id: string }) | null | undefined,
  opcoes: OpcoesDoAcervo = {},
): Acervo | null {
  if (!client || !projeto?.id) return null;
  const modo = capacidadeDoAcervo(projeto);
  if (modo === "off") return null;
  return criarAcervo(client, projeto.id, modo, opcoes);
}
