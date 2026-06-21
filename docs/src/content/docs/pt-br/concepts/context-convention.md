---
title: A convenção .context
description: Como o dotcontext organiza o diretório .context — config autorada versus estado de runtime gerado, o que é versionado e a migração do layout legado.
sidebar:
  order: 1
---

Tudo o que o dotcontext sabe sobre o seu projeto fica em um único diretório na raiz do repositório: `.context/`. É a convenção que une todo o sistema — a CLI, o harness e o servidor MCP leem e escrevem nele.

A ideia central é uma separação limpa entre dois tipos de estado:

- **Autorado** — arquivos que você e o time escrevem e commitam, como docs, playbooks de agentes, skills e configuração.
- **Gerado** — estado de runtime que o harness produz enquanto executa, como sessions, traces, contratos e replays.

O estado autorado é a sua fonte da verdade e pertence ao git. O estado gerado é reproduzível e é ignorado pelo git. Manter os dois separados deixa o histórico do repositório limpo, e os artefatos de runtime nunca criam diffs ruidosos.

:::tip
Você raramente cria o `.context/` na mão. Rode `context({ action: "init", autoFill: true })` pelo servidor MCP para fazer o scaffold — veja o [Quickstart](/pt-br/getting-started/quickstart/).
:::

## As duas metades: config e runtime

A convenção divide o `.context/` ao meio:

| Metade | Caminho | Escrito por | Commitado? |
| --- | --- | --- | --- |
| Config autorada | `.context/config/` | Você / seu time | Sim |
| Runtime gerado | `.context/runtime/` | O harness | Não |

`config/` guarda os arquivos que governam o comportamento do harness — as suas regras de policy e o seu catálogo de sensors. Eles são revisados, editados e versionados como qualquer outra configuração de projeto.

`runtime/` guarda tudo o que o harness emite enquanto trabalha — linhas do tempo de sessions, traces de eventos, contratos de tarefas, replays e datasets de falhas. É descartável: apague e o harness regenera o que precisar na próxima execução.

## Conhecimento durável do projeto

Ao lado de `config/` e `runtime/`, a convenção reserva quatro pastas para o conhecimento legível por humanos do qual os seus agentes se valem:

| Pasta | O que contém |
| --- | --- |
| `.context/docs/` | Documentação durável do projeto e a base de conhecimento semântica gerada |
| `.context/agents/` | Playbooks de agentes e definições de papéis, mantidos como ativos do projeto |
| `.context/skills/` | Skills reutilizáveis — guias operacionais sob demanda para tarefas específicas |
| `.context/plans/` | Planos de implementação mantidos como artefatos de trabalho locais |

`docs/`, `agents/` e `skills/` são commitados para que todo o time (e cada agente) compartilhe o mesmo conhecimento. `plans/` é tratado por padrão como estado de trabalho local e é gitignored, a menos que o time decida versioná-lo.

## A árvore de diretórios

Aqui está o layout completo. Os arquivos autorados no topo são versionados; tudo sob `runtime/` (e `cache/`, `plans/`) é gerado e gitignored.

```text
.context/
├── config.json                       # versionado — config de geração de contexto
├── docs/                             # versionado — documentação & KB semântica
├── agents/                           # versionado — playbooks de agentes
├── skills/                           # versionado — skills reutilizáveis
├── plans/                            # local      — planos de implementação (gitignored)
├── config/                           # versionado — configuração autorada
│   ├── policy.json                   #   regras declarativas de policy
│   └── sensors.json                  #   catálogo de sensors + stack detectada
├── cache/                            # gerado — gitignored
│   └── semantic/                     #   cache de snapshot semântico persistido
└── runtime/                          # gerado — gitignored
    ├── sessions/
    │   └── <sessionId>/
    │       ├── session.json          #   registro da session
    │       ├── trace.jsonl           #   log de eventos append-only
    │       └── artifacts/<id>.json
    ├── workflows/
    │   ├── prevc.json                #   estado atual da fase PREVC
    │   ├── collaboration-sessions.json
    │   ├── plan-tracking/
    │   └── archive/
    ├── contracts/
    │   ├── tasks/<taskId>.json
    │   └── handoffs/<handoffId>.json
    └── evaluations/
        ├── replays/<replayId>.json
        └── datasets/<datasetId>.json
```

## O que é versionado

Commite a metade autorada. Estes são os ativos compartilhados e duráveis do seu projeto:

- `.context/config.json` — configuração de geração de contexto, para que o scaffolding seja repetível entre checkouts
- `.context/config/policy.json` — regras de policy do harness e restrições de aprovação
- `.context/config/sensors.json` — o catálogo de sensors (gerado no bootstrap e depois customizado pelo time)
- `.context/docs/**` — toda a documentação e a base de conhecimento semântica
- `.context/agents/**` — todos os playbooks de agentes
- `.context/skills/**` — todas as skills

## O que é gitignored

A metade gerada é reproduzível, então fica fora do git. Um `.gitignore` típico bloqueia:

```text
.context/cache/
.context/plans/
.context/runtime/
.context/harness/      # legado
.context/workflow/     # legado
.context/**/archive/
```

:::note
`plans/` é gitignored por padrão porque planos geralmente são artefatos de trabalho locais. Se o time quiser compartilhar planos, basta remover essa linha e commitá-los como qualquer outro arquivo autorado.
:::

## Layout legado e migração automática

Versões anteriores do dotcontext misturavam configuração e estado de runtime em `.context/harness/` e `.context/workflow/`. A convenção atual substitui essas pastas pela divisão `config/` + `runtime/`.

Você não precisa migrar na mão. No primeiro acesso, o harness migra in-place as partes duráveis do layout antigo. A migração é idempotente e memoizada por caminho `.context`, então não custa nada nas execuções seguintes.

| Caminho legado | Caminho novo |
| --- | --- |
| `.context/harness/policy.json` | `.context/config/policy.json` |
| `.context/harness/sensors.json` | `.context/config/sensors.json` |
| `.context/harness/workflows/prevc.json` | `.context/runtime/workflows/prevc.json` |
| `.context/harness/workflows/archive` | `.context/runtime/workflows/archive` |
| `.context/harness/contracts` | `.context/runtime/contracts` |
| `.context/workflow/collaboration-sessions.json` | `.context/runtime/workflows/collaboration-sessions.json` |
| `.context/workflow/plans.json` | `.context/runtime/workflows/plans.json` |
| `.context/workflow/plan-tracking` | `.context/runtime/workflows/plan-tracking` |

Alguns detalhes que vale conhecer:

- **Só os artefatos duráveis migram.** Config, estado de workflow e contratos são movidos. O estado efêmero — sessions, traces, artifacts, replays, datasets — é deixado de propósito, porque o harness o regenera sob demanda.
- **O layout novo vence.** Se a localização legada e a nova tiverem dados, a cópia nova é mantida e a cópia legada permanece intocada. Nada é sobrescrito nem mesclado.
- **As pastas legadas continuam ignoradas.** O `.gitignore` mantém `.context/harness/` e `.context/workflow/` excluídos, então um checkout não migrado nunca vaza estado de runtime para o git.

## Próximos passos

- [Referência: o layout do .context](/pt-br/reference/context-layout/) — o detalhamento completo caminho por caminho, com classificações
- [Sensors](/pt-br/concepts/sensors/) — o que vive em `.context/config/sensors.json`
- [Policies](/pt-br/concepts/policies/) — o que vive em `.context/config/policy.json`
- [O runtime do harness](/pt-br/concepts/harness-runtime/) — o que preenche `.context/runtime/`
