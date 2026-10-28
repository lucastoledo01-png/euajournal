import { z } from "zod";
import { callOpenAIJSON } from "../newsroom/ai-provider";
import type { PacoteFactual } from "./pacote-factual";

/**
 * Conclusão sem lastro.
 *
 * A conferência determinística pega nome, número e data inventados. Ela não
 * pega o erro que a edição de validação cometeu: dizer que a medida afeta o
 * custo das compras da Shein quando o material não diz o que a medida faz.
 * Nenhuma palavra ali é inventada. A frase inteira é.
 *
 * Este módulo confere o outro tipo de afirmação: causa, consequência, impacto,
 * comparação, tendência e previsão. Não dá para conferir isso com expressão
 * regular, porque o que se compara é sentido, então quem confere é modelo,
 * recebendo o pacote factual e o texto e devolvendo claim por claim.
 */

export const TIPOS_DE_CLAIM = [
  "causalidade",
  "consequencia",
  "impacto",
  "comparacao",
  "tendencia",
  "previsao",
  /**
   * Escopo: a afirmação é maior do que o fato que a sustenta.
   *
   * É o erro típico do carrossel, e ele não existe no post de imagem única com
   * a mesma força: com seis slides para preencher, "pode" vira "vai", "algumas
   * situações" vira "todos os casos", "evidência relevante" vira "requisito
   * obrigatório", e um caso aprovado vira regra geral de aprovação. Nenhuma
   * palavra é inventada; o que é inventado é o alcance.
   *
   * O tipo entra no enum para os dois canais, e a instrução que o descreve só
   * entra no prompt de quem pede: a newsletter continua recebendo o prompt que
   * ela sempre recebeu.
   */
  "escopo",
] as const;

export const ClaimSchema = z.object({
  /** Trecho exato do texto onde a afirmação aparece. */
  trecho: z.string(),
  tipo: z.enum(TIPOS_DE_CLAIM),
  sustentada: z.boolean(),
  /** Qual fato do pacote sustenta, ou por que não sustenta. */
  motivo: z.string().default(""),
  /** Qual pauta, pela ordem em que foram enviadas. */
  pauta: z.number().default(0),
});

export type ClaimSemantica = z.infer<typeof ClaimSchema>;

export const RespostaDeClaimsSchema = z.object({
  claims: z.array(ClaimSchema),
});

export type OpcoesDoPrompt = {
  /**
   * Acrescenta a auditoria de ESCOPO ao prompt.
   *
   * Fora por padrão para o prompt da newsletter continuar byte a byte o que
   * era: mudar o prompt de um canal que está publicando, de carona numa
   * mudança de outro canal, é como uma regressão editorial aparece sem
   * ninguém saber de onde veio.
   */
  comEscopo?: boolean;
};

export function montarSystemDeClaims(opcoes: OpcoesDoPrompt = {}): string {
  const escopo = opcoes.comEscopo
    ? `
- "escopo": a afirmação é maior do que o fato que a sustenta. Nenhuma palavra é inventada; o alcance é. Marque como NÃO sustentada quando o texto:
  - troca possibilidade por certeza: a fonte diz "pode", "em geral", "costuma", e o texto diz "vai", "garante", "sempre";
  - troca parte por todo: a fonte fala de "algumas situações", "certos casos", "muitos pedidos", e o texto diz "todos", "qualquer", "em qualquer caso";
  - troca um caso por uma regra: a fonte descreve um exemplo, uma decisão específica ou um caso aprovado, e o texto afirma como regra geral;
  - troca evidência por exigência: a fonte diz que algo "pode ser apresentado", "é considerado" ou "conta como evidência", e o texto diz "é obrigatório", "é exigido", "precisa";
  - troca permissão por direito: a fonte diz que algo "é permitido em determinadas condições", e o texto diz que a pessoa "tem direito" sem as condições.
`
    : "";

  return `
Você audita afirmações editoriais contra um pacote factual.

Receberá, para cada pauta, o pacote factual (a íntegra do que a redação tinha) e o texto que foi escrito a partir dele.

Sua tarefa é listar as afirmações do texto que pertencem a estes tipos:

- "causalidade": diz que uma coisa causou outra.
- "consequencia": diz que algo vai provocar, gerar ou levar a algo.
- "impacto": diz que algo afeta, prejudica, beneficia ou muda a situação de alguém (consumidor, empresa, trabalhador, imigrante, brasileiro).
- "comparacao": diz que algo está melhor, pior, maior ou menor que outra coisa.
- "tendencia": diz que algo está crescendo, caindo, acelerando ou desacelerando.
- "previsao": diz que algo deve acontecer, vai acontecer ou é esperado.
${escopo}
Para cada uma, responda se ela está SUSTENTADA pelo pacote factual daquela pauta.

Está sustentada quando o pacote afirma aquilo, ou quando a afirmação é a leitura direta e inevitável de um fato do pacote. Exemplo de sustentada: o pacote diz que o prazo passou de 180 para 540 dias, e o texto diz que a espera ficou maior.

NÃO está sustentada quando exige informação que o pacote não tem. Exemplos:
- o pacote não diz o conteúdo da medida, e o texto afirma que ela encarece as compras.
- o pacote não traz número de empregos, e o texto afirma que a medida gera empregos.
- o pacote não compara períodos, e o texto afirma que a situação piorou.
- o pacote registra em "gaps" que a matéria não informa algo, e o texto informa assim mesmo.

Frase que apenas descreve o que aconteceu não é claim: ignore.

Frase que diz que a fonte não informou algo também não é claim, e continua sendo ignorada AQUI: ela não afirma nada sobre o mundo, então não há o que sustentar. Mas ela deixou de ser desejável no produto, e quem aponta isso é o auditor de qualidade, não este. Não a marque como claim não sustentada: marcar faria uma escolha de redação derrubar a edição por falta de lastro, que é coisa diferente.

Seja literal. Não invente claim que o texto não faz, e não perdoe claim que o pacote não sustenta.

Devolva JSON: {"claims": [{"trecho": "...", "tipo": "...", "sustentada": true|false, "motivo": "...", "pauta": 0}]}, com "pauta" no índice recebido.
`.trim();
}

export type PautaAuditavel = {
  indice: number;
  titulo: string;
  texto: string;
  pacote: PacoteFactual;
};

export type ResultadoDeClaims = {
  claims: ClaimSemantica[];
  naoSustentadas: ClaimSemantica[];
  custoUsd: number;
  tokens: number;
  /** Quando a auditoria não pôde rodar. Vazio não é o mesmo que aprovado. */
  erro: string | null;
};

/**
 * O corpo do pedido de auditoria, exportado para o motor Claude via MCP
 * (27/10/2026): a tarefa de auditoria servida ao Claude Desktop leva este
 * texto, o mesmo que a OpenAI recebe.
 */
export function montarUserDeClaims(pautas: PautaAuditavel[]): string {
  return pautas
    .map((p) =>
      [
        `PAUTA ${p.indice}: ${p.titulo}`,
        "",
        "Pacote factual:",
        JSON.stringify(
          {
            verified_facts: p.pacote.verified_facts,
            people: p.pacote.people,
            organizations: p.pacote.organizations,
            places: p.pacote.places,
            dates: p.pacote.dates,
            numbers: p.pacote.numbers,
            gaps: p.pacote.gaps,
          },
          null,
          1
        ),
        "",
        "Texto escrito:",
        p.texto,
      ].join("\n")
    )
    .join("\n\n=====\n\n");
}

/**
 * O que vale para toda resposta de auditoria, do modelo da esteira ou do Claude.
 * Resposta fora do esquema volta como `erro`, e erro não é aprovação.
 */
export function aceitarClaims(data: unknown): { claims: ClaimSemantica[]; naoSustentadas: ClaimSemantica[] } | { erro: string } {
  const parsed = RespostaDeClaimsSchema.safeParse(data);
  if (!parsed.success) return { erro: `formato inválido: ${parsed.error.issues[0]?.message ?? ""}` };
  return { claims: parsed.data.claims, naoSustentadas: parsed.data.claims.filter((c) => !c.sustentada) };
}

export async function auditarClaims(
  pautas: PautaAuditavel[],
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
  opcoes: OpcoesDoPrompt = {}
): Promise<ResultadoDeClaims> {
  if (pautas.length === 0) {
    return { claims: [], naoSustentadas: [], custoUsd: 0, tokens: 0, erro: null };
  }

  const modelo = env.OPENAI_MODEL_TRIAGE || "gpt-4o-mini";
  const corpo = montarUserDeClaims(pautas);

  try {
    const { data, usage } = await callOpenAIJSON<unknown>(
      [
        { role: "system", content: montarSystemDeClaims(opcoes) },
        { role: "user", content: corpo },
      ],
      modelo,
      env,
      fetcher
    );

    const parsed = RespostaDeClaimsSchema.safeParse(data);
    if (!parsed.success) {
      return {
        claims: [],
        naoSustentadas: [],
        custoUsd: usage.estimatedCostUsd,
        tokens: usage.totalTokens,
        erro: `formato inválido: ${parsed.error.issues[0]?.message ?? ""}`,
      };
    }

    return {
      claims: parsed.data.claims,
      naoSustentadas: parsed.data.claims.filter((c) => !c.sustentada),
      custoUsd: usage.estimatedCostUsd,
      tokens: usage.totalTokens,
      erro: null,
    };
  } catch (erro) {
    return {
      claims: [],
      naoSustentadas: [],
      custoUsd: 0,
      tokens: 0,
      erro: (erro as Error).message,
    };
  }
}
