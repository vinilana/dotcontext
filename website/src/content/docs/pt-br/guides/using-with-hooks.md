---
title: Usando dotcontext com Hooks
description: Instale hooks de ciclo de vida para Claude Code e Codex CLI — bootstrap de contexto, traces duráveis e lembretes de workflow sem carregar o MCP inteiro a cada turno.
sidebar:
  order: 2
---

Hooks conectam o dotcontext aos eventos de ciclo de vida do seu agente. Em vez de depender do MCP em cada início de sessão, hooks executam chamadas leves ao harness: verificar `.context/`, registrar traces após Write/Edit/Bash e mostrar status PREVC ao encerrar.

:::tip[Hooks vs MCP]
Use **hooks** para bootstrap, tracing e lembretes (baixo custo de tokens). Use **MCP** para a superfície completa (`context init`, `workflow-init`, sensores, planos). A maioria dos usuários de Claude Code e Codex se beneficia dos dois.
:::

## Hosts suportados

| Host | Comando | Config |
| --- | --- | --- |
| Claude Code | `dotcontext hook install claude-code` | `~/.claude/settings.json` ou `.claude/settings.json` |
| Codex CLI | `dotcontext hook install codex` | `.codex/hooks.json` ou inline em `config.toml` |

Pi usa extensão in-process — veja [Usando dotcontext com Pi](/pt-br/guides/using-with-pi/).

## Instalação

```bash
npx -y @dotcontext/cli@latest hook install
npx -y @dotcontext/cli@latest hook install claude-code --local
npx -y @dotcontext/cli@latest hook install codex --dry-run
```

Flags: `--global`, `--local`, `--dry-run`, `--format json|toml` (Codex), `-v`. Logs em `.context/logs/hook-install.log`.

## O que os hooks fazem

| Momento | Ação no harness | Efeito |
| --- | --- | --- |
| Início de sessão | `context` → `check` | Injeta índice compacto se `.context/` existir |
| Sem `.context/` | informativo | Dica para inicializar via MCP |
| Pós ferramenta (Write/Edit/Bash) | `harness` → `appendTrace` | Trace em `.context/runtime/` |
| Stop / fim | `workflow-status` | Resumo de fase PREVC |

Hooks são **não bloqueantes** por padrão.

## Codex: confiar nos hooks

Após instalar hooks de projeto no Codex, abra `/hooks` no TUI e confie nas definições antes da primeira execução.

## Próximos passos

- [Usando dotcontext com MCP](/pt-br/guides/using-with-mcp/)
- [Usando dotcontext com Pi](/pt-br/guides/using-with-pi/)
- [Instalação](/pt-br/getting-started/installation/)
