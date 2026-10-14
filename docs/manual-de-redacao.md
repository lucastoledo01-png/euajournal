# Manual de redação do eua.journal (piloto à mão)

Começou em 14/10/2026. Por alguns dias a parte editorial (escolher a pauta,
escrever, achar a foto) é feita à mão pelo Claude, em paralelo à esteira do
servidor, e o dono escolhe a melhor versão peça a peça. Cada decisão fica aqui,
com o porquê. No fim, o que se repetir vira regra no prompt e o que o dono
aprovar vira exemplo.

O arquivo de cada peça fica em `producao-manual/<data>/`, e entra na fila por
`src/scripts/_materia-manual.ts` (matéria), pelo mesmo caminho do ramo do
portal, sem chamada de modelo.

## Regras que já saíram do piloto

1. **A foto mostra o assunto, e o nome dele aparece quando dá.** Tesouro dos
   EUA: a fachada com "THE DEPARTMENT OF THE TREASURY" gravado, e não uma nota
   de dólar. Microsoft: o CEO, que fala na matéria. Antes de usar, abrir a
   imagem e conferir; banco genérico (Pexels) só se nada do assunto existir.
2. **Fonte com paywall não entra.** A Folha (Treasuries) devolve só a página
   de assinatura; a matéria sai só com a fonte que dá para ler inteira.
3. **Fato com dono.** Número ou fala atribuída vem com quem disse e onde
   ("segundo o Citi", "pela série do Federal Reserve"). Fala em inglês vira
   paráfrase, nunca aspas traduzidas.
4. **Nada além da fonte, nem para soar melhor.** "Nos EUA" no Gemini foi
   inventado pela esteira e o dono notou. O resumo gerado por IA no topo da
   fonte (NeoFeed) não é usado: só o texto do jornalista.
5. **Capa do Commons é o endereço ORIGINAL de `upload.wikimedia.org`**, nunca
   a miniatura de `thumb.wikimedia.org`: o site só aceita o primeiro host, e o
   código já reduz o original para a miniatura. Na primeira versão das duas
   matérias de 14/10 a capa não carregou por isso.
6. **Empresa: foto real antes do logotipo.** O dono recusou o cartão com o
   logotipo da Meta e a cena aérea de um telhado no post do Walmart (14/10).
   A ordem que ele pediu: a fachada com o nome ou o logo da empresa (loja,
   sede, placa) e, se não houver uma boa, o rosto conhecido que a representa
   (Zuckerberg pela Meta). O cartão do logotipo vira o último recurso, e
   isso muda a ordem de `fotoDoProtagonista` em `decisoes.md` (marca legível,
   logotipo, representante). Foto de estande ou de multidão com rostos de
   desconhecidos não serve, mesmo com o logo.
7. **O logo ou o nome da empresa tem que dominar a peça, e não só aparecer.**
   A primeira troca do Walmart (14/10) tinha o logo, mas pequeno no meio de
   uma fachada com estacionamento, e o dono devolveu. A segunda, a placa alta
   com "Walmart" e o logo ocupando mais de metade da largura, passou. Régua:
   no recorte que vai ao ar, o nome legível ocupa pelo menos um terço da
   largura. Placa e letreiro de perto valem mais que fachada inteira de longe.
8. **Rosto só se o público brasileiro reconhece.** Satya Nadella, CEO da
   Microsoft, foi recusado: "geralmente as pessoas não vão conhecer ele". O
   dono pede fundador ou figura popular (Bill Gates, Zuckerberg, Musk) ou a
   fachada. A contagem de Wikipédias não basta para medir isso: Nadella tem
   56. A pergunta é se um brasileiro comum reconhece o rosto sem legenda.
9. **Conferir a foto no recorte em que ela vai ao ar.** A capa do portal é
   horizontal e recorta pelo alto; o post é vertical. O retrato vertical do
   Gates na capa horizontal mostraria só a testa, e as fotos horizontais dele
   eram com um político europeu e a bandeira da UE, que mudam o assunto da
   imagem. Ficou a sede da Microsoft, com o logo atual e o nome.
10. **"O que você precisa saber" é da newsletter, não da matéria do portal**
   (dono, 14/10). A matéria abre direto pela linha fina e pela abertura. Isso
   desfaz, para o portal, o bloco do molde de 06/10 (`decisoes.md`, "A
   matéria completa").
11. **Uma matéria por notícia, com o molde do portal:** linha fina, "O que você
   precisa saber" com fato que a abertura não tem, abertura de dois parágrafos
   com o link da fonte, intertítulos em pergunta, "o que isso significa" só
   quando a fonte diz o efeito, perguntas e respostas.

## 14/10/2026

**Matéria 1, 12:00: Microsoft e o chip Maia 300.** Escolhida porque o dono
gostou do tema na newsletter do dia, e porque é a história de tecnologia com
nomes que o público reconhece (Microsoft, Nvidia, Nadella). Fonte: CNBC,
lida inteira. Foto: Satya Nadella, Commons, CC BY-SA 4.0.

**Matéria 2, 18:00: Treasuries acima de 5% e o custo do Brasil.** Escolhida
pelo leitor: liga juro americano, dólar e o bolso de quem investe ou pensa em
investir nos EUA. Recusadas na mesma rodada: diesel russo de Trump (sem foto
verificada na esteira), regulação de cripto do BC (Brasil sem os EUA), Apple
HomeView (já teve matéria em 08/10 sobre o Surface, tema de hardware repetido).
Foto: fachada do Tesouro com o nome legível, Commons, CC BY 4.0.

**Post da Microsoft: não feito.** O post precisa de arte renderizada e
congelada, e o caminho à mão para isso ainda não existe. Fica para o kit.

**Fotos refeitas a pedido do dono (14/10, manhã).** Post da Meta: logotipo
trocado por Mark Zuckerberg (aprovado). Post do Walmart: telhado aéreo, depois
fachada com o logo pequeno (recusada), e por fim a placa alta com o nome
(Commons, CC0, 2026). Matéria da Microsoft: Nadella trocado pela sede de
Redmond com o logo atual.

## O que vai para o código quando o piloto fechar

As regras 6 a 9 contradizem ou faltam na automação de hoje
(`visual/resolver.ts`, `fotoDoProtagonista`):
- a ordem da empresa passa a ser fachada com nome em destaque, depois rosto
  conhecido do público brasileiro, e só então o cartão do logotipo;
- a conferência visual mede o tamanho do nome ou logo no RECORTE da peça, e
  não só se ele aparece;
- o representante (CEO, fundador) só entra se for reconhecível no Brasil;
  precisa de uma medida melhor que a contagem de Wikipédias;
- foto de pessoa com outra figura pública no quadro, ou com símbolo de outro
  contexto (bandeira da UE), não serve como foto da empresa.

**Enquadramento (dono, 14/10).** Existe a regra de não cortar rosto, e ela
falhava no retrato vertical dentro da capa horizontal do portal. Desde o PR de
14/10 a capa da matéria mostra a foto inteira sobre ela mesma desfocada. Na
escolha: para portal e newsletter, preferir foto horizontal; retrato vertical
fica para o post do Instagram, que é vertical.
