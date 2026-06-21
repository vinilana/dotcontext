---
title: Arquitetura
description: Como o dotcontext é estruturado em torno do formato "cli -> harness <- mcp" — um runtime de harness agnóstico de transporte, limites claros e cinco pacotes publicáveis.
sidebar:
  order: 1
---

O dotcontext é construído em torno de uma ideia: o trabalho que um agente realiza deve viver em um **runtime reutilizável**, e não dentro de qualquer transporte que por acaso o invoque. Esse runtime é o **harness**, e tanto a CLI quanto o servidor MCP são camadas finas em volta dele.

O produto inteiro cabe em uma linha:

```text
cli -> harness <- mcp
              <- integrations (hooks / extensões de host)
```

Esta página explica pelo que cada peça é responsável, por que o harness fica no meio e como a base de código se divide em cinco pacotes independentes que você pode instalar separadamente.

::: tip[A única regra]
Comportamento de domínio pertence ao **harness**. As camadas de CLI e MCP devem permanecer finas — elas traduzem uma requisição em uma chamada ao harness e formatam o resultado. Se você notar lógica se infiltrando em `cli` ou `mcp` que outros transportes também precisariam, ela pertence ao harness.
:::

## O formato do produto

Leia as setas como "conduz": a **CLI conduz o harness**, e o **servidor MCP também conduz o harness**. Nenhum transporte é dono da lógica — ambos chamam o mesmo runtime.

```text
   operador                         cliente de IA / agente
      │                                    │
      ▼                                    ▼
 ┌─────────┐                          ┌─────────┐
 │   cli   │                          │   mcp   │
 └────┬────┘                          └────┬────┘
      │                                    │
      └──────────────┐      ┌──────────────┘
                     ▼      ▼
                  ┌────────────┐
                  │  harness   │   runtime agnóstico de transporte
                  └─────┬──────┘
                        ▼
                   .context/        estado durável, em disco
```

Como o harness é compartilhado, uma execução iniciada via MCP e outra conduzida pela CLI escrevem o **mesmo estado em disco, no mesmo formato**. Não existe um "banco da CLI" e um "banco do MCP" — existe um único diretório `.context/`, e ambos os transportes falam com ele através do harness.

## O harness: um runtime agnóstico de transporte

O **harness** é a camada de execução no centro do dotcontext. Ele é *agnóstico de transporte*: não faz ideia se uma requisição chegou como um subcomando de CLI ou como uma chamada de tool do MCP. Ele apenas executa o trabalho e persiste estado durável.

O harness é dono de:

- **Sessions duráveis** — contextos de execução que sobrevivem entre chamadas e processos, com traces, artifacts e checkpoints registrados nelas.
- **Sensors e backpressure** — checagens de qualidade executáveis (build, test, typecheck e outras) cujos resultados são registrados nas sessions.
- **Task contracts e handoffs** — acordos estruturados sobre o que uma task precisa e quais gates bloqueiam sua conclusão, mais transições formais de papéis.
- **Policies e avaliação de policy** — regras declarativas de allow / deny / require-approval aplicadas a ações do workflow.
- **Replay e datasets de falha** — reconstrução da linha do tempo completa de uma session e um corpus de falhas extraído desses replays.
- **Estado do workflow PREVC** — roteamento de fases (Plan, Review, Execution, Validation, Confirmation) e gates adaptáveis à escala.

Tudo isso é persistido em `.context/`, o único lar em disco tanto para a configuração autorada quanto para o estado de runtime gerado.

Para um mergulho profundo em sessions, traces, artifacts e checkpoints, veja o [conceito de runtime do harness](/pt-br/concepts/harness-runtime/).

## Os limites

O repositório mantém limites rígidos para que o harness permaneça reutilizável e os transportes permaneçam finos.

| Limite | Responsabilidade |
| --- | --- |
| `src/cli` | Superfície voltada ao operador — sync, import/export, instalação MCP, instalação de hooks, relatórios e comandos admin de workflow |
| `src/mcp` | O limite de transporte MCP — expõe o comportamento do harness como tools e resources do Model Context Protocol |
| `src/harness` | O runtime de domínio — regras de domínio, serviços de aplicação e adapters (o núcleo reutilizável) |
| `src/integrations` | Adapters de hooks de host — mappers de eventos, templates e helpers de instalação para Claude Code, Codex CLI e Pi |

### A superfície de operador da CLI

A CLI é o transporte **voltado ao operador**. Ela é focada em sync e admin: distribuir artifacts entre `.context/` e diretórios de ferramentas de IA, instalar o servidor MCP nas configs dos clientes, gerar relatórios e gerenciar estado de workflow de baixo nível.

Vale notar que a CLI **não** cria contexto, gera fills com IA, nem faz scaffold de plans por conta própria — esses fluxos são MCP-first. Veja [usando a CLI](/pt-br/guides/using-the-cli/) para a superfície completa de comandos.

### O limite de transporte MCP

O servidor MCP é o transporte **voltado ao agente**. Ele expõe o harness como um conjunto de tools do Model Context Protocol (`explore`, `context`, `sync`, `plan`, `agent`, `skill`, `harness` e as tools dedicadas `workflow-*`) mais resources como `context://codebase/{contextType}` e `workflow://status`.

Essa é a superfície com a qual um cliente de IA (Claude Code, Cursor, Windsurf e outros) conversa. Veja [usando o dotcontext com MCP](/pt-br/guides/using-with-mcp/) para instalá-lo.

### As entranhas do harness: domain, application, adapters

Dentro de `src/harness`, o código segue um layout hexagonal para que as regras de domínio nunca dependam de um transporte ou de um detalhe de sistema de arquivos:

| Camada | O que vive aqui |
| --- | --- |
| **domain** | Regras puras — fases e escala do PREVC, lógica de avaliação de policy, semântica dos contracts |
| **application** | Serviços que orquestram o domínio — sessions, sensors, contracts, policies, replay, datasets, workflow |
| **adapters** | As bordas — persistir estado de runtime em `.context/`, ler o repositório, conversar com provedores de modelo |

É por isso que o mesmo `WorkflowService` ou `HarnessSensorsService` se comporta de forma idêntica seja alcançado via MCP ou via CLI: os transportes plugam na camada de application, e a camada de application conversa com o domain.

## Cinco pacotes, um runtime

O monorepo é compilado em **cinco pacotes independentes e publicáveis**. Eles compartilham uma única versão raiz e são lançados juntos para que permaneçam sempre compatíveis.

| Pacote | Papel | Bin |
| --- | --- | --- |
| `@dotcontext/cli` | Sync, import/export, setup do MCP, instalação de hooks, relatórios e workflows admin voltados ao operador | `dotcontext` |
| `@dotcontext/harness` | O runtime reutilizável — regras de domínio, sessions, policies, sensors, contracts, replay, estado de workflow | — |
| `@dotcontext/mcp` | O adapter de transporte MCP e instalador para ferramentas de IA | `dotcontext-mcp` |
| `@dotcontext/integrations` | Adapters de hooks de host e mappers de eventos para autores de extensões | — |
| `@dotcontext/pi` | Extensão npm do Pi para hooks in-process | — |

### `@dotcontext/cli`

O pacote do operador. Ele entrega a stack completa da CLI e exporta um punhado de serviços para uso programático:

- `MCPInstallService` — configurar o MCP para ferramentas de IA suportadas
- `StateDetector` — detectar o estado de runtime do harness
- `SyncService` — exportar/importar rules, agents e skills
- `ReportService` — gerar relatórios de progresso do workflow

Ele inclui o diretório `prompts/` usado pela CLI interativa, e seu bin é `dotcontext`.

### `@dotcontext/harness`

O runtime reutilizável, com um conjunto mínimo de dependências para que possa ser embarcado em outros lugares. Ele exporta os serviços centrais:

- `HarnessExecutionService` — o runtime de execução central
- `HarnessRuntimeStateService` — persistir e carregar estado de runtime
- `HarnessSensorsService` — registro e execução de sensors
- `HarnessTaskContractsService` — task contracts e handoffs
- `WorkflowService` — estado e roteamento do workflow PREVC

Esse é o pacote do qual você depende se quiser as sessions duráveis, sensors, contracts e a lógica PREVC do dotcontext sem nenhum transporte.

### `@dotcontext/mcp`

O adapter de transporte MCP e instalador. Ele exporta:

- `AIContextMCPServer` — a instância do servidor MCP
- `startMCPServer()` — iniciar o servidor
- `handleHarness()` — o handler da tool `harness` do MCP
- `handleWorkflowManage()` — o handler da tool `workflow-manage` do MCP

Seu bin é `dotcontext-mcp`. Para a maioria dos usuários, a instalação passa por `npx @dotcontext/mcp install`, que escreve a config do servidor no seu cliente de IA.

::: note
Os pacotes separados são produzidos por `npm run build:packages`, que copia o `dist/` compilado para a raiz de cada pacote e escreve um manifesto `package.json` filtrado. O `npm run smoke:packages` então valida nomes, versões, pontos de entrada, exports e bin shims — e garante que nenhuma pasta legada `dist/services/` vaze para um bundle, o que mantém os limites honestos.
:::

## Importando os pacotes

Você pode importar diretamente dos pacotes publicados, escolhendo a superfície de que precisa:

```ts
import { MCPInstallService } from '@dotcontext/cli';
import { HarnessExecutionService } from '@dotcontext/harness';
import { AIContextMCPServer } from '@dotcontext/mcp';
```

Como os três compartilham a mesma versão raiz, fixar um e casar os demais mantém as superfícies compatíveis.

## Como tudo se encaixa

1. Um **operador** roda a CLI, ou um **cliente de IA** chama uma tool do MCP.
2. O transporte (`cli` ou `mcp`) traduz a requisição em uma chamada ao **harness**.
3. O harness executa o trabalho através de seus **serviços de application** e **regras de domain**.
4. O estado é persistido pelos **adapters** em `.context/`.
5. Qualquer outro transporte que leia esse estado — agora ou depois — vê o mesmo registro durável.

Esse runtime único e compartilhado é o que torna uma session do dotcontext **legível, retomável e auditável** não importa como ela foi iniciada.

## Próximos passos

- [O runtime do harness](/pt-br/concepts/harness-runtime/) — sessions, traces, artifacts e checkpoints em profundidade.
- [O workflow PREVC](/pt-br/concepts/prevc-workflow/) — as cinco fases e o roteamento adaptável à escala que o harness conduz.
- [Usando o dotcontext com MCP](/pt-br/guides/using-with-mcp/) — instale o servidor MCP no seu cliente de IA.
- [Usando a CLI](/pt-br/guides/using-the-cli/) — a superfície de comandos voltada ao operador.
- [dotcontext no GitHub](https://github.com/vinilana/dotcontext) — o código-fonte.
