import { describe, expect, it } from "vitest";
import {
  agruparMaterias,
  casaComNicho,
  contradizEstadoAtual,
  estadoAtual,
  estadosDasPautas,
  etapaDoTexto,
  nomesDoTitulo,
  rankingDoTermometro,
  superado,
  type Materia,
} from "./termometro";

/**
 * Vetores de mentira com a geometria que importa: o mesmo fato aponta quase
 * para o mesmo lado (cosseno ~0.95), o capítulo seguinte da mesma história
 * fica no meio (~0.6), e outra história fica longe (~0).
 */
const FATO_VIAJA = [1, 0, 0];
const FATO_CHEGA = [0.6, 0.8, 0];
const OUTRA = [0, 0, 1];
const quase = (v: number[], d = 0.05) => v.map((x, i) => (i === 2 ? x + d : x));

const AGORA = Date.parse("2026-10-28T15:00:00Z");
const h = (horas: number) => new Date(AGORA - horas * 3600 * 1000).toISOString();
const m = (titulo: string, dominio: string, horas: number): Materia => ({ titulo, dominio, publicadoEm: h(horas) });

function dia() {
  const materias = [
    m("Flávio Bolsonaro viaja rumo aos EUA", "g1.globo.com", 20),
    m("Flávio Bolsonaro embarca para os EUA", "folha.uol.com.br", 19),
    m("Flávio Bolsonaro chega a Miami", "uol.com.br", 2.5),
    m("Flávio Bolsonaro chega aos EUA e é recebido em Miami", "metropoles.com", 2),
    m("Flávio Bolsonaro desembarca em Miami", "cnnbrasil.com.br", 1),
    m("Flávio Bolsonaro chega aos EUA", "poder360.com.br", 0.5),
    m("Campeonato tem rodada decisiva no domingo", "g1.globo.com", 1),
  ];
  const vetores = [FATO_VIAJA, quase(FATO_VIAJA), FATO_CHEGA, quase(FATO_CHEGA), quase(FATO_CHEGA, 0.02), quase(FATO_CHEGA, 0.03), OUTRA];
  return { materias, vetores, grupos: agruparMaterias(materias, vetores) };
}

describe("o termômetro de pauta", () => {
  it("reconhece a etapa mais adiante do texto, por família", () => {
    expect(etapaDoTexto("Flávio viaja rumo aos EUA")?.rotulo).toBe("viaja");
    expect(etapaDoTexto("Flávio chegou a Miami dois dias depois de viajar")?.rotulo).toBe("chega");
    expect(etapaDoTexto("Flávio pede asilo nos EUA")?.rotulo).toBe("asilo");
    expect(etapaDoTexto("Visto que o mercado caiu, o dólar subiu")).toBeNull();
    // Casos do ensaio de 28/10/2026: reação não é capítulo, e "silêncio sobre asilo" não é asilo.
    expect(etapaDoTexto("“Perseguição implacável”, diz vice de Flávio após fuga de senador aos EUA")).toBeNull();
    expect(etapaDoTexto("Fuga de Flávio pode motivar prisão preventiva, dizem especialistas")?.familia).not.toBe("viagem");
    expect(etapaDoTexto("EUA confirmam vistos a Flávio Bolsonaro e família, mas silêncio sobre asilo mantém incerteza")?.rotulo).toBe("visto");
    expect(etapaDoTexto("Flávio Bolsonaro desafia proibição e viaja rumo aos EUA")?.rotulo).toBe("viaja");
    expect(etapaDoTexto("Dólar fecha em queda")).toBeNull();
  });

  it("acha os nomes que ligam capítulos, inclusive o que abre o título", () => {
    expect([...nomesDoTitulo("Flávio Bolsonaro chega a Miami")]).toEqual(expect.arrayContaining(["flavio", "bolsonaro", "miami"]));
    expect(nomesDoTitulo("Governo anuncia pacote")).not.toContain("governo");
  });

  it("junta o mesmo fato num grupo e liga os capítulos da mesma história", () => {
    const { grupos } = dia();
    const viaja = grupos.find((g) => g.maisNova.titulo.includes("embarca"))!;
    const chega = grupos.find((g) => g.maisNova.titulo === "Flávio Bolsonaro chega aos EUA")!;
    expect(viaja.materias).toHaveLength(2);
    expect(chega.materias).toHaveLength(4);
    expect(viaja.historia).toBe(chega.historia);
    expect(superado(viaja, grupos)?.id).toBe(chega.id);
    expect(superado(chega, grupos)).toBeNull();
  });

  it("o ranking dá uma linha por história, com o capítulo atual e os grupos que ela juntou", () => {
    const { grupos } = dia();
    const r = rankingDoTermometro(grupos, { termos: [], agoraMs: AGORA });
    expect(r).toHaveLength(2);
    expect(r[0].tituloMaisNovo).toBe("Flávio Bolsonaro chega aos EUA");
    expect(r[0].etapaAtual).toBe("chega");
    expect(r[0].grupos).toBe(2);
    expect(r[0].veiculos3h).toBe(4);
    expect(r[0].brasilEua).toBe(true);
    expect(r[0].alerta).toBe(true);
    expect(r[0].superadoPor).toBeNull();
  });

  it("sem etapa reconhecida dos dois lados, nada é superado (na dúvida, não corta)", () => {
    const materias = [m("Flávio Bolsonaro fala com a imprensa", "g1.globo.com", 10), m("Flávio Bolsonaro fala a apoiadores", "uol.com.br", 1)];
    const grupos = agruparMaterias(materias, [FATO_VIAJA, FATO_CHEGA]);
    expect(grupos).toHaveLength(2);
    expect(grupos[0].historia).toBe(grupos[1].historia);
    expect(superado(grupos[0], grupos)).toBeNull();
  });

  it("a trava segura texto de etapa anterior, e na dúvida não segura", () => {
    const { grupos } = dia();
    const viaja = grupos.find((g) => g.maisNova.titulo.includes("embarca"))!;
    const estado = estadoAtual(viaja, grupos);
    expect(estado.etapa?.rotulo).toBe("chega");
    expect(estado.linha).toMatch(/Etapa atual: chega/);
    expect(contradizEstadoAtual("Flávio Bolsonaro viaja para os EUA nesta terça", estado)).toMatch(/já está em "chega"/);
    expect(contradizEstadoAtual("Flávio Bolsonaro chega a Miami", estado)).toBeNull();
    expect(contradizEstadoAtual("Flávio Bolsonaro e o PL", estado)).toBeNull();
    expect(contradizEstadoAtual("qualquer coisa", null)).toBeNull();
  });

  it("o estado de cada pauta sai do grupo mais parecido do dia", () => {
    const { grupos } = dia();
    const estados = estadosDasPautas([{ storyId: "s1", vetor: FATO_VIAJA }, { storyId: "s2", vetor: [0, -1, 0] }], grupos);
    expect(estados.get("s1")?.etapa?.rotulo).toBe("chega");
    expect(estados.has("s2")).toBe(false);
  });

  it("o nicho é EUA no centro, e placar fica de fora", () => {
    expect(casaComNicho("Trump anuncia tarifa sobre o aço")).toBe(true);
    expect(casaComNicho("Brasileirão: rodada decisiva nos EUA")).toBe(false);
    expect(casaComNicho("Lula visita Minas Gerais")).toBe(false);
  });
});
