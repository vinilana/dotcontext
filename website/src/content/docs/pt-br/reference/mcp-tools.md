---
title: Referência das tools MCP
description: Referência completa de todas as tools MCP do dotcontext — as tools de gateway consolidadas e as tools dedicadas do workflow PREVC, com suas actions e parâmetros principais.
sidebar:
  order: 1
---

Esta página é a referência exaustiva das tools expostas pelo servidor MCP do dotcontext. Se você prefere um passo a passo prático, guiado por prompts, leia primeiro [Usando o dotcontext com MCP](/pt-br/guides/using-with-mcp/) — e volte aqui quando precisar do nome exato de uma action ou parâmetro.

O dotcontext mantém sua superfície de tools deliberadamente enxuta. Em vez de dezenas de tools específicas, a maioria das capacidades é agrupada em algumas **tools de gateway consolidadas** que recebem um parâmetro `action`. Algumas **tools dedicadas do workflow** ficam por conta própria porque são chamadas o tempo todo durante o PREVC.

:::note[Nomes das tools]
As tools abaixo são registradas com nomes como `explore`, `context`, `sync`, `plan`, `agent`, `skill`, `harness`, `workflow-init`, `workflow-status`, `workflow-advance` e `workflow-manage`. Seu cliente pode exibi-las com um prefixo de servidor (por exemplo `mcp__dotcontext__explore`). Os nomes das actions e os parâmetros são idênticos, independentemente do prefixo.
:::

## Como ler esta página

Toda tool consolidada segue o mesmo formato:

- Um parâmetro `action` obrigatório (um enum) seleciona o que a tool faz.
- Os demais parâmetros são opcionais e se aplicam apenas a actions específicas.

Então uma chamada típica fica assim:

```json
{
  "action": "init",
  "repoPath": "/caminho/do/projeto",
  "autoFill": true
}
```

:::tip[Passe repoPath uma vez]
Tools que operam sobre um projeto (em especial `context`) cacheiam o `repoPath` após a primeira chamada. Informe-o na primeira chamada da sessão; as chamadas seguintes podem omiti-lo.
:::

## Tools de gateway consolidadas

### explore

Exploração de arquivos e código — ler arquivos, listar caminhos, buscar conteúdo e extrair a estrutura do código.

**Actions:** `read`, `list`, `analyze`, `search`, `getStructure`

| Parâmetro | Tipo | Aplica-se a | Descrição |
| --- | --- | --- | --- |
| `action` | enum (obrigatório) | todas | Action a executar |
| `filePath` | string | read, analyze | Arquivo alvo |
| `pattern` | string | list, search | Glob (list) ou regex (search) |
| `cwd` | string | todas | Diretório de trabalho para operações de arquivo |
| `fileGlob` | string | search | Glob para filtrar quais arquivos são pesquisados |
| `maxResults` | number | search | Limite no número de resultados de busca |
| `rootPath` | string | getStructure | Raiz para a estrutura de diretórios |
| `maxDepth` | number | getStructure | Limite de profundidade da árvore de estrutura |
| `encoding` | enum: `utf-8` \| `ascii` \| `binary` | read | Codificação do arquivo |
| `symbolTypes` | array | analyze | Extrai `class` \| `interface` \| `function` \| `type` \| `enum` |
| `ignore` | array | list, search, getStructure | Padrões a excluir |

**Retorna:** conteúdo de arquivos, arquivos correspondentes, análise de símbolos, resultados de busca ou uma árvore de diretórios.

### context

Scaffolding de contexto e contexto semântico — o ponto de entrada para criar e preencher o `.context/`.

**Actions:** `check`, `bootstrapStatus`, `init`, `fill`, `fillSingle`, `listToFill`, `getMap`, `buildSemantic`, `scaffoldPlan`, `searchQA`, `generateQA`, `getFlow`, `detectPatterns`

| Parâmetro | Tipo | Aplica-se a | Descrição |
| --- | --- | --- | --- |
| `action` | enum (obrigatório) | todas | Action a executar |
| `repoPath` | string | todas | Raiz do projeto; cacheado na primeira chamada |
| `outputDir` | string | init, fill | Padrão: `./.context` |
| `type` | enum: `docs` \| `agents` \| `both` | init | Tipo de scaffolding |
| `semantic` | boolean | init, buildSemantic | Habilita análise semântica |
| `autoFill` | boolean | init | Preenche o scaffold automaticamente com conteúdo do codebase |
| `generateQA` | boolean | init | Gera docs auxiliares de Q&A em `.context/docs/qa` |
| `skipContentGeneration` | boolean | init | Pula a pré-geração |
| `target` | enum: `docs` \| `agents` \| `skills` \| `plans` \| `sensors` \| `all` | fill | Alvo do preenchimento |
| `filePath` | string | fillSingle | Arquivo a preencher |
| `section` | enum: `all` \| `meta` \| `stack` \| `structure` \| `architecture` \| `functionalPatterns` \| `dependencies` \| `stats` \| `keyFiles` \| `navigation` | getMap | Seção do mapa a retornar |
| `contextType` | enum: `documentation` \| `playbook` \| `plan` \| `compact` | buildSemantic | Variante de contexto semântico |
| `query` | string | searchQA | Palavra-chave usada para ranquear resultados de Q&A |
| `entryFile` | string | getFlow | Arquivo de entrada |
| `entryFunction` | string | getFlow | Nome da função a rastrear |
| `planName` | string | scaffoldPlan | Identificador do plano |
| `title` | string | scaffoldPlan | Título do plano |
| `summary` | string | scaffoldPlan | Objetivo do plano |
| `options` | object | buildSemantic | Opções do builder (`useLSP`, `maxContextLength`, …) |

**Retorna:** status do scaffold, conteúdo preenchido, contexto semântico, traces de execução, resultados de busca de Q&A, grafos de fluxo de código ou padrões detectados.

:::tip[Fluxo padrão de init]
Uma primeira sessão típica é `check` → `init` (com `autoFill: true`) → `fillSingle` para cada arquivo pendente → `scaffoldPlan` (apenas para trabalho não trivial) → e então iniciar o [workflow PREVC](#tools-dedicadas-do-workflow).
:::

### sync

Sincronização de import/export entre o `.context/` e os diretórios das ferramentas de IA.

**Actions:** `exportRules`, `exportDocs`, `exportAgents`, `exportContext`, `exportSkills`, `reverseSync`, `importDocs`, `importAgents`, `importSkills`

| Parâmetro | Tipo | Aplica-se a | Descrição |
| --- | --- | --- | --- |
| `action` | enum (obrigatório) | todas | Action a executar |
| `preset` | string | actions de export | Preset da ferramenta de IA alvo (`claude`, `cursor`, …) |
| `force` | boolean | export/import | Sobrescreve arquivos existentes |
| `dryRun` | boolean | todas | Pré-visualiza sem escrever |
| `indexMode` | enum: `readme` \| `all` | exportDocs | Estratégia de indexação |
| `mode` | enum: `symlink` \| `markdown` | exportAgents | Modo de export |
| `skipDocs` | boolean | reverseSync | Pula docs |
| `skipAgents` | boolean | reverseSync | Pula agents |
| `skipSkills` | boolean | reverseSync | Pula skills |
| `mergeStrategy` | enum: `skip` \| `overwrite` \| `merge` \| `rename` | import / reverseSync | Resolução de conflitos |
| `includeBuiltIn` | boolean | exportSkills, importSkills | Inclui skills built-in |
| `autoDetect` | boolean | actions de import | Detecta arquivos a importar automaticamente |
| `addMetadata` | boolean | actions de import | Adiciona metadados de frontmatter |

**Retorna:** status da operação de sync, contagens de artefatos e caminhos dos arquivos escritos.

:::note[Paridade com a CLI]
As actions de `sync` espelham os comandos da CLI standalone (`sync`, `reverse-sync`, `import-rules`, `export-rules`). Veja [Usando a CLI](/pt-br/guides/using-the-cli/) quando quiser executá-los fora de uma sessão MCP.
:::

### plan

Gerenciamento de planos e rastreamento de execução, vinculado às fases do PREVC.

**Actions:** `link`, `getLinked`, `getDetails`, `getForPhase`, `updatePhase`, `recordDecision`, `updateStep`, `getStatus`, `syncMarkdown`, `commitPhase`

| Parâmetro | Tipo | Aplica-se a | Descrição |
| --- | --- | --- | --- |
| `action` | enum (obrigatório) | todas | Action a executar |
| `planSlug` | string | maioria | Identificador do plano |
| `phaseId` | string | updatePhase, commitPhase | ID da fase PREVC (`P` \| `R` \| `E` \| `V` \| `C`) |
| `status` | enum: `pending` \| `in_progress` \| `completed` \| `skipped` | updatePhase, updateStep | Status a definir |
| `phase` | enum: `P` \| `R` \| `E` \| `V` \| `C` | getForPhase | Filtra por fase PREVC |
| `title` | string | recordDecision | Título da decisão |
| `description` | string | recordDecision, updateStep | Detalhes da decisão/step |
| `alternatives` | array | recordDecision | Alternativas consideradas |
| `stepIndex` | number | updateStep | Número do step (base 1) |
| `output` | string | updateStep | Caminho do artefato do step |
| `notes` | string | recordDecision, updateStep | Notas de execução |
| `coAuthor` | string | commitPhase | Nome do coautor/agent no commit |
| `stagePatterns` | array | commitPhase | Padrões glob a adicionar ao stage (padrão: `[".context/**"]`) |
| `dryRun` | boolean | commitPhase | Pré-visualiza o commit |

**Retorna:** status do plano, progresso das fases, registros de decisão e linha do tempo de execução.

### agent

Orquestração e descoberta de agents para os papéis do PREVC.

**Actions:** `discover`, `getInfo`, `orchestrate`, `getSequence`, `getDocs`, `getPhaseDocs`, `listTypes`

| Parâmetro | Tipo | Aplica-se a | Descrição |
| --- | --- | --- | --- |
| `action` | enum (obrigatório) | todas | Action a executar |
| `agentType` | string | getInfo, getDocs | Identificador do tipo de agent |
| `task` | string | orchestrate, getSequence | Descrição da tarefa |
| `phase` | enum: `P` \| `R` \| `E` \| `V` \| `C` | orchestrate, getPhaseDocs | Filtro de fase PREVC |
| `role` | enum: `planner` \| `reviewer` \| `executor` \| `verifier` \| `completer` | orchestrate | Papel PREVC |
| `includeReview` | boolean | getSequence | Inclui code review na sequência |
| `phases` | array | getSequence | Lista de fases para sequenciar |

**Retorna:** lista de agents, capacidades dos agents, agents recomendados, sequências de handoff ou documentação dos agents.

### skill

Gerenciamento de skills para expertise sob demanda.

**Actions:** `list`, `getContent`, `getForPhase`, `scaffold`, `export`, `fill`

| Parâmetro | Tipo | Aplica-se a | Descrição |
| --- | --- | --- | --- |
| `action` | enum (obrigatório) | todas | Action a executar |
| `skillSlug` | string | getContent | Identificador do skill |
| `phase` | enum: `P` \| `R` \| `E` \| `V` \| `C` | getForPhase | Filtro de fase PREVC |
| `skills` | array | scaffold, fill, export | Skills específicos a processar |
| `includeContent` | boolean | list | Inclui o conteúdo completo na listagem |
| `includeBuiltIn` | boolean | list, export | Inclui skills built-in |
| `preset` | string | export | Preset da ferramenta alvo |
| `force` | boolean | export | Sobrescreve arquivos existentes |

**Retorna:** lista de skills, conteúdo de skills, skills específicos de uma fase ou artefatos de scaffold.

### harness

Operações explícitas do runtime do harness — sessions, traces, artefatos, checkpoints, tasks, handoffs, datasets, sensors e policies. Esta é a superfície de baixo nível por trás do histórico de execução durável; normalmente você alcança a maior parte dela indiretamente, pelas tools de workflow.

**Actions, agrupadas:**

| Grupo | Actions |
| --- | --- |
| Sessions | `createSession`, `listSessions`, `getSession`, `resumeSession`, `completeSession`, `failSession`, `replaySession`, `listReplays`, `getReplay` |
| Traces | `appendTrace`, `listTraces` |
| Artefatos | `addArtifact`, `listArtifacts` |
| Checkpoints | `checkpoint` |
| Tasks | `createTask`, `listTasks`, `evaluateTask` |
| Handoffs | `createHandoff`, `listHandoffs` |
| Datasets | `buildDataset`, `listDatasets`, `getDataset`, `getFailureClusters` |
| Sensors | `recordSensor`, `getSessionQuality` |
| Policy | `registerPolicy`, `listPolicies`, `getPolicy`, `setPolicy`, `resetPolicy`, `evaluatePolicy` |

**Parâmetros principais (um subconjunto — a aplicabilidade depende da action):**

| Parâmetro | Tipo | Descrição |
| --- | --- | --- |
| `action` | enum (obrigatório) | Action a executar |
| `sessionId` | string | Identificador do recurso de session |
| `taskId` | string | Identificador do task contract |
| `datasetId` | string | Identificador do failure dataset |
| `name` / `title` / `description` | string | Metadados do recurso |
| `level` | enum: `debug` \| `info` \| `warn` \| `error` | Nível do `appendTrace` |
| `event` | string | Tipo de evento do trace (ex.: `sensor.run`) |
| `message` | string | Mensagem do trace |
| `data` / `metadata` / `content` | object | Payload estruturado |
| `expectedOutputs` / `acceptanceCriteria` / `requiredSensors` / `requiredArtifacts` | array | Definição do task contract |
| `sensorId` / `sensorStatus` / `sensorSeverity` / `sensorBlocking` | — | Campos da execução de sensor |
| `summary` / `evidence` | string / array | Resumo do resultado do sensor |
| `from` / `to` / `artifacts` | — | Campos de handoff |
| `scope` / `effect` / `target` / `pattern` | — | Campos de policy |

**Retorna:** linhas do tempo de session, inventários de artefatos, avaliações de tasks, telemetria de sensors, registros de replay, clusters de falhas ou resultados de aplicação de policy.

:::tip[Quer os conceitos por trás disso?]
As entidades do harness são explicadas em profundidade em [Sessions, traces e artefatos](/pt-br/concepts/harness-runtime/), [Sensors](/pt-br/concepts/sensors/), [Policies](/pt-br/concepts/policies/), [Task contracts e handoffs](/pt-br/concepts/task-contracts/) e [Replay e failure datasets](/pt-br/concepts/replay-and-datasets/).
:::

## Tools dedicadas do workflow

Estas quatro tools conduzem o workflow PREVC. Elas são mantidas separadas do gateway consolidado porque são chamadas com frequência e são centrais ao desenvolvimento estruturado.

:::caution[Pré-requisito]
Execute primeiro o [fluxo de scaffold de contexto](#context) — o `.context/` precisa existir antes de inicializar um workflow. O estado canônico do workflow fica em `.context/runtime/workflows/prevc.json`.
:::

### workflow-init

Inicializa um workflow PREVC para desenvolvimento estruturado.

| Parâmetro | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `name` | string | sim | Nome do workflow/feature |
| `description` | string | não | Descrição da tarefa usada para auto-detecção da escala |
| `scale` | enum: `QUICK` \| `SMALL` \| `MEDIUM` \| `LARGE` | não | Força a escala do projeto |
| `autonomous` | boolean | não | Pula os gates do workflow |
| `require_plan` | boolean | não | Exige um plano antes da transição P→R |
| `require_approval` | boolean | não | Exige aprovação antes da transição R→E |
| `archive_previous` | boolean | não | Arquiva um workflow existente antes |

A escala controla quais fases rodam:

| Escala | Fases | Esforço aproximado |
| --- | --- | --- |
| `QUICK` | E → V | arquivo único, ~5 min |
| `SMALL` | P → E → V | feature simples, ~15 min |
| `MEDIUM` | P → R → E → V | feature regular com design, ~30 min |
| `LARGE` | P → R → E → V → C | complexo/sistemas/compliance, 1+ hora |

**Retorna:** status do workflow, a fase inicial e a configuração de gates; persiste o estado canônico em `.context/runtime/workflows/prevc.json`.

### workflow-status

Obtém o status atual do workflow PREVC. Não exige parâmetros.

**Retorna:** fase atual, status de todas as fases, configurações de gates, planos vinculados e atividade dos agents.

### workflow-advance

Avança para a próxima fase do PREVC.

| Parâmetro | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `outputs` | array | não | Caminhos de artefatos produzidos na fase atual |
| `force` | boolean | não | Ignora os gates (P→R exige um plano quando `require_plan` está ativo; R→E exige aprovação quando `require_approval` está ativo) |

**Retorna:** a próxima fase, os status atualizados das fases e o resultado da aplicação dos gates.

### workflow-manage

Gerencia tudo em torno do loop principal de fases — handoffs, colaboração, criação de documentos, gates, aprovações, autonomia, checkpoints, artefatos, task contracts e execuções pontuais de sensors.

**Actions:** `handoff`, `collaborate`, `createDoc`, `getGates`, `approvePlan`, `setAutonomous`, `checkpoint`, `recordArtifact`, `defineTask`, `runSensors`

**Parâmetros principais (um subconjunto — a aplicabilidade depende da action):**

| Parâmetro | Tipo | Aplica-se a | Descrição |
| --- | --- | --- | --- |
| `action` | enum (obrigatório) | todas | Action a executar |
| `from` / `to` | string | handoff | Agents que entregam / recebem |
| `artifacts` | array | handoff | Artefatos a entregar |
| `topic` | string | collaborate | Tópico da colaboração |
| `participants` | array | collaborate | Papéis participantes |
| `type` | enum: `prd` \| `tech-spec` \| `architecture` \| `adr` \| `test-plan` \| `changelog` | createDoc | Tipo de documento |
| `docName` | string | createDoc | Nome do documento |
| `planSlug` | string | approvePlan | Identificador do plano |
| `approver` | enum: `planner` \| `reviewer` \| `executor` \| `verifier` \| `completer` | approvePlan | Papel que aprova |
| `notes` | string | approvePlan, setAutonomous | Notas / motivo |
| `enabled` | boolean | setAutonomous | Habilita ou desabilita a autonomia |
| `reason` | string | setAutonomous | Motivo da mudança |
| `name` / `kind` / `content` / `filePath` | — | recordArtifact | Campos do registro de artefato |
| `taskTitle` / `taskDescription` / `expectedOutputs` / `acceptanceCriteria` / `requiredSensors` / `requiredArtifacts` | — | defineTask | Campos do task contract |
| `sensors` | array | runSensors | IDs de sensors a executar |
| `data` | object | checkpoint | Payload do checkpoint |
| `pause` | boolean | checkpoint | Pausa a session após o checkpoint |

**Retorna:** confirmação de handoff, uma sessão de colaboração, um registro de artefato, status de gates, um task contract ou resultados de sensors.

## Recursos MCP

Além das tools, o servidor expõe recursos somente leitura que seu cliente pode buscar por URI.

| URI do recurso | Tipo MIME | Descrição |
| --- | --- | --- |
| `context://codebase/{contextType}` | `text/markdown` | Variantes de contexto semântico — `documentation`, `playbook`, `plan` ou `compact`. Atualiza automaticamente na leitura; suporta cache. |
| `file://{path}` | `text/plain` | Lê o conteúdo de arquivos; os caminhos são validados contra o limite do workspace. |
| `workflow://status` | `application/json` | Status atual do workflow PREVC — fases, papéis e um snapshot de progresso. |

## Fluxos de chamada recomendados

**Inicialização padrão:**

1. `context` → `check` (com `repoPath`) — verifica se o `.context/` existe
2. `context` → `init` (com `autoFill: true`) — faz o scaffold do `.context/`
3. `context` → `fillSingle` — preenche cada arquivo pendente (execute por arquivo)
4. `context` → `scaffoldPlan` — opcional, apenas para trabalho não trivial
5. `workflow-init` — inicia o PREVC (obrigatório para trabalho não trivial)
6. `workflow-status` → `workflow-advance` → handoffs → `workflow-status`

**Orquestração por fase:**

- `agent` → `orchestrate` (com `phase`) → `agent` → `getSequence` — descobre agents para uma fase
- `skill` → `getForPhase` (com `phase`) — puxa skills específicos da fase
- `workflow-manage` → `handoff` — transfere entre agents

**Após o workflow:**

- `plan` → `syncMarkdown` — sincroniza o tracking de volta para o markdown do plano
- `plan` → `commitPhase` (com `stagePatterns: [".context/**"]`) — commita os artefatos da fase

## Instalando o servidor

Para de fato chamar essas tools, instale o servidor MCP no seu cliente de IA:

```bash
npx @dotcontext/mcp install
```

O instalador suporta 16 clientes de IA (Claude Code, Claude Desktop, Cursor, Windsurf, Continue.dev, VS Code / GitHub Copilot, Roo Code, Amazon Q Developer CLI, Google Gemini CLI, Codex CLI, Kiro, Zed, JetBrains IDEs, Trae AI, Kilo Code e GitHub Copilot CLI). Para a configuração completa e detalhes cliente a cliente, veja [Usando o dotcontext com MCP](/pt-br/guides/using-with-mcp/).

## Veja também

- [Usando o dotcontext com MCP](/pt-br/guides/using-with-mcp/) — passo a passo guiado por prompts desta superfície
- [O workflow PREVC](/pt-br/concepts/prevc-workflow/) — fases, escalas e gates
- [Usando a CLI](/pt-br/guides/using-the-cli/) — a superfície de sync/admin fora do MCP
- [dotcontext no GitHub](https://github.com/vinilana/dotcontext)
