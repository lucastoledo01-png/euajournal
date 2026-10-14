/**
 * Mês sem ano numa manchete (dono, 14/10/2026).
 *
 * "Benefícios médios nos EUA sobem 3,60% em janeiro", numa edição de 15 de
 * outubro: o reajuste é de janeiro de 2027, mas a frase, no presente e sem o
 * ano, se lê como janeiro deste ano, notícia velha. A regra: mês que, no
 * calendário, já passou neste ano só pode estar falando de outro ano, e então
 * o ano vai escrito ("em janeiro de 2027"). Mês ainda por vir neste ano, ou o
 * próprio mês corrente, dispensa o ano.
 */
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
] as const;

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** Os meses do texto que, sem ano ao lado, ficam ambíguos em relação a `hoje`. */
export function mesesSemAno(texto: string, hoje: Date = new Date()): string[] {
  const mesAtual = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", month: "numeric" }).format(hoje),
  ) - 1;
  const t = semAcento((texto || "").toLowerCase());
  const achados: string[] = [];
  MESES.forEach((mes, i) => {
    const m = new RegExp(`\\b${semAcento(mes)}\\b`, "g");
    for (const r of t.matchAll(m)) {
      const depois = t.slice((r.index ?? 0) + mes.length, (r.index ?? 0) + mes.length + 12);
      // "janeiro de 2027", "janeiro/2027", "janeiro 2027"
      if (/^\s*(de\s+|\/\s*)?\d{4}\b/.test(depois)) continue;
      // "desde junho", "desde meados de junho" e "junho passado" falam do passado deste ano, sem ambiguidade.
      const antes = t.slice(Math.max(0, (r.index ?? 0) - 22), r.index ?? 0);
      if (/\bdesde\b/.test(antes) || /^\s*passado\b/.test(depois)) continue;
      if (i < mesAtual && !achados.includes(mes)) achados.push(mes);
    }
  });
  return achados;
}

/** O texto que vai para o reparo e para o prompt, um só para os canais. */
export function instrucaoDoMesSemAno(meses: string[], hoje: Date = new Date()): string {
  const ano = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(hoje));
  return (
    `"${meses.join('", "')}" sem o ano: neste mês, ${meses.length > 1 ? "esses meses já passaram" : "esse mês já passou"} ` +
    `em ${ano}, então a frase se lê como notícia velha. Escreva o ano ("em ${meses[0]} de ${ano + 1}", se for o próximo) ` +
    `e ponha o verbo no tempo certo: fato que ainda vai acontecer fica no futuro ("vão subir", "começa a valer").`
  );
}

/** A regra, para os prompts de manchete dos três canais. */
export const REGRA_DO_MES_COM_ANO =
  "DATA NA MANCHETE: mês que já passou neste ano só aparece com o ano (\"em janeiro de 2027\"), e o fato que ainda vai acontecer fica no futuro (\"vão subir 3,6% em janeiro de 2027\"), nunca no presente.";
