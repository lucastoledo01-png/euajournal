# O dia inteiro pelo Claude

Decisão do dono (29/10/2026): no motor `claude_mcp` o Claude faz o dia inteiro, com zero
OpenAI. O dono abre o Claude (app ou Claude Code, conectado ao MCP do eua.journal) a qualquer
hora e diz "faça o dia". O Claude chama `fazer_o_dia` e segue os passos até "pronto".

## As etapas

| etapa | o que o Claude faz | o que a plataforma faz |
|---|---|---|
| triagem | classifica a coleta em lotes (`classificar`), com o prompt do classificador | pré-filtra a coleta do dia, aplica `decidirPauta`, grava em `news_candidates` do projeto |
| plano | propõe o plano (`propor_plano`): newsletter, matérias, posts, Reels, o porquê e a cena de cada pauta | confere volume, repetição e pool; põe o plano na fila (ramo `plano`) |
| aguardando | chama `aguardar` até o dono decidir | o dono aprova, tira itens ou reprova no painel; reprovado volta ao Claude |
| preparo | escolhe a foto vendo as candidatas (`escolher_foto`) e extrai os fatos (`extrair_pacote`) | roda o resolvedor sem modelo, lê a matéria, grava a foto e o pacote; escolhe os Reels |
| produção | escreve e audita posts, matérias e a newsletter; escreve o texto dos Reels | as mesmas guardas da esteira, agenda, grava e põe tudo na fila |

O estado mora em `planos_do_dia`: se a conversa cair, "faça o dia" retoma de onde parou.

## O que é igual à esteira

- O post: `mcp/post/fluxo.ts`, como antes; o material vem da triagem (`mcp/dia/material.ts`).
- A matéria: system, user e reparo da esteira; `auditarArtigo` com o veredito do Claude; poda,
  montagem (`materiaDaPauta`), gravação e fila da esteira (`mcp/artigo/fluxo.ts`).
- A newsletter: o laço inteiro de `runNewsroomPipeline` roda com um modelo que responde do que o
  Claude entregou; cada chamada sem resposta vira tarefa (`mcp/newsletter/fluxo.ts`).

## O que é diferente

- Calor: o plano conta veículos pelos nomes próprios do título, sem vetor.
- A matéria sai com a fonte principal só (juntar outras fontes pede uma extração por fonte).
- A descrição da capa é a que o Claude escreveu ao escolher a foto.
- O plano é sempre manual no painel, e reprovado volta ao Claude com o motivo.

## Ligar

1. Rodar `supabase/2026-10-29-plano-do-dia.sql` (tem que voltar `plano_ok`, `fila_ok` e
   `reprovacoes_ok` verdadeiros).
2. Deploy do web.
3. Testar no projeto `teste-claude` (motor `claude_mcp`, `pautas_de: desbuguei`, fila em
   `enforce`): "faça o dia" no Claude, aprovar o plano no painel, conferir as peças na fila.
4. Só depois, e com o ok do dono, trocar o motor do eua.journal (o cron deixa de escrever).
