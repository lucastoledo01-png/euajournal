/**
 * A forma do assunto do e-mail, conferida em código (06/10/2026).
 *
 * O método veio da leitura de 40 assuntos do The News, aprovada pelo dono: caixa
 * baixa, de 2 a 7 palavras, uns 40 caracteres no máximo, sem ponto final, sobre
 * UMA história. Os nossos saíam descritivos ("o depósito de imigração rende
 * juros", "a lista dos US$ 30 bilhões") e um deles saiu com maiúscula ("O Alasca
 * entrou na conta"): o prompt pedia caixa baixa "como padrão", e padrão não é
 * regra.
 *
 * O que é FORMA mora aqui e não depende do modelo: caixa, ponto final,
 * travessão e espaços são consertados sem pedir nada a ninguém. O que é TAMANHO
 * não tem conserto determinístico, porque cortar um assunto muda o que ele diz;
 * então a escolha cai na primeira opção da própria redação que cabe, e só sem
 * nenhuma que caiba fica a mais curta, com o problema registrado.
 *
 * A caixa baixa é inteira, nomes próprios e siglas incluídos ("stf", "lula",
 * "nike"), porque é o que a referência faz. A exceção são os símbolos de moeda,
 * "R$" e "US$": o The News escreve "R$ 5 bi", e "r$" não é caixa baixa de nada,
 * é um símbolo quebrado.
 */

/*
 * O ALVO é o que o prompt pede; o TETO é o que o código recusa. Os dois são
 * diferentes de propósito, e o teto saiu da própria referência: "o advogado
 * que apostou R$ 5 bi no tigrinho" tem 9 palavras e 42 caracteres, e "a balada
 * com 20 homens e 120 mulheres" tem 8. Um teto em 7 e 40 recusaria os exemplos
 * que ensinam o método.
 */
export const FORMA_DO_ASSUNTO = {
  minimoDePalavras: 2,
  alvoDePalavras: 7,
  maximoDePalavras: 9,
  alvoDeCaracteres: 40,
  maximoDeCaracteres: 45,
} as const;

export type ProblemaDoAssunto =
  | "VAZIO"
  | "POUCAS_PALAVRAS"
  | "PALAVRAS_DEMAIS"
  | "CARACTERES_DEMAIS"
  | "MAIUSCULA"
  | "PONTO_FINAL"
  | "TRAVESSAO"
  | "DOIS_PONTOS";

/** Os problemas que a normalização resolve sozinha. */
const DE_FORMA: ProblemaDoAssunto[] = ["MAIUSCULA", "PONTO_FINAL", "TRAVESSAO"];

/** Caixa baixa inteira, com os símbolos de moeda devolvidos ao que são. */
function caixaBaixa(texto: string): string {
  return texto
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|[^a-z0-9])(us|r)\$/g, (_m, antes: string, moeda: string) => `${antes}${moeda.toUpperCase()}$`);
}

/**
 * O assunto na forma da casa, sem mudar uma palavra do que ele diz.
 *
 * Travessão e meia-risca viram vírgula, que é o que a frase falada faz no lugar
 * deles. A vírgula entre dois dígitos é decimal e fica colada. Ponto final e reticências no fim saem; interrogação e exclamação
 * ficam, porque a pergunta é uma das cinco formas.
 */
export function normalizarAssunto(bruto: string): string {
  let t = String(bruto ?? "")
    .replace(/[\u2014\u2013]/g, ",")
    .replace(/\s+,/g, ",")
    // Espaço depois da vírgula, menos na vírgula decimal: "3,6%" virava "3, 6%" (14/10/2026).
    .replace(/(?<!\d),(?=\S)|,(?=\D)/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
  t = t.replace(/(?:\.\s*|…\s*)+$/u, "").trim();
  t = t.replace(/,\s*$/, "").trim();
  return caixaBaixa(t);
}

function palavras(texto: string): string[] {
  return texto
    .split(/\s+/)
    .map((p) => p.trim())
    .filter((p) => p && /[\p{L}\p{N}]/u.test(p));
}

/** O que está fora da forma, sem consertar nada. */
export function problemasDoAssunto(assunto: string): ProblemaDoAssunto[] {
  const t = String(assunto ?? "").trim();
  if (!t) return ["VAZIO"];

  const problemas: ProblemaDoAssunto[] = [];
  const n = palavras(t).length;
  if (n < FORMA_DO_ASSUNTO.minimoDePalavras) problemas.push("POUCAS_PALAVRAS");
  if (n > FORMA_DO_ASSUNTO.maximoDePalavras) problemas.push("PALAVRAS_DEMAIS");
  if (t.length > FORMA_DO_ASSUNTO.maximoDeCaracteres) problemas.push("CARACTERES_DEMAIS");
  if (caixaBaixa(t) !== t) problemas.push("MAIUSCULA");
  if (/[.…]\s*$/u.test(t)) problemas.push("PONTO_FINAL");
  if (/[\u2014\u2013]/.test(t)) problemas.push("TRAVESSAO");
  if (/:/.test(t)) problemas.push("DOIS_PONTOS");
  return problemas;
}

// --------------------------------------------------------------------------
// As cinco formas, em rodízio (06/10/2026)
// --------------------------------------------------------------------------

/**
 * As cinco formas do método, NA ORDEM do rodízio.
 *
 * Pedir "formas diferentes" só no prompt não bastou: medido no ensaio de
 * 06/10/2026, o modelo prefere pergunta e número, e duas edições seguidas
 * saíam com a mesma forma. O dono decidiu que o rodízio é do CÓDIGO: a
 * redação propõe opções marcadas com a forma, e a forma da vez é escolhida
 * pelo histórico das edições gravadas, sem sorteio.
 */
export const FORMAS_DO_ASSUNTO = ["pergunta", "nomes", "personagem", "cena", "momento"] as const;

export type FormaDoAssunto = (typeof FORMAS_DO_ASSUNTO)[number];

export function ehFormaDoAssunto(valor: unknown): valor is FormaDoAssunto {
  return typeof valor === "string" && (FORMAS_DO_ASSUNTO as readonly string[]).includes(valor);
}

/** O que cada forma é, nas palavras do prompt, para o pedido da vez. */
export const DESCRICAO_DA_FORMA: Record<FormaDoAssunto, string> = {
  pergunta: "pergunta direta, que a edição responde",
  nomes: "dois ou três nomes da história, lado a lado",
  personagem: "personagem com um detalhe curioso",
  cena: "cena ou número que intriga",
  momento: "o momento",
};

/** Quantas edições para trás o rodízio olha: as outras quatro formas. */
const JANELA_DO_RODIZIO = FORMAS_DO_ASSUNTO.length - 1;

/**
 * A ordem em que as formas devem ser tentadas HOJE, a primeira sendo a vez.
 *
 * `recentes` vem da edição mais nova para a mais antiga; `null` é edição sem
 * forma conhecida, e não conta. A vez é a primeira forma, andando no círculo a
 * partir da forma da última edição, que não apareceu nas últimas quatro: com
 * tudo dando certo, as cinco passam antes de alguma voltar. Quando um dia não
 * consegue a forma da vez e cai para a seguinte, a que ficou para trás volta
 * a ser a vez assim que sair da janela, sem precisar de estado nenhum além do
 * que está gravado nas edições.
 *
 * Depois da vez vêm as outras na ordem do círculo, e a forma da edição
 * anterior vai para o FIM: é o último recurso, porque repetir a forma de ontem
 * é o que o rodízio existe para evitar.
 *
 * Sem histórico nenhum, começa por "pergunta". Determinístico: o mesmo
 * histórico dá sempre a mesma ordem.
 */
export function ordemDasFormas(recentes: ReadonlyArray<FormaDoAssunto | null | undefined>): FormaDoAssunto[] {
  const conhecidas = recentes.filter(ehFormaDoAssunto);
  if (conhecidas.length === 0) return [...FORMAS_DO_ASSUNTO];

  const ultima = conhecidas[0];
  const inicio = FORMAS_DO_ASSUNTO.indexOf(ultima) + 1;
  const circulo = FORMAS_DO_ASSUNTO.map((_, i) => FORMAS_DO_ASSUNTO[(inicio + i) % FORMAS_DO_ASSUNTO.length]);
  const janela = new Set(conhecidas.slice(0, JANELA_DO_RODIZIO));

  const vez = circulo.find((f) => !janela.has(f)) ?? circulo[0];
  const resto = circulo.filter((f) => f !== vez && f !== ultima);
  return vez === ultima ? [vez, ...resto] : [vez, ...resto, ultima];
}

/** A forma da vez, que é a primeira de `ordemDasFormas`. */
export function formaDaVez(recentes: ReadonlyArray<FormaDoAssunto | null | undefined>): FormaDoAssunto {
  return ordemDasFormas(recentes)[0];
}

/**
 * A forma de um assunto já publicado, quando a edição não a gravou.
 *
 * Existe para as edições anteriores à coluna `subject_form` (e para o dia em
 * que a coluna ainda não existe no banco): o rodízio precisa saber a forma da
 * edição de ontem. É uma leitura de FORMATO, conservadora, e devolve `null`
 * quando não reconhece, em vez de chutar: edição sem forma conhecida
 * simplesmente não conta no rodízio.
 */
export function inferirFormaDoAssunto(assunto: string): FormaDoAssunto | null {
  const t = String(assunto ?? "").trim().toLocaleLowerCase("pt-BR");
  if (!t) return null;
  if (/\?\s*$/.test(t)) return "pergunta";
  if (/^(?:o|a)\s+(?:dia|semana|noite|hora|momento|minuto|ano|mês|mes)\b/.test(t) || /^a\s+(?:virada|reviravolta)\b/.test(t)) {
    return "momento";
  }
  if (/\s&\s/.test(t)) return "nomes";
  if (/^(?:o|a|os|as)\s+\S+(?:\s+\S+)?\s+que\s/.test(t)) return "personagem";
  if (/\d/.test(t)) return "cena";
  return null;
}

export type AssuntoEscolhido = {
  subject: string;
  subject_options: string[];
  /** O assunto mudou de opção, e não só de forma. */
  trocado: boolean;
  /** O que ficou fora da forma mesmo depois da escolha. Vazio é o normal. */
  problemas: ProblemaDoAssunto[];
  /**
   * A forma do assunto escolhido, quando a redação marcou as opções. `null`
   * quando a escolha não passou pelo rodízio (opções sem marca, ou nenhuma
   * dentro da forma).
   */
  forma: FormaDoAssunto | null;
  /** A forma que era a vez, para o log dizer se ela foi cumprida. */
  formaDaVez: FormaDoAssunto | null;
};

/**
 * Normaliza o assunto e as opções, e escolhe o primeiro que cabe.
 *
 * A ordem de preferência é a da redação: o `subject` que ela escolheu, depois
 * as opções na ordem em que vieram. Opção repetida depois de normalizada sai,
 * porque "O Alasca" e "o alasca" são a mesma linha.
 */
export function escolherAssunto(
  subject: string,
  opcoes: string[],
  rodizio?: {
    /** A forma de cada opção, na mesma ordem de `opcoes`; `null` é opção sem marca. */
    formas?: ReadonlyArray<string | null | undefined>;
    /** As formas das edições anteriores, da mais nova para a mais antiga. */
    recentes?: ReadonlyArray<FormaDoAssunto | null | undefined>;
  },
): AssuntoEscolhido {
  const normalizadas: string[] = [];
  const formaDe = new Map<string, FormaDoAssunto>();
  (opcoes ?? []).forEach((o, i) => {
    const n = normalizarAssunto(o);
    if (!n) return;
    if (!normalizadas.includes(n)) normalizadas.push(n);
    const forma = rodizio?.formas?.[i];
    if (ehFormaDoAssunto(forma) && !formaDe.has(n)) formaDe.set(n, forma);
  });

  /*
   * O rodízio, quando há opção marcada e histórico pedido (06/10/2026).
   *
   * A primeira opção VÁLIDA da forma da vez ganha; sem nenhuma, a primeira
   * válida da forma seguinte na ordem, e assim por diante. "Válida" é a mesma
   * régua de sempre: zero problema de forma depois da normalização. Opção sem
   * marca não entra aqui; ela só serve à escolha antiga, logo abaixo, se o
   * rodízio não achar nada.
   */
  if (rodizio?.recentes && formaDe.size > 0) {
    const ordem = ordemDasFormas(rodizio.recentes);
    for (const forma of ordem) {
      const achada = normalizadas.find((o) => formaDe.get(o) === forma && problemasDoAssunto(o).length === 0);
      if (achada) {
        return {
          subject: achada,
          subject_options: normalizadas,
          trocado: achada !== normalizarAssunto(subject),
          problemas: [],
          forma,
          formaDaVez: ordem[0],
        };
      }
    }
  }
  const vezPedida = rodizio?.recentes ? formaDaVez(rodizio.recentes) : null;

  const original = normalizarAssunto(subject);
  const candidatos = [original, ...normalizadas.filter((o) => o !== original)].filter(Boolean);
  const semProblema = candidatos.find((c) => problemasDoAssunto(c).length === 0);

  if (semProblema) {
    return {
      subject: semProblema,
      subject_options: normalizadas,
      trocado: semProblema !== original,
      problemas: [],
      forma: formaDe.get(semProblema) ?? inferirFormaDoAssunto(semProblema),
      formaDaVez: vezPedida,
    };
  }

  /*
   * Nenhuma cabe. Fica a mais curta, e não a primeira: o defeito que sobra é
   * de tamanho, e a mais curta é a que menos estoura. Cortar para caber está
   * fora de questão, porque "a balada com 20 homens e" não diz nada.
   */
  const reserva = [...candidatos].sort((a, b) => a.length - b.length)[0] ?? original;
  return {
    subject: reserva,
    subject_options: normalizadas,
    trocado: reserva !== original,
    problemas: problemasDoAssunto(reserva).filter((p) => !DE_FORMA.includes(p)),
    forma: formaDe.get(reserva) ?? inferirFormaDoAssunto(reserva),
    formaDaVez: vezPedida,
  };
}

/**
 * Aplica a forma à edição, devolvendo o que precisou mudar para o log.
 *
 * Com `recentes`, passa pelo rodízio das formas e grava a forma escolhida em
 * `subject_form`. Sem `recentes` (a refação, os scripts antigos), a escolha é
 * a de antes: a primeira opção da redação que cabe na forma.
 */
export function aplicarFormaDoAssunto<
  T extends { subject: string; subject_options: string[]; subject_option_forms?: Array<string | null> | null },
>(
  edicao: T,
  recentes?: ReadonlyArray<FormaDoAssunto | null | undefined>,
): {
  edicao: T & { subject_form?: FormaDoAssunto | null };
  mudou: boolean;
  problemas: ProblemaDoAssunto[];
  antes: string;
  forma: FormaDoAssunto | null;
  formaDaVez: FormaDoAssunto | null;
} {
  const antes = edicao.subject;
  const escolha = escolherAssunto(edicao.subject, edicao.subject_options, {
    formas: edicao.subject_option_forms ?? undefined,
    recentes,
  });
  return {
    edicao: {
      ...edicao,
      subject: escolha.subject,
      subject_options: escolha.subject_options,
      ...(recentes ? { subject_form: escolha.forma } : {}),
    },
    mudou: escolha.subject !== antes,
    problemas: escolha.problemas,
    antes,
    forma: escolha.forma,
    formaDaVez: escolha.formaDaVez,
  };
}

/**
 * As opções como a redação as escreve agora: `{ forma, texto }`.
 *
 * O contrato de saída pede cada opção marcada com a forma, e o resto do
 * sistema (banco, painel, relatório) continua lendo `subject_options` como
 * lista de textos. Esta função faz a ponte ANTES da validação: opção-objeto
 * vira texto, e a forma vai para `subject_option_forms`, na mesma ordem. Opção
 * que já veio como texto continua valendo, sem forma.
 */
export function separarFormasDasOpcoes(bruto: unknown): unknown {
  if (!bruto || typeof bruto !== "object") return bruto;
  const edicao = bruto as Record<string, unknown>;
  if (!Array.isArray(edicao.subject_options)) return bruto;
  const textos: string[] = [];
  const formas: Array<FormaDoAssunto | null> = [];
  for (const o of edicao.subject_options) {
    if (typeof o === "string") {
      textos.push(o);
      formas.push(null);
    } else if (o && typeof o === "object") {
      const opcao = o as Record<string, unknown>;
      const texto = typeof opcao.texto === "string" ? opcao.texto : typeof opcao.text === "string" ? opcao.text : "";
      if (!texto) continue;
      textos.push(texto);
      const forma = String(opcao.forma ?? opcao.form ?? "").trim().toLowerCase();
      formas.push(ehFormaDoAssunto(forma) ? forma : null);
    }
  }
  return { ...edicao, subject_options: textos, subject_option_forms: formas };
}

/** Uma linha de `news_editions` como o rodízio a lê. */
export type EdicaoParaORodizio = { subject?: string | null; subject_form?: string | null };

/**
 * As formas das edições gravadas, da mais nova para a mais antiga.
 *
 * A forma gravada vale; sem ela (edição anterior à coluna), a inferência pelo
 * formato do texto, que pode devolver `null` e aí a edição não conta.
 */
export function formasDasEdicoes(linhas: ReadonlyArray<EdicaoParaORodizio>): Array<FormaDoAssunto | null> {
  return linhas.map((l) =>
    ehFormaDoAssunto(l.subject_form) ? l.subject_form : inferirFormaDoAssunto(String(l.subject ?? "")),
  );
}
