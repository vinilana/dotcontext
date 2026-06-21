---
title: Contratos de tarefa & handoffs
description: Como o dotcontext transforma fases de um plano em contratos de tarefa verificáveis com gates de sensor e artefato, e como os agentes passam o trabalho entre si.
sidebar:
  order: 6
---

Um prompt que diz "implemente a feature e garanta que os testes passem" é um desejo, não um contrato. O agente decide o que significa "pronto", e você só descobre se ele estava certo depois do fato.

Um **contrato de tarefa** inverte isso. Ele declara, de forma antecipada e verificável por máquina, o que uma tarefa precisa produzir e quais gates bloqueiam sua conclusão. É o harness — não o modelo — que decide se a tarefa pode ser marcada como concluída. Quando o trabalho passa de um agente para outro, um **contrato de handoff** registra exatamente o que foi transferido e por quê.

Esta página explica o que é um contrato de tarefa, como ele deriva de um plano vinculado, os dois tipos de gate (sensores requeridos e artefatos requeridos), o gate de evidência que protege a transição `E -> V` e como funcionam os handoffs.

## Por que existem contratos de tarefa

Contratos de tarefa dão à execução do agente três propriedades que prompts soltos não conseguem garantir:

- **Aceitação legível** — outputs esperados e critérios de aceitação ficam escritos, não implícitos.
- **Gates aplicados** — uma tarefa só conclui quando seus sensores requeridos passaram e seus artefatos requeridos existem.
- **Handoffs auditáveis** — toda transferência entre agentes é um registro durável com artefatos e evidências anexados.

Contratos são a ponte entre o [workflow PREVC](/pt-br/concepts/prevc-workflow/) (em que fase estamos?) e os [sensores](/pt-br/concepts/sensors/) e o estado de runtime (o trabalho realmente aconteceu?).

## Do plano ao contrato

Um contrato de tarefa normalmente é **derivado de um plano vinculado**. Quando você escreve um plano e o vincula a um workflow, cada fase do plano carrega os inputs, outputs esperados, critérios de aceitação e gates do trabalho daquela fase. O harness materializa isso em um contrato de tarefa sob `.context/runtime/contracts/tasks/`.

É por isso que a convenção é escrever um plano primeiro — veja [Escrevendo planos](/pt-br/guides/authoring-plans/). O plano é a fonte legível por humanos; o contrato é o derivado aplicado por máquina.

Você também pode definir um contrato de tarefa diretamente pelas ferramentas de harness ou workflow quando não há um plano completo do qual partir.

::: tip[O binding activeTaskId]
O arquivo de estado do workflow PREVC, `.context/runtime/workflows/prevc.json`, carrega um campo `binding.activeTaskId`. Esse ID aponta para um contrato sob `.context/runtime/contracts/tasks/`. Em outras palavras, o workflow ativo sabe a qual contrato de tarefa ele está sendo cobrado no momento. Os gates avaliados durante o workflow leem desse contrato.
:::

## Anatomia de um contrato de tarefa

Um contrato de tarefa é um registro JSON. Os campos que mais importam no dia a dia:

| Campo | Tipo | Propósito |
| --- | --- | --- |
| `id` | string | Identificador estável do contrato (referenciado por `binding.activeTaskId`). |
| `title` | string | Nome legível da tarefa. |
| `description` | string | Sobre o que é a tarefa. |
| `status` | enum | `draft`, `ready`, `in_progress`, `blocked`, `completed` ou `failed`. |
| `inputs` | string[] | A partir do que a tarefa começa. |
| `expectedOutputs` | string[] | O que a tarefa deve produzir. |
| `acceptanceCriteria` | string[] | Condições que definem sucesso. |
| `requiredSensors` | string[] | IDs de sensor que devem passar antes da conclusão. |
| `requiredArtifacts` | (string &#124; spec)[] | Arquivos/artefatos que devem existir antes da conclusão. |
| `sessionId` | string | Session à qual o contrato está anexado (opcional). |
| `owner` | string | Role ou agente responsável (opcional). |

`requiredSensors` e `requiredArtifacts` são os gates. Todo o resto descreve o trabalho; esses dois decidem se ele está pronto.

### required_sensors

`requiredSensors` é uma lista de IDs de sensor (por exemplo `tests-passing`, `typecheck-clean`). Antes de uma tarefa concluir, cada sensor listado precisa ter uma execução com status de aprovação registrada na session. Um sensor que falhou, foi bloqueado ou nunca rodou deixa o gate aberto.

Os sensores vêm do seu catálogo em `.context/config/sensors.json`. Veja [Sensores & backpressure](/pt-br/concepts/sensors/) para entender como eles são detectados e executados.

### required_artifacts

`requiredArtifacts` declara os arquivos ou artefatos que a tarefa deve produzir. A forma mais curta é apenas uma string:

```json
{
  "requiredArtifacts": ["test-report"]
}
```

Uma string simples é a **forma curta** de uma correspondência exata por nome — ela é normalizada para `{ "kind": "name", "name": "test-report" }`. Você também pode escrever a spec estruturada diretamente, o que habilita correspondência por path, glob e contagem de arquivos:

| Spec | Corresponde quando |
| --- | --- |
| `"string-de-nome"` | Forma curta; normalizada para uma spec `name` (correspondência exata em `artifact.name`). |
| `{ "kind": "name", "name": "..." }` | Um artefato registrado tem exatamente este nome. |
| `{ "kind": "path", "path": "..." }` | Um artefato registrado tem exatamente este path. |
| `{ "kind": "glob", "glob": "...", "minMatches": 1, "fromFilesystem": false }` | Ao menos `minMatches` artefatos correspondem ao glob. |
| `{ "kind": "file-count", "glob": "...", "min": 3, "fromFilesystem": false }` | Ao menos `min` arquivos correspondem ao glob. |

Um exemplo mais completo:

```json
{
  "requiredArtifacts": [
    "tech-spec",
    { "kind": "path", "path": "docs/changelog.md" },
    { "kind": "glob", "glob": "src/**/*.test.ts", "minMatches": 1, "fromFilesystem": true },
    { "kind": "file-count", "glob": "src/components/**/*.tsx", "min": 2, "fromFilesystem": true }
  ]
}
```

#### A opção fromFilesystem

Por padrão, os gates de artefato checam apenas artefatos que foram explicitamente registrados na session (via `recordArtifact` e similares). Isso é preciso, mas pode gerar falsos negativos: os arquivos realmente existem no repositório, o agente só nunca os registrou.

Definir `"fromFilesystem": true` em uma spec `glob` ou `file-count` diz ao contrato para **também escanear a árvore de trabalho** usando o glob, e unir essas correspondências do filesystem com os artefatos registrados. Isso fecha o caso em que os arquivos existem em disco mas `recordArtifact` não foi chamado.

O escaneamento do filesystem:

- resolve paths relativos ao repositório como paths POSIX,
- expira após 5 segundos,
- ignora `**/node_modules/**`, `**/.git/**` e `**/dist/**`.

::: note
`fromFilesystem` só se aplica a specs `glob` e `file-count` — os dois tipos que contam correspondências. Specs `name` e `path` sempre checam artefatos registrados.
:::

## Concluindo uma tarefa: a avaliação

Quando algo pergunta "esta tarefa pode concluir?", o harness avalia o contrato contra a session atual e retorna um veredito estruturado:

| Campo | Significado |
| --- | --- |
| `taskId` | O contrato que foi avaliado. |
| `canComplete` | `true` apenas se todos os gates estiverem satisfeitos. |
| `missingSensors` | IDs de sensor requeridos que não passaram. |
| `missingArtifacts` | Specs de artefato que não foram satisfeitas (com contagens). |
| `blockingFindings` | Explicações legíveis de cada gate aberto. |
| `matchedSensorRuns` | As execuções de sensor aprovadas que satisfizeram o gate de sensor. |
| `matchedArtifacts` | Os artefatos que satisfizeram o gate de artefato. |

Se `canComplete` for `false`, `blockingFindings` diz exatamente o que está faltando — um sensor que falhou, um glob de artefato com poucas correspondências, e assim por diante.

## O gate execution_evidence em E -> V

O lugar mais importante onde um contrato de tarefa é aplicado é a transição de **Execute (E)** para **Verify (V)** no workflow PREVC.

O dotcontext aplica um gate **`execution_evidence`** em `E -> V`. A premissa é simples: você não deveria entrar na verificação até que haja evidência real de que a execução aconteceu e se sustentou. Na prática, isso significa que os gates do contrato de tarefa ativo — seus `requiredSensors` e `requiredArtifacts` — precisam estar satisfeitos antes que o workflow avance de E para V.

É isso que impede um agente de declarar "implementação pronta, indo para o QA" enquanto os testes estão vermelhos ou os arquivos esperados nunca foram escritos. O gate lê o contrato vinculado por `binding.activeTaskId`, o avalia e bloqueia o avanço se `canComplete` for `false`.

::: caution
Se `E -> V` não avança, avalie primeiro o contrato de tarefa ativo. Os `blockingFindings` da avaliação são a lista autoritativa do que o `execution_evidence` está esperando — geralmente um sensor que não passou ou um artefato requerido que não foi produzido ou registrado.
:::

Para entender como fases e gates se encaixam no todo, veja [O workflow PREVC](/pt-br/concepts/prevc-workflow/).

## Handoffs entre agentes

Um workflow multifásico envolve mais de um agente: um planner produz uma spec, um executor a implementa, um verifier a revisa. Cada transferência é um **handoff**, e o dotcontext o registra como um **contrato de handoff**.

Um contrato de handoff captura:

| Campo | Propósito |
| --- | --- |
| `id` | Identificador estável do handoff. |
| `from` | Role ou ID do agente que passa o trabalho. |
| `to` | Role ou ID do agente que recebe o trabalho. |
| `artifacts` | IDs de artefato transferidos no handoff. |
| `taskId` | O contrato de tarefa ao qual este handoff se relaciona (opcional). |
| `sessionId` | A session à qual o handoff pertence (opcional). |
| `evidence` | Links ou achados passados adiante para o próximo agente. |

O agente que recebe ganha um ponto de partida concreto — quais artefatos retomar e quais evidências os sustentam — em vez de inferir o contexto a partir do histórico do chat. Como handoffs são registros duráveis, eles também aparecem depois no [replay](/pt-br/concepts/replay-and-datasets/) como parte da linha do tempo da session.

## Onde os contratos são armazenados

Os dois tipos de contrato vivem sob a árvore de runtime, um arquivo por contrato:

```text
.context/runtime/contracts/
├── tasks/
│   └── <taskId>.json        # contratos de tarefa (derivados de fases do plano)
└── handoffs/
    └── <handoffId>.json     # contratos de handoff entre agentes
```

Esses paths ficam sob `.context/runtime/`, que é estado gerado e está no **gitignore** — contratos são registros de execução reconstruíveis, não configuração versionada. O plano do qual eles derivam, por outro lado, é algo que você escreve e pode manter junto ao projeto.

## Juntando tudo

1. **Escreva um plano** com fases claras, outputs esperados e critérios de aceitação. Veja [Escrevendo planos](/pt-br/guides/authoring-plans/).
2. **Vincule o plano** a um workflow; o harness deriva um **contrato de tarefa** em `.context/runtime/contracts/tasks/` e o vincula via `binding.activeTaskId`.
3. **Durante Execute (E)**, rode os [sensores](/pt-br/concepts/sensors/) e registre artefatos para que os gates do contrato sejam preenchidos.
4. **Em `E -> V`**, o gate `execution_evidence` avalia o contrato; o workflow só avança quando `canComplete` é `true`.
5. **Faça o handoff** para o próximo role com um contrato de handoff que leva os artefatos e as evidências adiante.

## Relacionados

- [Escrevendo planos](/pt-br/guides/authoring-plans/) — escreva o plano do qual um contrato deriva.
- [O workflow PREVC](/pt-br/concepts/prevc-workflow/) — fases, roles e onde os gates se aplicam.
- [Sensores & backpressure](/pt-br/concepts/sensors/) — as verificações de qualidade por trás de `required_sensors`.
- [Replay & datasets de falha](/pt-br/concepts/replay-and-datasets/) — onde contratos e handoffs aparecem na linha do tempo.
