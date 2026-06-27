---
title: Usando a CLI
description: Um guia prático para a CLI standalone do dotcontext — invocação, modo interativo e os comandos de sync, import/export, relatórios e setup de MCP que ela oferece.
sidebar:
  order: 2
---

A CLI do dotcontext é a superfície **voltada ao operador** do runtime. Enquanto o [servidor MCP](/pt-br/guides/using-with-mcp/) dá ao seu agente de código acesso ao vivo, dentro do loop, ao contexto e ao workflow PREVC, a CLI é o que *você* roda no terminal para mover artefatos entre o `.context/` e suas ferramentas de IA, instalar o servidor MCP e inspecionar o progresso do workflow.

Um bom modelo mental: **o MCP cria e preenche o contexto; a CLI distribui e inspeciona.**

::: tip[Caminho recomendado]
A maioria dos usuários nunca precisa instalar a CLI globalmente. Rode-a sob demanda com `npx` e use o [fluxo de instalação do MCP](/pt-br/guides/using-with-mcp/) para as partes que se beneficiam de um agente (init, fill, plan, analyze).
:::

## Invocação

A CLI é distribuída como `@dotcontext/cli` e expõe o binário `dotcontext`. Requer Node `>=20`.

```bash
# Roda sob demanda (sem instalar) — abre o modo interativo
npx -y @dotcontext/cli@latest

# Roda um comando específico
npx -y @dotcontext/cli@latest <comando> [opções]

# Ou instala globalmente e chama o binário diretamente
npm install -g @dotcontext/cli
dotcontext <comando> [opções]
```

### Opções globais

| Flag | Descrição | Padrão |
| --- | --- | --- |
| `-l, --lang <locale>` | Define o idioma da interface (`en`, `pt-BR`) | Detectado do ambiente |
| `--version` | Mostra a versão da CLI | — |
| `--help` | Mostra a ajuda de um comando | — |

## Modo interativo

Rode a CLI **sem argumentos** para entrar em um menu guiado. A CLI primeiro detecta o estado do seu projeto e adapta o que oferece:

| Estado detectado | O que você vê |
| --- | --- |
| Projeto **novo** (sem `.context/`) | Instalar MCP, reverse sync ou configurações |
| Projeto **não preenchido** (scaffold existe, arquivos pendentes) | Lista de arquivos pendentes, depois o menu completo |
| Projeto **atualizado** | Menu completo com estatísticas de sync |

O menu completo oferece estas ações:

- **Quick Sync** — exportação unificada de agents, skills e docs para suas ferramentas de IA, com customização de destino
- **Reverse Sync** — import interativo dos diretórios de ferramentas de IA de volta para o `.context/`
- **MCP Install** — setup interativo do servidor MCP
- **Settings** — seleção de idioma
- **View Pending** — lista os arquivos aguardando conteúdo (exibido quando o projeto está não preenchido)
- **Exit**

::: note
O modo interativo é o ponto de entrada mais amigável. Toda ação que ele executa corresponde a um dos comandos explícitos abaixo, então, depois de conhecer o fluxo, você pode automatizá-lo.
:::

## Comandos principais

A superfície pública da CLI é focada em **sync, import/export, setup de MCP e relatórios**. Para o detalhamento flag a flag, veja a [referência da CLI](/pt-br/reference/cli-commands/).

### Sincronizar agents para suas ferramentas

`sync` exporta os playbooks de agents de `.context/agents` para um ou mais diretórios de ferramentas de IA.

```bash
# Cria symlinks dos agents no diretório do Claude Code
dotcontext sync --source ./.context/agents --target ./.claude/agents --mode symlink

# Usa um preset de destino e sobrescreve arquivos existentes
dotcontext sync --preset claude --force

# Pré-visualiza sem escrever
dotcontext sync --dry-run
```

Principais opções: `-s, --source <dir>` (padrão `./.context/agents`), `-t, --target <paths...>`, `-m, --mode <symlink|...>`, `-p, --preset <name>`, `--force`, `--dry-run`, `-v, --verbose`.

### Exportar rules e docs

`export-rules` distribui documentação e rules de `.context/docs` para os diretórios de configuração das ferramentas de IA.

```bash
dotcontext export-rules --source .context/docs --preset claude
dotcontext export-rules --targets .claude .github --force
dotcontext export-rules --dry-run
```

### Importar de fontes externas

Dois importadores focados trazem material externo *para dentro* do `.context/`:

```bash
# Importa rules/docs de arquivos externos para .context/docs
dotcontext import-rules --source ./rules --target .context/docs

# Importa definições de agents para .context/agents
dotcontext import-agents --source ./agents --target .context/agents
```

Ambos aceitam `--dry-run`, `--force` e `--no-auto-detect` (a detecção automática de arquivos de origem fica ligada por padrão).

### Reverse sync (puxar tudo de volta)

`reverse-sync` é o importador unificado: ele varre seus diretórios de ferramentas de IA (Claude Code, Cursor, GitHub Copilot, Windsurf, Cline, Continue e outros) e puxa **rules, agents e skills** de volta para o `.context/`.

```bash
# Importa tudo que encontrar
dotcontext reverse-sync

# Pula categorias que você não quer
dotcontext reverse-sync --skip-rules --skip-agents

# Controla como conflitos são resolvidos
dotcontext reverse-sync --merge-strategy merge --format formatted

# Pré-visualiza primeiro
dotcontext reverse-sync --dry-run
```

`--merge-strategy` aceita `skip` (padrão), `overwrite`, `merge` ou `rename`. Use `--no-metadata` para pular o frontmatter de import que a CLI adiciona por padrão.

### Gerar relatórios

`report` (dentro de `admin`) inspeciona o progresso do workflow, o inventário de artefatos e a saúde do projeto.

```bash
dotcontext admin report
dotcontext admin report --format json
dotcontext admin report --format console --output report.txt
dotcontext admin report --include-stack
```

`--format` é `console` (padrão) ou `json`; omita `--output` para escrever no stdout.

### Gerenciar skills

```bash
# Lista skills built-in e customizadas
dotcontext admin skill list
dotcontext admin skill list --json

# Exporta skills para ferramentas de IA
dotcontext admin skill export --preset all
dotcontext admin skill export --preset claude --force
```

## Setup de MCP pela CLI

A CLI também é como você conecta o servidor MCP ao seu editor ou agente. São dois comandos distintos.

### Instalar a configuração do MCP

`mcp:install` escreve (ou atualiza) a entrada do servidor MCP na configuração da sua ferramenta de IA. Rode de forma interativa ou nomeie uma ferramenta diretamente.

```bash
# Interativo — detecta ferramentas instaladas e pergunta
dotcontext mcp:install

# Mira uma ferramenta específica
dotcontext mcp:install claude

# Escolhe o escopo e pré-visualiza
dotcontext mcp:install --global
dotcontext mcp:install --local --dry-run

# Instala MCP mais hooks recomendados elegíveis
dotcontext mcp:install codex --with-hooks
```

Opções: `[tool]` (omita para ser perguntado), `-g, --global` (padrão), `-l, --local`, `--dry-run`, `--with-hooks`, `--no-hooks`, `--hook-format json|toml` e `-v, --verbose`. Hooks são recomendados e opcionais para Claude Code, Codex CLI e Pi; eles instalam config local no projeto por padrão. Veja [Usando o dotcontext com MCP](/pt-br/guides/using-with-mcp/) para a lista completa de ferramentas suportadas e caminhos de configuração.

### Rodar o servidor MCP

`mcp` inicia o servidor em si — é isso que um cliente MCP invoca por baixo dos panos.

```bash
dotcontext mcp
dotcontext mcp --verbose
dotcontext mcp --repo-path /caminho/para/repo
```

Opções: `-r, --repo-path <path>` (repo padrão para as ferramentas MCP), `-v, --verbose` (loga no stderr).

::: note
Normalmente você não roda `dotcontext mcp` na mão. A configuração de MCP instalada pelo `mcp:install` (ou por `npx @dotcontext/mcp install`) inicia o servidor para você quando seu agente se conecta.
:::

## O que a CLI *não* faz

Esta é a coisa mais importante de internalizar. **Criação de contexto, preenchimentos gerados por IA e scaffolding de planos são MCP-first.** A CLI standalone não tem comandos diretos para:

| Capacidade | Onde vive | Notas |
| --- | --- | --- |
| `init` — criar `.context/` do zero | Ferramenta MCP `context` (`action: "init"`) | O `admin workflow init` da CLI gerencia o *estado* do workflow, não o scaffolding de contexto |
| `fill` — gerar conteúdo de docs automaticamente | Ferramenta MCP `context` (`fill`, `fillSingle`) | Requer o runtime MCP movido pelo Claude |
| `plan` — fazer scaffold de planos PREVC | Ferramenta MCP `context` (`scaffoldPlan`) e ferramenta `plan` | — |
| `update` — reescritas sistemáticas de rules | Ferramenta MCP `context` | A CLI só importa/exporta rules literalmente |
| `analyze` — análise de código e indexação semântica | Ferramentas MCP `explore` / `context` | — |

A superfície da CLI é deliberadamente **focada em sync e admin**: ela distribui artefatos entre o `.context/` e os diretórios de ferramentas de IA, gerencia o estado de baixo nível do workflow e oferece utilitários de introspecção. Tudo que precisa de um modelo para *gerar* conteúdo é delegado ao servidor MCP.

::: caution
`dotcontext admin workflow init "nome"` existe, mas ele inicializa o **estado do workflow PREVC** — não faz scaffold do diretório `.context/`. Para criar contexto, use a ferramenta MCP `context`. Veja [Usando o dotcontext com MCP](/pt-br/guides/using-with-mcp/).
:::

## Para onde ir agora

- [Referência de comandos da CLI](/pt-br/reference/cli-commands/) — cada comando, flag e padrão
- [Usando o dotcontext com MCP](/pt-br/guides/using-with-mcp/) — a metade do produto guiada por agente
- [Instalação](/pt-br/getting-started/installation/) — caminhos de instalação para CLI e MCP
- [A convenção `.context`](/pt-br/concepts/context-convention/) — o que a CLI está sincronizando

Código-fonte no [GitHub](https://github.com/vinilana/dotcontext).
