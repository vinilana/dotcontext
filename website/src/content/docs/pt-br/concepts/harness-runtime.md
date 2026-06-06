---
title: O runtime do harness
description: A camada de execução reutilizável compartilhada pela CLI e pelo MCP — sessions duráveis, traces, artifacts e checkpoints, e como elas mapeiam para .context/runtime/sessions/.
sidebar:
  order: 2
---

O **harness** é o runtime no centro do formato de produto do dotcontext:

```text
cli -> harness <- mcp
```

Tanto a CLI quanto o servidor MCP são transportes finos. O trabalho de verdade — registrar o que um agente fez, persistir os artifacts que ele produziu, capturar checkpoints e manter um registro durável que você pode retomar ou dar replay — vive no harness. Como essa camada é compartilhada, uma execução iniciada via MCP e outra conduzida pela CLI escrevem o mesmo estado em disco, exatamente no mesmo formato.

Esta página explica as quatro entidades de runtime que o harness gerencia — **sessions**, **traces**, **artifacts** e **checkpoints** — e onde elas vivem em disco.

::: tip[Por que isso importa]
Uma session é o que transforma uma execução avulsa de agente em algo **legível, retomável e auditável**. Uma vez que a execução é registrada como estado durável, você pode pausá-la e retomá-la, inspecionar cada passo e reconstruir toda a linha do tempo depois com [replay](/pt-br/concepts/replay-and-datasets/).
:::

## A camada de runtime

O harness é uma camada de execução agnóstica de transporte. Seja quando um agente chama a tool `harness` do MCP, seja quando você conduz o runtime por comandos CLI/admin, o runtime:

- cria e acompanha **sessions duráveis** que sobrevivem entre chamadas e processos,
- anexa um **trace append-only** de tudo o que aconteceu,
- registra **artifacts** que a execução produziu (texto, JSON ou arquivos), e
- captura **checkpoints** — marcos nomeados que agrupam artifacts e estado.

Tudo isso é armazenado em `.context/runtime/`, que é estado gerado e **não** é versionado. Veja a [referência de layout do contexto](/pt-br/reference/context-layout/) para o mapa completo de diretórios e o que é rastreado versus ignorado.

## Onde vive o estado de runtime

Cada session é dona de uma pasta em `.context/runtime/sessions/<sessionId>/`:

```text
.context/
└── runtime/                       # estado gerado, no gitignore
    └── sessions/
        └── <sessionId>/
            ├── session.json       # o registro da session
            ├── trace.jsonl        # log de eventos append-only (um JSON por linha)
            └── artifacts/
                └── <artifactId>.json
```

| Caminho | O que contém |
| --- | --- |
| `.context/runtime/sessions/<id>/session.json` | O registro da session — status, timestamps, contadores de atividade e checkpoints inline |
| `.context/runtime/sessions/<id>/trace.jsonl` | Log de eventos append-only, um objeto JSON por linha |
| `.context/runtime/sessions/<id>/artifacts/<artifactId>.json` | Um arquivo por artifact registrado |

::: caution
Tudo em `.context/runtime/` é regenerado conforme necessário e está no gitignore. Não edite esses arquivos manualmente — passe pelo harness para que os contadores e o trace permaneçam consistentes.
:::

## Sessions

Uma **session** é um contexto de execução durável. É a unidade que você cria, retoma, completa ou marca como falha, e é dona dos traces, artifacts e checkpoints registrados nela.

O registro da session é armazenado em `.context/runtime/sessions/<id>/session.json`:

```json
{
  "id": "sess_...",
  "name": "add-dark-mode",
  "status": "active",
  "repoPath": "/path/to/project",
  "createdAt": "2026-06-05T...",
  "updatedAt": "2026-06-05T...",
  "startedAt": "2026-06-05T...",
  "completedAt": null,
  "failedAt": null,
  "traceCount": 12,
  "artifactCount": 3,
  "checkpointCount": 1,
  "lastTraceAt": "2026-06-05T...",
  "lastCheckpointAt": "2026-06-05T...",
  "checkpoints": [],
  "metadata": {}
}
```

Uma session percorre quatro estados:

| Status | Significado |
| --- | --- |
| `active` | Em execução, aceitando traces, artifacts e checkpoints |
| `paused` | Suspensa (por exemplo, após um checkpoint com `pause: true`) e retomável |
| `completed` | Finalizada com sucesso |
| `failed` | Finalizada com uma falha registrada |

O registro também guarda **contadores de atividade** — `traceCount`, `artifactCount`, `checkpointCount` — e timestamps `lastTraceAt` / `lastCheckpointAt`, para você ver de relance quanta coisa aconteceu e quando, sem precisar parsear o trace.

As sessions são gerenciadas pela tool `harness` do MCP, cujas actions de session incluem `createSession`, `listSessions`, `getSession`, `resumeSession`, `completeSession` e `failSession`. Como o estado é durável, uma session criada em uma chamada pode ser retomada em outra mais tarde — inclusive entre processos.

## Traces

Um **trace** é a linha do tempo append-only de uma session. Todo evento relevante — uma execução de sensor, um avanço de fase, um erro — é anexado como uma linha em `trace.jsonl`. Essa é a fonte da verdade sobre o que realmente aconteceu durante uma execução.

Cada entrada de trace tem este formato:

```json
{
  "id": "trace_...",
  "sessionId": "sess_...",
  "level": "info",
  "event": "sensor.run",
  "message": "tests passed",
  "createdAt": "2026-06-05T...",
  "data": { "status": "passed" }
}
```

| Campo | Notas |
| --- | --- |
| `level` | `debug`, `info`, `warn` ou `error` |
| `event` | Tipo do evento, ex. `sensor.run`, `phase.advanced`, `artifact.added` |
| `message` | Descrição legível por humanos |
| `data` | Payload estruturado opcional (resultados de sensor, contexto, etc.) |

Como o arquivo é **append-only** (`.jsonl`, um objeto JSON por linha), traces são baratos de escrever e nunca reescrevem entradas anteriores. Use a action `appendTrace` da tool `harness` para adicionar um evento e `listTraces` para ler a linha do tempo.

::: note
Valores de `event` de trace como `sensor.run` são a forma como o harness registra resultados de [sensores](/pt-br/concepts/sensors/) em uma session. É isso que depois permite que task contracts verifiquem se os sensores requeridos passaram, e que [failure datasets](/pt-br/concepts/replay-and-datasets/) agrupem eventos de nível de erro.
:::

## Artifacts

Um **artifact** é algo que uma execução produziu e quer guardar — um documento gerado, um payload JSON ou uma referência a um arquivo em disco. Cada artifact é armazenado como seu próprio arquivo dentro do diretório `artifacts/` da session:

```json
{
  "id": "art_...",
  "sessionId": "sess_...",
  "name": "tech-spec",
  "kind": "file",
  "createdAt": "2026-06-05T...",
  "content": null,
  "path": "docs/tech-spec.md",
  "metadata": {}
}
```

| `kind` | Use para |
| --- | --- |
| `text` | Conteúdo de texto inline pequeno |
| `json` | Conteúdo estruturado inline pequeno |
| `file` | Uma referência a um arquivo (via `path`), para saídas maiores |

Para saídas pequenas o valor pode ficar inline em `content`; para maiores, defina `path` apontando para o arquivo no repositório. Os artifacts registrados são o que os **task contracts** verificam ao decidir se os `requiredArtifacts` de uma tarefa foram satisfeitos — veja [task contracts e handoffs](/pt-br/concepts/task-contracts/) para entender como esse gate funciona.

Adicione artifacts com a action `addArtifact` da tool `harness` e leia-os com `listArtifacts`.

## Checkpoints

Um **checkpoint** é um marco nomeado dentro de uma session. Ele agrupa um conjunto de artifacts e estado opcional, dando a você um ponto significativo e recuperável para o qual voltar — útil entre fases PREVC, antes de um passo arriscado ou sempre que você quiser um snapshot rotulado.

Checkpoints são armazenados **inline** no array `checkpoints` do registro da session (não como arquivos separados):

```json
{
  "id": "ckpt_...",
  "note": "plan approved, before execution",
  "data": {},
  "artifactIds": ["art_..."],
  "createdAt": "2026-06-05T..."
}
```

| Campo | Notas |
| --- | --- |
| `note` | Rótulo opcional descrevendo o marco |
| `data` | Payload customizado opcional do checkpoint |
| `artifactIds` | Artifacts a preservar neste ponto |

Um checkpoint também pode pedir que a session **pause** — passe `pause: true` e a session vai para `paused`, pronta para ser retomada depois. Use a action `checkpoint` da tool `harness` para capturar um.

## Como sessions são registradas e dão replay

As quatro entidades se compõem em um único registro durável:

1. Uma **session** é criada e fica `active`.
2. Conforme a execução avança, eventos são anexados ao **trace** e saídas são registradas como **artifacts**.
3. **Checkpoints** marcam marcos recuperáveis e podem pausar a session.
4. A session é, por fim, `completed` ou `failed`.

Como tudo isso é persistido, o harness consegue reconstruir a linha do tempo completa depois. O **replay** costura os traces, artifacts, checkpoints, execuções de sensor, tasks e handoffs de uma session de volta em um fluxo de eventos ordenado no tempo, e os **failure datasets** mineram esses replays para agrupar problemas recorrentes. Esse é o assunto do próximo conceito.

## Próximos passos

- [Replay e failure datasets](/pt-br/concepts/replay-and-datasets/) — reconstrua a linha do tempo de uma session e construa um corpus de falhas a partir dela.
- [Sensores](/pt-br/concepts/sensors/) — as verificações de qualidade cujos resultados aterrissam no trace como eventos `sensor.run`.
- [Task contracts e handoffs](/pt-br/concepts/task-contracts/) — gates que verificam sensores e artifacts registrados antes de uma tarefa poder ser concluída.
- [Referência de layout do contexto](/pt-br/reference/context-layout/) — o mapa completo do diretório `.context/`, incluindo o que é rastreado versus ignorado.
