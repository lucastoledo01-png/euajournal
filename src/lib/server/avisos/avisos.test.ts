import { describe, expect, it } from "vitest";
import {
  JANELAS,
  avisarCandidatasNaoGravadas,
  avisarFimDaProducao,
  avisarLeituraDeCandidatasFalhou,
  textoCandidatasNaoGravadas,
  textoLeituraDeCandidatasFalhou,
  cicloDosAvisos,
  classificarMotivo,
  contarPorRamo,
  descreverContagem,
  limitesDoDia,
  naJanela,
  pecasNaFila,
  pecasPendentes,
  relogioLocal,
  textoFilaPronta,
  textoResumoDoDia,
  textoUltimaChamada,
  type DadosDoDia,
  type DepsDosAvisos,
  type LinhaDaFila,
  type NivelDoAviso,
  type ProjetoDosAvisos,
  type RegistroDoAviso,
} from "./avisos";

/**
 * Os avisos contra um banco de mentira e um Telegram de mentira.
 *
 * O relógio é injetado em UTC e o projeto está em São Paulo (UTC-3, sem horário
 * de verão desde 2019): 22:00 local é 01:00 UTC do dia seguinte, que é
 * exatamente o erro que um relógio do servidor cometeria.
 */

const TZ = "America/Sao_Paulo";

function projeto(capacidades: Record<string, string> = { aprovacao: "enforce", producao_vespera: "enforce" }): ProjetoDosAvisos {
  return { id: "proj-1", slug: "desbuguei", timezone: TZ, settings: { capacidades } };
}

/** Instante UTC de uma hora local de São Paulo. */
function sp(dia: string, hora: string): Date {
  const [h, m] = hora.split(":").map(Number);
  const [a, mes, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, mes - 1, d, h + 3, m));
}

function linha(ramo: LinhaDaFila["ramo"], estado: LinhaDaFila["estado"], publicarEm: string, extra: Partial<LinhaDaFila> = {}): LinhaDaFila {
  return { ramo, estado, publicarEm, liberadoEm: null, titulo: null, ...extra };
}

const DADOS_VAZIOS: DadosDoDia = {
  newsletterPublicada: false,
  assuntoDaNewsletter: null,
  materiasPublicadas: 0,
  postsPublicados: 0,
  postsComFalha: 0,
  motivosDeCorte: [],
  semFoto: 0,
  fila: [],
  custoUsd: 0,
};

function mundo(opcoes: {
  agora: Date;
  fila?: LinhaDaFila[];
  producaoRodou?: boolean;
  dados?: Partial<DadosDoDia>;
  envioFalha?: boolean;
}) {
  const enviados: Array<{ nivel: NivelDoAviso; texto: string }> = [];
  const registros: RegistroDoAviso[] = [];
  let agora = opcoes.agora;
  const deps: DepsDosAvisos = {
    agora: () => agora,
    leitor: {
      async filaEntre(_p, inicioIso, fimIso) {
        return (opcoes.fila ?? []).filter((l) => l.publicarEm && l.publicarEm >= inicioIso && l.publicarEm < fimIso);
      },
      async producaoDeixouLinha() {
        return opcoes.producaoRodou ?? true;
      },
      async dadosDoDia() {
        return { ...DADOS_VAZIOS, ...opcoes.dados };
      },
    },
    registro: {
      async jaFeito(_p, chave) {
        const daChave = registros.filter((r) => r.chave === chave);
        return daChave.some((r) => r.enviado) || daChave.length >= 3;
      },
      async gravar(_p, r) {
        registros.push(r);
      },
    },
    enviar: async (nivel, texto) => {
      enviados.push({ nivel, texto });
      return opcoes.envioFalha
        ? { enviado: false, motivo: "telegram_recusou", descricao: "chat not found" }
        : { enviado: true, motivo: "enviado", descricao: null };
    },
  };
  return { deps, enviados, registros, mover: (d: Date) => (agora = d) };
}

// Terça 06/10/2026 é dia de publicação; segunda 05/10 é dia de produção.
const AMANHA_6H07 = sp("2026-10-06", "06:07");

describe("relógio local", () => {
  it("lê a hora no fuso do projeto, não em UTC", () => {
    // 01:00 UTC de 06/10 ainda é 22:00 de 05/10 em São Paulo.
    expect(relogioLocal(new Date("2026-10-06T01:00:00Z"), TZ)).toEqual({ dia: "2026-10-05", hora: "22:00" });
    expect(relogioLocal(new Date("2026-10-06T03:00:00Z"), TZ)).toEqual({ dia: "2026-10-06", hora: "00:00" });
  });

  it("janela fechada nas duas pontas", () => {
    expect(naJanela("22:00", JANELAS.lembrete_22h)).toBe(true);
    expect(naJanela("21:59", JANELAS.lembrete_22h)).toBe(false);
    expect(naJanela("23:59", JANELAS.lembrete_22h)).toBe(true);
    expect(naJanela("05:29", JANELAS.ultima_chamada)).toBe(false);
    expect(naJanela("05:30", JANELAS.ultima_chamada)).toBe(true);
    expect(naJanela("06:07", JANELAS.ultima_chamada)).toBe(false);
  });

  it("os limites do dia local são meia-noite de São Paulo", () => {
    expect(limitesDoDia("2026-10-06", TZ)).toEqual({
      inicioIso: "2026-10-06T03:00:00.000Z",
      fimIso: "2026-10-07T03:00:00.000Z",
    });
  });
});

describe("contagens", () => {
  const fila = [
    linha("newsletter", "aguardando", AMANHA_6H07.toISOString()),
    linha("artigo", "aprovada", AMANHA_6H07.toISOString()),
    linha("artigo", "refazendo", AMANHA_6H07.toISOString()),
    linha("post", "aguardando", AMANHA_6H07.toISOString()),
    linha("post", "cancelada", AMANHA_6H07.toISOString()),
    linha("post", "descartada", AMANHA_6H07.toISOString()),
  ];

  it("na fila conta tudo menos cancelada e descartada", () => {
    expect(contarPorRamo(pecasNaFila(fila))).toEqual({ newsletter: 1, artigo: 2, post: 1, plano: 0 });
  });

  it("pendente é aguardando ou refazendo", () => {
    expect(contarPorRamo(pecasPendentes(fila))).toEqual({ newsletter: 1, artigo: 1, post: 1, plano: 0 });
  });

  it("descreve no plural certo, e omite zero quando pedido", () => {
    expect(descreverContagem({ newsletter: 1, artigo: 2, post: 9, plano: 0 })).toBe("1 newsletter, 2 matérias, 9 posts");
    expect(descreverContagem({ newsletter: 0, artigo: 1, post: 1, plano: 0 })).toBe("0 newsletter, 1 matéria, 1 post");
    expect(descreverContagem({ newsletter: 0, artigo: 1, post: 0, plano: 0 }, true)).toBe("1 matéria");
  });
});

describe("textos", () => {
  it("fila pronta diz amanhã e leva o link", () => {
    const t = textoFilaPronta("desbuguei", "2026-10-06", "2026-10-05", { newsletter: 1, artigo: 2, post: 5, plano: 0 });
    expect(t).toBe(
      "A fila de amanhã está pronta: 1 newsletter, 2 matérias, 5 posts.\n" +
        "Aprovar em https://casaloti.ia.br/admin/desbuguei/aprovacao",
    );
  });

  it("nenhum texto usa travessão", () => {
    const textos = [
      textoFilaPronta("x", "2026-10-06", "2026-10-05", { newsletter: 1, artigo: 1, post: 1, plano: 0 }),
      textoUltimaChamada("x", [linha("post", "aguardando", AMANHA_6H07.toISOString())], TZ, false),
      textoResumoDoDia("2026-10-06", DADOS_VAZIOS),
    ];
    for (const t of textos) expect(t).not.toContain(String.fromCharCode(0x2014));
  });

  it("última chamada dá o primeiro horário de cada canal, no fuso do projeto", () => {
    const t = textoUltimaChamada(
      "desbuguei",
      [
        linha("newsletter", "aguardando", AMANHA_6H07.toISOString(), { titulo: "o dólar caiu" }),
        linha("post", "aguardando", sp("2026-10-06", "14:45").toISOString()),
        linha("post", "refazendo", sp("2026-10-06", "08:00").toISOString()),
      ],
      TZ,
      false,
    );
    expect(t).toContain("NÃO sai no horário");
    expect(t).toContain('- 1 newsletter (a partir de 06:07): "o dólar caiu"');
    expect(t).toContain("- 2 posts (a partir de 08:00)");
    expect(t).not.toContain("matéria");
  });

  it("em ensaio a última chamada não diz que a peça fica de fora, porque não fica", () => {
    const t = textoUltimaChamada("desbuguei", [linha("post", "aguardando", AMANHA_6H07.toISOString())], TZ, true);
    expect(t).not.toContain("NÃO sai");
    expect(t).toContain("sai mesmo assim");
  });

  it("classifica motivo de corte", () => {
    expect(classificarMotivo("REJECT_IMMIGRATION_OFF_LINE")).toBe("imigracao");
    expect(classificarMotivo("SOCIAL_MAX_IMIGRACAO")).toBe("imigracao");
    expect(classificarMotivo("REJECT_NO_PHOTO")).toBe("sem_foto");
    expect(classificarMotivo("EIXO_OVERLOAD")).toBe("outro");
  });

  it("resumo do dia junta publicado, de fora e custo", () => {
    const t = textoResumoDoDia("2026-10-06", {
      newsletterPublicada: true,
      assuntoDaNewsletter: "o dólar caiu",
      materiasPublicadas: 2,
      postsPublicados: 4,
      postsComFalha: 1,
      motivosDeCorte: [
        { motivo: "REJECT_IMMIGRATION_OFF_LINE", quantas: 2 },
        { motivo: "REJECT_NO_PHOTO", quantas: 1 },
        { motivo: "EIXO_OVERLOAD", quantas: 3 },
      ],
      semFoto: 1,
      fila: [
        linha("post", "reprovada", AMANHA_6H07.toISOString()),
        linha("artigo", "aguardando", AMANHA_6H07.toISOString()),
      ],
      custoUsd: 0.3559,
    });
    expect(t).toBe(
      "Resumo de 06/10.\n" +
        'Publicado: newsletter enviada ("o dólar caiu"), 2 matérias, 4 posts.\n' +
        "Ficou de fora: 2 sem foto, 2 por imigração, 3 por regra editorial ou teto do dia, 1 reprovada, 1 sem aprovação, 1 post com falha.\n" +
        "Custo do dia: US$ 0,36.",
    );
  });

  it("resumo de dia sem nada de fora diz nada", () => {
    expect(textoResumoDoDia("2026-10-06", DADOS_VAZIOS)).toContain("Ficou de fora: nada.");
  });
});

describe("cicloDosAvisos: janelas e gates", () => {
  const filaDeAmanha = [
    linha("newsletter", "aguardando", AMANHA_6H07.toISOString()),
    linha("post", "aguardando", sp("2026-10-06", "08:00").toISOString()),
    linha("post", "aprovada", sp("2026-10-06", "11:22").toISOString()),
  ];

  it("às 21:59 não lembra; às 22:00 lembra uma vez; às 22:01 não repete", async () => {
    const m = mundo({ agora: sp("2026-10-05", "21:59"), fila: filaDeAmanha });
    expect((await cicloDosAvisos(projeto(), m.deps)).enviados).not.toContain("lembrete_22h");

    m.mover(sp("2026-10-05", "22:00"));
    expect((await cicloDosAvisos(projeto(), m.deps)).enviados).toContain("lembrete_22h");
    m.mover(sp("2026-10-05", "22:01"));
    expect((await cicloDosAvisos(projeto(), m.deps)).enviados).not.toContain("lembrete_22h");

    const lembretes = m.enviados.filter((e) => e.texto.startsWith("Lembrete"));
    expect(lembretes).toHaveLength(1);
    expect(lembretes[0].texto).toContain("1 newsletter, 1 post.");
    expect(lembretes[0].nivel).toBe("warning");
    expect(m.registros.find((r) => r.tipo === "lembrete_22h")).toMatchObject({ chave: "lembrete_22h:2026-10-06", enviado: true });
  });

  it("sem pendência às 22:00, nenhum lembrete e nenhum registro", async () => {
    const m = mundo({ agora: sp("2026-10-05", "22:00"), fila: [linha("post", "aprovada", AMANHA_6H07.toISOString())] });
    await cicloDosAvisos(projeto(), m.deps);
    expect(m.enviados.filter((e) => e.texto.startsWith("Lembrete"))).toHaveLength(0);
    expect(m.registros.filter((r) => r.tipo === "lembrete_22h")).toHaveLength(0);
  });

  it("com a fila em off, nem lembrete, nem última chamada, nem fila pronta", async () => {
    const off = projeto({ aprovacao: "off", producao_vespera: "enforce" });
    for (const [dia, hora] of [
      ["2026-10-05", "22:00"],
      ["2026-10-06", "05:30"],
      ["2026-10-05", "17:45"],
    ] as const) {
      const m = mundo({ agora: sp(dia, hora), fila: filaDeAmanha });
      const r = await cicloDosAvisos(off, m.deps);
      expect(r.enviados.filter((t) => ["lembrete_22h", "ultima_chamada", "fila_pronta"].includes(t))).toEqual([]);
    }
  });

  it("projeto sem capacidade declarada é off: nada da fila", async () => {
    const m = mundo({ agora: sp("2026-10-05", "22:00"), fila: filaDeAmanha });
    await cicloDosAvisos({ id: "p", slug: "s", timezone: TZ, settings: {} }, m.deps);
    expect(m.enviados.filter((e) => e.texto.startsWith("Lembrete"))).toHaveLength(0);
  });

  it("última chamada às 05:30 só com o que é de hoje, uma vez", async () => {
    const m = mundo({ agora: sp("2026-10-06", "05:30"), fila: filaDeAmanha });
    expect((await cicloDosAvisos(projeto(), m.deps)).enviados).toContain("ultima_chamada");
    m.mover(sp("2026-10-06", "05:31"));
    await cicloDosAvisos(projeto(), m.deps);
    const chamadas = m.enviados.filter((e) => e.texto.startsWith("Última chamada"));
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].texto).toContain("- 1 newsletter (a partir de 06:07)");
    expect(chamadas[0].texto).toContain("- 1 post (a partir de 08:00)");
  });

  it("última chamada fecha às 06:06", async () => {
    const m = mundo({ agora: sp("2026-10-06", "06:07"), fila: filaDeAmanha });
    expect((await cicloDosAvisos(projeto(), m.deps)).enviados).not.toContain("ultima_chamada");
  });

  it("fila pronta pelo cron só depois de a produção deixar linha", async () => {
    const semLinha = mundo({ agora: sp("2026-10-05", "17:30"), fila: filaDeAmanha, producaoRodou: false });
    const r1 = await cicloDosAvisos(projeto(), semLinha.deps);
    expect(r1.enviados).not.toContain("fila_pronta");
    expect(r1.pulados).toContainEqual({ tipo: "fila_pronta", motivo: "produção ainda sem linha" });

    const comLinha = mundo({ agora: sp("2026-10-05", "17:30"), fila: filaDeAmanha });
    expect((await cicloDosAvisos(projeto(), comLinha.deps)).enviados).toContain("fila_pronta");
    expect(comLinha.enviados[0].texto).toContain("A fila de amanhã está pronta: 1 newsletter, 0 matérias, 2 posts.");
  });

  it("fila pronta não sai em dia que não é de produção (sexta)", async () => {
    const m = mundo({ agora: sp("2026-10-09", "17:45"), fila: [linha("post", "aguardando", sp("2026-10-10", "08:00").toISOString())] });
    const r = await cicloDosAvisos(projeto(), m.deps);
    expect(r.enviados).not.toContain("fila_pronta");
  });

  it("produção que não deixou linha às 18:30 vira alerta crítico, uma vez", async () => {
    const m = mundo({ agora: sp("2026-10-05", "18:29"), producaoRodou: false });
    expect((await cicloDosAvisos(projeto(), m.deps)).enviados).not.toContain("producao_nao_rodou");
    m.mover(sp("2026-10-05", "18:30"));
    expect((await cicloDosAvisos(projeto(), m.deps)).enviados).toContain("producao_nao_rodou");
    m.mover(sp("2026-10-05", "18:31"));
    expect((await cicloDosAvisos(projeto(), m.deps)).enviados).not.toContain("producao_nao_rodou");
    const alerta = m.enviados.find((e) => e.texto.startsWith("A produção das 17:00 não rodou"));
    expect(alerta?.nivel).toBe("critical");
  });

  it("produção desligada: o silêncio às 18:30 não é alerta", async () => {
    const m = mundo({ agora: sp("2026-10-05", "18:30"), producaoRodou: false });
    const r = await cicloDosAvisos(projeto({ aprovacao: "enforce", producao_vespera: "off" }), m.deps);
    expect(r.enviados).not.toContain("producao_nao_rodou");
  });

  it("newsletter aprovada e não liberada às 06:15 vira alerta; liberada não", async () => {
    const presa = [linha("newsletter", "aprovada", AMANHA_6H07.toISOString(), { titulo: "o dólar caiu" })];
    const m = mundo({ agora: sp("2026-10-06", "06:14"), fila: presa });
    expect((await cicloDosAvisos(projeto(), m.deps)).enviados).not.toContain("newsletter_atrasada");
    m.mover(sp("2026-10-06", "06:15"));
    expect((await cicloDosAvisos(projeto(), m.deps)).enviados).toContain("newsletter_atrasada");

    const saiu = mundo({
      agora: sp("2026-10-06", "06:15"),
      fila: [linha("newsletter", "aprovada", AMANHA_6H07.toISOString(), { liberadoEm: AMANHA_6H07.toISOString() })],
    });
    expect((await cicloDosAvisos(projeto(), saiu.deps)).enviados).not.toContain("newsletter_atrasada");
  });

  it("newsletter atrasada só com a fila em enforce: em ensaio a fila não despacha", async () => {
    const m = mundo({ agora: sp("2026-10-06", "06:15"), fila: [linha("newsletter", "aprovada", AMANHA_6H07.toISOString())] });
    const r = await cicloDosAvisos(projeto({ aprovacao: "dry_run", producao_vespera: "enforce" }), m.deps);
    expect(r.enviados).not.toContain("newsletter_atrasada");
  });

  it("resumo do dia às 22:30, mesmo com a fila desligada, uma vez", async () => {
    const off = projeto({});
    const m = mundo({ agora: sp("2026-10-06", "22:29"), dados: { postsPublicados: 3 } });
    expect((await cicloDosAvisos(off, m.deps)).enviados).not.toContain("resumo_do_dia");
    m.mover(sp("2026-10-06", "22:30"));
    expect((await cicloDosAvisos(off, m.deps)).enviados).toContain("resumo_do_dia");
    m.mover(sp("2026-10-06", "23:10"));
    expect((await cicloDosAvisos(off, m.deps)).enviados).not.toContain("resumo_do_dia");
    expect(m.registros.filter((r) => r.tipo === "resumo_do_dia")).toHaveLength(1);
    expect(m.registros[0].chave).toBe("resumo_do_dia:2026-10-06");
  });

  it("envio que falha é gravado e tentado de novo, até desistir na terceira", async () => {
    const m = mundo({ agora: sp("2026-10-06", "22:30"), envioFalha: true });
    for (const hora of ["22:30", "22:31", "22:32", "22:33", "22:34"]) {
      m.mover(sp("2026-10-06", hora));
      await cicloDosAvisos(projeto({}), m.deps);
    }
    const tentativas = m.registros.filter((r) => r.tipo === "resumo_do_dia");
    expect(tentativas).toHaveLength(3);
    expect(tentativas.every((t) => !t.enviado && t.motivo === "telegram_recusou" && t.descricao === "chat not found")).toBe(true);
  });

  it("leitura que falha num aviso não segura os outros", async () => {
    const m = mundo({ agora: sp("2026-10-06", "22:30"), fila: filaDeAmanha });
    m.deps.leitor.filaEntre = async () => {
      throw new Error("Gateway Timeout");
    };
    const r = await cicloDosAvisos(projeto(), m.deps);
    expect(r.pulados).toContainEqual({ tipo: "lembrete_22h", motivo: "erro: Gateway Timeout" });
    expect(r.enviados).toContain("resumo_do_dia");
  });
});

describe("avisarFimDaProducao", () => {
  const decisao = { produzir: true, alvo: "2026-10-06", hoje: "2026-10-05" };
  const filaDeAmanha = [
    linha("newsletter", "aguardando", AMANHA_6H07.toISOString()),
    linha("artigo", "aguardando", AMANHA_6H07.toISOString()),
    linha("post", "aguardando", sp("2026-10-06", "08:00").toISOString()),
  ];

  it("produziu: manda a fila pronta, e o cron das 17:30 não repete", async () => {
    const m = mundo({ agora: sp("2026-10-05", "17:22"), fila: filaDeAmanha });
    const r = await avisarFimDaProducao(projeto(), { ok: true, modo: "enforce", decisao, resultado: { ok: true } }, m.deps);
    expect(r.enviados).toEqual(["fila_pronta"]);
    expect(m.enviados[0]).toEqual({
      nivel: "info",
      texto:
        "A fila de amanhã está pronta: 1 newsletter, 1 matéria, 1 post.\n" +
        "Aprovar em https://casaloti.ia.br/admin/desbuguei/aprovacao",
    });

    m.mover(sp("2026-10-05", "17:30"));
    expect((await cicloDosAvisos(projeto(), m.deps)).enviados).not.toContain("fila_pronta");
    expect(m.enviados).toHaveLength(1);
  });

  it("falha da produção não é repetida: a rota já alertou", async () => {
    const m = mundo({ agora: sp("2026-10-05", "17:22"), fila: filaDeAmanha });
    const r = await avisarFimDaProducao(projeto(), { ok: false, modo: "enforce", decisao }, m.deps);
    expect(r.enviados).toEqual([]);
    expect(m.enviados).toHaveLength(0);
  });

  it("rodou e não produziu nada: alerta crítico com o motivo", async () => {
    const m = mundo({ agora: sp("2026-10-05", "17:22") });
    await avisarFimDaProducao(
      projeto(),
      {
        ok: true,
        modo: "enforce",
        decisao,
        resultado: { ok: false, reason: "editorial_minimum_not_met", detail: "1 pauta aprovada, mínimo 2." },
      },
      m.deps,
    );
    expect(m.enviados).toEqual([
      {
        nivel: "critical",
        texto: "A produção das 17:00 não produziu nada para 06/10: editorial_minimum_not_met. 1 pauta aprovada, mínimo 2.",
      },
    ]);
  });

  it("produziu de verdade e nada entrou na fila: alerta crítico", async () => {
    const m = mundo({ agora: sp("2026-10-05", "17:22"), fila: [] });
    const r = await avisarFimDaProducao(projeto(), { ok: true, modo: "enforce", decisao, resultado: { ok: true } }, m.deps);
    expect(r.enviados).toEqual(["producao_vazia"]);
    expect(m.enviados[0].texto).toContain("nenhuma peça de 06/10 entrou na fila");
  });

  it("ensaio com a fila vazia é o esperado (o ensaio não enfileira): silêncio", async () => {
    const m = mundo({ agora: sp("2026-10-05", "17:22"), fila: [] });
    const r = await avisarFimDaProducao(projeto({ aprovacao: "dry_run", producao_vespera: "dry_run" }), { ok: true, modo: "dry_run", decisao, resultado: { ok: true } }, m.deps);
    expect(r.enviados).toEqual([]);
    expect(m.enviados).toHaveLength(0);
  });

  it("fila desligada: nada de fila pronta", async () => {
    const m = mundo({ agora: sp("2026-10-05", "17:22"), fila: filaDeAmanha });
    const r = await avisarFimDaProducao(projeto({ aprovacao: "off", producao_vespera: "enforce" }), { ok: true, modo: "enforce", decisao, resultado: { ok: true } }, m.deps);
    expect(r.enviados).toEqual([]);
    expect(r.pulados).toContainEqual({ tipo: "fila_pronta", motivo: "fila de aprovação desligada" });
  });

  /*
   * 06/10/2026: a edição de 07/10 foi barrada pelo QA depois de posts e
   * matérias entrarem na fila. O dono precisa saber das duas coisas: que há o
   * que aprovar, e que falta a newsletter, com o motivo e o comando.
   */
  it("só a newsletter barrada: avisa a newsletter que falta E a fila pronta do resto", async () => {
    const semNewsletter = filaDeAmanha.filter((l) => l.ramo !== "newsletter");
    const m = mundo({ agora: sp("2026-10-05", "17:22"), fila: semNewsletter });
    const motivo =
      "Edição bloqueada depois de 2 tentativa(s) de correção (QA 94): REJECT_EDITORIAL_QA: hallucination_risk\n" +
      "QA 94 | alucinação: sim | reparos: 2 | redações: 3\n" +
      "[auditor] O título da segunda matéria afirma que o padrão é criado 'nos EUA'.\n" +
      "[apontamento] LOW_READER_RELEVANCE: o texto explica o acontecimento.";
    const r = await avisarFimDaProducao(
      projeto(),
      { ok: true, modo: "enforce", decisao, newsletterAusente: { data: "2026-10-06", motivo } },
      m.deps,
    );
    expect(r.enviados).toEqual(["newsletter_ausente", "fila_pronta"]);
    expect(m.enviados[0].nivel).toBe("critical");
    const texto = m.enviados[0].texto;
    expect(texto).toContain("A newsletter de 06/10 NÃO foi produzida: Edição bloqueada");
    expect(texto).toContain("[auditor] O título da segunda matéria");
    expect(texto).not.toContain("LOW_READER_RELEVANCE");
    expect(texto).toContain("Posts e matérias do dia seguiram para a fila.");
    expect(texto).toContain("produzir-newsletter.ts --data 2026-10-06");
    expect(m.enviados[1].texto).toContain("1 matéria, 1 post");
    // Um por edição: o gancho chamado de novo não repete.
    await avisarFimDaProducao(projeto(), { ok: true, modo: "enforce", decisao, newsletterAusente: { data: "2026-10-06", motivo } }, m.deps);
    expect(m.enviados).toHaveLength(2);
  });

  it("não era dia de produção: nada", async () => {
    const m = mundo({ agora: sp("2026-10-09", "17:05"), fila: filaDeAmanha });
    const r = await avisarFimDaProducao(projeto(), { ok: true, modo: "enforce", decisao: { ...decisao, produzir: false } }, m.deps);
    expect(r.enviados).toEqual([]);
    expect(m.enviados).toHaveLength(0);
  });
});

/*
 * A gravação das candidatas falhou e os posts seguiram (06/10/2026). Até essa
 * data a falha fechava o feed do dia em silêncio; agora ela não fecha, e o
 * aviso é o que impede a falha de passar despercebida.
 */
describe("candidatas não gravadas", () => {
  const ERRO = "gravação de candidatas, lote 1: duplicate key value violates unique constraint code: 23505";

  it("manda um aviso curto, em português, com o erro e dizendo que os posts seguiram", async () => {
    const m = mundo({ agora: sp("2026-10-06", "06:11") });
    const enviado = await avisarCandidatasNaoGravadas(
      { id: "p1" },
      { dia: "2026-10-06", erros: [ERRO], postsGravados: 4 },
      m.deps,
    );

    expect(enviado).toBe(true);
    expect(m.enviados).toHaveLength(1);
    expect(m.enviados[0].nivel).toBe("warning");
    expect(m.enviados[0].texto).toContain("06/10");
    expect(m.enviados[0].texto).toContain("gravação das pautas candidatas");
    expect(m.enviados[0].texto).toContain("os posts seguiram normalmente (4 posts gravados)");
    expect(m.enviados[0].texto).toContain("23505");
    // Sem travessão (regra do projeto), escrito pelo código para não pôr o caractere aqui.
    expect(m.enviados[0].texto).not.toContain(String.fromCharCode(0x2014));
    expect(m.registros[0]).toMatchObject({ chave: "candidatas_nao_gravadas:2026-10-06", enviado: true });
  });

  it("um por dia: o ciclo da tarde que falha de novo não repete o aviso", async () => {
    const m = mundo({ agora: sp("2026-10-06", "06:11") });
    const falha = { dia: "2026-10-06", erros: [ERRO], postsGravados: 1 };
    await avisarCandidatasNaoGravadas({ id: "p1" }, falha, m.deps);
    const segundo = await avisarCandidatasNaoGravadas({ id: "p1" }, falha, m.deps);

    expect(segundo).toBe(false);
    expect(m.enviados).toHaveLength(1);
  });

  it("envio que falha fica gravado com o motivo do Telegram", async () => {
    const m = mundo({ agora: sp("2026-10-06", "06:11"), envioFalha: true });
    await avisarCandidatasNaoGravadas({ id: "p1" }, { dia: "2026-10-06", erros: [ERRO], postsGravados: 2 }, m.deps);

    expect(m.registros[0]).toMatchObject({ enviado: false, motivo: "telegram_recusou" });
  });

  it("sem erro, nada", async () => {
    const m = mundo({ agora: sp("2026-10-06", "06:11") });
    expect(await avisarCandidatasNaoGravadas({ id: "p1" }, { dia: "2026-10-06", erros: [], postsGravados: 3 }, m.deps)).toBe(false);
    expect(m.enviados).toHaveLength(0);
  });

  it("o texto cabe numa mensagem e conta os erros a mais", () => {
    const t = textoCandidatasNaoGravadas({ dia: "2026-10-06", erros: [ERRO.repeat(30), ERRO], postsGravados: 1 });
    expect(t.length).toBeLessThanOrEqual(900);
    expect(textoCandidatasNaoGravadas({ dia: "2026-10-06", erros: [ERRO, ERRO], postsGravados: 1 })).toContain("(e mais 1)");
    expect(textoCandidatasNaoGravadas({ dia: "2026-10-06", erros: [ERRO], postsGravados: 1 })).toContain("1 post gravado");
  });
});

/*
 * A leitura das candidatas falhou e a notícia do Instagram ficou segurada
 * (decisão do dono, 06/10/2026). O bloqueio continua; o aviso é o que impede
 * o dia sem post de passar em silêncio, como passou em 06/10.
 */
describe("leitura de candidatas que falhou", () => {
  const ERRO =
    "leitura de candidatas falhou: Candidatas, leitura da janela falhou: fetch failed causa: Connect Timeout Error code: UND_ERR_CONNECT_TIMEOUT";

  it("manda um aviso curto: o que foi segurado, por quê, o erro inteiro e o que fazer", async () => {
    const m = mundo({ agora: sp("2026-10-06", "06:11") });
    const enviado = await avisarLeituraDeCandidatasFalhou({ id: "p1" }, { dia: "2026-10-06", erros: [ERRO], postsSegurados: 4 }, m.deps);

    expect(enviado).toBe(true);
    expect(m.enviados).toHaveLength(1);
    const t = m.enviados[0].texto;
    expect(m.enviados[0].nivel).toBe("warning");
    expect(t).toContain("Instagram de 06/10");
    expect(t).toContain("os posts de notícia foram segurados (4 posts calculados ficaram de fora)");
    expect(t).toContain("a leitura do histórico de pautas candidatas no banco falhou");
    expect(t).toContain("Newsletter e portal não são afetados");
    expect(t).toContain("leva-social-extra.ts");
    // O erro vai inteiro, com o código que diz o que houve.
    expect(t).toContain(ERRO);
    expect(t).not.toContain(String.fromCharCode(0x2014));
    expect(m.registros[0]).toMatchObject({ chave: "leitura_de_candidatas_falhou:2026-10-06", enviado: true });
  });

  it("um por dia: a tarde que falha de novo não repete o aviso da manhã", async () => {
    const m = mundo({ agora: sp("2026-10-06", "06:11") });
    const falha = { dia: "2026-10-06", erros: [ERRO], postsSegurados: 2 };
    await avisarLeituraDeCandidatasFalhou({ id: "p1" }, falha, m.deps);
    expect(await avisarLeituraDeCandidatasFalhou({ id: "p1" }, falha, m.deps)).toBe(false);
    expect(m.enviados).toHaveLength(1);
  });

  it("não se confunde com o aviso da gravação: as chaves são outras", async () => {
    const m = mundo({ agora: sp("2026-10-06", "06:11") });
    await avisarCandidatasNaoGravadas({ id: "p1" }, { dia: "2026-10-06", erros: ["gravação falhou"], postsGravados: 1 }, m.deps);
    await avisarLeituraDeCandidatasFalhou({ id: "p1" }, { dia: "2026-10-06", erros: [ERRO], postsSegurados: 1 }, m.deps);
    expect(m.registros.map((r) => r.chave)).toEqual([
      "candidatas_nao_gravadas:2026-10-06",
      "leitura_de_candidatas_falhou:2026-10-06",
    ]);
  });

  it("envio que falha fica gravado com o motivo do Telegram", async () => {
    const m = mundo({ agora: sp("2026-10-06", "06:11"), envioFalha: true });
    await avisarLeituraDeCandidatasFalhou({ id: "p1" }, { dia: "2026-10-06", erros: [ERRO], postsSegurados: 1 }, m.deps);
    expect(m.registros[0]).toMatchObject({ enviado: false, motivo: "telegram_recusou" });
  });

  it("sem erro, nada", async () => {
    const m = mundo({ agora: sp("2026-10-06", "06:11") });
    expect(await avisarLeituraDeCandidatasFalhou({ id: "p1" }, { dia: "2026-10-06", erros: [], postsSegurados: 3 }, m.deps)).toBe(false);
    expect(m.enviados).toHaveLength(0);
  });

  it("singular, e o texto cabe numa mensagem do Telegram", () => {
    expect(textoLeituraDeCandidatasFalhou({ dia: "2026-10-06", erros: [ERRO], postsSegurados: 1 })).toContain("1 post calculado ficou de fora");
    expect(textoLeituraDeCandidatasFalhou({ dia: "2026-10-06", erros: [ERRO.repeat(100)], postsSegurados: 1 }).length).toBeLessThanOrEqual(3500);
  });
});
