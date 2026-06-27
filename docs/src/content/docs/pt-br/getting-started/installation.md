---
title: Instalação
description: Instale o dotcontext pelo fluxo recomendado do servidor MCP ou pela CLI standalone, sem precisar de API key.
sidebar:
  order: 2
---

O dotcontext é distribuído como cinco pacotes coordenados — `@dotcontext/mcp`, `@dotcontext/cli`, `@dotcontext/harness`, `@dotcontext/integrations` e `@dotcontext/pi` — que seguem o formato de produto `cli -> harness <- mcp` com hooks de host via `integrations`. Para o uso do dia a dia, você só precisa de um dos dois caminhos de instalação.

Existem duas formas de começar:

1. **Instalação MCP (recomendada)** — conecta o dotcontext ao seu cliente de IA para que context, planejamento e o workflow PREVC rodem dentro do seu assistente. Não precisa de API key.
2. **Instalação da CLI** — uma ferramenta de linha de comando standalone focada em tarefas de sync e admin (importar/exportar rules, agents e skills entre o `.context/` e suas ferramentas de IA).

:::tip[Caminho recomendado]
Comece pela instalação MCP. Criação de context, fills gerados por IA e scaffolding de plano são MCP-first, então o servidor MCP entrega toda a superfície do produto dentro do seu assistente. Use a CLI quando precisar sincronizar artefatos ou gerenciar estado de baixo nível. Veja o [Quickstart](/pt-br/getting-started/quickstart/) para o fluxo completo.
:::

## Pré-requisitos

| Requisito | Versão |
| --- | --- |
| Node.js | `>=20.0.0` |
| npm (ou runner compatível) | incluído no Node |

Você **não** precisa de API key para instalar ou rodar o servidor MCP. O servidor é iniciado sob demanda pelo seu cliente de IA via `npx`.

## Caminho 1: instalação MCP (recomendada)

O instalador MCP detecta os clientes de IA já instalados e escreve a configuração correta do servidor MCP para cada um, para que seu assistente possa chamar as tools do dotcontext diretamente.

```bash
npx @dotcontext/mcp install
```

Se você preferir conduzir o instalador pela CLI, o comando equivalente é:

```bash
npx @dotcontext/cli mcp:install
```

Quando executado sem o nome de uma ferramenta, o instalador pergunta de forma interativa e prioriza os clientes detectados na sua máquina. Você também pode mirar diretamente em um cliente específico:

```bash
npx @dotcontext/cli mcp:install claude
```

### Clientes de IA suportados

O instalador suporta **17 clientes de IA** e escreve um arquivo de configuração específico para cada um:

| Cliente | Arquivo de configuração |
| --- | --- |
| Claude Code | `~/.claude.json` |
| Claude Desktop | específico por plataforma (ex.: `~/Library/Application Support/Claude/`) |
| Cursor | `.cursor/mcp.json` |
| Windsurf (Codeium) | `.codeium/windsurf/mcp_config.json` |
| Continue.dev | `.continue/mcpServers/dotcontext.json` |
| VS Code / GitHub Copilot | `.vscode/mcp.json` |
| Roo Code | `.roo/mcp_settings.json` |
| Amazon Q Developer CLI | `.aws/amazonq/mcp.json` |
| Google Gemini CLI | `.gemini/settings.json` |
| Codex CLI | `.codex/config.toml` (formato TOML) |
| Kiro | `.kiro/settings/mcp.json` |
| Zed Editor | `.config/zed/settings.json` (`context_servers`) |
| JetBrains IDEs | `.config/JetBrains/mcp.json` |
| Trae AI (ByteDance) | `.trae/mcp.json` |
| Kilo Code | `.kilo/mcp.json` |
| GitHub Copilot CLI | `.copilot/mcp-config.json` |
| Pi | `.mcp.json` (local) ou `~/.config/mcp/mcp.json` (global) |

### O que o instalador escreve

Para cada cliente suportado o instalador escreve a mesma entrada padrão de servidor MCP (com formatação TOML para o Codex e a chave de wrapper apropriada para clientes como Zed e JetBrains):

```json
{
  "command": "npx",
  "args": ["-y", "@dotcontext/mcp@latest"],
  "env": {}
}
```

Comportamento da instalação:

- Cria o arquivo de configuração se ele não existir, ou atualiza um existente caso o dotcontext ainda não esteja configurado.
- Garante que os diretórios pais existam antes de escrever.
- Valida os caminhos contra o limite do workspace para evitar path-traversal.
- Registra cada ação em `.context/logs/mcp.log`.

### Flags de instalação

| Flag | Descrição | Padrão |
| --- | --- | --- |
| `[tool]` | Mira em um cliente específico (omita para escolher de forma interativa) | pergunta |
| `-g, --global` | Escreve na configuração global (diretório home) | `true` |
| `-l, --local` | Escreve na configuração local/no nível do repositório | — |
| `--dry-run` | Pré-visualiza as mudanças sem escrever nenhum arquivo | — |
| `-v, --verbose` | Saída detalhada | — |

:::note
A instalação global é o padrão: o instalador varre seu diretório home em busca de ferramentas instaladas e as prioriza. Use `--local` para escrever uma configuração por projeto (como `.mcp.json` ou um diretório específico da ferramenta). Combine com `--dry-run` para revisar as mudanças com segurança antes.
:::

Depois de instalar, reinicie seu cliente de IA para que ele reconheça o novo servidor MCP. Em seguida, continue com o [Quickstart](/pt-br/getting-started/quickstart/).

## Caminho 1b: instalação de hooks (Claude Code, Codex CLI, Pi)

Hooks conectam o dotcontext a eventos de ciclo de vida do host — bootstrap de context no início, traces duráveis após edições e lembretes de workflow no fim da sessão.

```bash
npx -y @dotcontext/cli@latest hook install
```

Exemplos:

```bash
npx -y @dotcontext/cli@latest hook install claude-code --dry-run
npx -y @dotcontext/cli@latest hook install codex --format toml
npx -y @dotcontext/cli@latest hook install claude-code --global
```

Por padrão, a instalação de hooks escreve configuração no projeto atual. Use `--global` para escrever no diretório home.

Após instalar hooks do Codex, rode `/hooks` no Codex e confie nos hooks do projeto quando solicitado.

Para diagnosticar a configuração do Codex, rode:

```bash
npx -y @dotcontext/cli@latest hook doctor codex
```

## Caminho 1c: extensão Pi

Pi usa uma extensão npm in-process:

```bash
npx -y @dotcontext/cli@latest hook install pi
pi install npm:@dotcontext/pi
npx @dotcontext/mcp install pi --local
pi install npm:pi-mcp-adapter
```

## Caminho 2: instalação da CLI

A CLI standalone é **focada em sync e admin**. Use-a para distribuir artefatos entre o `.context/` e os diretórios das suas ferramentas de IA, rodar imports reversos e gerenciar estado de workflow de baixo nível.

Rode sob demanda, sem instalar:

```bash
npx -y @dotcontext/cli@latest
```

Executar sem argumentos abre um menu interativo e guiado que detecta o estado do projeto (novo, não preenchido ou atualizado) e oferece Quick Sync, Reverse Sync, MCP Install e Settings.

Você também pode rodar qualquer comando diretamente:

```bash
npx -y @dotcontext/cli@latest sync --preset claude --force
npx -y @dotcontext/cli@latest reverse-sync --dry-run
```

### Instalação global

Para ter um binário `dotcontext` persistente no seu `PATH`:

```bash
npm install -g @dotcontext/cli
dotcontext
```

### O que a CLI faz (e o que não faz)

A superfície da CLI cobre:

- `sync` — exporta playbooks de agents de `.context/agents` para os diretórios das ferramentas de IA
- `import-rules` / `import-agents` — traz rules e agents externos para o `.context/`
- `reverse-sync` — varre os diretórios das ferramentas de IA e importa rules, agents e skills de volta para o `.context/`
- `export-rules` — distribui as rules de `.context/docs/` para as ferramentas de IA
- `mcp` / `mcp:install` — inicia o servidor MCP ou o configura para clientes de IA
- `hook install` / `hook uninstall` — configura hooks de ciclo de vida para Claude Code, Codex CLI ou Pi
- `admin` — estado de workflow de baixo nível, export de skills e relatórios

:::caution[Recursos MCP-first]
Criação de context, fills gerados por IA e scaffolding de plano **não** são comandos standalone da CLI — eles rodam pelo servidor MCP. Se você quer esses recursos, use o caminho de instalação MCP acima. Veja [Como o dotcontext funciona](/pt-br/about/architecture/) para entender a fronteira entre as superfícies CLI, harness e MCP.
:::

## Verifique sua instalação

Após a instalação MCP, confirme que seu cliente de IA enxerga as tools do dotcontext (por exemplo, `context`, `explore`, `workflow-init` e `harness`). Uma verificação rápida é pedir ao seu assistente para rodar a tool de check de context contra o seu repositório, que é o primeiro passo do [Quickstart](/pt-br/getting-started/quickstart/).

## Próximos passos

- [Quickstart](/pt-br/getting-started/quickstart/) — inicialize o `.context/` e comece seu primeiro workflow PREVC.
- [O workflow PREVC](/pt-br/concepts/prevc-workflow/) — entenda as cinco fases.
- [Referência de MCP tools](/pt-br/reference/mcp-tools/) — lista completa de tools e parâmetros.

Para código-fonte e issues, veja [github.com/vinilana/dotcontext](https://github.com/vinilana/dotcontext).
