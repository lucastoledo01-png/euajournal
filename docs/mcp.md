# O motor Claude via MCP

Um projeto pode ter dois motores. No `openai` (o padrão), a esteira chama a
OpenAI e decide sozinha, como sempre. No `claude_mcp`, quem faz o trabalho de
modelo é o Claude Desktop do usuário: a plataforma serve tarefas com a mesma
instrução, o mesmo esquema e as mesmas guardas, e o Claude entrega. O desenho
e as decisões estão em `docs/decisoes.md`, "O motor Claude via MCP".

Regras que não mudam com o motor:

- **a aprovação é só no painel, e manual.** O MCP não tem ferramenta de
  aprovar, reprovar nem cancelar;
- **reprovou, volta para o Claude.** A peça fica esperando a correção, com o
  motivo escrito no painel;
- **num projeto `claude_mcp` nada chama a API da OpenAI.**

## Ligar num projeto

1. Rodar `supabase/2026-10-27-mcp.sql` no SQL Editor (uma vez, cria as tabelas).
2. No projeto, `settings.motor = "claude_mcp"` e `settings.capacidades.aprovacao = "enforce"`:

   ```sql
   update public.projects
   set settings = jsonb_set(jsonb_set(settings, '{motor}', '"claude_mcp"'),
                            '{capacidades,aprovacao}', '"enforce"'),
       updated_at = now()
   where slug = '<slug>';
   ```

   O card do projeto no painel passa a dizer "Motor: Claude via MCP".
3. Criar o token de quem vai usar:

   ```bash
   npx tsx src/scripts/criar-token-do-mcp.ts --projeto <slug> --rotulo <nome> --aplicar
   ```

   O token aparece uma vez. Perdeu, revoga (`--revogar <id> --aplicar`) e cria outro.

## Conectar o Claude Desktop

O servidor roda na máquina do usuário, a partir desta cópia do repositório
(`npm ci` feito). Em `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "euajournal": {
      "command": "/caminho/do/node",
      "args": [
        "/caminho/do/euajournal/node_modules/tsx/dist/cli.mjs",
        "/caminho/do/euajournal/src/mcp/servidor.ts"
      ],
      "env": {
        "EUAJOURNAL_URL": "https://euajournal.com",
        "EUAJOURNAL_MCP_TOKEN": "ejmcp_..."
      }
    }
  }
}
```

Caminhos absolutos: o Claude Desktop não herda o PATH do terminal. O
`/caminho/do/node` é o que `which node` mostra. Reinicie o Claude Desktop
depois de salvar.

O token é segredo: não vai para o repositório, nem para print, nem para chat.

## As ferramentas

| ferramenta | o que faz |
|---|---|
| `estado_do_dia` | o que falta no dia, e se a fila está aceitando entregas |
| `ver_fila` | as peças na fila, com estado, motivo de reprovação e link do painel |
| `pautas_disponiveis` | as pautas com pacote factual e foto que ainda não viraram post |
| `iniciar_post` | abre a tarefa de escrita da pauta |
| `proxima_tarefa` | a próxima tarefa (reparo antes de nova): instrução, material, esquema e motivos |
| `entregar_tarefa` | entrega o JSON da tarefa; a plataforma confere e diz o que vem depois |
| `montar_post` | a peça renderizada e a legenda, para olhar antes de agendar |
| `agendar_post` | congela a arte, grava na próxima vaga e põe na fila de aprovação |

## O ciclo de um post

```
iniciar_post ─► escrever_post ─► auditar_post ─► guarda ─┬─ pronto ─► montar_post ─► agendar_post ─► fila
                     ▲                                    ├─ reparar (até 2 vezes)
                     └────────────────────────────────────┘─ descartado
```

- **A instrução é a da esteira.** `escrever_post` leva o mesmo pedido que a
  OpenAI receberia, com a voz do post e a memória da fila do canal. A entrega
  passa pela mesma limpeza, pela auditoria e pela guarda (`avaliarPostSocial`).
- **A auditoria é tarefa separada**, com só o pacote e o texto. O ideal é
  auditar numa conversa nova do Claude Desktop.
- **Agendar não publica.** O post nasce `draft` na fila, em `aguardando`, e só
  vai ao ar depois de aprovado no painel. Sem a fila e o Social V2 em
  `enforce`, `agendar_post` recusa.

## De onde vêm as pautas (por enquanto)

Neste passo o Claude escreve; a pauta, o pacote factual e a foto vêm de um post
que a esteira já produziu. `settings.mcp.pautas_de` diz de qual projeto (o
projeto de teste lê o eua.journal, `desbuguei`), e a leitura é só leitura. A
classificação, o pacote, a foto e a repetição entram como tarefas do Claude
nos próximos passos do plano (`docs/decisoes.md`, "O motor Claude via MCP").

Na v1 o post é peça única, no molde jornal, sem bolha: a bolha precisa de
detecção de rosto, que ainda não virou tarefa.
