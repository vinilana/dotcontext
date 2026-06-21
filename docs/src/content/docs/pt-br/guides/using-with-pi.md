---
title: Usando dotcontext com Pi
description: Instale a extensão @dotcontext/pi, combine com MCP via pi-mcp-adapter e mantenha bootstrap, tracing e lembretes de workflow nas sessões Pi.
sidebar:
  order: 3
---

Pi usa **extensões TypeScript** em vez de hooks shell. O pacote `@dotcontext/pi` registra handlers in-process e chama o mesmo harness runtime que MCP e CLI.

:::tip[Duas superfícies, um runtime]
**Extensão Pi** — bootstrap, tracing, lembretes (baixo token). **MCP + pi-mcp-adapter** — ferramentas completas (`context init`, `workflow-init`, sensores, planos).
:::

## Setup recomendado

```bash
pi install npm:@dotcontext/pi
npx @dotcontext/mcp install pi --local
pi install npm:pi-mcp-adapter
```

Ou via hook install (imprime instruções e pode escrever `.mcp.json`):

```bash
npx -y @dotcontext/cli@latest hook install pi --local
```

## O que a extensão faz

| Evento Pi | Chamada harness | Efeito |
| --- | --- | --- |
| `session_start` | `context` → `check` | Injeta bootstrap ou dica |
| `tool_execution_end` | `harness` → `appendTrace` | Trace silencioso |
| `agent_end` | `workflow-status` | Notificação de fase PREVC |

## MCP

Config padrão em `.mcp.json`:

```json
{
  "mcpServers": {
    "dotcontext": {
      "command": "npx",
      "args": ["-y", "@dotcontext/mcp@latest"],
      "env": {}
    }
  }
}
```

Global: `~/.config/mcp/mcp.json`.

## Próximos passos

- [Usando dotcontext com Hooks](/pt-br/guides/using-with-hooks/)
- [Instalação](/pt-br/getting-started/installation/)
- [Quickstart](/pt-br/getting-started/quickstart/)
