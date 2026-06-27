---
title: Fluxo de sessão com hooks
description: Como o dotcontext funciona hoje quando Claude Code, Codex CLI ou Pi disparam hooks de ciclo de vida durante uma sessão real.
sidebar:
  order: 4
---

Este documento descreve o funcionamento atual do dotcontext usando hooks. O ponto central é: hooks não substituem MCP. Eles conectam eventos leves do host ao mesmo harness runtime para fazer bootstrap de contexto, registrar traces e mostrar lembretes PREVC no fim da sessão.

O MCP continua sendo a superfície completa para inicializar `.context/`, criar planos, rodar sensores, avançar workflow e consultar ferramentas do dotcontext.

## Modelo mental

```text
Claude Code / Codex CLI hook
  -> dotcontext hook dispatch
  -> adapter do host
  -> harness runtime
  -> stdout JSON de volta para o host

Pi extension
  -> handler in-process
  -> harness runtime
  -> resposta in-process para Pi
```

Para Claude Code e Codex CLI, o instalador escreve comandos shell que chamam:

```bash
npx -y @dotcontext/cli@latest hook dispatch --source claude-code
npx -y @dotcontext/cli@latest hook dispatch --source codex
```

Por padrão, a instalação de hooks é no projeto atual:

```bash
npx -y @dotcontext/cli@latest hook install claude-code
npx -y @dotcontext/cli@latest hook install codex
npx -y @dotcontext/cli@latest hook install codex --format toml
```

Use `--global` somente quando quiser escrever a configuração no diretório home.

## Eventos suportados

| Momento no host | Evento | Ação no harness | Resultado esperado |
| --- | --- | --- | --- |
| Início da sessão | `SessionStart` | `context check` | Injeta readiness de `.context/`, ou uma dica de inicialização |
| Início da sessão com contexto pronto | `SessionStart` | `harness createSession` + `context getMap` | Cria uma sessão durável e adiciona navegação compacta |
| Depois de ferramenta | `PostToolUse` para `Write`, `Edit`, `Bash` | `harness appendTrace` | Registra `tool.use` em `trace.jsonl` |
| Fim da sessão | `Stop` | `workflow-guide` | Mostra próximos passos PREVC somente se há workflow ativo |

No fluxo padrão, hooks são não bloqueantes. Erro de trace, workflow ausente ou chamada reentrante de fim de sessão vira `{"continue": true}` para não quebrar a sessão do agente.

Antes de consultar `.context/`, o dispatch resolve o root nesta ordem: `--repo-path`, ancestral mais próximo com `.context/`, `cwd` e `process.cwd()`.

## Arquivos que aparecem

Depois de uma sessão com hooks em um projeto com `.context/` inicializado, os arquivos mais importantes são:

```text
.context/
└── runtime/
    ├── hooks/
    │   ├── host-sessions.json
    │   ├── reminders.json
    │   └── trace-failures.json
    └── sessions/
        └── <harness-session-id>/
            ├── session.json
            └── trace.jsonl
```

`host-sessions.json` guarda o vínculo entre a sessão do host (`session_id` do Claude/Codex) e a sessão durável do harness. `reminders.json` controla o cooldown do lembrete de workflow ausente. `trace-failures.json` registra falhas repetidas de trace para diagnóstico. `trace.jsonl` é o log append-only com os eventos capturados durante a sessão.

## Exemplo de sessão

Imagine uma sessão Codex em `/workspace/app`, com `.context/` já inicializado e um workflow PREVC ativo.

### 1. O host inicia a sessão

O host envia um envelope JSON para o comando de dispatch:

```json
{
  "session_id": "codex-session-123",
  "cwd": "/workspace/app",
  "hook_event_name": "SessionStart"
}
```

O dotcontext resolve o repositório por `cwd` ou por um ancestral com `.context/`, roda `context check` e, se `.context/` estiver pronto, cria ou reutiliza uma sessão do harness vinculada a `codex-session-123`.

Saída típica para o host:

```json
{
    "hookSpecificOutput": {
      "hookEventName": "SessionStart",
      "additionalContext": "dotcontext: scaffold ready. Use MCP context tools for navigation and workflow.\ndotcontext workflow: phase P is in progress.\nLikely gate: linked plan before leaving P.\n\ndotcontext navigation:\n..."
  }
}
```

Se `.context/` ainda não existe, a sessão não cria runtime desnecessário e o host recebe uma dica curta:

```json
{
    "hookSpecificOutput": {
      "hookEventName": "SessionStart",
      "additionalContext": "dotcontext: this repository does not have .context/ yet.\nHost: codex.\nNext step: configure MCP and ask the agent to run context init in this project."
  }
}
```

### 2. O agente escreve um arquivo

Depois que o agente usa `Write`, `Edit` ou `Bash`, o host dispara `PostToolUse`:

```json
{
  "session_id": "codex-session-123",
  "cwd": "/workspace/app",
  "hook_event_name": "PostToolUse",
  "tool_name": "Write",
  "tool_input": {
    "file_path": "src/feature.ts"
  }
}
```

O dispatch procura a sessão do harness vinculada a `codex-session-123` e anexa um trace:

```json
{
  "level": "info",
  "event": "tool.use",
  "message": "Write",
  "data": {
    "tool_input": {
      "file_path": "src/feature.ts"
    }
  }
}
```

A resposta para o host continua silenciosa:

```json
{
  "continue": true
}
```

Se a sessão vinculada ficou stale, o dotcontext tenta recriar a sessão do harness e repetir o trace. Se ainda assim falhar, ele registra o skip internamente e continua a sessão do agente.

### 3. O agente roda um comando

Um `Bash` também vira trace:

```json
{
  "session_id": "codex-session-123",
  "cwd": "/workspace/app",
  "hook_event_name": "PostToolUse",
  "tool_name": "Bash",
  "tool_input": {
    "command": "npm test -- --runInBand"
  }
}
```

O `trace.jsonl` passa a ter uma linha `tool.use` com `message: "Bash"`, o comando em `data.tool_input` e uma classificação best-effort:

```json
{
  "event": "tool.use",
  "message": "Bash",
  "data": {
    "classification": "test",
    "tool_input": {
      "command": "npm test -- --runInBand"
    }
  }
}
```

Essa classificação só lê o payload recebido do host; hooks não executam comandos extras.

### 4. A sessão termina sem workflow ativo

Se não existe workflow PREVC ativo, `Stop` é intencionalmente silencioso:

```json
{
  "session_id": "codex-session-123",
  "cwd": "/workspace/app",
  "hook_event_name": "Stop"
}
```

Resposta:

```json
{
  "continue": true
}
```

Esse caso evita ruído em repositórios que usam dotcontext só para contexto ou tracing.

No `SessionStart`, contexto pronto sem workflow ativo pode receber um lembrete leve no máximo uma vez por cooldown:

```text
dotcontext: context is loaded, but no PREVC workflow is active.
For gated work and evidence, start a workflow with workflow-init through MCP.
```

### 5. A sessão termina com workflow PREVC ativo

Quando há workflow ativo, `Stop` chama `workflow-guide` com `intent: "session_end"`:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "Stop",
    "additionalContext": "..."
  }
}
```

O conteúdo de `additionalContext` é um resumo curto com próximos passos PREVC, skills relevantes e dicas de gate. Se o workflow já está completo, inexistente ou ilegível, a resposta volta a ser `{"continue": true}`.

Chamadas reentrantes de fim de sessão, como `stop_hook_active`, `sessionEndActive` ou equivalentes, também são tratadas como no-ops para evitar loop de encerramento.

## Variação no Pi

Pi não usa shell hook. O pacote `@dotcontext/pi` registra handlers TypeScript in-process:

| Evento Pi | Ação equivalente |
| --- | --- |
| `session_start` | `context check` |
| `session_start_navigation` | `context getMap` com `section: "navigation"` |
| `harness_create_session` | `harness createSession` |
| `tool_execution_end` para `write`, `edit`, `bash` | `harness appendTrace` |
| `agent_end` | `workflow-guide` com `intent: "session_end"` |

O efeito prático é o mesmo: bootstrap no início, trace depois de ações relevantes e lembrete PREVC no fim somente quando faz sentido.

## O que hooks não fazem

Hooks não inicializam o projeto sozinhos, não preenchem documentação, não criam plano e não avançam fases PREVC. Para isso, use MCP:

```bash
npx @dotcontext/mcp install codex --local
```

Depois, peça ao agente para usar as ferramentas MCP do dotcontext, como `context init`, `workflow-init`, `workflow-manage`, `workflow-advance` e sensores.

## Como verificar

Depois de instalar hooks e iniciar uma sessão no host:

1. Confirme que `SessionStart` mostra um resumo do dotcontext ou a dica de inicialização.
2. Faça o agente editar um arquivo ou rodar um comando.
3. Inspecione:

   ```bash
   ls .context/runtime/sessions
   cat .context/runtime/sessions/*/trace.jsonl
   ```

4. Se estiver usando Codex, rode `/hooks` no TUI e confie nos hooks do projeto antes da primeira execução.
5. Para diagnóstico Codex, rode:

   ```bash
   npx -y @dotcontext/cli@latest hook doctor codex
   npx -y @dotcontext/cli@latest hook doctor codex --json
   ```
