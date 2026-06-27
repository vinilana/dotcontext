---
title: Referência dos comandos CLI
description: Referência completa da CLI do dotcontext — invocação, opções globais, todos os comandos públicos com flags e exemplos, e os comandos admin ocultos.
sidebar:
  order: 2
---

Esta página é a **referência completa de comandos** da CLI do dotcontext. Para um passo a passo guiado e orientado a tarefas, comece por [Usando a CLI](/pt-br/guides/using-the-cli/) — e volte aqui quando precisar da flag exata de um comando específico.

Um modelo mental rápido antes das tabelas: **o MCP cria e preenche o contexto; a CLI distribui e inspeciona.** A superfície da CLI é deliberadamente focada em *sync*, *import/export*, *setup do MCP*, *relatórios* e *admin de baixo nível*. Criação de contexto, fills gerados por IA e scaffolding de planos vivem no [servidor MCP](/pt-br/reference/mcp-tools/).

## Invocação

A CLI é distribuída no pacote `@dotcontext/cli` e expõe o binário `dotcontext`. Requer Node `>=20`.

```bash
# Executar sob demanda (sem instalar) — abre o modo interativo quando nenhum comando é passado
npx -y @dotcontext/cli@latest

# Executar um comando específico
npx -y @dotcontext/cli@latest <comando> [opções]

# Ou instalar globalmente e chamar o binário diretamente
npm install -g @dotcontext/cli
dotcontext <comando> [opções]
```

Executar o binário **sem comando** abre o menu interativo (veja [Modo interativo](#modo-interativo)).

## Opções globais

Estas flags se aplicam ao programa de nível superior e à maioria dos subcomandos.

| Flag | Descrição | Padrão |
| --- | --- | --- |
| `-l, --lang <locale>` | Define o idioma da interface (`en`, `pt-BR`) | Detectado do ambiente |
| `--version` | Exibe a versão da CLI | — |
| `--help` | Exibe a ajuda do programa ou de um comando | — |

::: tip
`--help` funciona em todos os níveis. Experimente `dotcontext --help`, `dotcontext sync --help` ou `dotcontext admin workflow --help` para ver as flags exatas de qualquer comando.
:::

## Comandos públicos

Estes comandos aparecem em `dotcontext --help` e são os mais usados no dia a dia.

| Comando | O que faz |
| --- | --- |
| [`sync`](#sync) | Exporta playbooks de agentes de `.context/agents` para diretórios de ferramentas de IA |
| [`import-rules`](#import-rules) | Importa regras de arquivos de origem para `.context/docs/` |
| [`import-agents`](#import-agents) | Importa definições de agentes para `.context/agents/` |
| [`reverse-sync`](#reverse-sync) | Escaneia diretórios de ferramentas de IA e importa regras, agentes e skills para `.context/` |
| [`export-rules`](#export-rules) | Exporta as regras de `.context/docs/` para diretórios de ferramentas de IA |
| [`mcp`](#mcp) | Inicia o servidor MCP (transporte stdio) |
| [`mcp:install`](#mcpinstall) | Instala a configuração do servidor MCP em ferramentas de IA suportadas |

A maioria dos comandos aceita um `[repo-path]` posicional (padrão: diretório de trabalho atual), além de `--dry-run` para pré-visualizar, `--force` para sobrescrever e `-v, --verbose` para saída detalhada.

### sync

Exporta playbooks de agentes de `.context/agents` para um ou mais diretórios de ferramentas de IA. (O alias oculto `sync-agents` faz a mesma coisa.)

| Flag | Descrição | Padrão |
| --- | --- | --- |
| `-s, --source <dir>` | Diretório de origem | `./.context/agents` |
| `-t, --target <paths...>` | Caminhos dos diretórios de destino | — |
| `-m, --mode <type>` | Modo de sync (`symlink` ou `markdown`) | `symlink` |
| `-p, --preset <name>` | Presets de destino (ex.: `claude`, `github`, `all`) | — |
| `--force` | Sobrescreve arquivos existentes | `false` |
| `--dry-run` | Pré-visualiza sem gravar | `false` |
| `-v, --verbose` | Saída detalhada | `false` |

```bash
dotcontext sync --preset claude --force
dotcontext sync --source ./.context/agents --target ./.claude/agents --mode symlink
dotcontext sync --dry-run
```

### import-rules

Importa regras de arquivos de origem externos para `.context/docs/`. Útil para trazer regras de arquivos de config de outras ferramentas para o seu contexto centralizado.

| Flag | Descrição | Padrão |
| --- | --- | --- |
| `[repo-path]` | Caminho do repositório a escanear | cwd |
| `-s, --source <paths...>` | Caminhos de arquivos ou diretórios de origem | — |
| `-t, --target <dir>` | Diretório de destino em `.context/` | — |
| `-f, --format <format>` | Formato de entrada (ex.: `markdown`) | `markdown` |
| `--force` | Sobrescreve arquivos existentes | `false` |
| `--dry-run` | Pré-visualiza | `false` |
| `--no-auto-detect` | Desativa a detecção automática de arquivos de origem | auto-detect ligado |
| `-v, --verbose` | Saída detalhada | `false` |

```bash
dotcontext import-rules --source ./rules --target .context/docs
dotcontext import-rules --format markdown
dotcontext import-rules --dry-run
```

### import-agents

Importa definições de agentes de arquivos de origem externos para `.context/agents/`.

| Flag | Descrição | Padrão |
| --- | --- | --- |
| `[repo-path]` | Caminho do repositório a escanear | cwd |
| `-s, --source <paths...>` | Caminhos de arquivos ou diretórios de origem | — |
| `-t, --target <dir>` | Diretório de destino em `.context/` | — |
| `--force` | Sobrescreve arquivos existentes | `false` |
| `--dry-run` | Pré-visualiza | `false` |
| `--no-auto-detect` | Desativa a detecção automática de arquivos de origem | auto-detect ligado |
| `-v, --verbose` | Saída detalhada | `false` |

```bash
dotcontext import-agents --source ./agents --target .context/agents
dotcontext import-agents --force
dotcontext import-agents --dry-run
```

### reverse-sync

A importação reversa unificada: escaneia diretórios de ferramentas de IA (Claude Code, Cursor, GitHub Copilot, Windsurf, Cline, Continue e outras) e traz regras, agentes e skills de volta para `.context/`. É o inverso de `sync`/`export-rules`.

| Flag | Descrição | Padrão |
| --- | --- | --- |
| `[repo-path]` | Caminho do repositório a escanear | cwd |
| `--dry-run` | Pré-visualiza sem importar | `false` |
| `-f, --force` | Sobrescreve arquivos existentes | `false` |
| `--skip-agents` | Pula a importação de agentes | `false` |
| `--skip-skills` | Pula a importação de skills | `false` |
| `--skip-rules` | Pula a importação de regras | `false` |
| `--merge-strategy <strategy>` | Resolução de conflitos: `skip`, `overwrite`, `merge`, `rename` | `skip` |
| `--format <format>` | Formato de saída das regras: `formatted`, `markdown`, `raw` | `formatted` |
| `--no-metadata` | Não adiciona metadados de importação aos arquivos | metadados ligados |
| `-v, --verbose` | Saída detalhada | `false` |

```bash
dotcontext reverse-sync
dotcontext reverse-sync --skip-rules --skip-agents
dotcontext reverse-sync --merge-strategy merge --format formatted
dotcontext reverse-sync --dry-run
```

### export-rules

Exporta as regras de `.context/docs/` para diretórios de ferramentas de IA. (Oculto na ajuda de nível superior, mas é um comando totalmente público.)

| Flag | Descrição | Padrão |
| --- | --- | --- |
| `[repo-path]` | Caminho do repositório | cwd |
| `-s, --source <dir>` | Diretório de regras de origem | `.context/docs` |
| `-t, --targets <paths...>` | Diretórios de destino | — |
| `--preset <name>` | Presets de destino | — |
| `--force` | Sobrescreve arquivos existentes | `false` |
| `--dry-run` | Pré-visualiza | `false` |
| `-v, --verbose` | Saída detalhada | `false` |

```bash
dotcontext export-rules --source .context/docs --preset claude
dotcontext export-rules --targets .claude .github --force
dotcontext export-rules --dry-run
```

### mcp

Inicia o servidor MCP via stdio. A maioria dos usuários nunca executa isso manualmente — os clientes de IA o iniciam por você usando a config gravada pelo `mcp:install`. Execute manualmente apenas para depurar o transporte.

| Flag | Descrição | Padrão |
| --- | --- | --- |
| `-r, --repo-path <path>` | Caminho de repositório padrão para as ferramentas MCP | — |
| `-v, --verbose` | Ativa logging detalhado no stderr | `false` |

```bash
dotcontext mcp
dotcontext mcp --verbose
dotcontext mcp --repo-path /caminho/do/repo
```

::: note
Não existe um binário global separado para o servidor no pacote `@dotcontext/cli` publicado — o bin `dotcontext-mcp` existe apenas no build isolado do pacote `@dotcontext/mcp`. A partir da CLI, inicie o servidor com `dotcontext mcp`. Veja [Arquitetura](/pt-br/about/architecture/) para entender como as superfícies são separadas.
:::

### mcp:install

Instala (ou atualiza) a configuração do servidor MCP para uma ferramenta de IA suportada. Execute sem nome de ferramenta para escolher interativamente; passe um nome de ferramenta para mirá-la diretamente. Veja [Instalando com MCP](/pt-br/guides/using-with-mcp/) para a lista completa de clientes suportados e caminhos de config.

MCP é a superfície completa de tools do dotcontext. Para alvos com hooks, `mcp:install` pode recomendar hooks de ciclo de vida depois que a config MCP é tratada. Hooks são recomendados, opcionais e não bloqueantes; são elegíveis somente para `claude` -> `claude-code`, `codex` -> `codex` e `pi` -> `pi`.

| Flag | Descrição | Padrão |
| --- | --- | --- |
| `[tool]` | Nome de ferramenta específica (omita para escolher interativamente) | pergunta |
| `-g, --global` | Instala na config global (home) | `true` |
| `-l, --local` | Instala na config local/no nível do repositório | `false` |
| `--dry-run` | Pré-visualiza sem gravar | `false` |
| `--with-hooks` | Instala hooks recomendados elegíveis depois do MCP sem perguntar | `false` |
| `--no-hooks` | Não pergunta, não instala e não imprime recomendação de hooks | `false` |
| `--hook-format <json\|toml>` | Formato dos hooks do Codex na etapa recomendada | `json` |
| `-v, --verbose` | Saída detalhada | `false` |

```bash
dotcontext mcp:install
dotcontext mcp:install claude
dotcontext mcp:install --global
dotcontext mcp:install --local --dry-run
dotcontext mcp:install codex --with-hooks
dotcontext mcp:install codex --with-hooks --hook-format toml
dotcontext mcp:install codex --no-hooks
```

Execuções interativas perguntam sobre hooks recomendados depois da config MCP quando o alvo selecionado é Claude Code, Codex CLI ou Pi. Execuções não interativas nunca escrevem hooks sem `--with-hooks`. `--no-hooks` suprime prompts e a recomendação. `--with-hooks --no-hooks` é inválido.

A config MCP é global por padrão; hooks recomendados instalam config local no projeto por padrão. Para Codex, rode `/hooks` dentro do Codex e confie nos hooks do projeto depois que a config for escrita. Para Pi, o fluxo combinado usa o instalador MCP para o snippet MCP e não o duplica pela etapa de hook do Pi.

## Modo interativo

Invocar a CLI sem argumentos (`npx -y @dotcontext/cli@latest`) abre um menu guiado. Primeiro ele detecta o estado do seu projeto — `new`, `unfilled`, `outdated` ou `uptodate` — e então adapta o menu:

- **Projeto novo** — oferece instalação do MCP, reverse-sync ou configurações.
- **Projeto não preenchido** — lista os arquivos pendentes aguardando conteúdo e então mostra o menu completo.
- **Projeto atualizado** — mostra o menu completo com estatísticas de sync.

O menu completo oferece Quick Sync (sync unificado de agentes, skills e docs), Reverse Sync, MCP Install, Settings (seleção de idioma), View Pending (quando há arquivos aguardando conteúdo) e Exit. A ação MCP Install usa o mesmo caminho de recomendação de hooks que `mcp:install`: hooks são oferecidos somente para Claude Code, Codex CLI e Pi, e continuam opcionais.

## Comandos ocultos / admin

Os comandos admin cobrem **gerenciamento de estado de workflow de baixo nível** e utilitários de inspeção. São a contraparte na CLI das ferramentas de workflow do MCP — úteis para scripting e depuração, mas a lógica de workflow de alto nível é MCP-first.

::: note[Registro duplo]
Cada comando admin é registrado **duas vezes**: sob o grupo visível `admin` *e* como um comando de nível superior oculto. Ou seja, ambos funcionam e são equivalentes:

```bash
dotcontext admin workflow status
dotcontext workflow status        # alias oculto, mesmo comando
```

A forma `admin <subcomando>` é a documentada e descobrível (aparece em `dotcontext admin --help`). A forma de nível superior oculta é apenas um alias de conveniência.
:::

Os comandos admin são:

| Comando | Propósito |
| --- | --- |
| [`admin workflow`](#admin-workflow) | Gerencia o estado do workflow PREVC e as transições de fase |
| [`admin skill`](#admin-skill) | Lista e exporta skills |
| [`admin report`](#admin-report) | Gera relatórios de progresso e saúde do workflow |
| `admin preview-splash` | Renderiza a tela de splash de inicialização (utilitário de debug interno) |

### admin workflow

Orquestração de baixo nível do workflow PREVC. A maioria dos subcomandos aceita `-r, --repo-path <path>` (padrão: cwd).

| Subcomando | Argumentos / flags | Propósito |
| --- | --- | --- |
| `init <name>` | `-d, --description <text>`, `-s, --scale <QUICK\|SMALL\|MEDIUM\|LARGE>`, `-r, --repo-path <path>` | Inicializa um novo workflow PREVC |
| `status` | `-r, --repo-path <path>` | Mostra a fase atual e recomendações |
| `advance` | `-o, --outputs <files...>`, `-r, --repo-path <path>` | Conclui a fase atual e avança para a próxima |
| `handoff <from> <to>` | `-a, --artifacts <files...>`, `-r, --repo-path <path>` | Transfere trabalho entre roles |
| `collaborate <topic>` | `-p, --participants <roles...>`, `-r, --repo-path <path>` | Inicia uma sessão de colaboração entre roles |
| `role <action> <role>` | `-o, --outputs <files...>`, `-r, --repo-path <path>` | Gerencia um único role (`start` / `complete`) |

```bash
dotcontext admin workflow init "dark-mode" --description "Add dark mode" --scale MEDIUM
dotcontext admin workflow status
dotcontext admin workflow advance --outputs report.md
dotcontext admin workflow handoff planner implementer --artifacts plan.md
dotcontext admin workflow collaborate "code review" --participants implementer reviewer
dotcontext admin workflow role complete reviewer --outputs review.md
```

::: caution
`admin workflow init` gerencia o **estado do workflow**, não o diretório `.context/` em si. Criar a estrutura de contexto, preencher docs e fazer scaffolding de planos são operações MCP-first — veja a [referência das ferramentas MCP](/pt-br/reference/mcp-tools/) e o [conceito do workflow PREVC](/pt-br/concepts/prevc-workflow/).
:::

### admin skill

Descobre e distribui skills (guias de expertise sob demanda).

| Subcomando | Argumentos / flags | Propósito |
| --- | --- | --- |
| `list` | `[repo-path]`, `--json` | Lista todas as skills disponíveis (built-in + customizadas) |
| `export` | `[repo-path]`, `-p, --preset <preset>`, `-f, --force`, `--include-builtin`, `--dry-run` | Exporta skills para diretórios de ferramentas de IA |

Os presets de `export` incluem `all` (padrão), `claude`, `github`, `windsurf`, `codex`, `antigravity` e nomes de ferramentas individuais.

```bash
dotcontext admin skill list --json
dotcontext admin skill export --preset all
dotcontext admin skill export --preset claude --force
dotcontext admin skill export --include-builtin --dry-run
```

### admin report

Gera um relatório de progresso do workflow e de saúde do projeto.

| Flag | Descrição | Padrão |
| --- | --- | --- |
| `[repo-path]` | Caminho do repositório | cwd |
| `-f, --format <format>` | Formato de saída: `console`, `json` | `console` |
| `-o, --output <path>` | Grava em arquivo (omita para gravar no stdout) | stdout |
| `--include-stack` | Inclui stack traces nos erros | `false` |
| `-v, --verbose` | Saída detalhada | `false` |

```bash
dotcontext admin report
dotcontext admin report --format json --output report.json
dotcontext admin report --include-stack --verbose
```

## O que a CLI não faz

Por design, a CLI standalone **não** oferece comandos para criar contexto do zero, gerar documentação automaticamente, fazer scaffolding de planos PREVC ou rodar análise semântica de código. Esses fluxos são guiados por IA e vivem no servidor MCP:

| Quer… | Use em vez disso |
| --- | --- |
| Criar a estrutura `.context/` | Ferramenta MCP `context` (`init`) — veja [ferramentas MCP](/pt-br/reference/mcp-tools/) |
| Preencher docs e agentes automaticamente | Ferramenta MCP `context` (`fill`, `fillSingle`) |
| Fazer scaffolding e rastrear planos PREVC | Ferramenta MCP `plan` e `workflow-init` |
| Analisar código / construir contexto semântico | Ferramentas MCP `context`/`explore` |

## Veja também

- [Usando a CLI](/pt-br/guides/using-the-cli/) — passo a passo orientado a tarefas dos comandos acima
- [Instalando com MCP](/pt-br/guides/using-with-mcp/) — configure o servidor MCP na sua ferramenta de IA
- [Referência das ferramentas MCP](/pt-br/reference/mcp-tools/) — a superfície voltada para IA
- [Arquitetura](/pt-br/about/architecture/) — como `cli`, `harness` e `mcp` são separados e publicados
