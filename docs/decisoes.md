# Decisões do eua.journal

O que já foi decidido, por quê, e o que **não** refazer.

Este arquivo existe porque os outros dois não respondem à pergunta que causa
retrabalho. O `arquitetura.md` diz como o sistema é; o
`aprendizados-e-incidentes.md` diz por que algo quebrou. Falta o registro do que
foi **escolhido de propósito**, e que, sem registro, alguém desfaz achando que é
descuido.

Regra de uso: antes de mudar algo que parece estranho, procure aqui. Se a
decisão estiver registrada e você discordar, discuta com o dono. Se não estiver,
decida e acrescente.

---

## Produto e marca

**A publicação é sobre os ESTADOS UNIDOS, não sobre imigração.** Virada de
16/09/2026, decidida pelo dono depois de ler uma manchete sobre o visto de um
designer mexicano. Economia, trabalho, custo de vida, política, tecnologia,
cultura e cidades, com a imigração como UMA editoria entre elas, teto de uma
pauta de visto por edição.

O que mudou junto, porque prompt sozinho não muda produto: 10 das 13 fontes de
escritório de advocacia foram desligadas e 12 fontes americanas de economia,
política, tecnologia e sociedade entraram; as cinco editorias do classificador,
que eram todas de imigração, viraram oito; o briefing do banco perdeu a ordem de
preferência que ranqueava visto em primeiro lugar. **Não reverta uma dessas
partes sozinha:** com as fontes antigas de volta, nenhuma regra de texto segura
a pauta técnica, porque o sistema não escreve sobre o que não coleta.

**A marca é `eua.journal`**, desde 28/09/2026. A linhagem é `desbuguei.ia` →
`imigra.us` → `usa.journal` → `eua.journal`. A troca é de nome e de logotipo,
não de linha editorial: continua sendo notícia dos EUA para brasileiros.

**O Instagram é `@eua.journal`, nome de exibição "EUA Journal".** Perguntado à
Graph API em 28/09/2026:

```
username  eua.journal
name      EUA Journal
```

Isto já esteve escrito ao contrário em dois lugares, e o erro saiu publicado: o
`marca.ts` apontava para `@usa.journal.ai` e o `pack-de-linguagem.md` afirmava
que esse era o perfil verdadeiro. O handle é IMPRESSO na arte de todo post, no
rodapé da newsletter e no portal, então o valor errado foi ao ar em cada peça
até esta data.

Se a conta for renomeada de novo, três campos do `marca.ts` mudam juntos:
`instagram`, `instagramHandle` e `instagramNome`, mais o `handle`. E a
conferência é uma chamada à Graph API, nunca a memória de ninguém nem um
documento antigo.

**O logotipo** é o que o dono entregou em 05/10/2026, em duas versões
desenhadas: `public/marca/eua-journal-fundo-claro.png` ("eua" azul-marinho,
para fundo branco) e `eua-journal-fundo-escuro.png` ("eua" branco, para
azul-marinho e foto escura). O ".journal" é vermelho nas duas. Até essa data os
arquivos que o `marca.ts` apontava ainda desenhavam "usa.journal" com a
estrela, e a arte escrevia a marca em texto em quatro lugares. A regra é uma
só: quem desenha a marca usa a imagem, escolhida pela cor do fundo onde ela
fica, e o endereço sai de `MARCA.logoClaro` ou `MARCA.logoEscuro`. Os
arquivos `-alta` são o original sem margem, em resolução cheia, para quem
precisar refazer um tamanho.

**O Instagram tem marca própria desde 06/10/2026**: o "eua" com o ponto
vermelho, sem o ".journal", entregue pelo dono nas duas tintas
(`public/marca/eua-instagram-fundo-claro.png`, azul-marinho, e
`eua-instagram-fundo-escuro.png`, branco; a margem transparente foi cortada
rente). Vale SÓ nas peças do feed: capa, miolo do carrossel, convite final e
o cabeçalho dos slides (`MARCA.logoInstagramClaro` e `logoInstagramEscuro`).
Portal, newsletter e site continuam com a assinatura horizontal. Na foto, quem
escolhe a tinta é a mesma medida de brilho atrás da marca (limiar 0.62); no
fundo preto do convite, a branca. O avatar (`eua-journal-avatar.png`) deixou de
desenhar ".usa": é o ícone do site, achatado sobre o azul-marinho, em 320x320.

**O domínio continua `casaloti.ia.br`**, por decisão do dono. É ele que serve o
site, as imagens do e-mail e o alvo do cron.

**`imigra.us` NÃO é o nosso site.** São 114 bytes de página de estacionamento do
registrador. Se alguém relatar "o site está sem notícia", conferir primeiro qual
endereço a pessoa abriu.

**O `slug` do projeto ainda é `desbuguei`.** É interno, não aparece para
ninguém, e trocar mexe em chave de idempotência e caminho de Storage. Fica.

## Cadência e canais

**O fim do e-mail tem UM convite, e é a análise de perfil.** Havia três blocos
disputando a mesma atenção: o "Giro rápido" repetindo fatos das pautas, a
análise de perfil e um convite para seguir o Instagram. O convite ao Instagram
oferecia o mesmo conteúdo em outro formato para quem tinha acabado de ler a
edição, e saiu. O Instagram vive no rodapé, como ícone mais o nome do perfil.
Desde 05/10/2026 o convite continua sendo um só, mas muda de formato a cada
edição: ver "O bloco do VisaMatch alterna de formato a cada edição".

**O `quick_bits` continua sendo gerado e não é mais renderizado.** O campo
alimenta o carrossel e o relatório. O que saiu foi a renderização, como já tinha
acontecido com "O que muda na prática".

**O título de busca do artigo é o `headline`, não o `subject`.** O assunto do
e-mail é escrito para dar vontade de abrir na caixa de entrada, com curiosidade
incompleta e caixa baixa. Isso é ótimo no Gmail e péssimo num resultado de
busca.

**Uma newsletter por dia.** Não é fio contínuo por e-mail: dezenas de disparos
queimariam a lista, e nem a referência faz isso.

**O CTA do Instagram oferece a NEWSLETTER; o do e-mail oferece a ANÁLISE DE
PERFIL. A divergência é deliberada**, decidida pelo dono em 17/09/2026, e não é
descuido de alguém que esqueceu de alinhar os dois.

O que muda entre os dois canais é quem está do outro lado. No Instagram a pessoa
ainda não assina, e o produto que se oferece a ela é a newsletter: até 17/09 as
quatro formas de CTA prometiam avaliação de perfil de imigração, o que
transformava um jornal em captação de lead em todo post. No e-mail a pessoa já
assinou, então pedir que ela assine não é oferta: a análise é a única coisa ali
que responde à pergunta que a levou a assinar, que é "eu consigo?".

Quem for alinhar os dois "por consistência" está desfazendo uma decisão, não
corrigindo um esquecimento.

**A mensagem que a pessoa recebe depois de comentar NÃO mora no repositório.**
Ela está na automação do OpenReply, e `garantirFunilPermanente` só fala com o
OpenReply quando `openreply_automation_id` é nulo: a automação é criada UMA vez e
nunca mais atualizada de cá. O cliente em `openreply-client.ts` tem GET de
disponibilidade e POST de criação, e nada mais.

Consequência prática, que já mordeu: mudar `prompt_campaigns.dm_message` no banco
não muda a DM. O registro no banco é a cópia intencionada; o que a pessoa recebe
é o que está no painel do OpenReply. Os dois só coincidem se alguém editar lá.

E NÃO tente forçar a recriação apagando `openreply_automation_id`: o OpenReply
recusa a segunda automação com a mesma palavra, e o resultado seria o funil
quebrado em vez de atualizado.

**O Instagram tem agenda própria** e não depende da edição passar. Ele roda
sobre o pool aprovado, ANTES da decisão da newsletter, e é por isso que os posts
continuam saindo em dias em que a edição é barrada.

**O portal tem a PAUTA como unidade**, não a edição. Quem procura "o que mudou
no H1B" precisa achar o assunto, e não um item chamado `edicao-2026-09-12`.

## Voz

**A publicação fala, não relata.** O nome tem "journal", o texto não tem. A
régua é conversa entre duas pessoas informadas: parágrafo de duas a quatro
linhas, frase curta alternada com uma que respira, segunda pessoa quando fizer
sentido, zero emoji e zero gíria no corpo. Vale igual para newsletter, artigo do
portal e Instagram, e no portal isso é automático: o artigo é a edição
regravada, sem chamada nova de LLM.

**O texto fala do FATO, nunca da reportagem.** "A fonte não informa", "não foi
detalhado" e "o G1 não diz" estão proibidos em qualquer campo. Isso não era um
descuido do modelo: eram nove instruções pedindo a frase, mais dois auditores
instruídos a tratá-la como desejável, mais o laço de reparo convertendo
afirmação sem lastro em ressalva. A exceção é uma por edição, quando a falta É a
notícia, e mesmo aí se escreve falando da divulgação: "a nova data ainda não foi
divulgada".

**Silêncio é resultado válido, e agora em todos os campos.** Era autorizado só
em `why_it_matters`. Sem essa autorização, tirar a ressalva deixaria o modelo
sem saída: completar a lacuna bloqueia por falta de lastro, e hedge bloqueia por
escopo.

**Português primeiro, sigla depois e só se ajudar.** Nome oficial de norma, de
processo judicial e de órgão em inglês não entra no corpo do texto. O caminho
preferido para jargão é TIRAR, não explicar; quando precisar explicar, é em
frase própria e falada, nunca em aposto no meio da frase.

**Negrito tem função.** Número, prazo, data e valor que decidem a notícia saem
em negrito, no máximo dois por parágrafo, marcados com dois asteriscos pelo
redator e convertidos no template. O leitor passa o olho antes de ler.

**Cada linha acrescenta, nenhuma repete a de cima.** O preheader não é resumo do
headline, e o summary não reescreve o title. Existe uma conferência
determinista que mede isso por CONTENÇÃO de palavras, não por Jaccard, e ela
gera apontamento de reparo, nunca bloqueio.

## Editorial

**O portão de alucinação não se afrouxa.** Fato inventado que chega à lista não
se desfaz com errata. Quando ele barra todo dia, o suspeito é o que alimenta o
texto, nunca o portão.

**A relevância pode ser vazia.** Nem toda pauta tem relevância com lastro. Uma
liminar que só diz "a medida está suspensa" não informa quem é afetado. Antes, o
vazio era apontado, o reparo insistia e a redação devolvia hedge, que o auditor
recusa: dois portões empurrando em direções opostas custavam o dia. A tolerância
é para o SILÊNCIO, não para a tentativa malfeita.

**A instrução nunca pede comportamento de pessoas.** A fonte fala de regra,
prazo e decisão, e não do que as pessoas acompanham, observam ou esperam. Pedir
isso fabrica, todo dia, a frase que a régua recusa.

**Um acontecimento, uma pauta por edição.** Os tetos de ator e de domínio não
pegavam três leituras do mesmo fato por veículos diferentes. Além da repetição,
um fato esticado em três matérias faz a redação enfeitar.

**O agrupamento é por SEMELHANÇA, não por igualdade.** A primeira versão
comparava impressão exata de ator, lugar e termo, e não agrupou nada: quatro
veículos sobre a mesma liminar escrevem palavras diferentes. A régua é o vetor
que já existe em `news_candidates.embedding`, com limiar de 0.70 entre as
pautas do mesmo dia. O número é medido, não escolhido: o mesmo fato por
veículos diferentes deu 0.89, 0.81 e 0.80, e o primeiro par de fatos distintos,
0.563. Não confunda com o limiar de 0.85 da repetição histórica: são perguntas
diferentes, e o mesmo dia repete muito mais que trinta dias.

**Google News é descoberta, nunca a fonte publicada.** Link de agregador não
resolve para o leitor. Resolver o link dele é engenharia reversa de endpoint
privado, e já foi medido: não vale.

## Visual

**Templates travados.** A LLM escreve o texto e nunca toca no layout. Não existe
decisão de layout por post.

**A manchete da capa tem forma, e a forma tem um lugar só.** De 6 a 18 palavras
e de 45 a 130 caracteres, em duas partes: o que é, com nome próprio ou citação,
e o que muda, com o detalhe que prova. A faixa saiu da medição das capas de
referência (11, 15 e 16 palavras) e da capacidade medida da arte nova, não de
gosto. Os números e o texto da regra vivem em `social/manchete.ts`, e os dois
prompts e a guarda leem de lá. Manchete de cinco palavras cabe em qualquer arte
e não diz qual regra, de quem, nem a partir de quando.

**O chapéu de editoria aparece sempre.** Com foto ou sem, peça única ou
carrossel. Ele ficava de fora na peça única com foto, herança do desenho
anterior, e é a linha que diz de que editoria é aquilo antes de o leitor ler a
manchete.

ESTENDIDO em 06/10/2026: **o chapéu é o TEMA quando a pauta tem um**, como o
Not Journal imprime "DATA CENTERS" e não a seção. O tema sai da lista fechada
de `src/lib/temas.ts` e só vale quando o texto da pauta o trata (duas menções
ou mais) E a manchete o nomeia; sem isso, a editoria de sempre. O mesmo chapéu
vai na capa e em todo slide do miolo, pequeno, espaçado, em caixa alta, logo
acima da manchete ou do texto, e fica gravado em `arte.chapeu` para a refação
da arte desenhar o mesmo. Ver "As decisões do dono sobre o método".

**A gramática dos posts é uma só:** foto sangrando colorida, marca no alto à
esquerda, chapéu de editoria e manchete em caixa alta no rodapé. A capa é a
mesma peça com a bolha por cima. As medidas vieram de medição das referências,
não de estimativa, e estão comentadas no CSS.

**A capa SEM foto é peça tipográfica, e não fallback quebrado.** Ela mede o
corpo do tipo no navegador e impede que "I-765" quebre no meio da linha. Não
troque por "fundo azul com a manchete em cima".

**A bolha é a vice-campeã do resolvedor**, que passou pelas mesmas barreiras da
vencedora. Nunca é a segunda da lista bruta, e nunca repete a foto de fundo.

**Estrutura da referência, identidade nossa.** Copiar a gramática do formato é
normal. Copiar logotipo, recorte circular com anel colorido e a cor de acento de
outra marca cria risco jurídico e faz o produto parecer clone.

## Infraestrutura e método

**Deploy só conta quando o processo nasce DEPOIS do clone.** O EasyPanel mantém
o contêiner anterior quando o build falha, e o site segue respondendo 200 com
código velho. Código novo no disco não prova nada.

**`npm run build` antes de todo deploy.** O `vitest` passa e o `tsc` avulso não
enxerga o projeto inteiro; quem roda o type check completo é o `next build`.

**Nunca filtre a saída de um verificador pelos arquivos que você mexeu.** Foi
assim que um build quebrado foi para produção: os dois erros estavam em arquivos
que eu não tinha tocado e por isso não apareciam no meu grep.

**O build na VPS não tem as variáveis do banco.** Página que depende de dado é
dinâmica, ou nasce vazia a cada deploy.

**Diagnóstico vai para o banco, não para o log.** O usuário `deploy` não está no
grupo `docker`, então log de contêiner é inalcançável. Portão que decide não
publicar grava POR QUE, com o texto na mão, e a linha de falha carrega os
contadores do funil.

**Skill de terceiro: fixe o commit, leia todos os arquivos, desconfie de
descrição larga.** O instalador oficial busca da branch `main` no momento da
instalação, então auditar e instalar viram conteúdos diferentes. Detalhes em
`.claude/skills/PROCEDENCIA.md`.

## O dia deixou de ser só reativo (16/09/2026)

A coleta lê 55 fontes e responde uma pergunta só: *o que estas publicações
publicaram?* Isso deixa dois buracos, e os dois são de tempo.

**O futuro.** A Black Friday é daqui a três semanas e nenhuma fonte escreveu
sobre ela ainda. Quando escreverem, faltarão dois dias. Quem sabe a data é o
calendário, e ele sabe hoje. `editorial/calendario.ts` gera de 84 a 92 datas
por ano, por REGRA e não por tabela, para os Estados Unidos e para o Brasil,
válido de 2026 a 2030 e além. Só vira tabela o que não tem regra: as reuniões
do Fomc, copiadas do Federal Reserve, e os grandes eventos já marcados.

**O agora.** O assunto do país pode não estar em nenhuma das 55.
`editorial/tendencias.ts` lê Google Trends (EUA e Brasil), os mais lidos da
Wikipédia e a capa do Hacker News. Reddit ficou de fora: devolve 403 sem
autenticação, medido.

Os dois viram fonte de busca no Google News, em `editorial/busca-dinamica.ts`,
para atravessarem a MESMA coleta, deduplicação, classificação e guarda. Nada
disso publica nada; só abre a porta.

Três coisas que custaram medida e não podem ser desfeitas por engano:

- **Tendência crua é quase toda esporte e celebridade.** Medido em 16/09/2026:
  o Google Trends dos EUA trazia "barca game", "aaron judge" e "man u" entre os
  dez primeiros. Por isso existe a triagem, e por isso ela devolve VAZIO quando
  falha: passar o cru adiante pagaria classificação por placar de jogo.
- **O relatório de emprego NÃO sai na primeira sexta do mês.** A regra do BLS é
  a terceira sexta depois do fim da semana que contém o dia 12 do mês de
  referência. As duas coincidem na maioria dos meses, e é por isso que a lenda
  sobrevive. Conferido contra o feed oficial: agosto de 2026 saiu em 4 de
  setembro.
- **A Black Friday não é a última sexta de novembro.** É o dia seguinte à
  QUARTA quinta-feira. Em anos com cinco quintas em novembro, a regra popular
  erra por uma semana.

## Uma pauta ruim não derruba mais a edição (16/09/2026)

Entre 04/09 e 16/09 a redação rodou 13 manhãs e publicou 5. As de 13, 14 e 15
morreram inteiras, e no dia 16 três execuções morreram antes de a quarta
passar. O motivo estava sempre na mesma linha: o portão reprovava a EDIÇÃO
quando UMA conclusão de UMA matéria não se sustentava no pacote factual.

Seria defensável se o juiz fosse determinístico. Ele não é: quem decide é um
modelo, e o mesmo texto reprovava numa chamada e passava na seguinte.

A troca é de escopo, não de rigor. A matéria sem lastro continua não sendo
publicada; ela é que sai, e não a edição. Abaixo do mínimo de pautas a edição
continua não saindo, porque aí o problema é do dia. E auditoria que NÃO RODOU
deixou de bloquear: timeout da OpenAI não é conclusão reprovada.

## A marca do topo escolhe a versão pelo brilho da foto (16/09/2026)

O logotipo tem o "usa" em branco, desenhado para foto escura, e em céu claro
ele sumia: a peça saía com meia marca, só o ".journal" vermelho.

Não dá para resolver escrevendo código: quem decide é a foto que o resolvedor
achou naquele dia. Então a decisão é medida no navegador, com a peça montada.
O script recorta o pedaço da foto que fica ATRÁS do logotipo, respeitando o
`cover` (a imagem quase nunca tem a proporção da peça, então o canto do arquivo
não é o canto da peça), reduz para 24 por 12 pixels e tira a luminância média.
Acima de 0.62, troca para a versão de tinta escura.

Medido em fotos reais, com o mesmo recorte da peça:

```
Fed, céu de fim de tarde     0.661   marca clara
Boston, céu branco           0.948   marca clara
Manhattan à noite            0.093   marca escura
```

Três defeitos apareceram no caminho, e os três são do tipo que não dá erro:

- **O template literal comeu as barras da expressão regular.** O script mora
  dentro de crases, e o literal processa escapes antes de a string existir:
  `\(` chegou ao navegador como `(`, a busca pela URL da foto passou a devolver
  vazio, e a medição nunca rodou. Sintoma: marca sempre escura.
- **O logotipo ainda não tinha carregado na hora de medir.** Um `img` sem
  carregar tem altura pelo CSS e largura ZERO, então o recorte tinha zero
  pixel. Só aparecia no render frio: no segundo, o arquivo já estava em cache.
- **A falha era silenciosa.** Passou a gravar `data-brilho` e `data-erro` na
  peça, porque sem eles canvas marcado, expressão quebrada e largura zero são
  o mesmo sintoma.

Existe validador: `npx tsx src/scripts/validar-marca-contraste.ts` renderiza as
três fotos com a foto embutida como data URL, igual à produção, e exige que a
peça tenha MEDIDO, não só acertado. Acertar por acaso não conta, porque a marca
escura é o padrão e uma peça que nunca mediu nada acerta toda foto escura.

## Nenhuma peça convida a arrastar (16/09/2026)

O convite existiu, com um argumento razoável: a peça de várias telas precisa
dizer que tem várias telas, e os pontos do Instagram são pequenos. O argumento
perdeu para a evidência.

Foram baixadas quatro capas de carrossel reais de @notjournal.ai e
@braziljournal, as duas referências do produto. **Nenhuma das quatro traz
convite.** A referência de recorte enviada pelo dono, um post do Tallis Gomes,
também não traz. O que as quatro têm é logotipo, chapéu de editoria e manchete.

O leitor de Instagram já sabe arrastar. A linha gastava espaço para ensinar o
que ninguém precisa aprender, e é o tipo de detalhe que denuncia peça feita
para performar em vez de informar.

Saiu das três gramáticas de notícia: capa de jornal, capa sem foto e recorte.
Continua viva na variante `result_showcase`, que é dos formatos de tutorial e
de prompt, e ali a linha promete um conteúdo, não ensina a arrastar.

## A bolha da capa tem régua própria (16/09/2026)

A bolha é o círculo com a segunda foto. Duas regras novas, pedidas pelo dono:

- **Identidade, não relevância.** O fundo pode ser a cena; o círculo precisa
  mostrar quem ou o que a pauta cita. Uma foto sem nenhuma correspondência de
  entidade soma 55 pontos, acima do piso de 45 do fundo, e virava o círculo. O
  piso de identidade (38, que é 85 por cento do peso de entidade) barra isso
  sem mexer no piso do fundo.
- **Ritmo, não disponibilidade.** Recurso que quebra padrão só funciona
  enquanto for exceção. Depois de uma capa com bolha vem uma sem, mesmo que a
  segunda foto exista. O estado vem do feed, não da leva, senão duas capas com
  bolha se encostam na virada do dia.

ATUALIZADO em 06/10/2026: a bolha nunca cobre rosto, e a alternância virou
alvo. Ver "A bolha não cobre rosto, e a vez dela passa adiante".

## Nenhuma imagem vai ao ar sem alguém ter olhado para ela (17/09/2026)

Decidido pelo dono depois de dois posts agendados com imagem incoerente: "é uma
automação 100%, então um erro vai para o ar". A régua de imagem passou a ter
quatro camadas, e a quarta é de natureza diferente das outras três.

**As três primeiras leem texto.** Relevância compara nome de entidade com nome
de arquivo, temporalidade compara data, e o detector de polaridade compara
palavra com palavra. Todas perguntam "há indício de que esteja errado?" e
**aprovam no silêncio**.

**A quarta abre a imagem.** Uma chamada de modelo recebe a foto e a manchete,
descreve o que vê e decide. Ela pergunta "o que você vê, e isso sustenta esta
manchete?" e **recusa no silêncio**.

A inversão é o ponto. Não adianta somar barreiras que aprovam por omissão: três
delas de olhos fechados continuam sendo zero conferência sobre o conteúdo da
foto.

**O que isso NÃO custa.** Não custa post. Nenhum guard do Instagram lê essas
notas, e o número de posts do dia vem de `SOCIAL_POSTS_MAX_PER_DAY` com o
evergreen preenchendo o que a notícia deixou. Recusar imagem errada troca a foto
pela bandeira, que é peça publicável (SUPERADO em 05/10/2026: a pauta sem foto
não vira post; ver "Pauta sem foto não vira conteúdo"). O que cai é a fração de posts ilustrados
pelo próprio assunto, e o bloco de foto da newsletter, que exige status
aprovado.

**O piso de confiança é 70, e é assimétrico de propósito.** Recusar imagem boa
custa uma bandeira. Aprovar imagem errada custa um post no ar afirmando
visualmente algo que não aconteceu, num perfil que publica sozinho. Os dois
erros não têm o mesmo preço.

**Falha de conferência é recusa, nunca passe livre.** Sem chave, com a rede fora
ou com resposta ilegível, a saída é a bandeira. O motivo gravado separa
"recusada porque estava errada" de "recusada porque não deu para conferir", que
pedem providências diferentes.

**Sigla de PROGRAMA não vira entidade visual; sigla de ÓRGÃO vira.** "PERM",
"EB-2 NIW" e "I-485" nomeiam procedimento, e procedimento não se fotografa: no
Wikidata eles encontram homônimo. "ICE", "USCIS" e "DOL" são instituições com
fachada e acervo. A diferença está no formato, e há teste com os 27 códigos do
catálogo de um lado e as siglas de órgão do outro.

**País fora da cobertura é VETO, não desconto.** A penalidade de pontos existia
para desempatar dois candidatos; quando o homônimo estrangeiro é o único, ela
vira pedágio que ele paga e segue. Foi assim que a cidade de Perm ganhou por
cinco pontos de um limiar.

**Os gatilhos do banco conceitual vêm nos dois idiomas.** O casamento roda sobre
o título da FONTE, e fonte americana escreve em inglês. E o casamento é por
INÍCIO DE PALAVRA, não substring: "ice" casava dentro de "justice" e "police".

## O recorte entra no feed, e quem decide é o eixo (18/09/2026)

O `recorte_post` estava pronto, testado e renderizável desde 16/09, e **nunca
desenhou uma peça**. Nenhum ponto da produção passava a gramática, o padrão era
`"jornal"`, e o único chamador era o script de preview. Faltava a decisão de
quando ele entra, que é de produto e não de código.

**O eixo decide.** Custo de vida, trabalho, cultura e tecnologia chegam como
leitura da realidade, e o recorte serve isso porque ele é uma fala. Política,
segurança, imigração e economia afirmam um fato com data e efeito, e pedem a
peça que afirma. Sem eixo reconhecido, jornal.

**A alternância é a rede, e não há sorteio.** Teto de dois recortes seguidos,
contado a partir do fim do FEED e não do começo da leva, senão três se
encostariam na virada do dia. Sorteio foi recusado pelo mesmo motivo que em
todo o resto do projeto: um dia com seis recortes seguidos seria
indistinguível de defeito.

**O recorte EXIGE foto**, e isso foi descoberto renderizando, não lendo. O
`.r-texto` é faixa fixa de 76% da altura com o tipo travado em 46px, e nada faz
o texto crescer: um gancho de 65 caracteres sem foto deixa dois terços da peça
em branco. Havia um comentário afirmando que sem foto "o corpo do tipo cresce".
Não cresce, e o comentário foi corrigido. Sem foto quem desenha é a capa
tipográfica do jornal, que MEDE o texto no navegador e enche o canvas.

**O corpo do recorte é o `gancho` da copy.** Medido em 25 peças reais: 24 cabem
no orçamento com foto. `fato_principal` não serve, estoura.

**A gramática é gravada, nunca deduzida.** `content_json.arte.gramatica` guarda
a decisão e `arte.variante` guarda o desenho, e a conferência da publicação
compara os dois. Deduzir do eixo na hora de conferir recusaria exatamente a
peça que caiu para jornal por não caber, que é a peça que fez a coisa certa.

Quem calcula a gramática efetiva é `gramaticaEfetiva`, em `social/arte.ts`, e
ela é UMA função com três chamadores: o desenho, o store e o ritmo. Já houve
a versão com três cópias da mesma regra, e custou vinte minutos de diagnóstico
num post que estava correto.

## A cena da foto sai do CONTEÚDO, e não de uma lista (18/09/2026)

São dois caminhos, e a diferença é do dono, que a nomeou melhor do que o código
nomeava.

**Com entidade nomeada** (Trump, a USCIS, o Fed, a Suprema Corte), o sistema
resolve a entidade no Wikidata e busca a foto DAQUELA coisa no Commons. Isso
estava certo e não mudou.

**Sem entidade nomeada**, o sistema desistia de olhar a matéria e caía numa
lista de 16 temas escritos à mão, casados por radical de palavra, na ordem,
primeiro que casar vence. A frase do dono é o diagnóstico:

> "compradores de imóvel ganham margem não tem entidade fotografável, isso está
> errado, porque existe um objeto que contextualiza com o conteúdo"

Tinha casas. Tinha imóveis. A lista é que não sabia.

**Três defeitos, medidos, e os três são do MÉTODO:**

- Um radical errado derruba tudo. O tema de moradia tinha `imovel`, a manchete
  dizia `imóveis`, e `imovel` não é prefixo de `imoveis`: o L quebra.
- A ordem rouba. Moradia é o penúltimo dos 16. "Aluguel pesa mais no orçamento
  e pressiona a economia" foi para notas de dólar, porque `economia` vem antes.
- São 16 gavetas para o mundo inteiro. Robotáxi, controlador de voo e dado do
  Census não têm gaveta, e caíam todos no mesmo skyline genérico.

**Agora o sistema pergunta.** Ele já fazia uma chamada de modelo para CONFERIR
a imagem; passou a fazer uma para DESCREVER o que fotografar. Medido nas pautas
reais do dia:

```
controlador de voo   antes: city skyline      agora: airport control tower exterior
robotáxi em Nevada   antes: city skyline      agora: autonomous vehicle city street Nevada
imóveis              antes: city skyline      agora: suburban houses for sale street
renda desigual       antes: banknotes         agora: mixed income neighborhood houses
```

**Os 16 temas continuam, como rede.** Chamada que falha cai neles, que é o
comportamento de antes, e não no vazio.

**Duas proibições, do dono, com essas palavras: "nunca pessoa identificável nem
texto na imagem".** Elas moram em três lugares de propósito: na instrução, numa
lista que filtra a resposta do modelo, e na conferência visual que abre a
imagem. Pedido não é garantia, e a régua tem que estar dos dois lados.

Pessoa anônima ilustrando "compradores de imóveis" é escolher alguém para
representar um grupo, e em "brasileiros nos EUA" seria inferir nacionalidade
por aparência. Texto na foto compete com a manchete, que já é o texto da peça.
Gente pequena ao fundo compondo uma rua não é recusa; rosto reconhecível é.

## O banco de imagens próprio (29/09/2026)

A decisão do dono: o acervo passa a ser **nosso**, e é a primeira fonte que a IA
consulta. Banco de terceiro vira exceção, não padrão. O motivo é controle: com
acervo próprio, a IA não encontra imagem que a gente não queira.

**A ordem de busca, e ela tem uma inversão que importa:**

| situação | de onde vem a imagem |
|---|---|
| Entidade nomeada e o acervo tem | acervo |
| Entidade nomeada e o acervo **não** tem | fontes externas |
| Sem entidade nomeada | acervo, pela tag de cena |
| Sem entidade e a cena também vazia | fontes externas |
| Nada em lugar nenhum | capa tipográfica |

**A cena só é consultada depois de a entidade falhar nos dois lados.** Se
invertesse, uma pauta sobre um produto novo acharia uma foto genérica de
"tecnologia" no acervo, ganharia ali, e nunca sairia para buscar a foto do
produto. O genérico mascararia a falta do específico, e é justamente em
lançamento e novidade que o acervo não vai ter.

**A busca é por TAG, não por vetor.** A primeira proposta foi vetor sobre a
descrição da imagem; o dono apontou que tag é mais simples, e está certo: é
exata, é de graça e dá para depurar olhando a linha. O vetor fica para quando
o acervo for grande o bastante para precisar distinguir duas fotos dentro da
mesma tag.

O que torna a tag confiável aqui, e não tornava nos 16 temas conceituais, é
QUEM escolhe: `cena-da-pauta.ts` já chama um modelo que lê a matéria, e ele
passa a devolver também a tag, escolhida de uma lista fechada. Modelo
escolhendo de cardápio é confiável; lista de palavras adivinhando pelo título
não é, e foi assim que `ice` casou dentro de `justice` e `imovel` não casou com
`imoveis`.

**A conferência visual continua valendo só para o que vem de fora.** Imagem do
acervo foi conferida na entrada e não é reaberta a cada uso. É o que faz o dia
comum não gastar chamada de modelo nenhuma no ramo visual, e mantém a barreira
exatamente onde ela é necessária, que é quando entra imagem desconhecida.

**As travas de licença saem, o registro fica.** Decisão do dono: `rights_status`
deixa de barrar publicação. O campo continua sendo gravado, porque anotar de
onde a imagem veio custa zero e é o que permite responder se alguém perguntar.

**Onde o arquivo mora:** o derivado de 2160x2880 fica no Storage do Supabase,
em bucket próprio, separado do `public_assets` das artes publicadas, que são
descartáveis e o acervo não. O original em resolução cheia fica no Drive e o
sistema nunca o lê. A linha grava em qual repositório o arquivo está, para a
mudança de casa lá na frente ser uma cópia mais um update, e não uma reescrita
do resolvedor. O ponto de virada é por volta de 2.500 imagens, quando o
derivado passa de 3,5 GB.

**O nome do arquivo é o metadado.** `grupo-pais-assunto-detalhe-numero.jpg`. A
ingestão lê e grava a tag e o país sem ninguém preencher formulário. O que NÃO
entra no nome é tom (claro ou escuro) e orientação: os dois são medidos nos
pixels com precisão maior que a do olho, e escrever à mão cria contradição
entre o nome e o arquivo.

**A régua de país vale para cena e lugar, não para pessoa.** Retrato é da
pessoa, onde quer que tenha sido feito. Cena de terceiro país é recusada.

**O que falta no acervo vira lista de compras.** Toda tag pedida e não atendida
é gravada. Em uma semana isso é a lista de produção ordenada por frequência, e
não um chute sobre o que fotografar.

### O primeiro lote curado (14/10/2026)

O acervo ganhou o primeiro lote: cerca de 50 fotos de 36 entidades recorrentes
(Trump, Lula, Flávio, Fed, Tesouro, Casa Branca, Capitólio, STF, TSE, big
techs...), escolhidas olhando cada uma: o nome ou o logo dominando a foto da
organização, licença livre, retrato atual da pessoa. Três mudanças vieram junto.

- **O acervo casa pelo QID**, em `acervo/entidades.ts`. O resolvedor chega com o
  rótulo do Wikidata, que muda com o idioma ("Lula" vira "Luiz Inácio Lula da
  Silva"); o arquivo continua com o nome curto (`pessoas-br-lula-retrato-01`).
  Entidade nova no acervo entra nessa tabela junto com a foto.
- **Foto de terceiro no acervo leva o crédito dela.** A ingestão lê um
  `creditos.json` na pasta (autor, licença, página do original), e o asset sai
  com `attribution` e a página do original. Antes todo acervo era "acervo
  próprio", sem autor, e uma foto CC BY-SA sairia sem crédito.
- **"Federal Reserve" resolvia para o Federal Reserve Bank of Minneapolis**
  (Q2503528), um dos 12 bancos regionais, e já tinha ilustrado duas pautas.
  `ENTIDADES_FIXAS`, em `wikidata.ts`, aponta o nome direto para o Q53536.

Cada arquivo é um só derivado 3:4. A capa da matéria mostra a foto inteira sobre
ela mesma desfocada (14/10/2026), então o retrato não é cortado no portal; a
versão horizontal fica para quando o desfoque não bastar.

### Os números que dimensionam o acervo

Medidos em 29/09/2026, no banco de produção:

```
consumo          3,3 posts/dia no Instagram mais as pautas da newsletter,
                 algo em torno de 6 imagens distintas por dia
janela           30 dias (EDITORIAL_JANELA_IMAGEM_DIAS)
minimo           6 x 30 = 180 imagens para nunca repetir dentro do mes
```

Distribuição das 396 pautas aprovadas em 45 dias: tecnologia 31%, economia 16%,
política 16%, custo de vida 14%, Brasil 10%. Por isso a profundidade do acervo
é proporcional, e não uniforme: tecnologia precisa de duas a três fotos por
cena, e `religiao` ou `militar` precisam de uma.

A lista de produção tem 746 cenas em 40 grupos, e está no guia do designer.

### Como entrou no código (05/10/2026)

**Atrás da capacidade `acervo`**, em `settings.capacidades` do projeto: não
declarada é `off` e o resolvedor nem sabe que o acervo existe; `dry_run`
consulta, anota o que escolheria e grava a lista de compras sem decidir a foto;
`enforce` manda. O código mora em `src/lib/server/visual/acervo/`.

**O cardápio é provisório.** O guia do designer não está no repositório, então
`catalogo-de-cenas.ts` foi derivado das editorias e da distribuição das pautas:
42 grupos, cerca de 190 cenas. Quando o guia chegar, é esse arquivo que muda. A
tag é `grupo/assunto`, os dois primeiros campos de conteúdo do nome do arquivo.
Retrato (`pessoas`) fica fora do cardápio: pessoa só sai do acervo pela
entidade, com o nome no campo `assunto`.

**A última linha da tabela ainda é a bandeira**, não a capa tipográfica. O
resolvedor continua devolvendo a bandeira com `NO_VALID_IMAGE` (regra de
17/09/2026, "nenhuma peça sem imagem"), e trocar isso é decisão de arte e de
newsletter, que lê o mesmo campo. Fica em aberto para o dono.
FECHADO em 05/10/2026: pauta sem foto não vira conteúdo, e a bandeira deixa de
ser publicada. Ver "Pauta sem foto não vira conteúdo".

**Imagem resolvida uma vez por pauta**: `imagemDaPauta`, com memória no
processo e a tabela `imagem_da_pauta` para o worker reusar o que o web
resolveu. Só com `enforce`.

## Imigração sai da pauta (05/10/2026)

A decisão do dono: o eua.journal não fala de imigração. O leitor é o
brasileiro que SONHA com os EUA (pensa em morar, trabalhar ou investir lá), e
não quem já mora. A linha é notícia positiva dos EUA e notícia ruim do Brasil,
aproveitando o que está em alta.

**O eixo `imigracao` fica, e é ele que recusa.** O classificador continua
rotulando a pauta de visto como `imigracao`, e `decidirPauta` recusa com
`REJECT_IMMIGRATION_OFF_LINE` antes de olhar país ou nota. Tirar o eixo seria
pior: a notícia de visto cairia em `politica` e passaria. Vale o booleano OU o
eixo, porque o modelo às vezes marca um e esquece o outro.

**O que mudou junto:** o verificador do Instagram recusa pelo mesmo motivo; a
triagem de assuntos em alta deixou de aprovar imigração; o boletim de vistos e
o registro do H-1B saíram do calendário; o teto de imigração no feed caiu de 3
para 0; as editorias do portal viraram Economia, Trabalho, Tecnologia, Custo de
vida, Política e Brasil; e "morar nos EUA" deixou de marcar o post como
imigração nas hashtags.

**O que mora no banco**, e por isso está em `supabase/2026-10-05-sem-imigracao.sql`
para o dono rodar: o nicho e o briefing editorial do projeto, o evergreen
desligado (os 66 temas do catálogo são todos de imigração) e as quatro fontes
ativas dedicadas a imigração. Nada foi apagado.

## Três ramos, e nenhum herda o texto do outro (05/10/2026)

A decisão do dono: a newsletter deixa de ser a mãe dos outros canais. Até aqui
ela compunha primeiro, o portal publicava o HTML do e-mail como artigo, e o
agendador legado do Instagram fazia um post por pauta da edição.

**O que é comum aos três:** coleta, classificação, pacote factual e resolução
de imagem. **O que é de cada ramo:** seleção, redação, auditor, arte e fila. A
mesma pauta pode sair nos três canais; o que é proibido é repetir DENTRO do
canal. O código está em `src/lib/server/ramos/`.

- **Newsletter:** de 2 a 4 pautas com pacote factual, nenhum acontecimento
  repetido (cosseno abaixo de 0.70, conferido de novo na saída), voz de
  e-mail no formato "The News".
- **Portal:** até 3 matérias por dia, de qualquer pauta aprovada com pacote,
  inclusive as que a newsletter não levou. Uma matéria por pauta, escrita como
  matéria de busca, com auditor próprio. Nasce `scheduled` e `needs_review`
  com o horário em `published_at`, e só vira `published` quando alguém aprovou
  E o horário chegou (`/api/cron/portal`, nos horários 06:07, 12:00 e 18:00).
- **Instagram:** até 5 posts sobre o pool mais as candidatas extras (perfis de
  referência e fontes do feed), evergreen desligado, voz de Not Journal e
  Brazil Journal.

**O pacote factual é a única matéria-prima.** Pauta sem pacote não é escolhida
por ramo nenhum: o texto cru da fonte não chega a redator nenhum.

**Nota baixa de QA vira aviso; risco de alucinação continua bloqueando
sozinho.** Fecha a divergência registrada em 18/09: o piso de 85 sai do portão
e vai para a peça, onde quem aprova vê. As duas ancoragens e o risco de
alucinação não mudaram.

**Tudo atrás de `settings.capacidades.ramos`.** Não declarado é `off`, e `off`
é o fluxo de antes. Em `dry_run` os ramos rodam e gravam diagnóstico em
`platform_events` (`ramo_veredito`, `ramo_custos_do_dia`), e quem publica é o
fluxo de antes. Os ramos só mandam com a guarda também em `enforce`.

**As instruções passam por `instrucaoDaEtapa`**, em `src/lib/server/instrucoes.ts`,
que hoje devolve o texto do código e amanhã lê a versão editável do banco.
## Produção na véspera e cadência do projeto (05/10/2026)

O PRD do MVP, validado pelo dono, muda o relógio: produção de segunda a quinta
às 17:00, tudo do dia seguinte; aprovação à noite; publicação de terça a sexta
nos horários de cada canal (newsletter 06:07; portal 06:07, 12:00 e 18:00;
Instagram 08:00, 11:22, 14:45, 18:07 e 21:30).

**Dia, horário, volume e fonte são configuração do PROJETO**, em
`projects.settings.cadencia`, nunca código nem ambiente (RNF-08). Quem lê é
`cadencia.ts` (`cadenciaDoProjeto`, `horariosDoPortal`, `agendaDoPortal`...), e
projeto que não declara nada recebe exatamente a tabela do PRD. Campo declarado
e inválido cai no padrão DAQUELE campo, com aviso no painel: lista vazia de
horários faria o dia sumir em silêncio.

**A troca é por capacidade, `producao_vespera`, e só `enforce` muda o dia.** Em
`enforce` a rota das 17:00 produz e a das 06:03 cede; em `dry_run` a das 17:00
ensaia e a das 06:03 continua publicando; ausente ou `off`, nada muda. O social
ainda lê ambiente, então a cadência chega a ele como ambiente montado na hora
(`ambientePelaCadencia`), e só na produção da véspera.

**Todo dia de produção deixa linha em `newsroom_runs`**, inclusive "capacidade
desligada" e "não é dia de produção". A produção confere se a linha existe no
fim e grava uma de garantia se não existir, em vez de confiar que cada caminho
da redação grava a sua.

**O que vai ao ar na hora certa é de três mecanismos, e só um é novo:** o
Listmonk dispara a campanha agendada (`send_at`), o worker publica o post pelo
`scheduled_at`, e `publicacao-agendada.ts` vira a edição `approved` e o artigo
`scheduled` em `published` quando a hora chega.

**A instrução editorial é editável, o contrato não (RF-26).** Os prompts foram
cortados em julgamento editorial (editável no painel, versionado, com volta) e
contrato de saída (campos do JSON, tetos da guarda, assinatura), que fica no
código. Com a capacidade `instrucoes` fora de `enforce`, os prompts saem byte a
byte como antes; isso foi conferido por snapshot dos seis prompts antes e
depois do corte.
## A fila de aprovação e o portão de publicação (05/10/2026)

O MVP põe uma pessoa entre a pauta e o ar (RF-20 a RF-29). O código está em
`src/lib/server/aprovacao/`, as tabelas na migration
`20261005120000_fila_de_aprovacao.sql`, e a tela em `/admin/<projeto>/aprovacao`.

**Uma função decide se uma peça sai: `decidirPublicacao`, em `portao.ts`.** O
worker do Instagram, o disparo da newsletter e a publicação do artigo
perguntam a ela, e quem grava `scheduled` também (`statusDeEntradaDoPost`,
`tentarLiberar`, em `fila.ts`). É a lição da "mesma regra em
três cópias": antes, três escritores de `social_posts` eram três decisões de
publicar.

**A aprovação é da VERSÃO, não da peça.** Cada linha de `aprovacoes` guarda o
SHA-256 do que vai ao ar (legenda mais o hash de cada arquivo congelado; assunto
mais HTML; título mais HTML). O worker pergunta duas vezes: antes de reivindicar
a vaga, com o manifesto, e depois de baixar os arquivos, com os bytes. Mudou
depois de aprovado, não sai.

**Peça segurada não é falha.** O worker devolve o post para `draft` com o motivo
do portão em `error_message`, e não marca `failed`. Ficar em `scheduled` faria
cinco posts esperando aprovação bloquearem os aprovados, porque `findDuePosts`
pega os cinco mais antigos.

**O interruptor é `settings.capacidades.aprovacao`, sem fallback de ambiente.**
Ausente vale `off`, que é publicar como antes. `dry_run` registra a fila e só
escreve no log o que seria segurado. `enforce` segura. Manual ou automático é
por ramo, em `settings.aprovacao.<ramo>`, e só a sessão do painel troca. Nem o
automático aprova peça com aviso de QA.

**O carrossel de campanha do Sistema PROMPT continua gravando `scheduled`
sozinho**, porque está congelado. Ele é barrado no worker, e há teste das três
origens. O caminho legado e a campanha geram a peça na hora de publicar, então
não têm versão para aprovar: com a fila em `enforce`, quem publica é o Social V2.

**A refação é por etapa, e os ganchos começam vazios.** Reprovar a imagem chama
imagem e arte, nunca o texto; a terceira reprovação descarta. As funções de
cada etapa existem, mas pedem a pauta avaliada inteira, que não está gravada na
linha do post. Até alguém registrar o gancho em `GANCHOS_DE_PRODUCAO`, a peça
reprovada fica em `refazendo` com o motivo no painel.
ATUALIZADO em 06/10/2026: toda etapa de todo ramo tem gancho, e a refação
roda fora do clique. Ver "A refação completa, por peça e por canal".

**Regra fixa só com o dono.** O mesmo erro três vezes, na mesma etapa, vira
PROPOSTA em `regras_propostas`. Só a aprovada entra no bloco "não repetir"
de `errosRecentesDaEtapa`, que é a função que os redatores chamam.

## As ligações entre as frentes (05/10/2026)

As cinco frentes do MVP deixaram pontos de encaixe vazios de propósito, para
não brigarem pelos mesmos arquivos. A integração os preencheu, e cada ligação
continua atrás da capacidade da frente dona: com todas desligadas, o dia é o
de antes.

**Uma foto por pauta, em todos os canais.** A newsletter, o post e a capa da
matéria do portal resolvem a imagem por `imagemDaPauta`. Com o acervo fora de
`enforce` ela é repasse direto ao resolvedor; em `enforce`, a mesma pauta ganha
a mesma foto nos três canais e o acervo não queima duas fotos para um fato.
`capacidadeDoAcervo` virou `resolverCapacidade("acervo", () => "off", ...)`.

**Os perfis de referência entram pelo ciclo de verdade, e só por ele.** O cron
das 06:03 e a produção da véspera passam `candidatosDosPerfisDeReferencia` ao
pool do Instagram (`ligacoes-do-ciclo.ts`). O ensaio da véspera não passa:
seria uma segunda rodada de leitura no mesmo dia.

**Peça do ramo entra na fila pela linha da tabela, uma vez.** `aoProduzirPeca`
leva a matéria do portal e o post à fila pelo id da linha, com o hash lido da
linha pelo mesmo adaptador do portão. Peça que já está na fila não é tocada:
um hash diferente a devolveria a `aguardando` e apagaria uma aprovação. A
newsletter fica de fora desse caminho porque a redação já a enfileira com o
resumo completo. A entrega das matérias passou para DEPOIS do upsert em
`articles`, senão a linha ainda não existe.

**Um portão para o portal.** Os três caminhos que põem matéria no ar
(`/api/cron/portal`, `/api/cron/publicacao` e a liberação da fila) perguntam a
`decidirPublicacao` quando a fila não está em `off`, com o mesmo hash. A edição
só aparece no portal com a newsletter dela aprovada, porque é o mesmo assunto e
o mesmo HTML. O hash do artigo passou a incluir a capa (só quando há capa, para
o hash antigo não mudar), porque a refação de imagem troca só ela.

**Matéria aprovada antes da hora espera a hora.** A liberação da fila já
respeitava `publicar_em`; o despacho do artigo agora também respeita o
`published_at` da linha, e matéria com horário futuro fica `scheduled` com a
revisão aprovada, para o relógio do portal publicar na hora. Despachar o que o
relógio já publicou é sucesso, e não alerta a cada minuto.

**A hora da newsletter na fila é a da cadência.** Com a produção na véspera, a
fila recebe a data da EDIÇÃO e os horários de `agendamento`, os mesmos que o
Listmonk e o artigo recebem. Sem véspera, vale `settings.aprovacao`, como era.

**A memória de reprovação entra nos três redatores.** O bloco de
`errosRecentesDaEtapa(projeto, "texto")`, que já inclui as regras fixas
aprovadas pelo dono, vai no fim da voz da newsletter, do artigo e do post, só
com a fila fora de `off`.
ATUALIZADO em 06/10/2026: o bloco é do CANAL, e não mais um só para os três.
Ver "O aprendizado da fila, por etapa e por canal".

**Refação ligada onde há o que refazer.** Texto e imagem do artigo (a pauta e
o pacote factual passaram a ser gravados no `resumo` da fila, em
`origemDoArtigo`), imagem e arte do post de peça única (lidas da própria linha).
Seleção, texto do post, newsletter e carrossel continuam sem gancho, com o
motivo em `ganchos-de-producao.ts`: cada um pediria um segundo gerador fora do
gerador.
ATUALIZADO em 06/10/2026: ligados todos, ver "A refação completa, por peça e
por canal".

**A home mostra a matéria do portal.** Com os ramos em `enforce`, a home junta
as matérias publicadas às pautas das edições, mais recente primeiro, sem o
artigo que é a própria edição e sem a pauta da edição cuja fonte já tem matéria
própria.

## Sem a fila em enforce, a matéria do portal sai no horário (05/10/2026)

Achado depois da integração. A matéria do ramo nasce `scheduled` e
`needs_review`, e os dois relógios (`/api/cron/portal` e
`/api/cron/publicacao`) exigiam `approved`. Quem grava `approved` é a liberação
da fila (`despacharArtigo`), e ela só despacha com `aprovacao` em `enforce`.
Com os ramos em `enforce` e a fila em `off` ou `dry_run`, nenhuma matéria
seria publicada nunca, sem erro e sem alerta.

**A regra agora:** a revisão humana só é exigida com a fila em `enforce`
(`revisaoExigidaPeloProjeto`, em `ramos/portal.ts`). Fora disso a matéria sai
no `published_at` dela, como antes de a fila existir, e só `blocked` segura.
Há teste dos dois lados contra uma tabela em memória que aplica os filtros.

## As edições viram matéria por pauta, e as editorias viram página (05/10/2026)

**As 23 edições publicadas como artigo (`edicao-AAAA-MM-DD`) viram uma matéria
por pauta**, pelo script `src/scripts/artigos-por-pauta.ts`, que o dono roda
(ensaio por padrão, `--aplicar` grava). Sem chamada de modelo: o texto é o que
a edição publicou, no molde da matéria do ramo (abertura, "Contexto", "Por que
importa", "Na prática", fonte). A pauta de imigração não vira matéria. A
edição não é apagada: sai da lista com `status = archived` (ou `draft`, se o
CHECK do banco recusar), e o link antigo redireciona com 308 para a primeira
matéria da edição. A foto da pauta é pareada pela POSIÇÃO no HTML do e-mail,
não pela ordem, porque pauta sem foto deslocava as seguintes.

**"Seções em foco" é uma fileira de cards de tema**, como na referência: um
card por editoria, com foto, nome e descrição fixa, rolando para o lado com
`scroll-snap` e sem biblioteca de carrossel. Cada card leva a `/editoria/<id>`,
página por requisição com as pautas da editoria no card do feed. Menu, rodapé
e barra lateral apontam para essas páginas; o `id` `editoria-<id>` ficou nos
cards para link antigo não cair no topo. A foto do card é a mais recente da
editoria que ainda não está num card à esquerda, porque as edições de
setembro usaram a mesma foto de Wall Street como reserva em dezenas de pautas.

## O portal veste Sora (05/10/2026)

O dono desenhou a referência no Superdesign, e ela está guardada em
`docs/design/portal-sora-2026-10-05/`, com as capturas do resultado. Letra
Sora em tudo, página branca, barra preta com a data, cabeçalho branco fixo no
computador e preto no celular, rodapé preto. A letra vem do `next/font`, que
serve o arquivo da nossa origem.

**O desenho foi adaptado, não copiado, e cada adaptação é deliberada:**

- A referência punha o logotipo de fundo escuro no cabeçalho branco, onde o
  "eua" branco some. Vale a regra da marca: a versão sai da cor do fundo.
- O vermelho é o do ".journal" do logotipo (#E91C32), e não o rose-600 do
  Tailwind. Texto vermelho pequeno usa #C8102E, porque o tom do logotipo dá
  4,49 de contraste sobre branco, abaixo do mínimo para letra miúda.
- "Mais lidas" virou "O mais novo de cada editoria": não existe contagem de
  leitura por pauta, e lista ordenada por um número que não existe é mentira
  com cara de dado.
- Saíram "Entrar", assinatura paga, busca, "Carregar mais", Facebook, Twitter
  e as páginas institucionais. Nada disso existe no produto, e link para o
  que não existe é pior que link nenhum.
- Tempo de leitura só aparece no artigo, medido nas palavras do corpo. O
  campo `reading_minutes` nasce com 5 e não é medida.
- A pauta sem foto é peça tipográfica com a faixa de cor da editoria, nunca
  caixa vazia. A peça fica por baixo de toda foto, então arquivo lento ou
  quebrado também cai nela.
- Cada página do portal tem UMA caixa de assinatura (`id="newsletter"`), que
  é o fluxo real da newsletter. Barra de topo e rodapé apontam para ela.

## Robôs de IA liberados, os dois tipos (05/10/2026)

Decisão do dono. Os robôs de **busca e citação** (OAI-SearchBot, PerplexityBot,
Claude-SearchBot e os de leitura sob demanda) leem a página quando alguém
pergunta e citam o site com link, e é deles que vem o GEO. Os de **treino**
(GPTBot, ClaudeBot, Google-Extended, CCBot) também ficam liberados: bloquear só
valeria daqui para frente, depende de o robô obedecer e não muda nada na busca
do Google, e um portal construindo audiência ganha mais sendo conhecido pelo
modelo do que protegendo notícia, que perde valor em dias. Rever se surgir
licenciamento ou conteúdo exclusivo. A lista está em `src/app/robots.ts`.

## A matéria na busca: auditoria, molde e correção (05/10/2026)

**A auditoria é determinística e mede a página servida.** `auditar-artigos.ts`
só lê: confere título de busca, descrição, lide, intertítulos, parágrafos,
fonte, perguntas, JSON-LD, canônico e capa, com peso por conferência
(`auditoria-de-artigo.ts`). O JSON-LD de quem está no ar vem do HTML que a
produção serviu, não do código; a página e a auditoria usam a MESMA função
(`dados-estruturados-do-artigo.ts`) para não haver duas cópias da regra.

**Onde as skills de SEO divergem, vale o projeto.** Não se exige
palavra-chave no começo do título (`modelo-de-titulo.md`); a moeda conta
como marca de país (regra 8), e por isso "US$" e "R$" situam o título.

**O molde:** JSON-LD num `@graph` (NewsArticle, Organization, BreadcrumbList
pela página da editoria e, só com pergunta VISÍVEL, FAQPage), `<` escapado,
autor "Redação eua.journal" como Organization, `dateModified` vindo de
`updated_at` só quando ele passa da publicação por mais de dez minutos. As
perguntas gravadas em `aeo_questions` aparecem como "Perguntas e respostas"
antes do crédito da fonte. A capa nunca se repete no corpo, comparada por
identidade da foto (sem tamanho, sem `&amp;`), e o crédito colado nela passa
para baixo da capa, porque a licença CC BY pede crédito junto da obra. A linha
fina some quando repete o começo do lide.

**A correção é piloto primeiro.** `corrigir-artigos.ts` corrige título,
descrição e editoria por regra, sem inventar palavra (o que não cabe vai para
a mão, nunca com reticências), e faz UMA chamada barata por matéria que lê só
o corpo e propõe perguntas e intertítulos; cada uma passa pela ancoragem de
`pacote-factual.ts` contra o corpo, e o que não se sustenta cai. O texto dos
parágrafos nunca é reescrito e a capa não é trocada (o dono decidiu manter as
fotos por ora). O lote só roda depois de o dono aprovar a matéria-modelo em
`docs/design/artigo-modelo-2026-10-05/`.

**Sitemap de notícias e `/llms.txt`** são rotas por requisição que leem o
banco direto, e não `getAllArticlesForAdmin`: aquela cai nos artigos estáticos
com `published_at` de agora quando o banco falha, e o sitemap de notícias
anunciaria matéria velha como de um minuto atrás.

## A matéria completa: molde, poda e indexação (06/10/2026)

O dono achou a matéria-piloto de Chicago rala (238 palavras, dois links): ela
tinha sido refeita só a partir do resumo da newsletter. O molde acertado, que
o redator do ramo do portal passou a seguir e que `reescrever-artigo.ts`
aplica a uma matéria publicada:

título e linha fina; "O que você precisa saber" (3 a 4 tópicos); abertura de
dois parágrafos com o link da fonte DENTRO do texto; intertítulos em forma de
pergunta do leitor, só as que o pacote responde; tabela só com comparação de
verdade; "O que isso significa para quem olha para os EUA" só quando o pacote
diz o efeito; "Leia também" com 2 a 3 matérias publicadas da mesma editoria e
a página da editoria; perguntas e respostas; "Fontes". De 500 a 900 palavras,
sem encher.

**A parte editorial do molde mora na voz (`VOZ_PADRAO_DO_ARTIGO`), que passa
por `instrucaoDaEtapa`; o contrato do JSON fica no código.** É a regra RF-26.

**O que não se sustenta é APAGADO, não amaciado.** `podarArtigo` corta por
unidade (tópico, parágrafo, linha de tabela, par de pergunta e resposta). A
ancoragem dura roda unidade por unidade; a conclusão do auditor semântico cai
na unidade que contém o trecho. Quando o primeiro parágrafo de uma seção sai,
a seção inteira sai, porque é ele que responde a pergunta do intertítulo. O
que não se poda bloqueia: título sem lastro, conclusão sem lugar na matéria,
matéria sem parágrafo. A poda roda SEMPRE, não só na reprovação: cada resposta
tem que estar no corpo que sobrou (`motivoDeRespostaSemLastro`), e o bloco de
significado que só repete o corpo (contenção de 60% ou mais) sai.

**Assuntos e entidades moram em `articles.tags`, com prefixo**, porque a
tabela não tem coluna de metadado em JSON e o dono não quer DDL agora:
`assunto:<texto>`, `sobre:<Tipo>:<nome>[|sameAs]`, `menciona:<Tipo>:<nome>[|sameAs]`
(`src/lib/indexacao-do-artigo.ts`). Viram `keywords`, `about` e `mentions` no
NewsArticle e a fileira "Assuntos" no fim da matéria, em texto puro: não existe
página de assunto nem busca, e link para o que não existe é pior que nenhum.
`sameAs` só com QID que o resolvedor do Wikidata do projeto devolveu com
confiança 70 ou mais. Nada de meta keywords.

**A descrição da foto da capa mora no corpo**, num `<p class="legenda-da-capa">`
que a página tira de lá e desenha embaixo da capa, como o crédito já fazia. Ela
vem da conferência visual chamada SEM a manchete (com a manchete, o modelo
"via" Chicago numa foto qualquer de prédios) e passa pela ancoragem contra o
pacote: nome ou número que o pacote não tem derruba a descrição, e a legenda
vira neutra ("Imagem ilustrativa: <assunto>.").

**O link de compartilhar no WhatsApp leva o endereço**, montado no clique a
partir do que o navegador mostra (origem e caminho, sem consulta nem âncora),
para sobreviver a troca de domínio. O `href` do servidor usa o canônico, só
para quem está sem JavaScript.

**Fonte que recusa o robô é lida pela cópia do Internet Archive da mesma
página** (`buscarTextoDaFonte`), com o mesmo agente honesto. Não se disfarça de
navegador.

## Assuntos com lista fechada, e o resumo com regra (06/10/2026)

A matéria-piloto de Chicago saiu com "energia" e "água" na fileira
"Assuntos", Trump em `mentions` sem uma linha sobre ele no texto, e quatro
tópicos de "O que você precisa saber" que repetiam a abertura logo abaixo. O
dono: "isso não pode acontecer novamente". As duas regras moram no CÓDIGO, e o
prompt só avisa o redator do que vai ser cortado.

**Assunto é entidade nomeada ou tema da lista fechada, e nada mais.** O
vocabulário está em `src/lib/temas.ts`: de 15 a 30 temas por editoria, em
português, específicos e buscáveis ("juros do Fed", "data centers", "conta de
luz"), cada um com `slug` estável para as futuras páginas `/tema` e com
sinônimos para casar a proposta do redator e o texto. A validação aceita tema
de QUALQUER editoria (Chicago é de Política e trata de data centers); a
organização por editoria serve ao prompt e às páginas futuras. Tema novo
entra por decisão editorial, editando o arquivo, nunca pelo que o modelo
devolveu num dia.

**Quem decide é `validarAssuntos`** (`indexacao-do-artigo.ts`): o modelo
propõe, o validador grava a forma canônica da entidade ou do tema, joga fora
palavra genérica (há uma lista só para o motivo do log; a regra é "fora da
lista sai"), repetição e o que passa de cinco, com entidades primeiro (no
máximo três, a central antes) e os temas da lista que o texto trata (duas
menções ou mais) completando. O descarte é silencioso para o leitor e vai
para o aviso do ramo ou para o terminal do script. `tagsDeIndexacao` valida
de novo, para quem grava não conseguir gravar "água" nem esquecendo.

**`about` e `mentions` só com quem o texto final nomeia**, sem acento nem
caixa. Na geração, o filtro vem antes do teto de dez menções; na página,
`indexacaoValidadaDoArtigo` lê as tags, tira entidade ausente do corpo (sem
contar "Leia também" e "Fontes") e passa os assuntos pelo validador. É a
ÚNICA porta de leitura da fileira e do JSON-LD: linha antiga com tag ruim não
mostra tag ruim, mesmo antes de ser reescrita. Há teste que quebra se a
página voltar a ler `indexacaoDasTags` direto.

**"O que você precisa saber" fica, com quatro regras no pós-processamento**
(`ramos/essencial.ts`, chamado por `podarArtigo`): até três tópicos; nenhum
repete uma frase da abertura (contenção de 60%, a medida do leitor); cada um
traz fato próprio que a abertura não disse (número, data, prazo, próximo
passo ou ator nomeado); e o bloco só existe com mais de 400 palavras de corpo.
Tópico que falha sai inteiro; com menos de dois, o bloco sai.

**Reaplicar sem reescrever.** `reescrever-artigo.ts --so <slug> --so-ajustes`
aplica as regras à matéria GRAVADA, sem modelo, e grava só `content_html`,
`tags` e `updated_at` (`ajuste-de-materia.ts`). Existe porque a reescrita dá
outro texto a cada rodada, e o dono já tinha lido a versão de Chicago. Em
Chicago (06/10/2026) os quatro tópicos caíram e o bloco saiu; os assuntos
viraram Chicago, City Council, data centers, política municipal e conta de
luz; e saíram de `mentions` Trump, Seattle, City of Chicago, a força-tarefa e
a Data Center Coalition, que o texto não nomeia. Illinois caiu também: está no
texto, mas não estava entre as entidades gravadas.

## Pauta sem foto não vira conteúdo (05/10/2026)

A decisão do dono, com estas palavras: "pauta sem foto não vira conteúdo". Uma
pauta cuja resolução de imagem termina SEM foto real da pauta (resolvedor com
`NO_VALID_IMAGE`, inclusive quando ele devolveu a bandeira de último recurso,
ou imagem nula) não vira peça em canal nenhum: história da newsletter, matéria
do portal (ramo e desmonte de edição) e post do Instagram.

**Isto SUPERA, para publicação, a regra de 17/09/2026** ("nenhuma peça sem
imagem", a bandeira como último recurso). A bandeira continua existindo no
resolvedor, como marcador interno e para o contador `ultimoRecurso` do
relatório, e nunca é publicada. Os textos datados de 17/09 e 18/09 neste
arquivo e no `aprendizados-e-incidentes.md` ficam como registro.

**A régua é uma só**, `temFotoDaPauta` em `src/lib/server/ramos/sem-foto.ts`:
`status === "SELECTED"`, com URL, e o asset não é a bandeira (pelo campo
declarado e pela URL, `ehImagemDaBandeira`, que reconhece também a miniatura
do Commons). Conferir as duas coisas é a lição de 18/09: a newsletter lia
`status` e o campo tinha mudado de sentido.

**A pauta cai ANTES da redação, e a vaga vai para a próxima.** A imagem sai
do título da fonte e da classificação, que existem antes do texto. Então cada
canal pergunta a foto ao selecionar (`selecionarComFoto`), e a seleção é
refeita sem a pauta sem foto até parar de mudar. O volume se mantém
(newsletter de 2 a 4, portal até 3, Instagram até 5) em vez de encolher, e
ninguém paga pacote factual nem redação de pauta que não vai sair. Onde a foto
da edição vem de outro caminho (resolvedor da fase 1, ranker antigo), vale a
rede de depois da resolução (`separarPautasSemFoto`): a pauta sai da edição já
escrita, como a pauta sem lastro sai em `runNewsroomPipeline`.

**Abaixo do mínimo, é dia sem edição.** Se a newsletter não chega ao mínimo com
pautas que têm foto, vale o caminho de 08/09: `registrarDiaSemEdicao` com o
motivo `EDITORIAL_MINIMUM_NOT_MET` e o detalhe `REJECT_NO_PHOTO`. Não se
completa com pauta sem foto.

**Resolver antes, gravar depois.** A foto antecipada é resolvida em LEITURA
(`somenteLeitura`), porque nessa hora ninguém sabe qual pauta vai sair, e
marcar uso da foto de uma pauta que não saiu a tiraria da próxima por trinta
dias. A newsletter confirma o uso só do que foi ao ar
(`confirmarImagemPublicada`). Uma memória do dia (`criarFotosDoDia`) garante
que a seleção, a capa do portal e a foto da edição leiam a MESMA resposta, e
em sequência, para o "já usada nesta edição" continuar valendo.

**O motivo fica visível.** Código `REJECT_NO_PHOTO`. Newsletter e portal
gravam `platform_events` do tipo `pauta_sem_foto`, no mesmo formato de
`descartados` do social, e o painel de logs junta as duas listas. No
Instagram a queda vai para `descartados` do ciclo, com etapa `visual`.

**O que já estava no ar sem foto é decisão do dono.** O script
`src/scripts/arquivar-sem-foto.ts` lista as matérias publicadas com capa vazia
ou com a bandeira (ensaio por padrão) e só arquiva com `--aplicar`
(`status = archived`, ou `draft` se o CHECK recusar, como em
`artigos-por-pauta.ts`). Medido no ensaio de 05/10/2026: 36 das 62 matérias
publicadas, 32 com a bandeira e 4 com capa vazia.

## O bloco do VisaMatch alterna de formato a cada edição (05/10/2026)

A decisão do dono: o bloco do VisaMatch fica, mas "diluído de forma criativa,
alternando a cada edição, igual o The News". O mesmo cartão escuro todo dia
virava paisagem.

**Oito variantes, de FORMATOS diferentes**, em
`src/lib/server/newsroom/visamatch-na-edicao.ts`: o cartão escuro de antes,
menção de uma linha antes da despedida, pergunta rápida com respostas
clicáveis, P.S. depois da despedida, checklist, caixa de "Você sabia?", cartão
discreto de conteúdo de parceiro e "Dúvida comum". Esta última é a coluna do
leitor sem o leitor: não há carta de leitor por trás, e chamá-la de "Pergunta
do leitor" seria inventar um registro.

**Ferramenta de parceiro, rotulada, curta, nunca o assunto.** Toda variante
diz que é de parceiro. A newsletter não é sobre imigração (decisão do mesmo
dia), e o bloco é um aviso no fim, não pauta. Sem "garantido", "aprovado",
"100%" nem travessão, e há teste disso.

**O mesmo link, com a variante no `utm_content`** e a edição no `utm_term`
(`linkDaVarianteNaNewsletter`). A pergunta que o número responde passou a ser
qual formato converte.

**A rotação é determinística pela data e pela cadência da newsletter.** Cada
dia de publicação do projeto é uma vaga (`vagaDaEdicao`), e a vaga N leva a
variante N módulo oito. Duas edições seguidas nunca repetem, inclusive de
sexta para terça, e as oito passam antes de alguma voltar. Sorteio foi
recusado pelo motivo de sempre. O projeto pode fixar uma variante ou trocar a
ordem em `settings.visamatch` (`{"variante": "quiz"}` ou `{"ordem": [...]}`).

Continua valendo "o fim do e-mail tem UM convite": é um bloco por edição, só
que não o mesmo.

**O VisaMatch é uma conversa, e o bloco diz isso (06/10/2026).** O dono leu a
variante "tenha isto em mãos" (diploma, anos de experiência) e apontou que ela
dava a impressão de que a pessoa precisa juntar papel e mandar currículo. Não
precisa: ela conversa com a ferramenta e recebe no fim um diagnóstico dos
vistos que combinam com o perfil. A variante virou um passo a passo da
conversa, os textos dos cartões falam em conversar e receber o diagnóstico, e
o teste recusa currículo, documento, diploma e "em mãos". **O botão nunca
quebra linha:** rótulo único e curto ("Fazer meu diagnóstico", teto de 22
caracteres) e `white-space:nowrap`, porque a pílula vermelha em duas linhas no
celular fica feia.

## Os exemplos dos prompts saíram da imigração (05/10/2026)

A decisão do dono: "pode trocar agora os exemplos". A publicação deixou de
falar de imigração, e os exemplos que ensinavam a forma do título ainda eram de
visto (I-864, EB-2 NIW, O-1B, F-1, DS-160, RFE, cidadania por nascimento). O
modelo imita exemplo mais do que obedece regra.

**Cada exemplo manteve o que ensinava**: jurisdição no fim, sigla nunca
sozinha, quem é afetado aparece, o fato antes da ressalva, nacionalidade de
terceiro país fora, a linha de baixo acrescenta. Trocados na redação da
newsletter e no prompt de reparo (`pipeline.ts`), na regra da manchete
(`manchete.ts`), no carrossel (`carrossel/copy.ts`) e na voz social
(`voz.ts`). Onde o exemplo era manchete REAL medida, entrou manchete real atual
do banco, com a data (por exemplo "Agentes sem acordo de 2026 não concluem
registro nos exchanges de 2027 nos EUA", de 23/09/2026, e o par headline e
preheader repetido de 30/09/2026); onde não havia uma que servisse, o exemplo
está marcado como "construção ilustrativa".

**Os padrões editáveis do painel mudaram junto**, porque o padrão é o texto do
código (RF-26): quem não tem versão ativa passa a ver e usar os exemplos novos.
`prompts-sem-imigracao.test.ts` falha se um prompt de redação voltar a trazer
I-864, NIW, EB-2, O-1, USCIS, DS-160, green card ou F-1. Ficam de fora o
classificador e o verificador, que precisam reconhecer visto para recusar, a
frase da linha editorial que diz o que está fora, e as listas de detecção do
`leitor.ts`. O `modelo-de-titulo.md` continua com o texto de 16/09, que é
registro histórico.

## Piso de dois assuntos, que não inventa (05/10/2026)

Da auditoria de SEO, AEO e GEO (`docs/auditorias/seo-aeo-geo-2026-10-05.md`):
61 das 62 matérias publicadas tinham zero assunto, e não havia piso, só o
teto de cinco. **O piso é dois** (`MINIMO_DE_ASSUNTOS`). Quem escreve completa
com as entidades CITADAS que o texto final nomeia, nunca com tema que o texto
não trata nem com palavra genérica; abaixo de dois mesmo assim, a matéria sai
com o que tem e o ramo registra `ASSUNTOS ABAIXO DO MÍNIMO`. Não bloqueia,
porque bloquear empurraria o redator a inventar. A página não completa nada
na leitura.

## A bolha não cobre rosto, e a vez dela passa adiante (06/10/2026)

Dois pedidos do dono, sobre o mesmo círculo. O caso que motivou o primeiro: o
retrato oficial de Biden de fundo (29/09/2026), com a bolha desenhada em cima
da metade do rosto. A posição era fixa no CSS, e nada na esteira sabia onde
ficava o rosto. Exemplos renderizados com fotos de produção em
`docs/design/bolha-sem-rosto-2026-10-06/`, com a conferência desenhada por cima.

**A bolha nunca cobre um rosto.** Na vez da bolha, uma chamada de visão recebe
a foto de fundo JÁ RECORTADA como a peça a mostra (`object-fit: cover`, a
mesma conta do script da marca, em `recorteDoCover`) e devolve as caixas das
cabeças em fração do canvas, com esquema JSON estrito. São 12 posições em
`carousel-templates/bolha.ts`, na ordem de preferência: a de sempre primeiro,
depois o espelho e as variações no mesmo tamanho, depois 36% e 30% da largura.
Todas ficam fora da marca do topo e acima da faixa do texto, e há teste disso
para cada uma. Vale a primeira que não encosta em rosto nenhum, com folga de
3% da largura mais o anel branco. Nenhuma serve: capa sem bolha.

**Falha de detecção é recusa.** Sem chave, com a rede fora, com resposta fora
do esquema ou com coordenada fora da escala de 0 a 1, não há bolha. É a regra
de 17/09/2026 aplicada ao círculo: capa sem bolha é peça publicável, bolha em
cima de rosto não é. A memória é por URL da foto, e a falha não fica guardada.

**O render confere de novo.** Depois de montar a peça, `renderizarCapas` mede o
círculo na página e o compara com as caixas; se encostar, a bolha sai antes do
screenshot. A posição é decidida contra uma tabela, e o arquivo é o que o CSS
desenhou: as duas coisas só coincidem enquanto ninguém mexer numa delas.

**Custo:** uma chamada por post na vez da bolha. Medida em 06/10/2026 com o
modelo de produção: cerca de 1.400 tokens e 0,0045 USD na foto comum, até
0,012 USD numa foto com muitos rostos pequenos (estimativa da tabela de
`calculateCost`, que cobra preço de gpt-4o para modelo desconhecido). Vai para
o livro do dia como etapa `bolha` do ramo do post. Fora da vez não se pergunta
nada. Multidão é cara para o modelo e quase nunca tem lugar livre: acima de
40 rostos é recusa direta.

**Estátua conta como rosto**, e a instrução diz isso. A fachada da NYSE com o
frontão esculpido devolve uma dúzia de rostos pequenos. É conservador de
propósito: o pedido é "nunca", e o preço do falso positivo é uma capa sem
bolha.

**A alternância virou alvo.** O ritmo de 16/09 continua: depois de uma capa com
bolha vem uma sem, com o estado lido do feed. O que muda é o lado da vez:
quando é a vez e ela não se cumpre (sem segunda foto, sem posição livre, render
que tirou a bolha), ela PASSA para o post seguinte, e não se perde. A decisão
virou `decidirBolha`, peça a peça dentro do laço do ciclo, porque a vez de
uma depende de a anterior ter saído com bolha de verdade, e isso só se sabe
depois do render. `alternarBolha`, a passada pura sobre a leva, saiu.

**Na vez, a segunda foto é procurada com mais força, com a mesma régua.** Em
06/10/2026 só 1 das 12 últimas capas tinha bolha, e parte da causa estava no
resolvedor: a vice só existia no caminho das fontes externas, e a foto que
vinha do acervo ou da biblioteca terminava sem vice nenhuma.
`buscarSegundaFoto` entra só na vez e só quando a vice não veio: acervo pelo
assunto da entidade primeiro, depois biblioteca, Commons (30 arquivos em vez de
12) e Openverse, pelas MESMAS barreiras da vice e com o piso de identidade, e
a conferência visual abrindo até quatro. Pauta sem entidade nomeada não tem
bolha: o círculo mostra quem a pauta cita. A ordem é a do custo: os rostos são
perguntados antes, porque procurar segunda foto para uma peça sem lugar livre
seria dinheiro jogado.

**Tudo fica gravado** em `content_json.arte.bolha_decisao`: se era a vez, o
resultado (`com_bolha`, `nao_era_a_vez`, `sem_posicao_livre`,
`sem_segunda_foto`, `deteccao_falhou`, `tirada_no_render`...), os rostos, a
posição escolhida e as recusadas, a origem da segunda foto e o custo.
`arte.bolha` passou a dizer o que foi ao ARQUIVO, e não o que foi pedido.

**Os moldes do painel já alcançam a esteira.** Com `{"recorte": false,
"sem_foto": false}` em `settings.moldes` (gravado em 05/10/2026 às 17:57),
`alternarGramatica` não devolve recorte, e a pauta sem foto já não chegava ao
render (regra de 05/10). Os três recortes de 05/10 nasceram às 09:21, antes do
interruptor. O recorte também deixou de carregar a segunda foto: ele não
desenha bolha, e o campo ia preenchido assim mesmo.

## A refação completa, por peça e por canal (06/10/2026)

Véspera de a fila valer com aprovação manual nos três ramos. Até aqui a
seleção (todos os ramos), o texto do post, a newsletter inteira e o carrossel
deixavam a peça reprovada em `refazendo` para sempre.

**A aprovação e a refação são por PEÇA e por CANAL** (decisão do dono, com
estas palavras: os três canais comunicam de jeitos diferentes). Reprovar a
newsletter nunca toca a matéria nem o post da mesma pauta, e vice-versa; cada
um é aprovado e reprovado sozinho. Os ganchos só escrevem na linha da peça
reprovada (ou criam a substituta), e há teste que reprova o texto do post e
confere que a matéria e a newsletter ficaram iguais, linha e conteúdo.

**A foto refeita é da peça, não da pauta.** A foto de uma pauta é resolvida uma
vez para os três canais (`imagem_da_pauta`). A refação de imagem resolve outra
(`imagemDaPauta` com `ignorarReuso`) e grava só na peça; desde esta data
`ignorarReuso` não regrava a tabela nem a memória, e os outros canais seguem
com a foto que tinham. Até 05/10 a foto refeita substituía a compartilhada.

**O contexto vai para a linha da fila.** `resumo.contexto` guarda a pauta (o
que os redatores e o resolvedor leem dela), o pacote factual, a referência ao
pool aprovado do dia (só os `storyId`, em ordem) e, na newsletter, as fotos e os
créditos de cada história. O post leva o mesmo em `content_json.contexto_da_refacao`
e a forma do carrossel em `content_json.carrossel`. Peça anterior a isto é
remontada de `news_candidates`, `articles.source_urls`, `news_editions.stories`
e do histórico editorial; sem como remontar, o painel diz o que faltou.

**Cada etapa, por ramo:**

| ramo | seleção | texto | imagem | arte |
|---|---|---|---|---|
| post | outra pauta, pelo ciclo social inteiro (`rodarSocialDoDia`, teto 1), na vaga da reprovada | `gerarPostDaPauta` com motivo e memória, depois a arte | foto nova só da peça, depois a arte | recongela |
| carrossel | idem | o mesmo gerador, na mesma estrutura, e recongela todas as telas | foto da capa, e recongela as telas | recongela as telas |
| artigo | outra pauta, pelo ramo do portal (`rodarRamoDoPortal`), no horário da reprovada | `escreverArtigoDaPauta` | capa nova | não existe |
| newsletter | troca UMA história, apontada pelo editor, e reescreve a edição | `runNewsroomPipeline` com motivo e memória (a edição inteira; a pauta apontada vai como foco) | foto nova da história apontada, ou de todas; só o HTML é redesenhado | não existe |

**A seleção refeita respeita a régua do ramo:** aprovada pela linha editorial,
imigração fora, nada que o canal já tenha no dia (nem a pauta recusada), nenhum
acontecimento repetido no canal (cosseno 0.70 contra as peças do dia, e a
impressão do acontecimento no post), nada já publicado no canal
(`verificarRepeticao`), foto real e pacote factual. No post e no artigo a peça
nova entra na fila com hash próprio e herda a contagem de refações da vaga; a
reprovada é descartada com o motivo e o id da substituta. A newsletter é uma
peça por dia, então a troca é dentro dela, e o editor escolhe no painel qual
pauta sai (sem escolher, a refação diz que precisa saber).

**O Listmonk não é tocado.** A campanha só nasce na liberação, com o que está
na linha naquela hora.

**A refação roda fora do clique.** A reprovação grava `resumo.refacao` em
`na_fila` e responde. Roda o `after` da própria reprovação e, a cada minuto, o
relógio da fila (`processarRefacoes`); a reivindicação é condicional, então os
dois nunca refazem a mesma peça. Falha técnica volta para a fila (na terceira
vira "não dá"); processo que morreu no meio deixa `rodando`, e depois de 20
minutos a linha é pega de novo. Com a fila fora de `enforce`, nada roda.

**"Não dá" nunca é silêncio.** Se o gancho recusou sem escrever, a peça volta a
`aguardando` intacta, com o motivo: o editor aprova como está, reprova outra
etapa ou cancela. Se a peça mudou pela metade (texto novo, arte que não
fechou), fica em `refazendo`, porque aprovar a meia-versão publicaria a
manchete de uma peça na arte de outra; a saída é cancelar. O painel mostra
"refazendo X, refação n de 2" com a previsão de volta (estimativa por etapa,
`MINUTOS_DA_REFACAO`) e se atualiza sozinho enquanto houver refação andando.

**O que continua manual:** a peça cujo contexto não dá para remontar (a matéria
que é a edição da newsletter, `edicao-AAAA-MM-DD`; o carrossel gravado antes
desta data, sem a forma; a edição antiga sem a foto no histórico, para refazer
o texto), e a terceira reprovação, que descarta como sempre.

## O aprendizado da fila, por etapa e por canal (06/10/2026)

O dono: "de nada adianta esse esforço manual se não houver aprendizado". Até
aqui a memória de reprovação só chegava ao texto, e misturada: o erro apontado
na legenda do post entrava na voz da newsletter. O código está em
`src/lib/server/aprendizado/`, as tabelas na migration
`20261006120000_aprendizado_da_fila.sql`, e a tela em
`/admin/<projeto>/aprendizado` (também na seção "Aprendizado" do projeto).

**Canal é canal, sempre.** `errosRecentesDaEtapa(projeto, ramo, etapa)` lê só
as reprovações daquele canal, as regras têm `ramo` NOT NULL, e cada voz recebe
o bloco do próprio canal. Nada lê o aprendizado com a fila em `off`.

**Cada etapa aprende com a reprovação dela.** A reprovação grava em
`reprovacoes.detalhes` o que a peça tinha (a pauta, a foto de fundo, o molde):

| etapa | o que aprende | onde |
|---|---|---|
| seleção | cada recusa parecida (fonte, ator, eixo) tira 8 pontos da nota, até 24; fonte ou ator recusado 3 vezes em 30 dias sai do canal; pauta recusada nunca volta ao canal. O eixo nunca bloqueia | `aprenderNaSelecao` na newsletter, no portal e no Instagram; a troca de pauta da refação também |
| texto | erros recentes, regras aprovadas e exemplos aprovados de primeira, do canal | `vozesDosRamosComMemoria` |
| imagem | a foto recusada no canal nunca mais é escolhida nele; o motivo vai para a pergunta da cena | `fotosDoCanal`, `comFotoDoCanal`, `recusasDoEditor` |
| arte | molde recusado 3 vezes sai da escolha do feed (o jornal nunca sai); a refação da arte troca a decisão recusada e grava o porquê em `content_json.arte.aprendizado` | `moldesComAprendizado`, `arteNaRefacao` |

A foto de uma pauta continua resolvida uma vez para os três canais. O bloqueio
de um canal entra DEPOIS dessa resolução: só aquele canal resolve outra.

**A aprovação de primeira vira exemplo.** Até 5 por tipo (assunto da
newsletter; manchete e abertura da legenda do post; título e linha fina da
matéria), num orçamento de 1.600 caracteres, só do canal, só aprovadas pelo
editor sem refação nem edição à mão, dos últimos 30 dias, nada antes de
05/10/2026 e nada com vocabulário de imigração.

**A edição à mão vira proposta.** O antes e o depois vão para
`edicoes_do_editor`. Toda segunda às 08:00 (`/api/cron/aprendizado`) e no botão
do painel, UMA chamada de modelo lê as edições da semana por canal e devolve
padrões; a proposta precisa de duas edições do mesmo canal, a citação de outro
canal é descartada na validação, e tudo nasce `proposta`, com origem `edicoes`.
Nada vira regra sem o dono aprovar.

**A taxa do painel conta edição como retrabalho.** Aprovada de primeira é sem
refação E sem edição à mão.

## A cadência se edita no painel, e o relógio da produção é da rota (06/10/2026)

**A tela é `/admin/<projeto>/cadencia`**, com link no menu do projeto, ao lado
dos perfis de referência e do acervo. Ela edita `settings.cadencia` inteiro:
dias, horários e volume de cada canal, mais produção e aprovação, e mostra a
prévia da semana seguinte. Grava por `PUT /api/admin/projetos/<id>/cadencia`,
com sessão do painel, tocando só a chave `cadencia` do jsonb.

**Campo inválido é gravado como veio**, e na leitura cai no padrão daquele
campo com aviso, que é a regra de 05/10. Normalizar antes de gravar apagaria o
aviso: o painel diria "gravado" e o campo voltaria ao padrão em silêncio. O
formulário calcula a prévia e os avisos a cada tecla com os MESMOS validadores
da esteira (`cadencia-no-painel.ts` é puro e o cliente o importa).

**O horário da produção é decidido pela rota, não pelo crontab.** Com
`?relogio=1`, `/api/cron/producao` é chamada de 15 em 15 minutos e só produz no
primeiro disparo entre o horário gravado e 15 minutos depois. Fora da janela
não grava linha, não pinga o watchdog e não alerta. Sem o parâmetro a rota
continua produzindo quando é chamada, então a linha antiga das 20:00 UTC segue
funcionando até ser trocada; o painel avisa quando o horário gravado não bate
com ela. O portal tem o mesmo aviso para `/api/cron/portal`, que já é segura de
chamar a qualquer hora.

## Os avisos de operação no Telegram (06/10/2026)

Com a fila de aprovação, a rotina do dono passou a ter horário, e o Telegram
deixou de falar só quando algo quebra. O código está em
`src/lib/server/avisos/`, e passa pelo mesmo `alerts.ts` dos alertas de falha.

| aviso | quando (hora do projeto) | condição |
|---|---|---|
| fila pronta | fim da produção das 17:00; rede no cron a partir das 17:30 | fila fora de `off`, produção com linha, fila do alvo não vazia |
| lembrete | 22:00 a 23:59 | fila fora de `off`, peça de amanhã aguardando ou refazendo |
| última chamada | 05:30 a 06:06 | fila fora de `off`, peça de hoje pendente |
| resumo do dia | 22:30 a 23:59 | sempre |
| produção vazia | fim da produção | rodou e a redação não produziu, ou produziu e nada entrou na fila (fora do ensaio) |
| produção não rodou | 18:30 a 21:59 | dia de produção sem linha em `newsroom_runs` |
| newsletter atrasada | 06:15 a 11:59 | fila em `enforce`, newsletter aprovada e não liberada |

**Um aviso por chave `tipo:dia`, gravado em `platform_events`**
(`aviso_operacional`). O cron de minuto em minuto pergunta antes de mandar. Envio
que falha é gravado com o motivo do Telegram e tentado de novo no minuto
seguinte, até três vezes; depois desiste, e as três linhas dizem por quê.

**A janela, e não o minuto.** O aviso sai no primeiro minuto dentro da janela,
então um cron atrasado não perde o dia. E o fuso é sempre o do projeto: o
contêiner está em UTC, onde 22:00 de São Paulo já é o dia seguinte.

**Nenhum aviso mente.** Com a fila em `dry_run` nada é segurado, então a última
chamada diz "sai mesmo assim" em vez de "não sai". E ela dá o primeiro horário
de cada canal, porque o post das 14:45 ainda tem a manhã para ser aprovado.

**Rota própria, `/api/cron/avisos`.** O cron da fila pula projeto fora de
`enforce` antes de ler qualquer coisa, e o resumo vale com a fila desligada; e
uma falha aqui não pode atrasar a liberação das 06:07. A rota não alerta a
própria falha, porque com o banco fora seria um alerta crítico por minuto.

**A falha de QUALQUER alerta vai para o banco**, `platform_events` do tipo
`alerta_falhou`, com o motivo e a descrição do Telegram e sem segredo. Antes
ela só existia no log do contêiner.

## O evergreen ganha catálogo novo, sem imigração (06/10/2026)

O evergreen foi desligado em 05/10 porque os 66 tópicos do catálogo eram todos
de visto. O catálogo novo é da linha atual: o brasileiro que SONHA em morar,
trabalhar ou investir nos EUA, e o conteúdo explica como as coisas funcionam
lá. O de imigração está arquivado em `evergreen/catalogo-imigracao-arquivado.ts`,
que ninguém importa. **A capacidade continua desligada** até o dono aprovar.

**O catálogo:** 60 tópicos e 154 ângulos (de 2 a 4 por tópico), em
`evergreen/catalogo.ts`, agrupados pelas editorias do portal: economia 13,
trabalho 13, tecnologia 8, custo de vida 14, política 8 e Brasil 4. Todo
tópico declara de 1 a 3 temas da lista fechada de `src/lib/temas.ts`, e o
teste recusa slug que não existe lá. Nenhum tópico nem ângulo pode ser de
imigração (o teste procura visto, green card, USCIS, cidadania, deportação e
afins).

**Fontes só de órgão oficial**, e a lista de `grounding.ts` foi trocada
inteira: saíram uscis.gov, travel.state.gov, state.gov, cbp.gov e
federalregister.gov; entraram Fed, Tesouro, SEC, FDIC, CFPB, FTC, BLS, BEA,
Census, EIA, USDA, DOL, IRS, SBA, HealthCare.gov, Medicare, NCES, NIST, USPTO,
NASA, DOE, CISA, USA.gov, Arquivo Nacional, Câmara, Justiça federal, os .gov de
Texas, Califórnia, Nova York, Washington e Tennessee, e gov.br só para o
contraste com o Brasil. As 148 URLs foram conferidas em 06/10/2026 com o agente
honesto do projeto (`eua.journal/1.0`, que substituiu o `imigra.us/1.0` da
leitura): HTTP 200, texto suficiente e o assunto presente na página. Ficaram
fora porque recusam agente declarado (403, desafio ou página vazia):
investor.gov, ssa.gov, hud.gov, huduser.gov, studentaid.gov, ed.gov,
ibge.gov.br, bcb.gov.br, congress.gov, senate.gov e transportation.gov. A
conferência se repete com `npx tsx src/scripts/conferir-fontes-evergreen.ts`.

**O Brasil só entra como contraste**, nos 4 tópicos da editoria Brasil, e cada
lado do contraste tem a sua fonte primária (IRS e Receita, DOL e MTE, IRS e
INSS, FGTS e FICA). Nenhum ângulo afirma equivalência que as duas fontes não
dizem.

**O adaptador deixou de marcar imigração.** `imigracao: false` e o eixo sai da
EDITORIA do tópico (economia, trabalho, tecnologia, custo_de_vida, politica,
brasil), e não mais da família, que diz a forma. Assim as réguas da linha nova
(foto obrigatória, moldes, bolha, chapéu da editoria) tratam o evergreen como
qualquer pauta. As famílias viraram cinco (`explainer`, `glossary`, `faq`,
`comparison`, `process_explainer`).

**Ator da foto é instituição, e só onde ela é o assunto.** O código do
programa ("FOMC", "401(k)") não vai mais como ator, pela lição da sigla PERM.
O campo `entidade` existe em 6 tópicos (Fed, SEC, FDIC, IRS na temporada,
Congresso, Suprema Corte). Medido com o resolvedor: com o órgão declarado,
credit score, 401(k), aluguel e Artemis terminavam sem foto; sem ele, os
quatro saíram com a foto da cena.

**O ritmo:** nenhum TÓPICO volta em 30 dias (a janela era 7) e o par
tópico+ângulo continua com 30. O teto do dia caiu de 4 para 2, que é
`60 tópicos / 30 dias`: com 4, o catálogo secaria na metade do mês de pouca
notícia. Uma editoria por dia (`EVERGREEN_MAX_POR_EDITORIA`). O evergreen
continua só nas vagas que a notícia deixou, e cede o assunto quando a notícia
do dia traz o mesmo programa ou a mesma instituição. O desempate entre itens
nunca usados passou a girar com o dia (continua determinístico): item que cai
depois da seleção (sem foto, copy recusada) não entra no histórico e, com a
ordem alfabética, voltava ao topo todo dia, travando o catálogo.

**Amostras** em `docs/design/evergreen-novo-2026-10-06/`, pelo caminho de
produção inteiro em ensaio (`src/scripts/amostras-evergreen.ts`: store de
memória, arquivo local no lugar do Storage, banco só lido): credit score,
mandato do Fed (com bolha), Colégio Eleitoral e FDIC (com bolha). PNGs
reduzidos para 1080x1440 no repositório.

**Como ligar:** no painel, a capacidade `evergreen` do projeto
(`settings.capacidades.evergreen`): primeiro `dry_run` (calcula, grava o
diagnóstico em `payload.diagnostico.evergreen` e não publica nada), depois
`enforce`. Para `enforce` publicar, o Social V2 também precisa estar em
`enforce`.

## A matéria profunda: mais fontes, capa creditada e IndexNow (06/10/2026)

A auditoria de estrutura (`auditar-artigos.ts --estrutura`) mediu as duas
matérias publicadas com 359 e 411 palavras de corpo, contra o molde de 500 a
900, sem "O que você precisa saber" (o bloco só existe acima de 400 palavras
com fato próprio), uma sem crédito nem legenda na capa e uma com `&amp;` no
endereço da capa. O dono aprovou três frentes.

**A poda NÃO afrouxa.** A matéria era curta porque o pacote factual vinha de
UMA fonte, e a poda apaga o que o pacote não sustenta. O que muda é o pacote,
nunca a régua: nada sem lastro vai ao ar, e matéria não se enche.

**O pacote da matéria do portal junta as fontes do mesmo fato**
(`ramos/fontes-da-materia.ts`, ligado em `ramos/materia-profunda.ts`). Antes de
escrever, o ramo tenta, nesta ordem: as URLs que a deduplicação agrupou com a
pauta; as candidatas de `news_candidates` dos últimos três dias com cosseno de
0.70 ou mais com o vetor da pauta (o limiar medido de "mesmo acontecimento",
`limiarDeAgrupamento`); e os links para fonte primária (domínio `.gov`, `.mil`,
`.gov.br`, `.jus.br`, `.leg.br`) que o CORPO da matéria principal cita, sem a
home do órgão e sem PDF. Cada fonte é lida com o agente honesto e, se recusar,
pela cópia do Internet Archive (`buscarTextoDaFonte`), e vira o SEU pacote
(uma chamada barata de extração). Fica de fora agregador, pauta de imigração,
a mesma URL ou o mesmo domínio de uma fonte já escolhida, e fonte sem fato.
Teto de quatro fontes contando a principal e de seis leituras.

**O limiar desce para 0.60 em dois casos, por decisão do dono (06/10/2026):**
irmã em outra língua e irmã de domínio oficial. Medido no ensaio: a mesma
notícia do diesel em The Hill e em O Globo deu 0.659, e o comunicado oficial,
0.618; o 0.70 foi medido entre veículos da mesma língua. Na mesma língua e
fora de órgão oficial continua 0.70. O que segura fato vizinho é a ancoragem
por fonte, que não mudou.

- **O pacote da camada comum não muda.** A cópia ampliada é só do portal; a
  newsletter e o post seguem com o pacote de sempre (a regra de "um pacote por
  pauta" é sobre os canais não lerem duas extrações diferentes da MESMA
  fonte, e continua valendo).
- **Cada fato continua com o dono.** O pacote guarda `fontes` (F1 é a
  principal), o redator recebe os fatos separados por fonte e marca o link de
  cada uma com o id (`[[segundo a Reuters|F2]]`). A régua nova
  `atribuicaoSemLastro` confere que o número atribuído a uma fonte está NO
  MATERIAL DELA, e não só no pacote: o trecho que falha é reprovado e, se o
  reparo não resolver, apagado pela poda. É a resposta determinista ao defeito
  de atribuição da matéria de Chicago, para o caso em que ele dá para medir.
- **As lacunas vão com o dono** ("The Hill não informa: ..."): a lacuna crua da
  principal faria o auditor semântico apagar o fato que a segunda fonte deu.
- **O separador do texto de origem leva o nome da fonte, nunca o id**: "F2" no
  material sustentaria um "2" inventado no texto.
- **Com uma fonte só, o prompt é byte a byte o de antes.** O contrato das
  várias fontes só entra quando há mais de uma.
- A seção "Fontes" lista todas as fontes do pacote, e cada uma vira link
  dentro do texto, no primeiro trecho que a cita.
- A refação de texto da fila reescreve com o pacote ampliado (ele é o que fica
  em `origemDoArtigo`), e a troca de pauta também amplia.

Medida em ensaio, sem gravar nada: `npx tsx src/scripts/medir-materia-profunda.ts`
escreve cada pauta duas vezes (uma fonte e várias), com o mesmo redator, auditor
e poda, e imprime palavras e o bloco de tópicos antes e depois.

**A capa sempre com crédito, legenda e endereço limpo.** O crédito mora no
corpo, num `<p class="credito-da-foto">` com autor, licença, link da página do
arquivo e, quando a origem diz, a medida do original em `data-largura` e
`data-altura` (`src/lib/credito-da-capa.ts`). O ramo o escreve a partir do
asset que o resolvedor escolheu, e a legenda vem da conferência visual sem a
manchete, passada pela ancoragem, com a neutra ("Imagem ilustrativa:
<assunto>.") como saída. A capa é gravada sem `&amp;`. O crédito inclui o
Pexels, cuja licença não exige: o dono pediu crédito em TODA capa.

- **A página conserta a linha antiga na leitura.** Sem crédito gravado, a rota
  pergunta à origem (`resolverCreditoDaCapa`: a página do arquivo no Commons e,
  com `PEXELS_API_KEY`, a API do Pexels), com cache de um dia; sem resposta,
  vale o que o endereço permite saber (origem e link). Sem legenda gravada, a
  neutra, e o `alt` fica no título, porque a neutra não descreve a foto.
- **A refação de imagem troca o crédito e a legenda junto com a foto**, e a de
  texto preserva os dois. Antes a de texto os apagava.
- **O banco se conserta por script, em ensaio por padrão**:
  `src/scripts/consertar-capas.ts` (e `--aplicar` para gravar). Só `published`
  por padrão, porque a `scheduled` está na fila, cujo hash cobre HTML e capa.
  Crédito pela metade não é gravado, para a página continuar perguntando, e
  `updated_at` não muda: crédito de foto não é mudança de conteúdo.
- **A auditoria lê a capa**: `auditar-artigos.ts --capas` (só leitura).

**O NewsArticle leva `image` como `ImageObject` com largura e altura**, e só
medida que é verdade: no Pexels e no Unsplash os três cortes de 1200 (16:9, 4:3,
1:1) que o próprio endereço garante; no Commons a miniatura de 1280 com a altura
pela proporção do original; sem medida conhecida, o endereço puro, como antes.
O `/llms.txt` passou a listar todas as publicadas, e não as 20 últimas. O
sitemap já tinha todas as publicadas e as páginas de editoria; o de notícias
fica nas 48 horas, que é a regra do Google News.

**IndexNow** (`src/lib/server/indexnow.ts`). Bing, Yandex e, pelo Bing, a busca
do ChatGPT e do Copilot ficam sabendo da matéria publicada, mudada ou retirada,
com a matéria, a página da editoria e a home. Os três caminhos que publicam (o
relógio do portal, o da publicação e a liberação da fila), o painel e os
scripts que mudam matéria no ar avisam. O aviso roda no `after` e nunca segura
a publicação; prazo de cinco segundos; falha vai para `platform_events`
(`indexnow_falhou`). A chave é `INDEXNOW_KEY` no ambiente (só letra e número, de
8 a 128, `openssl rand -hex 32`), servida em `/<chave>.txt` por uma reescrita
do `next.config.ts`. Sem a chave, nada acontece e o log diz isso uma vez. O
Google não participa, e ping de sitemap ele ignora desde 2023.

## Autores com nome, e a Redação continua o padrão (06/10/2026)

Aprovado pelo dono. Tabela `autores` (migration `20261006120000_autores.sql`)
e `articles.author_id`, nulo por padrão. A esteira automática nunca atribui
autor: matéria sem autor assina "Redação eua.journal" e sai como Organization
no JSON-LD, como antes. O dono cadastra e atribui em `/admin/<projeto>/autores`.

- **A página prefere `author_id`**; a coluna de texto `author` fica por
  compatibilidade e não é lida para a assinatura com link.
- **Com autor, o NewsArticle traz Person** (url da página, `jobTitle`,
  `image`, `sameAs` só com as redes gravadas), e `/autor/<slug>` é ProfilePage.
  A auditoria de artigo aceita Person ou Organization.
- **Desativar, nunca apagar.** Autor desativado sai do portal inteiro: a página
  dá 404 e as matérias voltam a assinar como a Redação, para nenhum link
  apontar para página que não existe. Reativar devolve tudo.
- **Página de autor sem matéria publicada** abre, mas com `noindex` e fora do
  sitemap até a primeira matéria.
- **A leitura degrada.** Antes da migration, a matéria abre com a Redação e o
  painel diz qual arquivo rodar.

Capturas em `docs/design/autores-2026-10-06/` (autora de exemplo, fictícia).

## O método do Not Journal e do The News (06/10/2026)

O dono leu 7 carrosséis do Not Journal (31 slides) e 40 assuntos do The News e
aprovou o método. O teste com dados reais, as peças e o custo estão em
`docs/design/metodo-carrossel-2026-10-06/comparacao.md`.

**O assunto do e-mail é sobre UMA história**, a mais forte do dia, em caixa
baixa inteira (nome e sigla inclusive; só "R$" e "US$" ficam), de 2 a 7
palavras, uns 40 caracteres, sem ponto final, numa de cinco formas: pergunta que
a edição responde, dois ou três nomes, personagem com detalhe curioso, cena ou
número, o momento. A forma é conferida e consertada em código
(`newsroom/assunto.ts`): caixa, ponto e travessão sem pedir nada a ninguém;
tamanho escolhendo a primeira opção da própria redação que cabe, nunca
cortando. O teto do código é 9 palavras e 45 caracteres, e não 7 e 40, porque
os exemplos que ensinam o método passam disso ("o advogado que apostou R$ 5 bi
no tigrinho" tem 9 e 42). O piso do schema caiu de 15 para 5 caracteres: "lula &
trump" derrubaria a edição inteira depois de paga. **O preheader continua
nosso**, editorial, e não a propaganda do The News.

**A pergunta é permitida no ASSUNTO e continua proibida na MANCHETE.** O assunto
abre o e-mail e a edição responde logo abaixo; a capa do Instagram é o post
inteiro para quem não desliza, e pergunta ali é teaser.

**A manchete da capa é uma frase: ator, verbo no presente, fato, escala.**
Número exato, atribuição, zero adjetivo de opinião. O prompt pede de 10 a 18
palavras; a guarda continua recusando abaixo de 6 (`FORMA_DA_MANCHETE`), de
propósito: subir o piso transformaria toda manchete boa de 8 ou 9 palavras em
reescrita paga ou post descartado, e a recusa é do que é rótulo. A legenda abre
com o lide inteiro em uma frase (`gancho`, teto do aparador subiu de 160 para
240 para não cortar a frase no meio).

**A notícia vira carrossel só com material para dois passos além da capa**
(`determinarFormatoDaNoticia`): escala, detalhe, explicação com dono,
consequência. Dois passos dão 3 slides (capa, um slide com dois blocos,
convite); três dão 5; quatro, ou dois com seis fatos ou mais além do lide, dão
5 ou 6. Cada slide de conteúdo tem um ou dois blocos de 15 a 30 palavras,
conferidos (`conferirBlocosDaNoticia`, faixa de 12 a 36 na guarda). Na notícia
a relevância para o leitor é silêncio permitido: o método conta o fato, e o
ensaio mostrou a régua de leitor exigindo "quem" enquanto o auditor recusava
justamente o "para quem pensa em morar em Los Angeles" que o pacote não
sustenta.

**Todo slide é foto, e o protagonista aparece em fotos diferentes**
(`carrossel/fotos.ts`): o resolvedor de sempre, perguntado de novo com a lista
do que já saiu, primeiro pelo RETRATO do protagonista (a conferência visual
pergunta "é esta pessoa?", e não se a foto sustenta a manchete), depois pela
cena sem atores; sem foto nova, o slide sai no azul-marinho, nunca com a foto
de outro slide nem com rosto de outra pessoa. A bolha só entra no slide em que
um SEGUNDO personagem nomeado aparece no texto, com foto cuja entidade é ele. O
LUGAR da bolha é da frente `feat/bolha-sem-rosto`; o miolo usa a classe
`j-bolha` mais o modificador `jn-bolha`.
ATUALIZADO no mesmo dia: o slide sem foto SAI do carrossel, outras pessoas na
foto do slide são aceitas, e a bolha do miolo desvia de rosto. Ver "As
decisões do dono sobre o método".

**O último slide da notícia convida a assinar a newsletter**, sempre, com ou
sem keyword: fundo preto, logotipo de fundo escuro, "Assine a newsletter do
eua.journal." e uma caixa de entrada desenhada em HTML com a NOSSA edição no
topo (`cta_assinatura`). A linha "Comente NEWS e receba o link" só aparece com
keyword escutada. É a regra "o CTA do Instagram oferece a NEWSLETTER" levada à
arte.

**Tudo do carrossel atrás de `settings.capacidades.carrossel_noticia`.** Não
declarado é `off`, a peça única de sempre; `dry_run` só anota no log o que
viraria carrossel; `enforce` faz o carrossel com a verificação semântica ligada.

**Os textos editoriais novos são os padrões do código** (RF-26): valem sem
painel. `src/scripts/salvar-instrucoes.ts` grava as cinco etapas como versões
ativas quando o dono aprovar (ensaio por padrão, `--aplicar`, `--reverter`).

## As decisões do dono sobre o método (06/10/2026)

Lidas as amostras e o `comparacao.md`, o dono fechou os pontos abertos. Novas
amostras, com dados de produção e o código desta data, em
`docs/design/metodo-carrossel-2026-10-06/v2/` (`src/scripts/amostras-metodo-v2.ts`,
banco só lido, nenhuma chamada de modelo).

**Os cinco textos editoriais estão aprovados** (`newsletter_assunto`,
`manchete`, `social_copy`, `carrossel_copy`, `voz_social`). Quem grava as
versões ativas é o dono, depois do deploy:
`npx tsx src/scripts/salvar-instrucoes.ts --aplicar` (volta com `--reverter`).

**Slide de notícia sem foto não existe.** O carrossel usa MENOS slides, nunca
um slide de texto chapado sobre azul-marinho (`podarMioloSemFoto`, em
`carrossel/fotos.ts`). O menor carrossel de notícia é capa, um passo e o
convite (`MINIMO_DE_SLIDES_DA_NOTICIA`, 3); abaixo disso, a pauta sai como peça
única. Falha ao resolver as fotos é o caso extremo: peça única. E o slide de
notícia nunca vira texto no render: se a foto aprovada não baixar, o render
falha (`exigeFoto`) e o ciclo congela a peça única no lugar do carrossel. A
legenda leva só os créditos das fotos que ficaram. A linha guarda a foto de
cada slide (`content_json.carrossel.fotos`), e a refação da arte recongela com
elas; sem elas, a refação diz que não dá, em vez de desenhar o miolo sem foto.
O resolvedor não mudou: outra frente está tornando a falha de foto rara.

**Outras pessoas na foto do slide são aceitas**, como o Not Journal faz
(Sanders no palco de um ginásio cheio). Duas regras continuam: a foto do
protagonista mostra o PROTAGONISTA (a entidade resolvida tem que ser ele) e a
bolha nunca cobre rosto. No miolo a bolha tem posições próprias, acima do
texto, que ocupa a metade de baixo (`POSICOES_DA_BOLHA_DO_MIOLO`); a foto do
slide passa pelo mesmo detector de rostos da capa (`decidirBolhaDoMiolo`), sem
posição livre ou sem conseguir conferir a bolha sai, e o render mede o círculo
de novo, como na capa.

**As cinco formas do assunto giram em CÓDIGO, não só no prompt.** A redação
escreve cinco opções marcadas com a forma (`{ forma, texto }`), duas na forma
da vez; o código escolhe a primeira opção válida da forma da vez e, sem
nenhuma, a primeira válida da forma seguinte (`escolherAssunto`, em
`newsroom/assunto.ts`). A vez sai das edições gravadas: andando no círculo
pergunta, nomes, personagem, cena, momento a partir da forma de ontem, a
primeira que não apareceu nas últimas quatro edições (`ordemDasFormas`). Com
tudo dando certo, as cinco passam antes de alguma voltar; a forma que um dia
não conseguiu volta a ser a vez quando sai da janela; a forma de ontem só
como último recurso. Sem sorteio, pelo motivo de sempre. A forma escolhida é
gravada em `news_editions.subject_form` (migration
`20261006140000_forma_do_assunto.sql`, para o dono rodar). Antes dela a edição
é gravada sem a coluna e o rodízio lê a forma das edições pelo formato do
assunto (`inferirFormaDoAssunto`, que devolve nada quando não reconhece). A
edição do próprio dia não entra no histórico, e a refação da newsletter não
passa pelo rodízio.

**O teto do título do carrossel subiu de 95 para 130**, o da capa
(`FORMA_DA_MANCHETE`). Os 95 são do título do e-mail, medido num celular de
390px; a manchete do carrossel é a capa do Instagram, na mesma faixa medida da
peça única, e as manchetes do método passavam de 95 e iam para reparo pago sem
defeito nenhum.

**O chapéu mostra o tema, como no Not Journal.** Ver o chapéu em "Visual". A
condição de a MANCHETE nomear o tema veio da amostra: a pauta das ações
climáticas contra petroleiras citava "petróleo" duas vezes na legenda e saía
com "PREÇO DO PETRÓLEO", que não é o assunto dela.

**A marca do feed é a do Instagram**, e o avatar é o ícone do site. Ver "O
logotipo" em "Produto e marca". O convite final desenha o remetente da caixa de
entrada com o avatar novo, e não mais em CSS.

## Foto da cena depois da entidade, dólar em US$ e logotipo de terceiro (06/10/2026)

Três defeitos vistos nas amostras do evergreen novo, com a correção aprovada
pelo dono. Valem para notícia também, não só para o evergreen.

**A pauta com entidade não morre mais sem foto quando a foto da entidade não
passa.** Até aqui, citar um órgão (o Fed, o IRS) mandava a resolução só pelo
caminho da entidade. O banco conceitual entrava misturado com as fontes de
fato e era pontuado contra o NOME do órgão: foto de banco nunca tem "Federal
Reserve" no arquivo, então somava 33 contra o piso de 45 e caía como
LOW_RELEVANCE sem ninguém abrir a imagem. E quando a foto do órgão passava na
pontuação e a conferência visual a recusava, o banco nem era consultado. A
mesma pauta sem o nome do órgão ganharia a foto da cena.

Agora são duas etapas em `resolver.ts`. A da entidade decide primeiro, com a
régua de sempre. Se ela não entrega foto aprovada, entra a da cena, com as
mesmas barreiras da pauta sem entidade e sem desconto nenhum: a cena descrita
pelo conteúdo (`cena-da-pauta.ts`, sem pessoa identificável e sem texto), o
acervo pela tag com a régua de país, e a conferência visual abrindo cada
imagem. A cena é pontuada contra a entidade CONCEITUAL da pauta, não contra o
órgão. O resultado continua dizendo qual é a entidade da pauta, porque é ela
que a bolha procura: fundo de cena e círculo do órgão é uma capa válida.

- **Pessoa continua sem cena no lugar, quando a pauta é SOBRE ela.** Foto
  conceitual no lugar de pessoa é a mentira mais fácil, e a regra de
  `TIPOS_DE_PESSOA` vale sempre que a manchete nomeia a pessoa. Quando a
  manchete não nomeia (Trump entre os atores de "EUA flexibilizam normas sobre
  economia de combustível"), a pauta é sobre o fato e segue pela cena. No
  replay de pautas reais eram exatamente essas as que ainda morriam: a
  conferência recusava a foto da pessoa por ela não estar na manchete, e a
  regra recusava a cena por ela ser a entidade.
- **Entidade ambígua segue pela cena.** Ambiguidade continua sem palpite sobre
  a entidade, mas a foto de contexto não afirma qual das duas é, e a pauta
  deixou de morrer ali.
- **O caminho fica gravado.** `ResultadoVisual.caminho` diz `entidade`, `cena`
  ou `cena_depois_da_entidade`; a nota "fallback de cena" vai para
  `fontesConsultadas` com o motivo (foto do órgão reprovada na conferência ou
  nenhuma passou na pontuação); o asset ganha `metadata.fallback_de_cena`; e
  `content_json.visual.caminho` guarda o caminho no post.
- **Custo:** a pauta que cai na cena depois da entidade paga a pergunta da cena
  e as conferências da escada. Só acontece quando a entidade falhou.

**A cena desce uma escada antes de desistir.** Pedido do dono no mesmo dia:
"o ideal é que nunca haja falha de imagem; sempre tem que ter foto de
contexto". Medido no catálogo do evergreen, TODA pauta que ficava sem foto
tinha o mesmo perfil: três fotos de banco, as três recusadas pela conferência,
e nenhum outro lugar onde procurar. A cena agora desce degraus e para no
primeiro que entrega foto aprovada:

| degrau | o que pede |
|---|---|
| `acervo` | o acervo próprio pela tag, como antes |
| `cena` | a busca que descreve o objeto da pauta (ou o tema fixo, se a pergunta falhou) |
| `cena_ampla` | a busca ampla que o mesmo modelo devolve, o tema fixo e o Openverse |
| `editoria` | o contexto da editoria (Capitólio para política, servidores para tecnologia, Brasília para Brasil) |
| `reuso` | os mesmos pedidos aceitando foto dos últimos 30 dias; nunca a que saiu hoje |

- **As regras duras não descem com a escada.** Toda candidata passa pela
  pontuação e pela conferência visual. O que muda é a PERGUNTA para a foto de
  cena (`papel: "cena"`): ela é contexto, e "é genérica" ou "não identifica o
  órgão" deixam de ser motivo de recusa, que eram as recusas mais comuns.
  Pessoa identificável, texto como assunto, outro país e logotipo de terceiro
  continuam recusa, e estão repetidos na instrução de propósito.
- **O degrau fica gravado**: `ResultadoVisual.degrau`, `metadata.degrau`,
  `content_json.visual.degrau` e uma nota por degrau em `fontesConsultadas`.
- **Teto:** quatro conferências por degrau e doze na escada inteira. O caso
  comum para no primeiro degrau.
- **O banco faz uma chamada por provedor, não uma por foto.** Eram três
  chamadas iguais por pauta, cada uma baixando os mesmos 15 resultados para
  ficar com o seguinte. Além de triplicar o custo, era rajada, e o Pexels
  responde 429 a rajada: em medição, uma rajada recusada virava "não há foto".
  Agora uma busca devolve até seis candidatas.
- **O Commons grande é conferido pela miniatura.** O modelo recusa baixar mais
  de 20 MB, e o original do Commons passa disso: duas fotos do IRS viraram
  VISUAL_CHECK_UNAVAILABLE por isso. A conferência abre a miniatura de 1280 px
  do mesmo arquivo; a URL gravada e publicada continua a original.
- **Vale para todos os canais**, porque newsletter, portal, post e carrossel
  resolvem a foto pelo mesmo `resolveVisualAsset`.

**Dólar em texto português é `US$` com número brasileiro.** A manchete do FDIC
saiu "até $250,000". O modelo copiou a grafia da fonte, que é o que o prompt
pede para número, e ninguém traduzia a forma. `dolarEmPortugues`
(`editorial/dolar-em-portugues.ts`) roda depois da geração dentro de
`limparVicios`, que é o ponto por onde passa toda copy em português (newsletter,
artigo, post, legenda, carrossel), e de novo antes da formatação de números da
newsletter. Converte `$250,000`, `US$250,000`, `USD 3,000`, `3,000 USD`,
`$1.5 million` (vira "US$ 1,5 milhão"), `$250K`; não toca em `R$`, em outra
moeda com cifrão (A$, HK$), em número sem marca de dólar nem em URL. O prompt
dos quatro redatores ganhou a mesma regra (`REGRA_DO_DOLAR`).

- **A ancoragem continua valendo.** Ela compara dígitos e tipo, e "$250,000"
  na fonte e "US$ 250.000" no texto são os mesmos dígitos, os dois moeda. Há
  teste dos dois lados, inclusive de que valor que a fonte não tem continua
  sem lastro.
- **A vírgula ambígua ("1,239") é decidida pelo prefixo.** Depois de "US$" o
  texto já está em português e cotação de três casas fica decimal ("o euro
  vale US$ 1,169"); cifrão solto e "USD" são grafia americana, e a vírgula é
  milhar. Três casas terminadas em zero são sempre milhar.
- **Isto consertou um defeito escondido na newsletter.** `formatarNumerosDoTexto`
  lia "$250,000" como número brasileiro e imprimia "$ 250", um valor mil vezes
  menor com cara de arredondamento. O cifrão solto agora sai como "US$".

**Logotipo de empresa que não é o assunto é recusa na conferência visual.** A
foto de credit score trazia um cartão com o logo da Mastercard; a bolha do
FDIC mostrava o selo do órgão cortado pelo círculo. A instrução de
`conferencia-visual.ts` passou a recusar logotipo ou marca registrada em
destaque de empresa que não é o assunto da manchete, e logotipo do próprio
assunto cortado, pela metade ou ilegível. A marca da PRÓPRIA instituição de que
a pauta trata, inteira e legível, é aceita, e isso é uma exceção explícita à
regra de texto na imagem: é identidade do assunto, não texto competindo com a
manchete. A foto da bolha agora é conferida sabendo que vai para a bolha
(`uso: "bolha"`): a conferência recebe a geometria do recorte (o quadrado
central, com os cantos comidos pelo círculo) e recusa o que ficaria cortado ali.
Falha de conferência continua sendo recusa.

**Medição:** `npx tsx src/scripts/medir-fotos-evergreen.ts` passa o catálogo
inteiro (60 tópicos, primeiro ângulo) pelo resolvedor de produção em leitura e
conta quantos ficam sem foto; com `--noticias=60 --dias=14` faz o mesmo com
pautas reais aprovadas, lidas do banco só com SELECT. Em 60 pautas reais de
22/09 a 06/10, a queda por foto foi de 63,3% (código do PR #91) para 0%; no
catálogo do evergreen, de 15% para 0%. Detalhe em
`docs/design/evergreen-novo-2026-10-06/v2/medicao-de-fotos.md`.

**A entidade não voltou aos tópicos do evergreen.** Com a cena depois da
entidade, declarar o órgão já não mata o tópico por falta de foto (8 de 11
candidatos morriam antes, 1 depois). Mas a bolha, que é a razão de declarar o
órgão, não achou segunda foto em nenhum dos onze, e entidade que não rende
bolha só acrescenta consulta.

## O calor da pauta (06/10/2026)

O dono achou a seleção "muito fria". A auditoria
(`docs/auditorias/noticia-quente-2026-10-06.md`) mediu 200 posts do Not
Journal e 200 do Brazil Journal pela Graph API, os nossos 60 últimos e as 3.857
candidatas da semana, e achou três coisas: o pool tinha as histórias quentes
(Trump, Musk, Bezos, o acordo de IA na Casa Branca, o dólar abaixo de R$ 5) e
a nota as deixava atrás de pauta útil e fria; o post sai em mediana 31 horas
depois da fonte; e 21 dos 60 posts repetem história do dia anterior.

**A nota da pauta mede utilidade; o calor mede se alguém está falando dela.**
Os dois somam. `editorial/calor.ts` dá de 0 a 100 por pauta aprovada, com
cinco sinais deterministas:

| sinal | peso | de onde |
|---|---|---|
| veículos | 30 | domínios distintos com o mesmo fato em 24h, vetor do TÍTULO dos dois lados, limiar de agrupamento de sempre (0.70) |
| tendência | 25 | Google Trends EUA e Brasil, Bluesky, mais lidos da Wikipédia em inglês e em PORTUGUÊS (nova); duas fontes valem 25, uma vale 18 |
| fama | 25 | quantas Wikipédias têm artigo da pessoa ou organização citada (Wikidata); 150 ou mais vale 25 |
| recência | 10 | até 6h, 10; até 24h, 5; depois de 48h, zero |
| número forte | 10 | percentual, dinheiro com escala, recorde, contagem grande; ano não conta |

O bônus na nota é `0.35 x calor`, até 35 pontos: o bastante para a pauta
quente passar a fria de nota parecida, e não para a irrelevante passar a
importante. **O calor só reordena o que a linha aprovou.** Imigração, notícia
ruim dos EUA e o que a guarda recusa continuam fora; nada na linha mudou.

**Três medições que viraram regra:**

- **O vetor é do título, e não o gravado.** `news_candidates.embedding` só
  existe para a aprovada (36 de 1.010 nas últimas 48h). Para contar quem mais
  cobriu o fato, as matérias do dia (todas, aprovadas ou não) ganham vetor do
  título, alguns centavos de centavo por dia, com memória no processo. No vetor
  só do título o 0.70 é mais severo: a faixa 0.65 a 0.70 é quase toda o mesmo
  fato. Ficou 0.70; baixar é decisão do dono.
- **A fama passa pela busca da Wikipédia, e não pela do Wikidata.** O
  classificador escreve "Trump" (210 vezes na semana) e "Lula" (100). A busca
  do Wikidata devolve o sobrenome Trump (6 Wikipédias) e a lula, o molusco
  (94); a busca de texto da Wikipédia em português devolve Donald Trump (266),
  Lula da Silva, Flávio Bolsonaro e Alexandre de Moraes. O título achado
  precisa ter uma palavra do nome ("Neko Health" achava "Gato").
- **Fama é de pessoa ou organização.** Sem isso, "Virgínia Ocidental" (192)
  virava o famoso de uma pauta de indenização. Vale ser humano (Q5), ou ter
  sede (P159) ou setor (P452).

**Onde entra.** No Instagram, ANTES dos finalistas (`ciclo-do-dia.ts`), porque
é a ordem do pool que decide quem é verificado. Na newsletter, só a ABERTURA:
as pautas são as mesmas da seleção, e a mais quente passa para o topo
(`liderPeloCalor`); empate fica com a de cima.

**Atrás de `settings.capacidades.calor`, sem fallback de ambiente.** Ausente
ou `off`: nenhuma chamada sai, o dia é o de antes. `dry_run`: calcula e grava
em `platform_events` (`calor_da_selecao`) o calor de cada pauta, a ordem e o
feed que `comporFeedSocial` montaria com e sem calor, e a abertura que a
newsletter teria; a seleção não muda. `enforce`: a nota leva o calor. Toda
fonte de sinal que falha vira aviso e vale zero; nada aqui derruba o dia.

**Ensaio sem gravar:** `npx tsx src/scripts/ensaiar-calor.ts 48` lê as
aprovadas das últimas 48h e imprime as duas ordens. No de 06/10/2026, "Inside
Trump's new AI playbook" subiu de 30º para 12º, o Ibovespa acima de 200 mil
pontos de 32º para 16º, e "Mortgage rates today" desceu de 14º para 26º.

**A Folha chegava com os acentos quebrados**, achado na mesma auditoria: o feed
declara ISO-8859-1 e a coleta lia UTF-8. `textoDoFeed`, em `collector.ts`,
decodifica pelo charset do cabeçalho, depois o do XML, depois UTF-8.

**A foto e a voz já estavam prontas para isso.** O resolvedor prefere pessoa,
depois organização, depois lugar, pela centralidade (`entidade-visual.ts`,
`centralidade.ts`), e busca o retrato da entidade no Commons; os cinco textos
editoriais aprovados em 06/10 já pedem ator, verbo e fato. O que faltava era a
seleção entregar a eles a pauta com gente no centro.

### Fontes quentes propostas, desligadas

Em `supabase/2026-10-06-fontes-quentes.sql`, para o dono rodar. Entram com
`enabled = false`: o pool já tinha as histórias quentes e a linha as recusou,
então fonte nova sem decisão de linha só paga classificação de mais recusa. O
arquivo traz, comentados, o primeiro grupo a ligar (negócio e tecnologia dos
EUA, mercado brasileiro), o segundo (política brasileira, só com decisão do
dono) e o desligamento das buscas fixas do Google News (248 candidatas por dia,
zero aprovadas). Reuters (sem RSS), AP (403), as seções de Axios, CNN Brasil e
InfoMoney (404 ou vazias), Metrópoles, Yahoo Finance, Forbes Brasil, ABC e
Guardian US ficaram de fora, com o motivo no arquivo.

```sql
insert into public.project_news_sources
  (project_id, source_key, name, company_name, type, url, enabled, priority, category, region, keywords)
select p.id, v.source_key, v.name, v.company_name, 'rss', v.url, false, v.priority, v.category, v.region, '{}'::text[]
from public.projects p
cross join (values
  -- EUA: negócios, tecnologia e política com gente conhecida no centro
  ('cnbc-politics', 'CNBC, política', 'CNBC', 'https://www.cnbc.com/id/10000113/device/rss/rss.html', 1, 'politica', 'eua'),
  ('cnbc-technology', 'CNBC, tecnologia', 'CNBC', 'https://www.cnbc.com/id/19854910/device/rss/rss.html', 1, 'tecnologia', 'eua'),
  ('cnbc-markets', 'CNBC, mercados', 'CNBC', 'https://www.cnbc.com/id/15839069/device/rss/rss.html', 2, 'economia', 'eua'),
  ('fortune', 'Fortune', 'Fortune', 'https://fortune.com/feed/fortune-feeds/?id=3230629', 2, 'economia', 'eua'),
  ('business-insider', 'Business Insider', 'Business Insider', 'https://feeds.businessinsider.com/custom/all', 2, 'economia', 'eua'),
  ('semafor', 'Semafor', 'Semafor', 'https://www.semafor.com/rss.xml', 2, 'politica', 'eua'),
  ('fox-business', 'Fox Business', 'Fox Business', 'https://moxie.foxbusiness.com/google-publisher/latest.xml', 2, 'economia', 'eua'),
  ('politico-top', 'Politico, manchetes', 'Politico', 'https://rss.politico.com/politics-news.xml', 2, 'politica', 'eua'),
  ('nyt-politics', 'New York Times, política', 'The New York Times', 'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml', 2, 'politica', 'eua'),
  ('nyt-technology', 'New York Times, tecnologia', 'The New York Times', 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml', 2, 'tecnologia', 'eua'),
  ('wapo-business', 'Washington Post, negócios', 'The Washington Post', 'https://feeds.washingtonpost.com/rss/business', 2, 'economia', 'eua'),
  ('wapo-politics', 'Washington Post, política', 'The Washington Post', 'https://feeds.washingtonpost.com/rss/politics', 2, 'politica', 'eua'),
  ('bbc-business', 'BBC, negócios', 'BBC', 'https://feeds.bbci.co.uk/news/business/rss.xml', 2, 'economia', 'global'),
  ('bbc-us-canada', 'BBC, EUA e Canadá', 'BBC', 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml', 2, 'politica', 'eua'),
  -- Brasil: mercado, dólar e a relação com os EUA
  ('bloomberg-linea-br', 'Bloomberg Línea Brasil', 'Bloomberg Línea', 'https://www.bloomberglinea.com.br/arc/outboundfeeds/rss/?outputType=xml', 2, 'br_media', 'br'),
  ('estadao-economia', 'Estadão, economia', 'Estadão', 'https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/economia/', 2, 'br_media', 'br'),
  ('estadao-politica', 'Estadão, política', 'Estadão', 'https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/politica/', 2, 'br_media', 'br'),
  ('estadao-internacional', 'Estadão, internacional', 'Estadão', 'https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/internacional/', 2, 'br_media', 'br'),
  ('cnn-brasil', 'CNN Brasil', 'CNN Brasil', 'https://www.cnnbrasil.com.br/feed/', 2, 'br_media', 'br'),
  ('poder360', 'Poder360', 'Poder360', 'https://www.poder360.com.br/feed/', 2, 'br_media', 'br'),
  ('folha-poder', 'Folha de S.Paulo, Poder', 'Folha de S.Paulo', 'https://feeds.folha.uol.com.br/poder/rss091.xml', 2, 'br_media', 'br'),
  ('folha-tec', 'Folha de S.Paulo, tecnologia', 'Folha de S.Paulo', 'https://feeds.folha.uol.com.br/tec/rss091.xml', 2, 'br_media', 'br'),
  ('g1-tecnologia', 'G1 Tecnologia', 'G1', 'https://g1.globo.com/rss/g1/tecnologia/', 2, 'br_media', 'br'),
  ('exame', 'Exame', 'Exame', 'https://exame.com/feed/', 2, 'br_media', 'br'),
  ('valor-empresas', 'Valor Econômico, empresas', 'Valor Econômico', 'https://pox.globo.com/rss/valor/empresas/', 2, 'br_media', 'br'),
  ('valor-financas', 'Valor Econômico, finanças', 'Valor Econômico', 'https://pox.globo.com/rss/valor/financas/', 2, 'br_media', 'br'),
  ('neofeed', 'NeoFeed', 'NeoFeed', 'https://neofeed.com.br/feed/', 2, 'br_media', 'br')
) as v(source_key, name, company_name, url, priority, category, region)
where p.slug = 'desbuguei'
  and not exists (
    select 1 from public.project_news_sources s
    where s.project_id = p.id and s.source_key = v.source_key
  );
```

### O que fica para o dono

- **A repetição do Instagram não é conferida.** A guarda confere a repetição
  contra o histórico da newsletter, e `editorial_history` não tem nenhuma linha
  de Instagram desde 20/09. É por isso que 21 dos 60 posts repetem história de
  ontem. Consertar antes de pôr o calor em `enforce`, senão a pauta quente de
  ontem volta hoje.
- **As perguntas de linha** (política brasileira, geopolítica, citação de
  famoso, esporte como negócio, o limiar de 0.65, publicar no dia do fato)
  estão no fim da auditoria, com a recomendação de cada uma. Nenhuma foi
  mudada no código.

ATUALIZADO no mesmo dia: a repetição do Instagram foi consertada em
`fix/repeticao-no-instagram` (ver "O feed repetia a pauta de ontem" em
`aprendizados-e-incidentes.md`), e o dono decidiu as perguntas de linha. Ver
"A linha quente: as decisões do dono sobre a notícia quente".

## A linha quente: as decisões do dono sobre a notícia quente (06/10/2026)

O dono aprovou as nove recomendações do fim da auditoria
(`docs/auditorias/noticia-quente-2026-10-06.md`), com UMA mudança na primeira:
a política brasileira entra inteira, inclusive notícia e bastidor de campanha,
e não só quando mexe com o dólar. Nas palavras dele: "acho que podemos colocar
fofoca de campanha também por enquanto pois é política agora no Brasil,
segundo turno etc". Isso muda, por enquanto, a frase "notícia positiva dos EUA
e notícia ruim do Brasil": a política brasileira entra em qualquer tom.

**A linha mora num lugar só, e o recorte do dono é contrato, não texto do
painel.** `editorial/linha-editorial.ts` ganhou `regraDoRecorte(linha)`, que o
classificador e o verificador leem, DEPOIS da régua de relevância editável e
dizendo que vale sobre ela. Não passa pelo painel porque cada regra tem um
campo do schema ou um ramo de `decidirPauta` que depende dela; o projeto está
com `instrucoes` em `enforce`, e um texto do painel que contradissesse o
código seria a recusa silenciosa de 23 a 28/09 outra vez. O modo do projeto
mora em `editorial/linha-do-projeto.ts` (sem os textos, para a config não
arrastar o contexto das instruções).

| decisão | como ficou |
|---|---|
| 1. Política brasileira e eleição entram, campanha inclusive | `settings.linha.politica_brasileira`: `"eleicao"`, `"so_mercado"` ou `"fora"`. Ausente ou torto vale `so_mercado`, que é a linha de antes byte a byte na decisão. Em `eleicao`, `decidirPauta` aprova com `APPROVED_BRAZIL_POLITICS` a pauta marcada como política brasileira (campo novo `politica_brasileira`, ou país Brasil com eixo `politica`), em qualquer tom e qualquer país (Trump comentando o segundo turno sai "EUA"), e a fala dela não tem o teto de declaração. O verificador do Instagram é avisado de que, na abertura, a fala de candidato é adequada |
| 2. Geopolítica do mundo fora, salvo com os EUA como ator | Regra no prompt: sem os EUA no centro, país "outro" e relevância 0; "outro" já era recusado |
| 3. Citação de famoso entra, como formato | Campos novos `citacao_de_famoso` e `quem_fala`. CEO, bilionário, chefe de governo ou de banco central falando de economia, trabalho, tecnologia, mercado ou os EUA, com o nome de quem fala: sem teto de declaração, motivo `APPROVED_FAMOUS_QUOTE`. Literal: o pacote factual extrai as falas entre aspas e o código guarda só as que estão no texto de origem (`citacoesLiterais`); a ancoragem bloqueia fala de 5 palavras ou mais entre aspas que não esteja no texto, num original ou numa tradução conferida. Atribuída: `SOCIAL_REJECT_QUOTE_ATTRIBUTION` quando o post não nomeia quem falou. Foto: quem fala vai à frente dos atores que o resolvedor procura (`atoresParaAFoto`) |
| 4. Esporte só como negócio, audiência ou recorde | Regra no prompt: placar, resultado, classificação, escalação e lesão valem 0 |
| 5. Notícia ruim dos EUA e imigração continuam fora | Inalterado em `decidirPauta`, e as duas recusas vêm ANTES da abertura eleitoral e da citação: nenhum modo as abre |
| 6. Limiar de 0.65 para contar veículos no calor | `LIMIAR_DE_VEICULOS_DO_CALOR` em `calor.ts` (ambiente `CALOR_LIMIAR_VEICULOS`). Só a contagem de veículos do calor; o agrupamento do dia (0.70) e a repetição histórica (0.85) não mudaram |
| 7. Publicar a notícia quente no mesmo dia | Ciclo da tarde, só do Instagram (`social/quente-da-tarde.ts`, rota `/api/cron/quente-da-tarde`), atrás da capacidade própria `quente_da_tarde` |
| 8. Buscas do Google News | mantidas ligadas, por decisão do dono |
| 9. Ligar as fontes quentes dos grupos 1 e 2 | SQL, ver abaixo |

**A abertura eleitoral é TEMPORÁRIA.** Para fechar depois do segundo turno, o
dono troca o modo no projeto, e nada mais precisa mudar:

```sql
update public.projects
set settings = jsonb_set(settings, '{linha,politica_brasileira}', '"so_mercado"'), updated_at = now()
where id = '00000000-0000-4000-8000-000000000001';
```

O modo entra no texto do prompt, e por isso na assinatura da classificação
persistida e na impressão da régua do verificador: abrir ou fechar reclassifica
as candidatas da janela e reverifica as finalistas, em vez de reaproveitar o
veredito da régua anterior. O teto de política brasileira do feed
(`SOCIAL_MAX_POLITICA_BR`, 2 por dia) e o de pautas do Brasil na newsletter
(`EDITORIAL_MAX_PAUTAS_BRASIL`, 1) continuam valendo: a eleição entra, e não
ocupa o feed inteiro.

**O ciclo da tarde.** A causa do "frio" medida na auditoria era o tempo: 31
horas de mediana da fonte ao post. Às 15:30 (hora do projeto, editável em
`settings.quente_da_tarde.horario`), o ciclo coleta de novo, passa pela mesma
guarda (a classificação da manhã é reaproveitada pela assinatura), calcula o
calor, fica com as pautas publicadas na fonte nas últimas 10 horas e com calor
35 ou mais, e manda ao ciclo social de sempre com a grade reduzida às vagas
livres de hoje: horário do Instagram que ainda não passou, sem post a menos de
45 minutos, e não mais que o que sobra do teto do dia nem que 2 posts. O
histórico do feed é lido INCLUINDO hoje, para o post da manhã não voltar à
tarde com outra manchete; a fila de aprovação, a regra da foto e a
idempotência por pauta e acontecimento são as do ciclo social. Dia que o
Instagram não publica na cadência, nada. Em `dry_run` o social roda em ensaio
(nenhuma linha em `social_posts`); todo desfecho, inclusive "sem vaga" e "nada
quente", vai para `platform_events` (`quente_da_tarde`). A busca dinâmica do
Google News não entra na coleta da tarde: a tendência chega pelo calor.

A linha do crontab (VPS, usuário `deploy`), com o segredo redigido:

```
*/15 * * * * /usr/bin/curl -fsS -m 60 -X POST -H "Authorization: Bearer SEU_CRON_SECRET" "https://casaloti.ia.br/api/cron/quente-da-tarde?relogio=1" >> /home/deploy/quente-da-tarde-cron.log 2>&1
```

Com a capacidade em `off` a rota responde sem fazer nada, então a linha pode
entrar antes de a capacidade ser ligada.

**A ordem de ligar.** `supabase/2026-10-06-linha-quente.sql`, um arquivo,
uma transação, idempotente: política brasileira em `eleicao`, `calor` e
`quente_da_tarde` em `dry_run` (com a configuração da tarde explícita), as 27
fontes quentes inseridas com os grupos 1 e 2 ligados (as 14 responderam HTTP
200 com XML em 06/10/2026), com uma conferência no fim. As buscas do Google
News, fixas e de tendência, continuam ligadas por decisão do dono (06/10/2026),
apesar da medição abaixo. Depois de uns dias lendo `calor_da_selecao` e
`quente_da_tarde`, `enforce`.

**As buscas de tendência do Google News não dão para medir em separado.** A
candidata não grava de que busca veio (`source_key` nulo nas 3.857 da semana).
O que se mede: 1.734 candidatas do Google News em 7 dias, fixas e de tendência
juntas, nenhuma aprovada, e as 361 que passaram da linha morreram em poucos
fatos ou fonte não resolvida, porque o link do agregador não chega à matéria.
A recomendação era desligar as fixas e as de tendência; o dono decidiu manter
as duas (06/10/2026).

**Ensaio sem gravar, 48 horas de candidatas** (`npx tsx
src/scripts/ensaiar-linha-quente.ts`): 555 candidatas fora do Google News,
reclassificadas no modo `eleicao`. Antes, 36 aprovadas; com a linha nova, 184.
É a decisão da LINHA, antes de a guarda buscar a matéria e conferir a
repetição: parte das novas ainda cairia por poucos fatos ou por repetida, como
cairia hoje.
Das 153 novas, 85 são política brasileira (o primeiro turno inteiro: Flávio à
frente de Lula, a bancada feminina recorde, Erika Hilton, Nikolas, a abstenção
recorde, o mercado reagindo, Trump e Milei comentando), 4 são citação de
famoso (Bessent, Sam Altman, o CEO da Hyundai, Trump) e 56 são dos EUA. As 56
foram reclassificadas também com o prompt ANTERIOR, com o mesmo texto: 34
aprovam igual, então são a diferença entre o resumo do feed e a releitura com
a matéria que a produção fez, e não a linha nova. Imigração: 13 recusadas,
nenhuma aprovada; notícia ruim dos EUA: 65 lidas como desfavoráveis, nenhuma
aprovada. Esporte: nenhum placar aprovado. O verificador do Instagram
confirmou 8 de 8 das novas de política com texto, e recusou 8 sem texto (o
ensaio não enriquece a matéria; a produção sim). O ensaio mostrou que a régua
da eleição vazava para a campanha dos EUA, e o bloco ganhou a linha "a
abertura é SÓ para a política do Brasil". Custo: US$ 1,86 na estimativa do
código.

## A legenda do Instagram no método do Not Journal, e duas regras do dono (06/10/2026)

O dono mandou sete legendas reais do Not Journal (Flávio e o dólar, Moraes e
Débora, a frase de Bezos, o apoio de Temer, Sicario 3, Trump e a peste na
Rússia, os 670 bancos da China) e pediu a legenda nesse padrão. Amostras com
pautas reais, lado a lado com a legenda de antes, em
`docs/design/legenda-not-journal-2026-10-06/amostras.md`.

### As duas REGRAS, que não são opção

**1. O crédito da foto é uma linha curta, a última da legenda, e a arte do
Instagram não tem crédito nenhum.** A regra chegou em duas versões no mesmo
dia. A primeira, com as palavras do dono: "não quero que fique colocando
crédito na descrição do instagram, não precisa. isso não é uma opção, é uma
regra". Horas depois ele a trocou pela que vale: o crédito fica na legenda,
junto da obra, na forma curta, e a tira sai da arte para toda licença.

- Formato: depois do corpo, uma linha em branco, "Siga @eua.journal" e, na
  linha de baixo, "Foto: Daniel Torok". A sigla da licença vai entre
  parênteses só quando a licença exige mais que o nome (CC BY, CC BY-SA):
  "Foto: Gage Skidmore (CC BY-SA 4.0)". Pexels, Unsplash, CC0 e domínio
  público: só o nome. Várias fotos (carrossel, bolha): "Fotos: A, B e C", sem
  repetir, até três nomes e depois "e outros".
- Sem autor conhecido, sem linha. Nunca "Foto: desconhecido". Nada de "via
  Wikimedia Commons", link, "Licença Pexels" ou texto jurídico.
- ATUALIZADO em 06/10/2026, à noite, por escolha explícita do dono depois de
  ler a fila de 07/10: a linha leva SÓ o nome de quem fez a foto, e a sigla
  de licença saiu. "Fotos: Lucio Bernardo Jr./Câmara dos Deputados (CC BY) e
  Leonardo Prado/Câmara dos Deputados (CC BY)" virou "Fotos: Lucio Bernardo
  Jr. e Leonardo Prado". Ver "As regras do dono depois da fila de 07/10".
- O ÚNICO crédito é o que o código monta (`linhaDeCredito`, em
  `social/legenda-final.ts`) a partir do autor e da licença gravados no asset
  de cada foto que foi ao ar. Qualquer outra linha com cara de crédito, em
  qualquer lugar do corpo, sai (`fecharLegenda`), inclusive a que um modelo,
  uma instrução antiga ou uma edição à mão escrever.
- O registro completo continua no post: `content_json.visual` (autor,
  licença, URL, atribuição), mais `creditoNaLegenda` e `creditosDasFotos`.
  `atribuicaoImpressa` é sempre falso, porque a arte não imprime.
- **Isto substitui, para o Instagram, a lição de 06/09 "requisito de licença é
  requisito de RENDER"** (`aprendizados-e-incidentes.md`). O raciocínio do
  dono: o crédito na legenda, junto da obra e na forma curta, é a atribuição
  razoável que a licença pede numa rede social, e a tira sobre a foto só
  disputava a peça. Portal e newsletter continuam com o crédito deles, sem
  mudança.

**2. A legenda SEMPRE fecha com "Siga @eua.journal"**, depois de uma linha em
branco, uma vez só. O handle sai de `MARCA.instagramHandle`, nunca escrito à
mão. Abaixo dele, só a linha do crédito.

As duas são CÓDIGO, não prompt: `fecharLegenda` é o último passo de todo
caminho que grava `social_posts.caption` no Social V2 (a guarda, o ciclo, o
store, a refação do texto na fila e a edição à mão no painel), é idempotente,
e vale mesmo com uma versão antiga da instrução ativa no banco.

### O que saiu da legenda junto

**O convite "Comente NEWS".** O fecho da legenda é o "Siga". O funil de
comentário continua onde ele mora: a automação do OpenReply escuta o
comentário em qualquer post, e o último slide do carrossel continua dizendo
"Comente NEWS e receba o link" quando há keyword escutada. Na peça única,
nada mais convida a comentar; quem comentar a palavra continua recebendo o
Direct. `copy.cta` continua sendo calculado, porque é ele que desenha o slide
do convite. Isto atualiza "O CTA do Instagram oferece a NEWSLETTER" (em
"Cadência e canais") para a LEGENDA: ela não oferece nada além de seguir.

**A hashtag, por padrão.** O Not Journal não usa nenhuma. O código continua
inteiro e liga com `settings.instagram.hashtags = true` no projeto: aí as
hashtags da pauta entram num bloco logo ANTES do fecho. Desligado, a falta de
hashtag deixou de ser problema na guarda e na edição à mão.

### O padrão da legenda

- Abre direto no lide, em uma ou duas frases: ator, verbo, fato e quando, com
  o número exato. Sem saudação, sem pergunta, sem emoji, hashtag, link ou "Leia
  mais".
- Depois, de 2 a 5 parágrafos curtos (de 2 a 4 frases), cada um com UMA camada:
  números e detalhe; quem disse o quê, com a atribuição na frase ("segundo o
  TSE"); histórico; leitura de especialista ou de mercado com dono; o que segue
  em aberto. Pacote fino dá menos parágrafos, nunca enchimento.
- Registro de jornal, neutro, em terceira pessoa (saiu o "fale com a pessoa"
  da voz social); de 120 a 300 palavras; conta MAIS que a capa e os slides e
  não repete a manchete. Vale para a peça única e para o carrossel.
- O contrato do JSON ganhou `paragrafos` (lista). Os campos antigos
  (`fato_principal`, `contexto`...) continuam no schema e só montam a legenda
  quando a lista vem vazia, que é o que uma instrução antiga ativa produz.

### O que a guarda confere, em código

- **Forma** (`conferirFormaDaLegenda`, motivo `SOCIAL_REJECT_CAPTION_SHAPE`,
  reparável): lide de até 2 frases e 70 palavras, sem pergunta nem saudação;
  até 5 parágrafos depois dele, cada um com até 5 frases e 95 palavras; teto de
  340 palavras no corpo; manchete de 8 palavras ou mais repetida palavra por
  palavra; emoji; link. Os tetos têm folga sobre o alvo do prompt, e não há
  piso, pela regra do "nunca enchimento".
- **O quando** (`conferirDiasDaSemana`): "na segunda-feira (5)" tem de bater
  com o calendário dos últimos oito dias, que o prompt recebe pronto, E ser um
  dia que o material nomeia ou a data de publicação da fonte. Nas amostras o
  modelo pôs o dia em que escrevia em três pautas que não diziam dia nenhum.
  O par válido sai do texto que vai para a ancoragem, porque o "(5)" é do
  calendário e não do pacote.
- **A atribuição** (`atribuicoesDaLegendaSemLastro`, motivo
  `SOCIAL_REJECT_CAPTION_ATTRIBUTION`): "segundo X" com X nome próprio tem de
  existir no pacote ou ser o veículo; quando é o veículo e o número da frase
  só aparece no pacote com outro dono ("according to the city"), é o defeito
  da matéria de Chicago e volta para reescrita. Com várias fontes no pacote,
  vale a régua da matéria do portal (`atribuicaoSemLastro`).
- A ancoragem de número e nome contra o pacote continua a de sempre.

### As instruções no banco

Os padrões do código mudaram em `social_copy` (a legenda) e `voz_social` (o
registro). `carrossel_copy` não mudou: a orientação da legenda do carrossel
mora no contrato, no código, e vale com o deploy. Para as versões ativas do
banco acompanharem, o dono roda, depois do deploy,
`npx tsx src/scripts/salvar-instrucoes.ts --aplicar` (só grava o que mudou;
`--reverter` volta uma leva por vez). As duas regras acima não dependem disso.

## A fila mostra a peça, e não o resumo dela (06/10/2026)

O dono abriu a fila com as peças do dia e achou confusa: uma coluna só
misturando os canais; a matéria e a newsletter mostradas pelo pacote factual
(os fatos brutos, e não o texto); avisos com código cru ("AVISO_DO_RAMO:
APAGADO pergunta.3: previsao sem lastro") em caixa vermelha; nenhum post; e uma
matéria "aprovada" com só "Cancelar peça", que já estava no ar. Ao aprovar,
"Esta peça tem aviso de QA" foi lido como Q&A, o bloco de perguntas e
respostas, como se ele fosse entrar no texto. Capturas em
`docs/design/aprovacao-2026-10-06/`.

**Aprovar é aprovar o que vai ao ar, então o cartão mostra o que vai ao ar.**
A newsletter é a linha da caixa de entrada (assunto e pré-cabeçalho) e o HTML
gravado em `news_editions.content_html`, o mesmo que a liberação entrega ao
Listmonk e que entra no hash, num iframe sem script
(`/api/admin/aprovacao/previa`). A matéria é desenhada por `PaginaDaMateria`,
o MESMO componente da rota pública, a partir da linha em qualquer status, só
com a sessão do painel (`/admin/<projeto>/aprovacao/previa/<id>`; com
`?moldura=0` sem cabeçalho e rodapé do portal, para a prévia embutida). O post
são as telas congeladas, na ordem do hash, e a legenda com as quebras de
linha. O pacote factual continua, recolhido e por último. Nada disso remonta a
peça: uma prévia que redesenha seria aprovar uma coisa parecida com o que sai.

**Um canal por aba, e a situação junta a fila com a tabela da peça**
(`situacao.ts`). "No ar" vence o estado da fila: no ensaio a peça sai no
horário dela, e o cartão dizia "aprovada" ou "aguardando" de uma matéria
publicada. Os botões espelham o que o servidor aceita: peça no ar não se
edita nem se cancela; no ensaio, a que saiu sem decisão ainda pode ser
aprovada ou reprovada, porque a decisão ensina o canal. Quando a linha não é
mais a versão que entrou na fila (`hashConfere`), o cartão diz isso antes do
clique, e o botão de aprovar some. Medido em 06/10: o HTML da matéria do
diesel mudou nove segundos depois de entrar na fila, com título e capa
iguais; a causa não foi achada, e em `enforce` essa matéria ficaria segurada.

**Aviso tem frase e gravidade** (`avisos-legiveis.ts`). `resolvido` é o que a
máquina já tratou (trecho apagado pela poda, assunto descartado, pauta
retirada, texto reescrito): informação, recolhida. `confira` é o que pede o
olhar do dono (risco de fato inventado, nome que não está na fonte, auditoria
que não rodou, apontamento da guarda do post). Só `confira` pede confirmação
ao aprovar, e a confirmação diz que aprovar publica a peça como está e que
nada da lista entra nela. Formato sem tradução cai em `confira`, com o texto
cru. O código e o texto gravado ficam em "detalhes técnicos".

**O lote não mudou de regra**, só de nome: "Aprovar todas as N matérias sem
aviso", e ele continua deixando de fora toda peça com aviso, inclusive o
resolvido (RF-21). A confirmação diz quantas ficam de fora.

**Por que não havia post (06/10/2026).** Não era a fila: nenhum post foi
gravado em `social_posts` nesse dia. O ciclo do Instagram das 06:11 conferiu 7
pautas e terminou com `selected: 0, scheduled: 0`, sem custo de redação de
post. O único caminho que corta tudo entre a composição e a redação é o
bloqueio da composição (`SOCIAL_PERSISTENCE_UNAVAILABLE`, persistência de
candidatas degradada), e ele não era gravado. Agora o diagnóstico grava
`bloqueio`, `escolhidasNaComposicao` e a liberação do enforce, e a aba vazia
do Instagram explica o dia com o registro mais recente
(`dia-do-instagram.ts`). Com o post gravado, o ensaio já o enfileirava.

**O painel mostra três dias de histórico** além do que está aberto
(`recentes`, opcional no store): aprovadas, reprovadas, canceladas e
publicadas, para os filtros. O relógio da fila continua lendo só `abertas`.

## Os bancos de imagem oficiais (06/10/2026)

O pedido do dono: mais bancos de foto, sobretudo brasileiros, porque a linha
passou a ter política brasileira (ano de eleição) e gente conhecida. O Commons
tem do Flávio Bolsonaro, quando tem, a foto de 2019; a Câmara e o Senado o
fotografam toda semana. O código mora em `src/lib/server/visual/bancos-oficiais/`.

**A pesquisa, banco a banco, com o agente honesto (`eua.journal/1.0`).** Entra
só banco cuja licença permite uso COMERCIAL com crédito, conferida na página da
própria foto ou do próprio banco, e que responde ao agente declarado. A conta é
comercial: o feed tem CTA de produto.

| banco | licença | crédito | acesso | entrou? |
|---|---|---|---|---|
| Câmara dos Deputados (banco de imagens) | CC BY, no rodapé da página de busca | "Nome/Câmara dos Deputados" | HTML da busca, sem API; robots livre | sim |
| Agência Senado (www12.senado.leg.br/fotos) | a da foto no Flickr: CC BY-SA 4.0 em 2025 e 2026, CC BY 2.0 de 2015 a 2023, CC BY-NC numa de 2013 | "Nome/Agência Senado" | proxy JSON do próprio Senado sobre a API do Flickr, sem chave | sim, com a licença lida foto a foto |
| Casa Branca (galerias do whitehouse.gov) | domínio público do governo; terceiro é CC BY 3.0 | "Official White House Photo by Nome", na legenda | mapa de galerias e HTML; sem API, busca interna proibida no robots | sim, só a foto assinada pelo fotógrafo oficial |
| Federal Reserve (photogallery.htm) | domínio público salvo indicação; "Photo Credit" de terceiro fica fora | "Federal Reserve" | uma página HTML, sem robots | sim |
| NASA (images-api.nasa.gov) | não protegida; uso editorial sem sugerir endosso | "NASA/Nome" | API pública sem chave | sim |
| Palácio do Planalto (Flickr) | CC BY 2.0 até 2023, pelos registros do Commons; o atual não deu para conferir | "Nome/Palácio do Planalto" | o robots do flickr.com proíbe tudo fora da API | com `FLICKR_API_KEY` |
| STF (Flickr) | Public Domain Mark nas de 2026, pelos registros do Commons | "Nome/STF" | idem; o portal do STF dá 403 ao agente | com `FLICKR_API_KEY` |
| Agência Brasil (EBC) | NÃO é CC BY: "© Todos os direitos reservados pela EBC"; reprodução autorizada para fim jornalístico, e "redes sociais aliadas a produtos" pedem licenciamento | "Nome/Agência Brasil" | HTML; o original tem proteção de hotlink (403 sem Referer) | NÃO |
| Fiocruz Imagens | 7.290 de 7.303 itens CC BY-NC | | API Omeka S | NÃO (não comercial, e acervo de saúde) |
| Agência Gov | portal de notícia, sem banco de fotos nem crédito estruturado | | robots proíbe busca | NÃO |
| Library of Congress | | | 403 do Cloudflare ao agente | NÃO |
| senate.gov, bioguide | | | 403 do Akamai; robots `Disallow: /` | NÃO |
| Congress.gov (API) | "Courtesy of the Member", não é licença | | chave do api.data.gov | NÃO (175x219, e sem licença) |
| retratos oficiais da Câmara e do Senado (dados abertos) | termos gerais das casas | | JSON sem chave | NÃO por ora: 354x472 e 480x600, abaixo dos 800 px |
| DVIDS (Defesa) | domínio público, uso comercial liberado nos termos da API | "U.S. Army photo by ..." | API com chave gratuita | fica para quando houver chave |

**A Agência Brasil fica de fora, e é decisão de licença, não de técnica.** O
pedido citava "Creative Commons com crédito", e não é o que a página diz hoje.
O caminho é o dono escrever para licenciamento@ebc.com.br; com licença por
escrito, o adaptador é pequeno (busca HTML, crédito em `div.credito-foto`), mas
precisa mandar o Referer da página para baixar o original, e o portal, que
carrega a capa direto do host, levaria 403.

**O que muda no resolvedor, e o que NÃO muda.**

- **Pela entidade, antes do Commons na ordem de conferência.** Pessoa e
  instituição pública consultam os bancos (o do país da pauta primeiro, e o
  outro também: o Lula da pauta americana é foto do Brasil). As fotos entram na
  MESMA fila do Commons, da fonte oficial e do Openverse, com a mesma
  pontuação, piso de identidade, régua de país, temporalidade, figura não
  central e conferência visual. O que muda é QUEM é aberto primeiro:
  `oficiaisPrimeiro` põe na frente, até três, as fotos de banco cuja LEGENDA
  nomeia a entidade, da mais recente para a mais antiga. A pessoa como ela está
  hoje.
- **A identidade vem da legenda, nunca da busca.** O banco devolve para "Lula"
  a foto do ministro que "se reuniu com Lula", o deputado Lula da Fonte e o
  fotógrafo Lula Marques; para "Tarcísio", o deputado Tarcísio Motta; para
  "Vance", na NASA, o astronauta Vance Brand. Duas réguas, e as duas valem.
  `legendaCita` exige o nome com fronteira de palavra, aceita o apelido de uma
  palavra só quando o que vem depois não é outro sobrenome, e aceita cargo mais
  sobrenome ("Chairman Warsh", "presidente Lula"). `protagonistaDaLegenda`
  exige que a entidade seja a PRIMEIRA pessoa que a legenda nomeia, depois de
  tirar os trechos de assunto ("sobre", "envolvendo", "contra", "about"): a
  legenda de agência abre por quem está na foto, e cita o tema da pauta também.
  E foto de grupo não é retrato de ninguém: legenda com lista ("Mesa:",
  "Participam:", "da esquerda para a direita") ou com três pessoas nomeadas ou
  mais não prova a pessoa (`fotoDeGrupo`). O pedido é a pessoa como assunto
  claro da foto, e a mesa de sete da posse não é o Fachin.
  Foto de banco de PESSOA que não passa nas duas sai da fila
  (`NON_CENTRAL_PUBLIC_FIGURE`), porque pela pontuação ela ainda passaria. A
  que passa ganha o nome resolvido em `metadata.categorias`, que é onde a
  pontuação procura. O caso que fez a régua: ver "A legenda citava o Moraes,
  e a foto era de um senador" no `aprendizados-e-incidentes.md`.
- **A vice da bolha e a busca extra da bolha** usam a mesma fila, com as
  oficiais na frente e o piso de identidade de sempre.
- **Na escada da cena**, no degrau `editoria` e só em pauta de governo do
  Brasil ou dos EUA, os bancos do país entram com o lugar (a fachada do
  Congresso, a Esplanada, a Casa Branca, o prédio do Fed). A conferência
  continua recusando pessoa identificável, então o plenário cheio cai.
- **Com os bancos ligados, a biblioteca só devolve na hora a foto que veio de
  banco oficial.** A do Commons guardada antes volta pela busca, mas não passa
  na frente por ter chegado primeiro.
- **A memória de 30 dias, a do dia e as regras de rosto da bolha** são as de
  sempre: a foto de banco é um `AssetVisual` como qualquer outro.

**O registro e o crédito.** `source = "banco_oficial"`, e em `metadata`: o
banco, o nome dele, o autor, a licença como o banco a declara, a página, a
data, a legenda e o crédito curto. O `attribution` é o crédito no formato do
dono, "Foto: Marcelo Camargo/Agência Brasil" (aqui, "Foto: Kayo
Magalhães/Câmara dos Deputados" ou "Foto: Daniel Torok/Casa Branca"), SEMPRE,
inclusive no domínio público americano, que não exige: foto de agência oficial
sem o nome de quem fez parece apropriada. Na legenda do Instagram quem monta a
linha é `linhaDeCredito` (`social/legenda-final.ts`, da frente da legenda no
método do Not Journal; ATUALIZADO na mesma noite: na legenda do Instagram
ficou SÓ o nome do fotógrafo, sem o banco e sem a sigla, por escolha do dono,
e o "Nome/Banco" continua em `asset.attribution` e no portal; ver "As regras
do dono depois da fila de 07/10"): para foto de banco ela usava o autor COM o banco
(`autorComBanco`), porque a CC BY da Câmara exige "Nome do Fotógrafo/Câmara dos
Deputados", e mantém a regra dela de pôr a sigla só onde a licença pede
("Foto: Kayo Magalhães/Câmara dos Deputados (CC BY)"; "Foto: Jonas
Pereira/Agência Senado (CC BY-SA 4.0)"; "Foto: Daniel Torok/Casa Branca"). O
filtro que tira crédito com "/" de outra origem deixa passar "/" mais o nome
de um banco da lista (`NOMES_DOS_BANCOS`), e o teste confere que todo banco do
registro está nela. No portal, o crédito da capa usa o banco como origem.

**CC BY-SA na peça.** A Agência Senado publica em CC BY-SA 4.0 desde 2025, e a
arte do post é obra derivada (recorte e texto por cima). A allowlist já aceita
BY-SA desde a fase 2, para o Commons; o compartilhamento pela mesma licença
vale para a peça, e isso é uma decisão do dono que esta frente não mudou.

**A rede.** Agente honesto, prazo de 12 s, um pedido por vez por host com
intervalo mínimo (1,1 s; 2 s no Senado, cuja busca leva de 4 a 10 s e pesa 1
MB), memória de 10 minutos por busca (a newsletter, o portal e o post resolvem
a mesma pauta em sequência), e a falha nunca fica na memória. Banco fora do ar,
recusa, resposta ilegível ou falta de chave viram nota em `fontesConsultadas`
(`banco_oficial`), e o Commons segue como antes. A medida da foto que o banco
não declara (Câmara, Fed) é lida do próprio JPEG, nos primeiros 64 KB.

**Hosts.** `www.camara.leg.br`, `www.whitehouse.gov`, `www.federalreserve.gov`
e `images-assets.nasa.gov` entraram no `next.config.ts`; o Senado e o Flickr
usam `live.staticflickr.com`, que já estava. Cada banco declara os hosts dele,
e o teste de hosts confere todos contra a lista do `next/image`.

**O interruptor é `settings.imagens.bancos_oficiais`.** Só o `true` booleano
liga; ausente é desligado no código e a resolução é byte a byte a de antes.
`imagemDaPauta` lê do projeto, e o ciclo social passa o mesmo valor à foto do
carrossel e à busca extra da bolha, que chamam o resolvedor direto. Para ligar:
`supabase/2026-10-06-bancos-oficiais.sql`.

**A chave do Flickr, para o Planalto e o STF.** O robots do flickr.com proíbe
tudo para agente não listado, inclusive o feed público, então a API com chave é
o único caminho legítimo. Uso comercial pede a chave comercial: em
https://www.flickr.com/services/apps/create/apply/, "Apply for a Commercial
Key", descrevendo o uso (busca de fotos editoriais nas contas oficiais do
Planalto e do STF, com crédito e link para a página da foto). Os termos da API
pedem respeitar a licença e o autor de cada foto, linkar a página da foto e
exibir "This product uses the Flickr API but is not endorsed or certified by
SmugMug, Inc." A chave vai para `FLICKR_API_KEY` no ambiente dos dois serviços.
A busca já pede só as licenças comerciais (4, 5, 8, 9, 10, 11 e 12) e confere
de novo foto a foto.

**Medição.** `npx tsx src/scripts/medir-bancos-oficiais.ts` passa pautas reais
(só SELECT) cuja manchete nomeia um político brasileiro ou uma autoridade
americana, antes e depois, e grava `medicao.json` e a folha de contato em
`docs/design/bancos-oficiais-2026-10-06/`. 

Medido em 06/10/2026, em 21 pautas aprovadas dos últimos 30 dias (10 brasileiras), SEM a
conferência visual: a conta do modelo estava sem crédito (ver o incidente do
mesmo dia), então o resolvedor aprovou a primeira da fila, que é a foto que a
conferência abriria primeiro, e quem conferiu fui eu, olhando a folha. Foram
cinco rodadas, porque as três primeiras acharam fotos erradas que as réguas de
identidade deixavam passar.

```
                                    antes    depois (rodada final)
pauta com foto da pessoa              11       12      (de 21)
  dessas, de banco oficial             0        5
pautas brasileiras com a pessoa        3        3      (de 10)
```

O que a folha mostra, foto a foto, nas cinco de banco oficial: Moraes nas
duas pautas dele (Agência Senado, 2023, ele como assunto claro), Powell (Fed,
abril de 2026) estão certos e mais novos que o Commons. Flávio Bolsonaro (Senado,
setembro de 2026) e Fachin (Senado, 2015) vieram em plano aberto, com muita
gente, e é a conferência visual que decide se a pessoa aparece; sem crédito
na conta, ela recusa, e essas duas não iriam ao ar. A diferença de 11 para 12
é variação de rede numa pauta de Trump, e não efeito dos bancos.

Duas conclusões medidas. **Nas pautas brasileiras o gargalo não é o banco, é
a entidade:** em 6 das 10 nenhuma pessoa foi resolvida como entidade (a pauta
"Ibovespa dispara, com foco em Lula" é do Ibovespa, e "STF analisa mensagens
entre Moraes e Vorcaro" saiu como cena), e nesses casos nenhum banco é
consultado pela pessoa. **A régua de polaridade de texto recusa legenda
legislativa:** "Deliberação dos dispositivos do Veto nº 51" tem "veto", que o
detector lê como rejeição, e derrubou as fotos de 2026 do Flávio na Câmara
numa pauta de tom positivo. Nenhuma das duas foi mexida aqui.

## A leitura das candidatas que falha segura a notícia, e avisa (06/10/2026)

A pergunta que ficou em aberto no incidente "zero post de notícia porque a
camada de candidatas falhou" (`aprendizados-e-incidentes.md`): a leitura das
candidatas que falha deve continuar fechando a notícia do Instagram? **O dono
decidiu que sim, e que o bloqueio tem de avisar.** Sem a leitura, o pool é
reclassificado do zero e o sorteio do classificador (24% de decisões trocadas,
medido) volta a decidir o que vai ao ar; um dia sem post de notícia é o preço
aceito. O que não se aceita é o silêncio: em 06/10 o mesmo bloqueio custou o
dia e só foi achado por eliminação.

- **A gravação que falha continua como estava:** os posts seguem, o diagnóstico
  grava `candidatasNaoGravadas` e o Telegram recebe `candidatas_nao_gravadas`.
- **A leitura que falha segura e avisa.** Quando a composição acende
  `SOCIAL_PERSISTENCE_UNAVAILABLE`, `rodarSocialDoDia` manda o aviso
  `leitura_de_candidatas_falhou` (`avisos/avisos.ts`), pelo mesmo `emitir` dos
  avisos de operação: chave `tipo:dia` em `platform_events`, envio pelo
  `alerts.ts` e o desfecho gravado nos dois casos. A manhã e o ciclo da tarde
  (`quente-da-tarde-ciclo.ts`, que passa pelo mesmo `rodarSocialDoDia`) dão uma
  mensagem só por dia. O texto diz quantos posts calculados ficaram de fora, o
  erro inteiro do banco (já com `texto-do-erro.ts`), que newsletter e portal
  não são afetados (a guarda classifica tudo de novo e segue; o bloqueio mora
  só na composição do feed) e como refazer só o Instagram, sem tocar e-mail nem
  portal e sem duplicar post: `npx tsx src/scripts/leva-social-extra.ts
  --quantos=5`, depois com `--valendo`.
- **Só em `enforce`.** Em ensaio a composição não bloqueia (`paraPublicar`),
  nada seria publicado, e dizer "segurados" seria mentir, que é a regra dos
  avisos. É a mesma escolha do aviso da gravação. Também não avisa a leitura
  que falhou num ciclo que nem chegou à composição (pool vazio, feed
  ilegível): não havia post para segurar.
- **No diagnóstico sempre, fora de `off`.** `candidatasNaoLidas` vai para o
  registro `social_cycle_diagnostic`, ao lado do `bloqueio`, e o desfecho da
  tarde (`quente_da_tarde`) grava `bloqueio` e `candidatasNaoLidas`, para o
  "0 post" da tarde não parecer "nada quente".
- **Limite conhecido.** Se o banco inteiro estiver fora, o registro dos avisos
  também não lê, e `emitir` não manda (não conseguir olhar não é "não foi
  feito"). Nesse caso o diagnóstico e o log continuam com o erro.

## As regras do dono depois da fila de 07/10 (06/10/2026)

O dono leu os cinco posts do Instagram de 07/10/2026 e devolveu cinco pontos,
com o pedido de que cada um virasse regra em CÓDIGO: "senão eu vou ficar num
loop infinito corrigindo o erro". O prompt pede; a guarda confere; a fila
aprende.

| ponto do dono | o caso real | onde mora |
|---|---|---|
| 1. Citação com contexto | "Bret Taylor: “É uma espécie de caos até que tal padrão exista”" | `social/manchete-com-contexto.ts`: dêitico dentro das aspas ("tal padrão", "isso", "eles") sem o referente nomeado fora delas é recusa; pessoa que fala ou abre a manchete, fora da lista de conhecidos do público brasileiro (`FAMOSOS_PARA_O_PUBLICO_BRASILEIRO`) e sem cargo ou empresa ao lado, é recusa. Motivo `SOCIAL_REJECT_HEADLINE_CONTEXT`, reparável |
| 2. Valor não quebra de linha | "US$" no fim de uma linha e "45.000" na outra | `carousel-templates/util.ts`: `esc` cola moeda, número, escala e percentual com U+00A0 em toda peça do feed; o destaque em cor é fatiado depois da colagem; o encaixe do tipo mede sem partir palavra. Conferido no navegador por `src/scripts/validar-valores-na-arte.ts` |
| 3. Crédito só com o nome | "Fotos: Lucio Bernardo Jr./Câmara dos Deputados (CC BY) e ..." | `social/legenda-final.ts`: só o nome de quem fotografou, sem banco, sigla, barra nem o "from Washington, DC, USA" do Flickr; sem pessoa, a instituição ("Foto: NASA"). `fecharLegenda` reescreve também a linha antiga que chega pronta (a refação e o painel) |
| 4. Variação diz o que variou | "SpaceX sobe quase 8%" | `variacoesSemMetrica`, na manchete e no lide da legenda: verbo de variação com percentual, pontos ou dinheiro, sem métrica na oração (ações, valor de mercado, avaliação, receita, índice...). Motivo `SOCIAL_REJECT_VARIATION_METRIC`, reparável |
| 5. A manchete se explica para o público brasileiro | "Douglas Ruas pode vencer no primeiro turno..." | o que dá para conferir: sujeito nomeado (nunca pronome, sempre alguém ou algo com nome) e pessoa apresentada (ponto 1). O resto é prompt: `REGRAS_DO_DONO_PARA_A_MANCHETE`, em `social/manchete.ts`, com os pares reais |

**Por que o bloco do prompt fica fora do texto editável.** A regra da manchete
é editável no painel (etapa `manchete`), e uma versão gravada antes desta data
apagaria o pedido. O bloco do dono vem sempre DEPOIS da regra vigente, como o
contrato do JSON, nos dois prompts (peça única e carrossel).

**A crença sobre o cargo de Bret Taylor.** O dono escreveu "ex-presidente do
conselho da OpenAI"; o pacote factual da CNBC diz "chairman of OpenAI", atual.
Os exemplos seguem o pacote ("presidente do conselho da OpenAI"), porque é a
régua da ancoragem.

**A fama é uma lista curta, de propósito.** Errar para fora custa uma aposição
("Sam Altman, CEO da OpenAI"); errar para dentro é o post que o dono devolve.
O sobrenome sozinho só vale quando nenhuma outra pessoa do pacote o tem: no
ensaio, "Ronaldo Caiado" casava "Gracinha Caiado" pelo sobrenome e a manchete
certa era recusada. A lista está exportada para a seleção (outra frente) poder
usar a mesma régua.

**Newsletter e portal não passam por esta guarda.** O título deles tem auditor
próprio, sem helper comum com o post; as regras chegam a eles pelo aprendizado
(as regras aprovadas abaixo, por canal) e não por código. O valor colado também
é só do Instagram: o e-mail e o portal são HTML que o leitor redimensiona, e
`esc` não é o escape deles.

**A fila aprende as cinco.** `supabase/2026-10-06-regras-do-dono.sql` (para o
dono rodar) grava as regras como APROVADAS em `regras_propostas`, por canal:
as de manchete nos três, a do valor na arte do post, a do crédito no texto do
post. `origem = 'reprovacoes'` e `ocorrencias = 3`, o piso do CHECK.

**Refazer os cinco posts.** `npx tsx src/scripts/refazer-textos-da-fila.ts`
(ensaio, roda o gancho de texto de produção com um cliente que só lê) e, depois
do deploy, `--aplicar`, que REPROVA cada peça na fila com o retorno do dono como
motivo (texto; arte para a da Anthropic, cujo texto estava certo). A reprovação
ensina o canal, e o relógio da fila refaz com o código novo.

## O alcance nacional da pauta centrada em gente (06/10/2026)

O dono, revendo a fila de 07/10, sobre um post aprovado pela abertura
eleitoral ("Douglas Ruas pode vencer no primeiro turno se votos de Garotinho
forem anulados no RJ"): "pensando na massa, muito segmentada, muito
específica; candidato pouco conhecido, não faz sentido explorar esse tipo de
notícia". A regra: política brasileira, e qualquer pauta centrada em gente,
precisa de ALCANCE NACIONAL para o público de massa (disputa presidencial,
figura nacional, instituição nacional, efeito no mercado). Disputa estadual ou
municipal e candidato pouco conhecido ficam fora, salvo com uma figura nacional
como protagonista.

**Duas peneiras, e a de código é piso, não régua.** O classificador e o
verificador ganharam a regra de texto ("ALCANCE NACIONAL", no bloco da abertura
eleitoral de `linha-editorial.ts`, e a definição de "famosa" na citação). Depois
da linha, a guarda confere o protagonista na Wikipédia (`editorial/alcance.ts`,
`conferirAlcance`), pela mesma busca do calor, e recusa com
`REJECT_LOW_REACH`, gravado na candidata. Só confere o que a abertura eleitoral
ou a citação de famoso aprovou; o resto passa sem consulta. Wikipédia fora do
ar deixa passar, com a linha no log: a regra de texto continua valendo.

**Os números, medidos em 06/10/2026 (Wikipédias com artigo):**

| nome | Wikipédias | |
|---|---|---|
| Lula | 128 | passa |
| Flávio Bolsonaro | 29 | passa |
| Fernando Haddad | 28 | passa |
| Alexandre de Moraes | 16 | passa |
| Erika Hilton | 16 | passa |
| Ronaldo Caiado | 11 | passa |
| Tarcísio de Freitas | 10 | passa |
| Nikolas Ferreira | 7 | passa |
| Douglas Ruas | 5 | cai |
| Anthony Garotinho | 5 | cai |
| Washington Reis | 4 | cai |
| Hugo Motta (presidente da Câmara) | 5 | passa pelo cargo |
| Nunes Marques (STF) | 4 | passa pelo cargo |

O piso da pessoa é 6. A margem é curta (Nikolas 7, Ruas 5), e por isso a
medida é piso e a regra de texto é a primeira peneira. Quem está no comando do
Congresso ou no STF e a Wikipédia ainda não mede entra por uma lista curta e
datada (`NACIONAIS_ABAIXO_DO_PISO`). As visualizações da Wikipédia em português
NÃO servem: na eleição Douglas Ruas teve 88 mil em 30 dias, mais que Moraes. O
cargo no Wikidata (P39) também não: Garotinho aparece como governador "atual".

**Instituição salva a pauta só no centro, e nunca por cima de uma disputa
regional.** Pessoa nacional em qualquer dos três primeiros atores salva; pessoa
regional sem nenhuma nacional derruba, mesmo com TSE na lista ("RJ: 204 mil
eleitores votaram 13 para governador", com TSE, TSE e Garotinho); sem pessoa,
instituição nacional como primeiro ator salva ("Mulheres são 37% das
candidaturas", com TSE, Câmara e IBGE). Instituição nacional é lista
(`INSTITUICOES_NACIONAIS`: tribunais superiores, Congresso, Planalto, Banco
Central, partidos nacionais), porque a sigla cai na página de desambiguação
("TSE" 12 sem tipo, "PL" sem artigo).

**A citação de famoso tem piso 20.** O formato vive do rosto e do nome que o
leitor reconhece. Bret Taylor (presidente do conselho da OpenAI) tem 10
Wikipédias e 60 visitas em 30 dias na Wikipédia em português: o leitor
brasileiro não sabe quem é, e a citação só funcionaria apresentada pela
empresa, e aí a notícia é da empresa. Passam Musk 164, Bezos 101, Altman 66,
Nadella 56, Huang 48, Powell 39, Bessent 32, Warsh 24. A notícia da empresa não
some: sem o formato, a fala volta à régua de sempre de declaração, e o fato da
empresa entra pelo fato.

**O ensaio** (`npx tsx src/scripts/ensaiar-alcance.ts 48`, só leitura, sem
modelo), sobre as 42 pautas aprovadas pela abertura eleitoral nas 48 horas até
06/10/2026: caem 8. As duas do Rio com Garotinho, a renovação da Alesp, a morte
por aposta no Pará, o cientista político do "terceiro turno", e três que
merecem o olho do dono: a proibição de precatórios no Conselho da Justiça
Federal (que entrou na lista de instituições depois do ensaio), as concessões
na mira dos governadores eleitos e "por que metade do Brasil ainda prefere o
bolsonarismo", que não têm pessoa nem instituição nos atores.

**Custo:** a regra de texto muda o prompt do classificador, e com ele a
assinatura da classificação. O primeiro ciclo depois do deploy reclassifica a
janela uma vez (no ensaio de 06/10/2026, 657 candidatas novas custaram US$ 1,70
na estimativa do código).

## A newsletter que falta, e só ela (06/10/2026)

A produção das 17:00 de 06/10/2026 fez e enfileirou os posts e as matérias de
07/10, e a edição da newsletter foi barrada pelo QA (risco de alucinação, QA 94,
dois reparos). Ver o incidente em `aprendizados-e-incidentes.md`.

**Barrada, a edição é escrita de novo** (`newsroom/nova-redacao.ts`): até duas
redações novas, com 15 e 30 segundos de espera, só com a guarda em `enforce`. O
portão é o mesmo em toda tentativa; o que muda é o sorteio. Quando o auditor
aponta UMA matéria (pelo título, por um trecho entre aspas que só aparece nela,
ou por "a segunda matéria"), ela sai da redação seguinte, se a edição mantiver o
mínimo; quando aponta várias, só a última tentativa tira todas, porque a lista
do auditor mistura alucinação com imprecisão. O custo de todas as tentativas é
somado no livro do dia, e a peça diz quantas redações a edição teve.

**Só a newsletter barrada é desfecho parcial, não falha da produção.** A linha
`failed` do run continua (a edição não saiu), mas a produção devolve `ok` com
`newsletterAusente`, e o fim da produção manda o aviso `newsletter_ausente`
(crítico, um por edição) com o motivo do portão e o comando que produz só a
newsletter, e depois a fila pronta com o que entrou. Até aqui o dono recebia
"Produção da véspera falhou" e nenhum aviso de que havia posts e matérias para
aprovar. Qualquer outra falha continua sendo falha.

**Produzir só a newsletter de um dia**:
`npx tsx src/scripts/produzir-newsletter.ts --data AAAA-MM-DD` (ensaio) e
`--aplicar`. É o caminho da véspera (`produzirSoANewsletter`) com
`somenteNewsletter`: o ciclo do Instagram, o ramo do portal, a edição como
artigo, o agendador legado, os perfis de referência e o Listmonk não rodam, e
só a peça da newsletter chega à fila. A edição usa SÓ as classificações que já
estão no banco (`soReaproveitadas`): o material que a véspera classificou, sem
pagar de novo. O envio planejado é o da cadência (06:07).

- O ensaio trava toda escrita no banco (`travarEscritasDoBanco`, em
  `supabase-admin.ts`: insert, upsert, update, delete, rpc e Storage voltam
  como erro, e o fim do ensaio lista o que foi recusado) e tira a credencial
  do Telegram.
- O `--aplicar` recusa com a fila fora de `enforce` (sem ela a redação
  dispararia a campanha), com newsletter do dia já em `aprovacoes`, e com a
  edição do dia já em `news_editions`. A chave do run é
  `daily-edition-<data>#so-newsletter`: o prefixo do dia para os leitores por
  prefixo, e a idempotência impede o segundo `--aplicar`.
- O script preenche `EDITORIAL_GUARD`, `VISUAL_RESOLVER_V2` e
  `SOCIAL_PIPELINE_V2` com `enforce` quando o ambiente local não declara: sem
  eles a guarda cai em observação, e sairia outra newsletter, pelo ranker
  antigo.

## O protagonista da manchete: a foto é dele, verificada (06/10/2026)

A regra do dono, depois da fila de 07/10/2026 ("a gente precisa ser 100%
certeiro"): **a manchete que nomeia uma pessoa mostra ESSA pessoa, com a
identidade conferida; a que nomeia uma empresa ou organização mostra a marca
dela ou quem a representa. Cena no lugar do protagonista nomeado não existe.**
Sem foto verificada, vale "pauta sem foto não vira conteúdo". O incidente que
motivou está em `aprendizados-e-incidentes.md` ("A foto do casamento na pauta
do Caiado"). O código mora em `visual/protagonista.ts`,
`visual/verificacao-do-protagonista.ts`, `visual/cartao-da-marca.ts` e no
`fotoDoProtagonista` de `resolver.ts`.

**Quem é o protagonista.** O ator da classificação que a manchete nomeia, na
ordem da manchete; a manchete da PEÇA (`PautaParaImagem.manchete`, que a
refação e o script da fila passam) vem antes do título da fonte. Nome completo
reserva as partes dele, e a parte de nome que casa com dois atores é do
primeiro da lista. É resolvido no Wikidata ANTES de tudo; vale se for pessoa,
empresa, instituição ou órgão. Nome que o Wikidata diz ser lugar ou conceito
passa a vez; falha ou 429 do Wikidata deixa a pauta sem foto (não se sabe quem
é, então não se escolhe nada). Com dois nomes na manchete e nenhuma foto do
primeiro, a vez passa ao segundo (até três).

**Pessoa: a identidade tem prova.** Três provas, nesta ordem: a foto É o
retrato que o Wikidata declara (P18); a foto foi comparada pelo modelo com
esse retrato, que respondeu mesma pessoa e em destaque com confiança de 85 ou
mais; sem P18, a foto de banco oficial cuja legenda põe a pessoa como
protagonista vira a referência. Sem referência nenhuma, nenhuma foto passa. A
conferência de sempre continua rodando (outro país, texto, logotipo de
terceiro), avisada de que o rosto já foi conferido. A foto da biblioteca não
sai direto: entra na fila da verificação. A bolha de pessoa exige a mesma
prova.

**Organização: a marca primeiro, o rosto por último.** A ordem e o porquê:

1. foto com o nome LEGÍVEL (o modelo transcreve o texto, e o código confere o
   nome da empresa nele; órgão público e instituição também passam pela sede
   reconhecível, o Capitólio, o prédio do STF). É o exemplo aprovado: a
   fachada da SpaceX com o nome na parede.
2. o LOGOTIPO oficial (P154), num cartão: logotipo centrado, fundo neutro
   escolhido pelo brilho do próprio logotipo (papel claro ou grafite; cor de
   marca inventada seria marca adulterada), 1600 px, área segura que sobrevive
   ao recorte 3:4 do post e ao 16:9 da matéria e fica acima da faixa da
   manchete. A arte não mudou: o cartão é uma foto como outra, servida por
   `/api/visual/cartao-da-marca?arquivo=<arquivo do Commons>` (só nome de
   arquivo do Commons; não é proxy). O modelo confere o cartão composto, como
   `data:`, e precisa ler o nome nele. Amostras em
   `docs/design/imagem-certeira-2026-10-06/cartao-*`.
3. o REPRESENTANTE: o CEO (P169), depois o fundador (P112), cargo vigente (sem
   P582), com a identidade provada como a de qualquer pessoa.

O rosto vem por último porque o dono reprovou duas vezes a Anduril com o
fundador num palco ("não tem a marca Anduril e tem um rapaz que não tem
contexto nenhum"). Produto sem a marca legível não passa: não há como provar
que o drone é da Anduril, e certeza é a regra.

**O registro.** `asset.metadata.verificacao` (e `content_json.visual.verificacao`
no post, com `protagonista`): o tipo (`identidade`, `marca`, `logotipo`,
`representante`), como se provou, a referência e o veredicto. Recusas novas:
`PROTAGONIST_PHOTO_NOT_VERIFIED`, `IDENTITY_NOT_VERIFIED`, `BRAND_NOT_VERIFIED`.

**O que continua igual.** Pauta cuja manchete não nomeia ninguém segue pela
cena e pela escada (#96); o órgão citado e não nomeado na manchete ainda cai na
cena depois da entidade. **Custo:** até duas chamadas de visão por candidata
(identidade ou marca, mais a de sempre), quatro candidatas por degrau. No
ensaio da fila de 07/10 (8 peças, três rodadas) foram US$ 2,24 no total.

**A fila de 07/10.** `src/scripts/refazer-imagens-da-fila.ts` (ensaio por
padrão; `--folha=<pasta>` grava a folha de contato; `--aplicar` refaz as
peças `aguardando` pelo gancho de imagem e de arte da própria fila e reentra
com o hash novo, sem contar como reprovação; peça aprovada não é tocada).
Antes e depois em `docs/design/imagem-certeira-2026-10-06/`.

## Armadilhas que já custaram tempo

Estas não são preferências, são fatos da plataforma. Repetir custa horas.

- **Altura relativa contra pai sem altura definida.** `max-height: %` vira
  `none` e `h-full` vira a altura natural do conteúdo. Bateu duas vezes no mesmo
  dia, no carrossel e na manchete do portal.
- **CSS solto depois do `@import "tailwindcss"`** vence toda utilidade,
  independente de especificidade. `a { color: inherit }` fora de layer anulava
  toda classe de cor em link no site inteiro.
- **`.default()` em campo novo de schema compartilhado** torna o campo
  obrigatório no tipo de SAÍDA e quebra todo literal que já existe.
- **Backtick dentro de comentário de CSS** em template literal encerra a string.
  Há um teste que varre isso porque a lição escrita falhou três vezes.
- **Mock parcial de módulo** derruba o que não for redeclarado.
- **`if (error || !data)`** colapsa "não achei" e "não consegui olhar", e o
  estado que some é sempre o que tem conserto.

## Decisões em aberto

Ficam aqui para não serem redescobertas como novidade.

- **Loop de aprendizado**: nada lê alcance ou salvamento e realimenta a pauta.
  `fetchMediaInsights` existe e ninguém chama.
- **`aeo_questions`**: única coluna de SEO ainda vazia. Pede geração, e cabe no
  mesmo passo em que a edição é escrita.
- **Multiprojeto**: o cron executa um projeto e não itera; o design de carrossel
  não tem `project_id`.
- **Versão escura do logotipo** foi gerada recolorindo o azul, não desenhada.
  FECHADO em 05/10/2026: o dono entregou as duas versões desenhadas. Ver
  "O logotipo" em Produto e marca.
- **Ícone quadrado da marca.** O favicon do site ainda é o padrão do Next, e o
  logotipo é uma assinatura horizontal que não cabe em 16 por 16. Precisa de
  uma marca quadrada desenhada (o "e" ou o ponto vermelho, por exemplo); o
  avatar do Instagram é candidato, mas tem detalhe demais para o tamanho.
  FECHADO: o site ganhou `src/app/icon.png` (o "eua" com o ponto sobre
  azul-marinho), e desde 06/10/2026 o avatar é esse mesmo ícone.

## O motor Claude via MCP (27/10/2026)

O dono quer perfis de dois tipos na mesma plataforma: os 100% automáticos com
a OpenAI, como hoje, e os operados pelo usuário no Claude Desktop, conectado
por MCP. Não é a API da Anthropic: é o Claude aplicativo, no plano do usuário.

**O motor é do projeto**, em `settings.motor` (`mcp/motor.ts`). Ausente ou
torto vale `openai`, o projeto de antes byte a byte. O card do painel diz qual é.

**A inteligência fica na plataforma.** Cada chamada de modelo vira uma tarefa
(`tarefas_do_claude`) com a instrução exata que a produção mandaria, o
material e o esquema; o Claude entrega e a plataforma valida com as mesmas
guardas e grava onde a produção grava. Instrução editável, memória da fila,
regras aprovadas e exemplos chegam ao Claude do mesmo jeito que chegam à
OpenAI.

**Aprovação só no painel, sempre manual, e a reprovação volta para o Claude.**
No motor Claude, `modoDoRamo` é manual mesmo com o automático declarado, o
MCP não tem ferramenta de decidir, e a reprovação estaciona a peça esperando
a correção do Claude, em vez de refazer no servidor. A plataforma não consegue
acordar o aplicativo: o aviso vai pelo Telegram, e o Claude vê a pendência ao
perguntar o estado do dia.

**Zero chamada à OpenAI nesse motor, inclusive vetores.** Quem decide se duas
matérias são o mesmo fato, ou se o fato já saiu no feed, é o Claude, com as
comparações por regra (URL, entidades, impressão do acontecimento) rodando
antes como rede.

**Classificação com teto diário.** Mil candidatas por dia não cabem numa
conversa: a plataforma filtra por regra e manda no máximo
`settings.mcp.teto_de_classificacao` (padrão 120).

**A ordem de construção** começa pelo post de peça única do Instagram: base
(motor, token, tarefas, servidor local), texto e arte, foto, pacote e
verificador, classificação e repetição, correções, cron. Carrossel, matéria e
newsletter depois. O token é por usuário e por projeto, guardado só como
resumo SHA-256, e o motor é conferido a cada chamada: voltar o projeto para
`openai` corta o MCP na hora. Configuração em `docs/mcp.md`.
