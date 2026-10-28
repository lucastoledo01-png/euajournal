import { extrairNumeros, numeroCompativel, numerosDoMaterial } from "../editorial/numeros-com-sentido";
import { semTravessao } from "../newsroom/anti-vicios";
import { validarLegendaSocial } from "../social/legenda";
import type { Ramo } from "./contrato";

/**
 * A guarda do texto editado à mão na fila (RF-23), 05/10/2026.
 *
 * Não é uma régua nova: são as réguas que a máquina já enfrenta, chamadas sobre
 * o texto que o editor escreveu. A diferença é só quem escreveu, e o leitor não
 * vê essa diferença.
 *
 *   - travessão, pela regra da casa (`anti-vicios.ts`);
 *   - número sem lastro, pela mesma comparação de valor E tipo que segura a
 *     redação (`numeros-com-sentido.ts`): o editor pode cortar e reescrever,
 *     mas número que não estava na peça nem no material precisa de fonte;
 *   - no post, a forma da legenda (`legenda.ts`): hashtag no fim, um CTA só,
 *     sem fechamento de newsletter.
 */

export type ProblemaDaEdicao = { codigo: string; detalhe: string };

export type EntradaDaGuarda = {
  ramo: Ramo;
  textoAnterior: string;
  textoNovo: string;
  /** Pacote factual e o que mais servir de lastro para número. */
  material: string[];
  keyword?: string;
  titulo?: string;
};

/** Teto do Instagram para a legenda, e do assunto de e-mail que ainda cabe na caixa de entrada. */
const LIMITE_POR_RAMO: Record<Ramo, number> = { post: 2200, newsletter: 200, artigo: 300, plano: 20000 };

export function conferirEdicao(e: EntradaDaGuarda): ProblemaDaEdicao[] {
  const problemas: ProblemaDaEdicao[] = [];
  const novo = e.textoNovo ?? "";

  if (!novo.trim()) {
    problemas.push({ codigo: "TEXTO_VAZIO", detalhe: "o texto editado está vazio" });
    return problemas;
  }

  if (novo.length > LIMITE_POR_RAMO[e.ramo]) {
    problemas.push({
      codigo: "TEXTO_LONGO_DEMAIS",
      detalhe: `${novo.length} caracteres, o teto do ramo ${e.ramo} é ${LIMITE_POR_RAMO[e.ramo]}`,
    });
  }

  if (semTravessao(novo) !== novo) {
    problemas.push({ codigo: "TRAVESSAO", detalhe: "travessão no texto: use vírgula, dois-pontos ou frase nova" });
  }

  const lastro = numerosDoMaterial([e.textoAnterior, ...e.material]);
  for (const n of extrairNumeros(novo)) {
    const c = numeroCompativel(n, lastro);
    if (!c.ok) problemas.push({ codigo: "NUMERO_SEM_LASTRO", detalhe: c.motivo });
  }

  if (e.ramo === "post") {
    for (const p of validarLegendaSocial(
      { full_caption: novo },
      { titulo: e.titulo ?? "", keyword: e.keyword ?? "" },
    )) {
      problemas.push({ codigo: p.motivo, detalhe: p.detalhe });
    }
  }

  return problemas;
}
