---
title: Referência do layout .context
description: Um mapa completo do diretório .context/ — cada arquivo e pasta, sua classificação e se é rastreado pelo git.
sidebar:
  order: 3
---

Tudo o que o dotcontext sabe sobre o seu projeto vive em um único diretório na raiz do repositório: `.context/`. Esta página é a referência completa de onde fica cada coisa — cada diretório e arquivo, sua classificação e se o git o rastreia.

Se você quer o *porquê* por trás desse layout (a separação entre config autorada e estado de runtime gerado), leia primeiro [A convenção .context](/pt-br/concepts/context-convention/). Esta página é o *o quê*.

## Classificação em resumo

Todo caminho em `.context/` cai em um de três grupos:

| Classificação | Significado | Rastreado pelo git |
| --- | --- | --- |
| **versioned** | Autorado por você e seu time; a fonte da verdade. | Sim |
| **local** | Artefatos de trabalho mantidos na sua máquina, a menos que o time decida compartilhá-los. | Não (por padrão) |
| **runtime** | Estado gerado pelo harness; totalmente reproduzível e descartável. | Não |

A regra de bolso: se um humano escreveu, provavelmente é versioned e fica no commit. Se o harness gerou, é runtime e fica ignorado.

## Layout de nível superior

```text
.context/
├── config.json                  # versioned — config de geração
├── config/
│   ├── policy.json              # versioned — regras de policy
│   └── sensors.json             # versioned — catálogo de sensores
├── docs/                        # versioned — documentação + KB semântica
├── agents/                      # versioned — playbooks de agentes
├── skills/                      # versioned — expertise sob demanda
├── plans/                       # local    — planos de implementação
├── cache/                       # runtime  — cache de snapshot semântico
└── runtime/                     # runtime  — todo estado gerado pelo harness
    ├── sessions/<id>/...
    ├── workflows/...
    ├── contracts/...
    └── evaluations/...
```

## Configuração autorada

Esses arquivos governam como o harness se comporta. Você os escreve, os revisa e eles pertencem ao git.

| Caminho | Classificação | Rastreado | Propósito |
| --- | --- | --- | --- |
| `.context/config.json` | versioned | Sim | Configuração de geração de contexto persistida para que o scaffolding seja repetível entre checkouts. |
| `.context/config/` | versioned | Sim | O diretório de config autorada. |
| `.context/config/policy.json` | versioned | Sim | Regras de [policy](/pt-br/concepts/policies/) do harness e restrições de aprovação. |
| `.context/config/sensors.json` | versioned | Sim | Catálogo de [sensores](/pt-br/concepts/sensors/) do projeto mais informações da stack detectada. Gerado no bootstrap e depois customizado pelo time. |

## Conhecimento durável do projeto

O conhecimento legível por humanos do qual seus agentes se valem. Três dessas pastas são versioned; `plans/` é local por padrão.

| Caminho | Classificação | Rastreado | Propósito |
| --- | --- | --- | --- |
| `.context/docs/**` | versioned | Sim | Documentação durável do projeto e a base de conhecimento semântica gerada. |
| `.context/agents/**` | versioned | Sim | Playbooks de agentes e definições de papéis mantidos como ativos do projeto. |
| `.context/skills/**` | versioned | Sim | Skills reutilizáveis e guias operacionais sob demanda. |
| `.context/plans/**` | local | Não | Planos de implementação mantidos como artefatos locais de trabalho (a menos que seu time decida versioná-los). |

## Estado de runtime gerado

Tudo sob `.context/runtime/` e `.context/cache/` é produzido pelo harness durante o trabalho. É descartável — apague e o harness regenera o que precisa na próxima execução. Nada disso é rastreado pelo git.

### Cache

| Caminho | Classificação | Rastreado | Propósito |
| --- | --- | --- | --- |
| `.context/cache/semantic/**` | runtime | Não | Cache de snapshot semântico persistido e seções de resumo versionadas da análise da codebase. |

### Sessions

Uma pasta por [session do harness](/pt-br/concepts/harness-runtime/), guardando seu registro, log de eventos e artefatos.

| Caminho | Classificação | Rastreado | Propósito |
| --- | --- | --- | --- |
| `.context/runtime/sessions/` | runtime | Não | Raiz de todo o estado de sessions. |
| `.context/runtime/sessions/<id>/session.json` | runtime | Não | O registro da session (status, contadores, checkpoints). |
| `.context/runtime/sessions/<id>/trace.jsonl` | runtime | Não | Log de eventos append-only, um objeto JSON por linha. |
| `.context/runtime/sessions/<id>/artifacts/<artifactId>.json` | runtime | Não | Registros de artefatos individuais produzidos durante a session. |

### Workflows

Estado do workflow PREVC e registros de apoio. Veja o conceito [Workflow PREVC](/pt-br/concepts/prevc-workflow/).

| Caminho | Classificação | Rastreado | Propósito |
| --- | --- | --- | --- |
| `.context/runtime/workflows/` | runtime | Não | Raiz do estado de workflow. |
| `.context/runtime/workflows/prevc.json` | runtime | Não | O estado canônico da fase PREVC atual e a configuração de gates. |
| `.context/runtime/workflows/plans.json` | runtime | Não | Vínculos de plano e metadados. |
| `.context/runtime/workflows/plan-tracking/` | runtime | Não | Rastreamento de passos de fase e resultados de execução de predicados de aceitação. |
| `.context/runtime/workflows/collaboration-sessions.json` | runtime | Não | Registros de handoff e colaboração. |
| `.context/runtime/workflows/archive/` | runtime | Não | Workflows arquivados e artefatos de execução históricos. |

### Contracts

[Task contracts e handoffs](/pt-br/concepts/task-contracts/) que controlam a conclusão e formalizam as transições de papel.

| Caminho | Classificação | Rastreado | Propósito |
| --- | --- | --- | --- |
| `.context/runtime/contracts/` | runtime | Não | Raiz das definições de contracts. |
| `.context/runtime/contracts/tasks/<taskId>.json` | runtime | Não | Task contracts com sensores e artefatos obrigatórios. |
| `.context/runtime/contracts/handoffs/<handoffId>.json` | runtime | Não | Handoff contracts entre agentes e fases. |

### Evaluations

Artefatos de [replay e datasets de falha](/pt-br/concepts/replay-and-datasets/).

| Caminho | Classificação | Rastreado | Propósito |
| --- | --- | --- | --- |
| `.context/runtime/evaluations/` | runtime | Não | Raiz dos artefatos de replay e análise de falhas. |
| `.context/runtime/evaluations/replays/<replayId>.json` | runtime | Não | Histórico de execução de session reproduzível (eventos ordenados no tempo). |
| `.context/runtime/evaluations/datasets/<datasetId>.json` | runtime | Não | Datasets de falha agrupados para análise e aprendizado. |

## O que o git ignora

O `.gitignore` do dotcontext bloqueia todo o estado gerado e local:

```text
.context/cache/
.context/plans/
.context/runtime/
.context/harness/      # legado
.context/workflow/     # legado
.context/**/archive/
```

Todo o resto sob `.context/` entra no commit: seus docs, agentes, skills e os três arquivos de config autorada (`config.json`, `config/policy.json`, `config/sensors.json`).

:::tip
Faça commit de `config/policy.json` e `config/sensors.json` para que todo o time compartilhe os mesmos gates. Deixe `runtime/` ignorado — versioná-lo gera diffs ruidosos e nunca ajuda, porque o harness o regenera.
:::

## Layout legado e migração

Versões anteriores do dotcontext misturavam estado de config e runtime sob `.context/harness/` e `.context/workflow/`. O layout atual separa a `config/` autorada do `runtime/` gerado. Checkouts antigos são migrados automaticamente.

A migração roda **em local no primeiro acesso**, é idempotente e é memoizada por caminho `.context`:

- **Artefatos duráveis** (config, estado de workflow, contracts) são migrados para o novo layout.
- **Estado efêmero** (sessions, traces, artefatos, datasets, replays) intencionalmente *não* é migrado — ele se regenera conforme necessário.
- **Tratamento de divergência** — se tanto o local legado quanto o novo tiverem dados, o novo layout vence; a cópia legada é deixada intacta (sem sobrescrita, sem merge).

Os arquivos que se movem:

| Caminho legado | Novo caminho |
| --- | --- |
| `.context/harness/policy.json` | `.context/config/policy.json` |
| `.context/harness/sensors.json` | `.context/config/sensors.json` |
| `.context/harness/workflows/prevc.json` | `.context/runtime/workflows/prevc.json` |
| `.context/harness/workflows/archive` | `.context/runtime/workflows/archive` |
| `.context/harness/contracts` | `.context/runtime/contracts` |
| `.context/workflow/collaboration-sessions.json` | `.context/runtime/workflows/collaboration-sessions.json` |
| `.context/workflow/plans.json` | `.context/runtime/workflows/plans.json` |
| `.context/workflow/plan-tracking` | `.context/runtime/workflows/plan-tracking` |

Os caminhos legados `.context/harness/` e `.context/workflow/` permanecem no `.gitignore` para que checkouts não migrados nunca façam commit acidental de estado de runtime.

:::note
Você não roda a migração manualmente. Ela acontece na primeira vez que a CLI, o harness ou o servidor MCP toca um diretório `.context/` legado.
:::

## Veja também

- [A convenção .context](/pt-br/concepts/context-convention/) — o raciocínio por trás deste layout.
- [Sensores](/pt-br/concepts/sensors/) e [Policies](/pt-br/concepts/policies/) — os dois arquivos de config autorada em detalhe.
- [Harness runtime](/pt-br/concepts/harness-runtime/) — o que gera o estado de runtime.
