---
title: Usando o dotcontext com MCP
description: Instale o servidor MCP do dotcontext, conecte um cliente de IA e conduza o workflow index-first com as ferramentas consolidadas e as ferramentas do workflow PREVC.
sidebar:
  order: 1
---

O Model Context Protocol (MCP) é a forma recomendada de usar o dotcontext. Em vez de colar contexto nos prompts, seu cliente de IA conversa diretamente com o servidor MCP do dotcontext — lendo o contexto compartilhado, fazendo o scaffold de `.context/`, rodando o workflow PREVC e registrando um histórico de execução durável.

Este guia mostra como instalar o servidor, conectar um cliente, o workflow index-first obrigatório e as ferramentas que você mais vai usar — com exemplos de prompts para adaptar.

:::tip[Novo no dotcontext?]
Se você ainda não instalou nada, comece pelo [Quickstart](/pt-br/getting-started/quickstart/). Esta página assume que você quer um passo a passo prático, guiado por prompts, da superfície MCP.
:::

## Por que MCP primeiro

O servidor MCP é onde o dotcontext faz o trabalho de verdade. Criação de contexto, fills gerados por IA, scaffold de plano, análise semântica e o workflow PREVC são todos MCP-first — a CLI standalone foca em sincronizar artefatos e tarefas administrativas de baixo nível.

Isso significa que, uma vez conectado o servidor, você conversa com o agente em linguagem natural. O agente chama as ferramentas certas para você.

## 1. Instale o servidor MCP

O caminho mais rápido é deixar o dotcontext escrever a configuração do seu cliente:

```bash
npx @dotcontext/mcp@latest install
```

Ou conduza o instalador pela CLI, opcionalmente apontando para uma ferramenta específica:

```bash
# Interativo — detecta as ferramentas instaladas e pergunta
npx -y @dotcontext/cli@latest mcp:install

# Apontar para um cliente específico
npx -y @dotcontext/cli@latest mcp:install claude

# Pré-visualizar a configuração sem escrever nada
npx -y @dotcontext/cli@latest mcp:install --dry-run
```

O instalador suporta 17 clientes de IA, incluindo Claude Code, Claude Desktop, Cursor, Windsurf, Continue.dev, VS Code / GitHub Copilot, Zed, IDEs JetBrains, Codex CLI, Gemini CLI, Amazon Q, Pi e mais. Ele detecta o que você já tem instalado e escreve (ou atualiza) o arquivo de configuração apropriado.

MCP é a superfície completa de tools do dotcontext. Hooks são o complemento recomendado para hosts com integração de ciclo de vida porque fazem bootstrap de sessões, registram traces de edição/bash e mostram lembretes PREVC em segundo plano. Hooks são opcionais e não bloqueantes; o sucesso da instalação MCP não depende do sucesso da instalação de hooks.

O fluxo `mcp:install` da CLI recomenda hooks somente para hosts de ciclo de vida suportados: Claude Code (`claude` -> `claude-code`), Codex CLI (`codex`) e Pi (`pi`). Em um terminal interativo, o prompt aparece depois que a configuração MCP é tratada. Em execuções não interativas, use `--with-hooks` para escrever hooks; caso contrário, o comando só imprime o próximo passo recomendado. Use `--no-hooks` para suprimir a recomendação.

```bash
# MCP + hooks recomendados
npx -y @dotcontext/cli@latest mcp:install codex --with-hooks

# Escolher o formato dos hooks do Codex no fluxo combinado
npx -y @dotcontext/cli@latest mcp:install codex --with-hooks --hook-format toml

# Só MCP, sem prompts nem recomendação de hooks
npx -y @dotcontext/cli@latest mcp:install codex --no-hooks
```

Para Codex, rode `/hooks` dentro do Codex e confie nos hooks do projeto depois que a config for escrita. Para Pi, o fluxo combinado deixa o instalador MCP escrever o snippet MCP e não pede para a etapa de hook do Pi adicionar um snippet duplicado.

A configuração que ele escreve é a mesma para todas as ferramentas:

```json
{
  "command": "npx",
  "args": ["-y", "@dotcontext/mcp@latest"],
  "env": {}
}
```

:::note[Global vs local]
Por padrão, o instalador escreve na configuração global (diretório home). Use `--local` para escrever uma configuração no nível do projeto (por exemplo `.mcp.json` ou um diretório específico da ferramenta). Use `--dry-run` para pré-visualizar qualquer um dos caminhos antes de confirmar.
:::

Para a lista completa de clientes, locais de configuração e flags, veja [Instalação](/pt-br/getting-started/installation/).

## 2. Conecte um cliente de IA

Após instalar, reinicie (ou recarregue) seu cliente de IA para que ele detecte o novo servidor. As ferramentas do dotcontext devem então aparecer na lista de ferramentas do cliente.

Uma forma rápida de confirmar a conexão é pedir ao agente para checar o projeto:

> Verifique se este repositório já tem uma pasta `.context`.

Nos bastidores, o agente chama `context` com a action `check`. Se ele responder com o status atual de bootstrap, o servidor está conectado e funcionando.

## 3. O workflow index-first obrigatório

O dotcontext é construído em torno de um **índice de contexto compartilhado**. Antes de fazer trabalho real, um agente deve ler o índice para saber qual contexto existe e onde encontrá-lo — em vez de varrer a árvore inteira e gastar tokens.

A sequência de inicialização recomendada é:

| Passo | Chamada de ferramenta | O que faz |
| --- | --- | --- |
| 1 | `context` → `check` | Verifica se `.context/` existe (passe `repoPath` na primeira chamada) |
| 2 | `context` → `init` | Faz o scaffold de `.context/` (use `autoFill: true` para semear a partir do código) |
| 3 | `context` → `fillSingle` | Preenche cada arquivo pendente com conteúdo gerado (rode por arquivo) |
| 4 | `context` → `scaffoldPlan` | Cria um template de plano (opcional, para trabalho não trivial) |
| 5 | `workflow-init` | Inicia o workflow PREVC depois que o contexto está pronto |

:::caution[Sempre indexe antes de agir]
Para um projeto que já tem `.context/`, o índice fica no topo da documentação (o primeiro arquivo listado pelas ferramentas de context). Lê-lo primeiro permite que o agente vá direto ao arquivo certo. Pular o índice leva a respostas incompletas ou incorretas.
:::

Uma versão em linguagem natural do mesmo fluxo:

> Este repo ainda não tem `.context`. Inicialize com auto-fill, preencha cada arquivo pendente e inicie um workflow PREVC para "adicionar login OAuth".

O agente traduz isso em `context` (`init` → `fillSingle` …) seguido de `workflow-init`, persistindo o estado canônico do workflow em `.context/runtime/workflows/prevc.json`.

## 4. As ferramentas consolidadas em resumo

O dotcontext agrupa suas capacidades em um pequeno conjunto de ferramentas consolidadas. Cada uma recebe um parâmetro `action` que seleciona a operação. Abaixo está o mapa de alto nível com exemplos de prompts; as tabelas completas de actions e parâmetros estão na [referência de ferramentas MCP](/pt-br/reference/mcp-tools/).

### explore — ler e buscar código

Exploração de arquivos e código: `read`, `list`, `analyze`, `search`, `getStructure`.

> Busque no código onde o rate limiting é implementado e mostre a estrutura de diretórios de `src/`.

### context — scaffold e contexto semântico

Scaffold de contexto e conhecimento semântico: `check`, `init`, `fill`, `fillSingle`, `getMap`, `buildSemantic`, `scaffoldPlan`, `searchQA`, `getFlow`, `detectPatterns` e mais.

> Construa um contexto semântico compacto para este código e depois mostre o code flow começando em `src/server.ts`.

:::tip[Passe repoPath uma vez]
Na primeira chamada de `context`, inclua `repoPath` apontando para a raiz do projeto. O servidor faz cache, então as chamadas seguintes não precisam repetir.
:::

### sync — importar e exportar com ferramentas de IA

Sincronize `.context/` com outras ferramentas de IA: `exportRules`, `exportDocs`, `exportAgents`, `exportSkills`, `reverseSync`, `importDocs`, `importAgents`, `importSkills`.

> Exporte os agents em `.context/agents` para o Claude Code e faça reverse-sync de quaisquer rules que eu já tenha em `.cursor`.

### plan — acompanhar planos e fases PREVC

Gerenciamento de planos e acompanhamento de execução: `link`, `getDetails`, `getForPhase`, `updatePhase`, `recordDecision`, `updateStep`, `getStatus`, `syncMarkdown`, `commitPhase`.

> Marque a fase E do plano atual como concluída, registre a decisão de usar Postgres e faça o commit dos artefatos da fase em `.context/**`.

### agent — orquestrar e descobrir agents

Orquestração e descoberta de agents: `discover`, `getInfo`, `orchestrate`, `getSequence`, `getDocs`, `getPhaseDocs`, `listTypes`.

> Quais agents devem cuidar da fase de Planning para "migrar auth para OAuth"? Me dê a sequência de handoff recomendada.

### skill — expertise sob demanda

Gerenciamento de skills: `list`, `getContent`, `getForPhase`, `scaffold`, `export`, `fill`.

> Liste as skills disponíveis para a fase Verify e mostre o conteúdo da skill de testes.

## 5. As ferramentas do workflow PREVC

PREVC (Plan → Review → Execute → Verify → Confirm) é o workflow estruturado de desenvolvimento. Cinco ferramentas dedicadas o conduzem:

| Ferramenta | Propósito | Parâmetros notáveis |
| --- | --- | --- |
| `workflow-init` | Inicia um workflow para uma feature | `name` (obrigatório), `description`, `scale` (QUICK/SMALL/MEDIUM/LARGE), `autonomous`, `require_plan`, `require_approval` |
| `workflow-status` | Obtém a fase atual, gates e atividade | nenhum obrigatório |
| `workflow-guide` | Obtém próximos passos, skills e dicas de gate | `intent`, `format` |
| `workflow-advance` | Avança para a próxima fase | `outputs` (caminhos de artefatos), `force` (ignorar gates) |
| `workflow-manage` | Handoffs, docs, gates, sensors, tasks | `action` (handoff, createDoc, approvePlan, runSensors, defineTask, checkpoint, …) |

A scale que você passa para `workflow-init` controla quais fases rodam — de um rápido `E → V` para uma correção pequena até o `P → R → E → V → C` completo para trabalho complexo ou sensível a compliance. Se você descrever a tarefa, o dotcontext pode auto-detectar uma scale adequada.

Um loop típico de workflow em linguagem natural:

> Inicie um workflow MEDIUM para "adicionar export CSV" que exige um plano antes do review. Depois mostre o status, rode os sensors e avance para a próxima fase quando eles passarem.

Isso mapeia para `workflow-init` (com `scale: "MEDIUM"`, `require_plan: true`), `workflow-guide`, `workflow-manage` (`action: "runSensors"`) e `workflow-advance`.

:::note[Gates protegem as transições]
Se você definir `require_plan` ou `require_approval`, a transição correspondente fica bloqueada até que o plano ou a aprovação existam. O `workflow-advance` reporta o resultado do gate; passe `force: true` apenas quando você quer intencionalmente ignorá-lo.
:::

Para entender como fases, scale e roles se encaixam, leia [O workflow PREVC](/pt-br/concepts/prevc-workflow/).

## 6. Recursos MCP

Além das ferramentas, o servidor expõe alguns recursos somente-leitura que seu cliente pode puxar diretamente:

| URI do recurso | Conteúdo | MIME type |
| --- | --- | --- |
| `context://codebase/{contextType}` | Contexto semântico (`documentation`, `playbook`, `plan`, `compact`) | `text/markdown` |
| `file://{path}` | Conteúdo de arquivo, validado contra o limite do workspace | `text/plain` |
| `workflow://status` | Snapshot do status atual do workflow PREVC | `application/json` |

Eles são úteis quando seu cliente suporta anexar recursos MCP a uma conversa — por exemplo, puxar `context://codebase/compact` para um briefing leve do projeto.

## Uma sessão de exemplo completa

Juntando tudo, veja como um projeto novo sai do zero até um workflow rodando, expresso como prompts para o agente:

> 1. Verifique se este repo tem uma pasta `.context`.
> 2. Inicialize com auto-fill e preencha todos os arquivos pendentes.
> 3. Construa um contexto semântico compacto para entender o código.
> 4. Faça o scaffold de um plano para "adicionar audit logging".
> 5. Inicie um workflow PREVC MEDIUM para ele que exige aprovação antes da execução.
> 6. Mostre o status do workflow e depois percorra as fases — rodando sensors e registrando artefatos conforme avança.

Cada passo mapeia para uma ou mais das ferramentas acima, e cada action é registrada como estado de runtime durável em `.context/runtime/` — para que você possa depois inspecionar, fazer replay ou construir failure datasets a partir da sessão.

## Próximos passos

- [Referência de ferramentas MCP](/pt-br/reference/mcp-tools/) — tabelas completas de actions e parâmetros de cada ferramenta.
- [Quickstart](/pt-br/getting-started/quickstart/) — o caminho mais curto da instalação até seu primeiro workflow.
- [O workflow PREVC](/pt-br/concepts/prevc-workflow/) — fases, scale, roles e gates explicados.
- [Instalação](/pt-br/getting-started/installation/) — todos os clientes suportados e locais de configuração.
