---
title: Sensores & backpressure
description: Como o dotcontext executa verificações de qualidade como sensores, onde fica o catálogo de sensores e como os resultados alimentam os gates de fase do PREVC.
sidebar:
  order: 4
---

Um modelo pode afirmar que "os testes passaram" — mas afirmações não são evidências. Os **sensores** são a forma como o harness do dotcontext transforma qualidade em algo que o runtime consegue observar e fazer cumprir, em vez de algo que um agente apenas declara no chat.

Um sensor é uma verificação executável que o runtime roda — normalmente um comando de shell, como o seu script de teste ou de typecheck — que emite um resultado estruturado: passou, falhou, foi pulado ou foi bloqueado. Esse resultado vira evidência, registrada na sessão e consultada sempre que um gate de fase ou um [task contract](/pt-br/concepts/task-contracts/) precisa saber se o trabalho está realmente bom o suficiente para avançar.

É isso que queremos dizer com **backpressure**: quando um sensor crítico e bloqueante falha, o runtime pode reagir e impedir que o workflow avance — em vez de deixar um agente declarar vitória e seguir em frente.

## Por que os sensores existem

Qualidade baseada só em prompt é frágil. Se o único sinal que o harness tem é a palavra do agente, todo gate vira um "achismo". Os sensores substituem isso por evidência determinística e repetível:

- **Legível** — uma execução de sensor é um trace registrado, não uma frase em um transcript.
- **Reutilizável** — as mesmas verificações fazem gate em toda fase, toda sessão, todo agente.
- **Auditável** — sucessos e falhas são persistidos e aparecem no [replay](/pt-br/concepts/replay-and-datasets/) e nos datasets de falha.

O runtime detecta padrões sensatos a partir da stack do seu repositório no bootstrap, escreve-os em um catálogo que você pode editar e os executa sob demanda durante o workflow.

## Os sensores built-in

O dotcontext vem com três sensores built-in canônicos. A etapa de bootstrap inspeciona o seu repositório e sugere os que se aplicam.

| Sensor | O que verifica | Detectado a partir de |
| --- | --- | --- |
| `i18n-coverage` | Arquivos de locale não-base têm o mesmo conjunto de chaves do locale base | Presença de `locales/*.json` ou `i18n/*.json` |
| `tests-passing` | A suíte de testes passa (parsing de JSON do Jest por padrão; modo exit-code para outros runners) | `scripts.test` no `package.json` |
| `typecheck-clean` | `tsc --noEmit` (ou o comando configurado) sai sem erros | Presença de `tsconfig.json` |

O bootstrap também pode sugerir um sensor `lint` quando um config de ESLint é encontrado.

::: note
Quais sensores são sugeridos depende da sua stack. Um repositório TypeScript com i18n e Jest recebe os três built-ins; um repositório sem script de teste não recebe a sugestão de `tests-passing`. Você sempre pode adicionar, remover ou editar sensores manualmente no catálogo.
:::

### Severidade e bloqueio

Cada sensor carrega duas flags importantes:

- **`severity`** — normalmente `critical` ou `warning`. Sensores críticos representam gates que você não quer cruzar com uma falha; warnings são apenas informativos.
- **`blocking`** — quando `true`, uma execução com falha aplica backpressure: o runtime trata isso como um gate rígido que impede o progresso até passar.

Um sensor `tests-passing` costuma ser `critical` e `blocking`. Um sensor `lint` é frequentemente um `warning` que mostra achados sem interromper o workflow.

## O catálogo de sensores

Os sensores ficam em um único catálogo versionado:

```text
.context/config/sensors.json
```

Ele é **gerado no bootstrap** a partir da stack detectada, e é **seu para customizar** — fica em `.context/config/`, a metade autorada e versionada (git-tracked) do layout `.context/` (em contraste com o estado gerado em `.context/runtime/`). Faça commit dele para que cada pessoa do time e cada agente rodem as mesmas verificações.

### Formato do catálogo

```json
{
  "version": 1,
  "generatedAt": "2026-06-05T12:00:00.000Z",
  "source": "bootstrap",
  "stack": {
    "primaryLanguage": "TypeScript",
    "languages": ["TypeScript", "JavaScript"],
    "frameworks": ["React"],
    "buildTools": ["npm"],
    "testFrameworks": ["Jest"],
    "packageManager": "npm"
  },
  "sensors": [
    {
      "id": "tests-passing",
      "name": "Tests passing",
      "description": "Run the package test script",
      "severity": "critical",
      "blocking": true,
      "enabled": true,
      "command": "npm test -- --runInBand",
      "script": "test"
    },
    {
      "id": "typecheck-clean",
      "name": "Typecheck clean",
      "description": "Type validation with no errors",
      "severity": "critical",
      "blocking": true,
      "enabled": true,
      "command": "npm run typecheck",
      "script": "typecheck"
    }
  ]
}
```

### Campos do catálogo

| Campo | Tipo | Propósito |
| --- | --- | --- |
| `version` | number | Versão do schema do catálogo |
| `generatedAt` | string | Quando o catálogo foi gerado |
| `source` | `bootstrap` \| `manual` | Se foi gerado ou escrito à mão |
| `stack` | object | Metadados da stack detectada que orientaram os defaults |
| `sensors[]` | array | As definições de sensor que o runtime pode executar |

### Campos do sensor

| Campo | Tipo | Propósito |
| --- | --- | --- |
| `id` | string | Identificador estável referenciado por task contracts e gates |
| `name` | string | Rótulo legível |
| `description` | string | O que o sensor verifica |
| `severity` | `critical` \| `warning` | Quão séria é uma falha |
| `blocking` | boolean | Se uma falha aplica backpressure |
| `enabled` | boolean | Se o runtime o executa |
| `command` | string | O comando de shell a executar |
| `script` | string | O script de pacote subjacente, quando aplicável |

::: tip
Desabilite um sensor sem deletá-lo definindo `"enabled": false`. Isso mantém a definição no catálogo (e no histórico do git) para quando você quiser de volta.
:::

## O que uma execução produz

Quando o runtime executa um sensor, ele emite um resultado estruturado:

```ts
{
  status: "passed" | "failed" | "skipped" | "blocked",
  summary: string,
  evidence?: string[],   // caminhos de arquivo, achados, links
  output?: unknown,      // stdout do comando ou JSON parseado
  details?: Record<string, unknown>
}
```

Esse resultado é persistido como uma entrada de **trace** (event: `sensor.run`) na sessão ativa, em `.context/runtime/sessions/<sessionId>/trace.jsonl`. Por fazer parte do registro durável da sessão, você pode inspecioná-lo depois, comparar execuções entre sessões e expor falhas recorrentes em datasets.

## Como os sensores alimentam os gates de fase

Os sensores são a camada de evidência; os gates são onde essa evidência é aplicada. Dois mecanismos consomem os resultados dos sensores:

1. **Task contracts.** Um [task contract](/pt-br/concepts/task-contracts/) pode listar `requiredSensors` — IDs de sensores que precisam passar antes que a tarefa possa ser concluída. Quando o runtime avalia a conclusão, qualquer sensor obrigatório que não passou aparece como um gate faltante, e a tarefa não pode ser marcada como concluída.

2. **Avanço de fase do PREVC.** Conforme você percorre o [workflow PREVC](/pt-br/concepts/prevc-workflow/), o runtime pode executar sensores e registrar seus resultados na fase atual. A falha de um sensor crítico e bloqueante é backpressure contra o avanço — o workflow trava na fase atual até que o problema subjacente seja resolvido.

Na prática, isso significa que uma fase como **Verify** não está "concluída" porque um agente disse que está. Está concluída porque `tests-passing` e `typecheck-clean` realmente rodaram e realmente passaram, e essa evidência está registrada.

### Executando sensores

Pela superfície MCP, as execuções de sensor são conduzidas por operações do harness — por exemplo, `recordSensor` registra uma execução de sensor em uma sessão, e a ferramenta `workflow-manage` expõe uma ação `runSensors` para executar sensores nomeados durante o workflow. Os resultados aterrissam na sessão como traces, exatamente como descrito acima.

::: caution
Um sensor vale tanto quanto o comando dele. Se o `command` de um sensor não falhar de fato com uma entrada ruim (por exemplo, um script de teste que sempre sai com `0`), o gate vai passar mesmo quando não deveria. Verifique se os seus comandos retornam código diferente de zero em caso de falha antes de confiar neles como gates bloqueantes.
:::

## Próximos passos

- Ajuste o catálogo e escreva suas próprias verificações em [Customizando sensores e políticas](/pt-br/guides/customizing-sensors-and-policies/).
- Veja como `requiredSensors` se conectam aos gates de conclusão em [Task contracts & handoffs](/pt-br/concepts/task-contracts/).
- Entenda as fases que os sensores fazem gate em [O workflow PREVC](/pt-br/concepts/prevc-workflow/).
- Inspecione execuções de sensor registradas e falhas recorrentes em [Replay & datasets](/pt-br/concepts/replay-and-datasets/).
