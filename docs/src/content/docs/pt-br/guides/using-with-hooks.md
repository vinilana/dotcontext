---
title: Usando dotcontext com Hooks
description: Instale hooks de ciclo de vida para Claude Code e Codex CLI — bootstrap de contexto, traces duráveis e lembretes de workflow sem carregar o MCP inteiro a cada turno.
sidebar:
  order: 2
---

Hooks conectam o dotcontext aos eventos de ciclo de vida do seu agente. Em vez de depender do MCP em cada início de sessão, hooks executam chamadas leves ao harness: verificar `.context/`, registrar traces após Write/Edit/Bash e mostrar status PREVC ao encerrar quando existe um workflow PREVC ativo.

:::tip[Hooks vs MCP]
Use **hooks** para bootstrap, tracing e lembretes (baixo custo de tokens). Use **MCP** para a superfície completa (`context init`, `workflow-init`, sensores, planos). A maioria dos usuários de Claude Code e Codex se beneficia dos dois.
:::

## Hosts suportados

| Host | Comando | Config |
| --- | --- | --- |
| Claude Code | `dotcontext hook install claude-code` | `.claude/settings.json` por padrão, ou `~/.claude/settings.json` com `--global` |
| Codex CLI | `dotcontext hook install codex` | `.codex/hooks.json` por padrão, ou `.codex/config.toml` com `--format toml` |

Pi usa extensão in-process — veja [Usando dotcontext com Pi](/pt-br/guides/using-with-pi/).

## Instalação

O instalador escreve configuração local no projeto por padrão:

```bash
# Interativo: detecta hosts instalados
npx -y @dotcontext/cli@latest hook install

# Host específico
npx -y @dotcontext/cli@latest hook install claude-code

# Codex em TOML inline
npx -y @dotcontext/cli@latest hook install codex --format toml

# Config global no diretório home
npx -y @dotcontext/cli@latest hook install claude-code --global

# Prévia sem escrever arquivos
npx -y @dotcontext/cli@latest hook install codex --dry-run
```

Flags: `--global`, `--local`, `--dry-run`, `--format json|toml` (somente Codex), `-v`. Ações de instalação são registradas em `.context/logs/hook-install.log`.

## O que os hooks fazem

| Momento | Ação no harness | Efeito |
| --- | --- | --- |
| Início sem `.context/` | `context` → `check` | Retorna uma dica curta e JSON-safe para configurar MCP e rodar `context init`; não cria `.context/runtime` |
| Início com `.context/` parcial | `context` → `check` | Lista até três partes faltantes do setup, como `workflow` ou `plans` |
| Início com `.context/` pronto | `context` → `check`, vínculo de sessão e `context` → `getMap` | Injeta contexto/navegação compactos, lembrete diário de workflow ausente ou preflight PREVC ativo |
| Pós ferramenta (Write/Edit/Bash) | `harness` → `appendTrace` | Trace em `.context/runtime/`; Bash recebe classificação best-effort |
| Stop / fim | `workflow-guide` | Próximos passos, skills e dicas de gate PREVC somente quando existe um workflow PREVC ativo |

Hooks são **não bloqueantes** por padrão. Erros do harness não encerram a sessão do agente. Stop/fim também fica silencioso quando não há workflow PREVC ativo, quando o estado de workflow está ausente ou malformado, e durante reentrada do host. Nesses casos, o hook retorna um no-op bem-sucedido para não criar ruído no encerramento.

O dispatch resolve o root do projeto nesta ordem: `--repo-path`, ancestral mais próximo com `.context/`, `cwd` e, por fim, `process.cwd()`. Isso mantém traces vinculados ao root esperado quando a sessão começa dentro de um subdiretório de monorepo.

A classificação de Bash só lê o comando que o host já enviou; ela não executa comandos extras. Exemplos: `npm test`, `vitest` e `jest` viram `test`; `npm run build` e `tsc` viram `build`; `eslint` e `npm run lint` viram `lint`; `git status` e `git diff` viram `inspection`.

Falhas repetidas de append trace são registradas em `.context/runtime/hooks/trace-failures.json` e aparecem no `hook doctor`; a primeira falha continua silenciosa para o host.

## Claude Code

O instalador grava entradas `hooks` em `.claude/settings.json` por padrão. Cada entrada chama:

```bash
npx -y @dotcontext/cli@latest hook dispatch --source claude-code
```

Eventos configurados:

| Evento | Matcher |
| --- | --- |
| `SessionStart` | `*` |
| `PostToolUse` | `^Write$\|^Edit$\|^Bash$` |
| `Stop` | `*` |

Depois de instalar, reinicie o Claude Code. Em um projeto com `.context/` inicializado, o próximo `SessionStart` deve injetar um resumo compacto de contexto.

## Codex CLI

Hooks do Codex usam o mesmo dispatch com `--source codex`:

```bash
npx -y @dotcontext/cli@latest hook dispatch --source codex
```

O instalador escreve uma destas configurações:

- **JSON**: `.codex/hooks.json` com wrapper `{ "hooks": { ... } }`;
- **TOML**: blocos `[[hooks.SessionStart]]` dentro de `.codex/config.toml`, usando `--format toml`.

No formato TOML, o instalador também garante `[features].hooks = true`.

## Codex: confiar nos hooks

Após instalar hooks de projeto no Codex, rode `/hooks` no TUI e confie nas definições antes da primeira execução. Este passo é obrigatório: o arquivo `.codex/hooks.json` ou `.codex/config.toml` pode existir, mas o Codex não executa hooks de projeto enquanto eles não forem confiados.

## Verificação

Para Claude Code, inicie uma sessão em um projeto com `.context/` inicializado e confirme que o bootstrap aparece no início.

Para Codex, depois de rodar `/hooks` e confiar nos hooks, edite um arquivo pelo Codex e verifique se `.context/runtime/sessions/*/trace.jsonl` recebeu um evento `tool.use`.

Use o doctor para validar a instalação do Codex:

```bash
npx -y @dotcontext/cli@latest hook doctor codex
npx -y @dotcontext/cli@latest hook doctor codex --json
```

O doctor do Codex verifica `.codex/hooks.json` ou `.codex/config.toml`, `[features].hooks = true` no TOML, comandos atuais de dispatch dotcontext, `.context/`, estado do workflow, trace recente e falhas de trace.

## Desinstalação

```bash
npx -y @dotcontext/cli@latest hook uninstall claude-code
npx -y @dotcontext/cli@latest hook uninstall codex --format toml
```

Use `--dry-run` para pré-visualizar remoções.

## Combine com MCP

Configuração recomendada para Claude Code ou Codex CLI:

1. Instale MCP para a superfície completa:

   ```bash
   npx @dotcontext/mcp install claude
   # ou
   npx @dotcontext/mcp install codex --local
   ```

2. Instale hooks para bootstrap e tracing em segundo plano:

   ```bash
   npx -y @dotcontext/cli@latest hook install claude-code
   # ou
   npx -y @dotcontext/cli@latest hook install codex
   ```

3. Se instalou hooks do Codex, rode `/hooks` no Codex e confie nos hooks do projeto.

4. Inicialize contexto pelo agente (MCP `context init`) e deixe os hooks manterem sessões e traces nas próximas execuções.

## Próximos passos

- [Usando dotcontext com MCP](/pt-br/guides/using-with-mcp/)
- [Usando dotcontext com Pi](/pt-br/guides/using-with-pi/)
- [Instalação](/pt-br/getting-started/installation/)
