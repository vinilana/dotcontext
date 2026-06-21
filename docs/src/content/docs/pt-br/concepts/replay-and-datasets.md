---
title: Replay & datasets de falha
description: Reconstrua timelines de sessão duráveis e ordenadas com replay e agrupe falhas recorrentes em datasets para análise de causa raiz.
sidebar:
  order: 7
---

Todo workflow produz um rastro de eventos: execuções de sensor, mudanças de fase, artifacts, checkpoints, handoffs e erros. O **replay** costura esse rastro de volta em uma única timeline durável e ordenada no tempo, que você pode inspecionar muito depois de a sessão terminar. Os **datasets de falha** então varrem vários replays para revelar as falhas que continuam voltando.

Juntos eles transformam a atividade efêmera da sessão em um loop de aprendizado: o replay conta *o que aconteceu* em uma execução; os datasets contam *o que continua dando errado* entre execuções.

Esses recursos ficam em cima do [harness runtime](/pt-br/concepts/harness-runtime/), que registra as sessões, traces, artifacts, execuções de sensor, tasks e handoffs subjacentes.

## Por que replay e datasets existem

Uma sessão ao vivo é ótima para o trabalho fluir, mas o estado dela está espalhado por vários arquivos e cresce conforme a execução avança. Quando a execução termina, normalmente você quer respostas para perguntas como:

- Qual foi a ordem exata dos eventos que levou a uma falha?
- Qual sensor bloqueou a fase, e qual foi a evidência dele?
- Estamos esbarrando no mesmo erro de typecheck em dez features diferentes?

O replay responde as duas primeiras ao condensar uma sessão em um único log de eventos ordenado. Os datasets respondem a terceira ao agrupar falhas entre vários replays, deixando os padrões evidentes.

## Replay: um log de eventos durável e ordenado

Um **replay** reconstrói a timeline completa de uma sessão a partir de tudo que o harness registrou: o próprio registro da sessão, seus traces, artifacts, checkpoints, execuções de sensor, tasks e handoffs. O resultado é um único documento com uma lista plana de eventos ordenada no tempo, que você pode reproduzir em sequência.

### O que um replay contém

Cada replay é um snapshot autocontido. Além dos dados coletados, ele carrega um pequeno cabeçalho descrevendo a execução:

| Campo | Significado |
| --- | --- |
| `id` | Identificador do replay |
| `sessionId` | A sessão que este replay reconstrói |
| `repoPath` | Repositório em que a sessão rodou |
| `createdAt` / `replayedAt` | Quando o replay foi construído |
| `fidelity` | `complete` ou `partial` (se todos os dados de origem estavam disponíveis) |
| `eventCount` | Número de eventos na timeline ordenada |
| `summary` | Descrição legível da execução |

Os dados de origem coletados (`session`, `artifacts`, `checkpoints`, `traces`, `sensorRuns`, `tasks`, `handoffs`) são incluídos por completo, e o array `events` mescla tudo em uma única timeline:

```json
{
  "id": "replay-...",
  "sessionId": "session-...",
  "fidelity": "complete",
  "eventCount": 42,
  "summary": "Execução de feature com 1 sensor falho",
  "events": [
    {
      "id": "evt-...",
      "sessionId": "session-...",
      "createdAt": "2026-06-05T10:02:11.000Z",
      "source": "trace",
      "label": "phase.advanced P -> R",
      "payload": { "from": "P", "to": "R" }
    },
    {
      "id": "evt-...",
      "sessionId": "session-...",
      "createdAt": "2026-06-05T10:14:53.000Z",
      "source": "sensor",
      "label": "typecheck-clean failed",
      "payload": { "status": "failed" }
    }
  ]
}
```

Cada evento registra sua `source` — `session`, `trace`, `artifact`, `checkpoint`, `sensor`, `task` ou `handoff` — então você sabe de relance de onde cada entrada veio.

### Onde os replays ficam armazenados

```text
.context/runtime/evaluations/replays/<replayId>.json
```

Como todo o estado de runtime do harness, o diretório `evaluations/` fica sob `.context/runtime/` e é ignorado pelo git. É saída gerada, não configuração escrita à mão.

### Construindo e lendo replays

O replay é uma action da ferramenta MCP `harness`:

```jsonc
// Re-executa uma sessão em um replay durável
{ "action": "replaySession", "sessionId": "session-..." }

// Lista os replays existentes
{ "action": "listReplays" }

// Busca um replay pelo id
{ "action": "getReplay", "replayId": "replay-..." }
```

:::tip
Construa um replay logo após a sessão terminar — tendo ela completado ou falhado. O replay é um artefato estável, então mesmo que a sessão ao vivo seja arquivada ou limpa depois, a timeline continua disponível para análise.
:::

## Datasets de falha: agrupando o que continua quebrando

Um único replay conta sobre uma execução. Um **dataset de falha** varre vários replays para montar um corpus de falhas e então agrupa falhas relacionadas em clusters, para você ver quais problemas se repetem.

### Como as falhas são coletadas

O construtor de dataset percorre os replays e extrai falhas de quatro tipos:

| Tipo | O que captura |
| --- | --- |
| `sensor` | Uma execução de sensor que foi bloqueada ou falhou |
| `task` | Um task contract cujos gates não foram satisfeitos (sensors ou artifacts faltando) |
| `session` | Uma sessão marcada como falha |
| `trace` | Uma entrada de nível error ou failed/blocked no log de trace |

### Assinaturas e clustering

Cada falha é reduzida a uma **assinatura** (signature) — uma versão normalizada da sua mensagem combinada com o tipo da falha. Detalhes voláteis como UUIDs são normalizados (por exemplo, substituídos por `:uuid`), de modo que duas falhas descrevendo o mesmo problema subjacente colapsam para a mesma assinatura.

Falhas que compartilham uma assinatura são agrupadas em um **cluster**. Um cluster resume com que frequência um problema aparece e onde:

```json
{
  "id": "dataset-...",
  "createdAt": "2026-06-05T11:00:00.000Z",
  "sessionCount": 12,
  "replayCount": 12,
  "failureCount": 27,
  "clusterCount": 4,
  "clusters": [
    {
      "signature": "task::typecheck-clean failed",
      "count": 9,
      "sessionIds": ["session-...", "session-..."],
      "exampleMessages": ["typecheck-clean failed: 3 type errors"],
      "firstSeenAt": "2026-05-28T09:11:00.000Z",
      "lastSeenAt": "2026-06-05T10:14:53.000Z"
    }
  ]
}
```

Cada cluster carrega seu `count`, os `sessionIds` que ele abrange, alguns `exampleMessages` e uma janela `firstSeenAt` / `lastSeenAt` — o suficiente para dizer se um problema é novo, crônico ou recém-resolvido.

### Onde os datasets ficam armazenados

```text
.context/runtime/evaluations/datasets/<datasetId>.json
```

Os datasets ficam ao lado dos replays sob `.context/runtime/evaluations/` e são ignorados pelo git.

### Construindo e lendo datasets

Os datasets também são actions da ferramenta MCP `harness`:

```jsonc
// Varre os replays e constrói um dataset de falha
{ "action": "buildDataset" }

// Lista os datasets
{ "action": "listDatasets" }

// Busca um dataset pelo id
{ "action": "getDataset", "datasetId": "dataset-..." }

// Inspeciona apenas os clusters de falha
{ "action": "getFailureClusters", "datasetId": "dataset-..." }
```

:::note
Um dataset é construído a partir dos replays que existem quando você roda `buildDataset`. Para capturar uma sessão em um dataset, faça o replay dela primeiro com `replaySession` e então reconstrua o dataset.
:::

## Um loop típico de análise

1. Rode um workflow normalmente; o harness registra a sessão, seus traces, execuções de sensor e artifacts.
2. Quando a sessão termina, chame `replaySession` para congelar a timeline dela em `.context/runtime/evaluations/replays/`.
3. Após várias sessões, chame `buildDataset` para varrer os replays acumulados.
4. Chame `getFailureClusters` para ver quais falhas mais se repetem e então mergulhe em replays individuais com `getReplay` para ver a timeline completa de eventos por trás de um cluster.
5. Corrija a causa raiz e observe o `lastSeenAt` do cluster parar de avançar em datasets posteriores.

## Para onde ir agora

- [Harness runtime](/pt-br/concepts/harness-runtime/) — as sessões, traces, artifacts e checkpoints a partir dos quais os replays são construídos.
- [Sensors & backpressure](/pt-br/concepts/sensors/) — os quality checks cujas falhas alimentam os datasets.
- [Task contracts & handoffs](/pt-br/concepts/task-contracts/) — os gates que produzem falhas do tipo `task`.
- [Referência de ferramentas MCP](/pt-br/reference/mcp-tools/) — a lista completa de actions do `harness`, incluindo as actions de replay e dataset.
