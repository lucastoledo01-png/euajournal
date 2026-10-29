/**
 * As palavras pesadas escritas de forma disfarçada no Instagram (decisão do
 * dono, 29/10/2026): "assassinatos" vira "4ss4ss1n4t0s". Só no Instagram (texto
 * da arte, legenda e Reel), onde a palavra crua pode derrubar o alcance do post;
 * portal e newsletter continuam por extenso, porque ali a palavra certa ajuda a
 * busca.
 *
 * A troca roda DEPOIS das conferências de fato: a ancoragem compara o texto
 * por extenso com a fonte. A lista é fechada e curta de propósito, só o que é
 * pesado de verdade; palavra ambígua ("executado", "matar") fica de fora.
 */

/** Radicais das palavras pesadas, sem acento. A palavra inteira que começa por um deles é trocada. */
const RADICAIS = [
  "assassin",
  "homicid",
  "feminicid",
  "estupr",
  "suicid",
  "pedofil",
  "chacina",
  "massacr",
  "decapit",
  "terroris",
  "tortur",
  "sequestr",
  "esquartej",
];

const LETRAS: Record<string, string> = { a: "4", á: "4", à: "4", â: "4", ã: "4", e: "3", é: "3", ê: "3", i: "1", í: "1", o: "0", ó: "0", ô: "0", õ: "0" };

function semAcento(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** A palavra disfarçada: vogais por números, o resto como está (caixa inclusive). */
export function disfarcar(palavra: string): string {
  return [...palavra].map((c) => LETRAS[c.toLowerCase()] ?? c).join("");
}

export function ehPesada(palavra: string): boolean {
  const p = semAcento(palavra);
  return RADICAIS.some((r) => p.startsWith(r));
}

/** O texto com as palavras pesadas disfarçadas. Idempotente: a palavra já disfarçada não casa mais. */
export function disfarcarPalavrasPesadas(texto: string): string {
  if (!texto) return texto;
  return texto.replace(/[\p{L}]+/gu, (p) => (ehPesada(p) ? disfarcar(p) : p));
}
