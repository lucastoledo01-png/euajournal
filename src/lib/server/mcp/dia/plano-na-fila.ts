import { ItensDoPlanoSchema } from "./plano";
import { PLANO_VAZIO, type ItensDoPlano } from "./plano-store";

/**
 * O plano editado no painel (29/10/2026). O dono edita o JSON do plano como
 * texto, e a regra é uma só: ele pode TIRAR item, não pode pôr pauta que o
 * Claude não propôs (ela não passou pela triagem, pela foto nem pelo porquê).
 */
export function itensEditados(anteriorBruto: unknown, novoTexto: string): ItensDoPlano {
  const anterior: ItensDoPlano = { ...PLANO_VAZIO, ...((anteriorBruto ?? {}) as Partial<ItensDoPlano>) };
  let bruto: unknown;
  try {
    bruto = JSON.parse(novoTexto);
  } catch {
    throw new Error("o plano editado não é JSON válido");
  }
  const lido = ItensDoPlanoSchema.safeParse(bruto);
  if (!lido.success) throw new Error(`o plano editado não cabe no formato: ${lido.error.issues[0]?.message ?? ""}`);
  const novo = lido.data;
  for (const canal of ["newsletter", "artigos", "posts", "reels"] as const) {
    const novos = novo[canal].filter((id) => !anterior[canal].includes(id));
    if (novos.length) throw new Error(`${canal}: só dá para tirar item do plano, e ${novos.join(", ")} não estava nele`);
  }
  // As cenas e os porquês ficam os do Claude; a edição só escolhe quais itens seguem.
  return { ...novo, porque: anterior.porque, cenas: anterior.cenas };
}
