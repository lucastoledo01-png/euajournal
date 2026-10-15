/**
 * O assunto do acervo de cada entidade recorrente, pelo QID do Wikidata
 * (14/10/2026).
 *
 * O resolvedor chega com o rótulo que a busca do Wikidata devolveu, e ele muda
 * com o idioma e com a grafia da pauta ("Lula" vira "Luiz Inácio Lula da
 * Silva", "Senado" vira "Senado Federal do Brasil"). O QID não muda. O nome do
 * arquivo continua legível (`pessoas-br-lula-retrato-01.jpg`), e esta tabela
 * liga um ao outro. Entidade nova no acervo entra aqui junto com a foto.
 */
export const ASSUNTO_POR_QID: Record<string, string> = {
  // Pessoas
  Q22686: "donald_trump",
  Q37181: "lula",
  Q10283057: "flavio_bolsonaro",
  Q36215: "mark_zuckerberg",
  Q7407093: "sam_altman",
  Q317521: "elon_musk",
  Q305177: "jensen_huang",
  Q22294946: "alexandre_de_moraes",
  Q15031: "xi_jinping",
  Q6182718: "jerome_powell",
  Q7435987: "scott_bessent",
  Q7426870: "satya_nadella",
  Q265852: "tim_cook",
  // Empresas
  Q21708200: "openai",
  Q116758847: "anthropic",
  Q380: "meta",
  Q95: "google",
  Q182477: "nvidia",
  Q2283: "microsoft",
  Q312: "apple",
  Q483551: "walmart",
  Q3884: "amazon",
  Q478214: "tesla",
  Q193701: "spacex",
  // Instituições
  Q53536: "federal_reserve",
  Q35525: "casa_branca",
  Q519138: "stf",
  Q3656204: "tse",
  Q2119413: "senado_federal",
  Q1834804: "camara_dos_deputados",
  Q806186: "banco_central_do_brasil",
  Q2824618: "social_security",
  Q648666: "tesouro_dos_eua",
  Q54109: "capitolio",
  Q13677: "nyse",
  Q11201: "suprema_corte_eua",
};
