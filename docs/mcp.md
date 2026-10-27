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

## Conectar o Claude (Mac ou Windows)

O MCP mora na plataforma, em `https://<site>/api/mcp` (Streamable HTTP, sem
sessão). O computador do usuário não instala servidor nenhum: o Claude só
precisa da URL e do token.

**O jeito do usuário:** no painel, em `/admin/<projeto>/claude` ("Conectar ao
Claude"), dar um nome ao computador e copiar o comando gerado. O painel cria o
token, mostra uma vez e lista os computadores conectados, com "Revogar".

**Claude Code** (no chat, ou sozinho em modo automático). O comando que o painel
gera, o mesmo no Terminal do Mac e no PowerShell do Windows:

```bash
claude mcp add --transport http --scope user euajournal https://<site>/api/mcp --header "Authorization: Bearer ejmcp_..."
```

Para conferir: `claude mcp list` deve mostrar `euajournal` conectado. Para
testar sem deploy, com a plataforma rodando na máquina (`npm run dev`), use
`http://localhost:3000/api/mcp`.

O token é segredo: não vai para o repositório, nem para print, nem para chat.
Perdeu ou vazou, revoga no script (`--revogar <id> --aplicar`) e cria outro.

**Claude Desktop pela interface** (conector personalizado) normalmente pede
login por OAuth, que ainda não existe aqui. Fica para depois; o modo
automático usa o Claude Code.

### Servidor local (só desenvolvimento)

`src/mcp/servidor.ts` é o mesmo conjunto de ferramentas por stdio, chamando
as rotas `/api/mcp/<ferramenta>` por HTTP. Serve para depurar com o Claude
Desktop apontado para a plataforma local:

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
        "EUAJOURNAL_URL": "http://localhost:3000",
        "EUAJOURNAL_MCP_TOKEN": "ejmcp_..."
      }
    }
  }
}
```

Atenção: em 27/10/2026 o Claude Desktop regravou o
`claude_desktop_config.json` ao salvar preferências e a entrada sumiu. Se as
ferramentas desaparecerem do Desktop, confira o arquivo.

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
