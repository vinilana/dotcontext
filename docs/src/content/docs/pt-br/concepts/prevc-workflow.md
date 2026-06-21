---
title: O workflow PREVC
description: Como o dotcontext estrutura o desenvolvimento em cinco fases — Plan, Review, Execute, Verify, Confirm — e as roteia conforme a escala do trabalho.
sidebar:
  order: 3
---

PREVC é o workflow no coração do dotcontext. Ele divide qualquer mudança em cinco fases nomeadas — **P**lan, **R**eview, **E**xecute, **V**erify, **C**onfirm — e executa apenas as fases que a sua mudança realmente precisa.

A ideia não é burocracia. Uma correção de uma linha não deveria passar pelos mesmos gates de uma feature sensível a segurança. O PREVC mantém o trabalho pequeno rápido e o trabalho grande seguro, roteando as fases conforme a **escala** da tarefa, ao mesmo tempo em que mantém um registro único e durável do que aconteceu.

O estado canônico do workflow fica em `.context/runtime/workflows/prevc.json`. Ele é gerado e gerenciado pelo harness — você o conduz pelas ferramentas MCP `workflow-*` ou pelo CLI `dotcontext admin workflow`.

## As cinco fases

Cada fase tem um código de uma letra, uma responsabilidade clara e papéis e saídas típicos. P, E e V sempre fazem parte de qualquer rota não trivial; R e C são opcionais e entram conforme a escala cresce.

| Fase | Nome | Responsabilidade | Opcional? | Papéis típicos | Exemplos de saídas |
| --- | --- | --- | --- | --- | --- |
| **P** | Plan | Descoberta, requisitos e especificações | Não | planner, designer | PRD, tech-spec, requisitos |
| **R** | Review | Arquitetura, decisões técnicas, revisão de design | Sim | architect, designer | architecture, ADR, design-spec |
| **E** | Execute | Implementação e desenvolvimento | Não | developer | código, testes unitários |
| **V** | Verify | Testes, QA e code review | Não | qa, reviewer | relatório de testes, comentários de review, aprovação |
| **C** | Confirm | Documentação, deploy e handoff | Sim | documenter | documentação, changelog, deploy |

### Plan (P)

Plan é onde o trabalho é compreendido antes de qualquer código ser escrito. Você captura requisitos, define as saídas esperadas e — para qualquer coisa não trivial — gera um documento de plano. O plano se torna o contrato que o resto do workflow vai conferir.

:::tip[Escrevendo planos]
O plano que você gera aqui aciona os gates mais adiante. Veja [Escrevendo planos](/pt-br/guides/authoring-plans/) para a estrutura e como as fases se mapeiam nos passos do plano.
:::

### Review (R)

Review é um checkpoint de arquitetura e design. É onde as decisões técnicas são desafiadas e registradas como ADRs ou design specs antes que a implementação as fixe. Review é opcional — só roda em trabalhos MEDIUM e LARGE, em que uma escolha de design errada é cara de reverter.

### Execute (E)

Execute é a implementação: o código, os testes unitários, a mudança em si. Os artefatos produzidos aqui (arquivos, diffs) são registrados na sessão para que as fases seguintes e os task contracts possam verificá-los.

### Verify (V)

Verify roda as suas verificações de qualidade — testes, type checks, QA, code review. É aqui que os [sensors](/pt-br/concepts/sensors/) provam seu valor: eles executam as checagens do projeto (por exemplo `npm test -- --runInBand`) e emitem resultados pass/fail/blocked que controlam a conclusão.

### Confirm (C)

Confirm é a fase de fechamento: documentação, changelog, deploy e handoff. Só roda em trabalhos LARGE, em que a mudança precisa ser comunicada e entregue de forma deliberada.

## Roteamento adaptativo por escala

O PREVC não executa todas as cinco fases sempre. Ele roteia apenas as fases que uma mudança precisa, com base em uma **escala** que você define explicitamente ou deixa o harness detectar a partir da descrição da tarefa.

| Escala | Rota | Tempo estimado | Casos de uso |
| --- | --- | --- | --- |
| **QUICK** | E → V | ~5 min | Correções de bug e ajustes pequenos (cerca de 3 arquivos ou menos, sem compliance) |
| **SMALL** | P → E → V | ~15 min | Features simples (cerca de 10 arquivos ou menos) |
| **MEDIUM** | P → R → E → V | ~30 min | Features regulares que precisam de design (10–30 arquivos; a rota padrão) |
| **LARGE** | P → R → E → V → C | ~1+ hora | Sistemas complexos, trabalho que precisa de docs, compliance ou segurança, 30+ arquivos |

Repare no padrão: **E e V estão sempre presentes** (você sempre implementa e sempre verifica). O Plan entra a partir de SMALL, o Review a partir de MEDIUM e o Confirm a partir de LARGE.

### Como a escala é detectada

Ao inicializar um workflow você pode definir `scale` diretamente. Se não definir, o harness a infere a partir da `description` que você passa, usando sinais como palavras-chave e complexidade:

- **Correção de bug → QUICK**: palavras como `fix`, `bug`, `hotfix`, `patch`, `issue`
- **Feature simples → SMALL**: palavras como `add`, `simple`, `small`, `minor`, `tweak`
- **Segurança / compliance → LARGE**: palavras como `security`, `compliance`, `audit`, `gdpr`, `lgpd`
- **Precisa de docs → LARGE**: palavras como `document`, `docs`, `api`, `public`

:::note
A detecção é uma conveniência, não uma garantia. Na dúvida, defina `scale` explicitamente para que a rota seja exatamente a que você pretende.
:::

## Gates e modo autônomo

O roteamento decide *quais* fases rodam. Os **gates** decidem se você tem permissão para sair de uma fase para a próxima. Eles transformam o PREVC de um checklist em um processo aplicável.

| Gate | O que exige | Quando dispara |
| --- | --- | --- |
| `require_plan` | Deve existir um plano vinculado antes de sair de Plan | Transição P → R |
| `require_approval` | Deve haver uma aprovação registrada antes de sair de Review | Transição R → E |
| `execution_evidence` | Artefatos registrados / sensors aprovados antes de concluir a execução | Transições E e V |

Os gates são configurados quando você inicializa um workflow e expostos pelo `workflow-status`. Quando você chama `workflow-advance`, o harness aplica os gates ativos: avançar de P → R falha se `require_plan` estiver ligado e nenhum plano estiver vinculado; avançar de R → E falha se `require_approval` estiver ligado e nenhuma aprovação estiver registrada.

Se você precisar seguir mesmo assim, `workflow-advance` aceita uma flag `force` para contornar o gate — use com cuidado, já que o bypass fica registrado.

### Modo autônomo

Para trabalho de baixo risco, os gates podem atrapalhar. O **modo autônomo** deixa um agente percorrer a rota inteira sem parar para aprovações.

- Defina `autonomous: true` ao chamar `workflow-init` para iniciar sem gates.
- Alterne depois com `workflow-manage` usando `action: "setAutonomous"` e `enabled: true | false`.

:::caution
O modo autônomo pula os gates com humano no loop (`require_plan`, `require_approval`). Reserve-o para trabalhos QUICK e SMALL, ou para automação confiável — não para mudanças LARGE que tocam código sensível a compliance.
:::

## Conduzindo o workflow

O PREVC é MCP-first. As ferramentas dedicadas `workflow-*` cobrem todo o ciclo de vida:

| Ferramenta | O que faz |
| --- | --- |
| `workflow-init` | Inicia um workflow PREVC; defina `name`, e opcionalmente `description`, `scale`, `autonomous` e as flags de gate |
| `workflow-status` | Reporta a fase atual, o status de todas as fases, os gates, os planos vinculados e a atividade |
| `workflow-guide` | Retorna próximos passos adapter-neutral, skills relevantes e dicas portáveis de gate |
| `workflow-advance` | Avança para a próxima fase; passe os `outputs` produzidos e `force` para contornar gates |
| `workflow-manage` | Gerencia operações: `handoff`, `approvePlan`, `setAutonomous`, `getGates`, `recordArtifact`, `defineTask`, `runSensors` e mais |

Um loop típico, depois de gerar o `.context/`:

```text
workflow-init  ->  workflow-guide  ->  workflow-advance  ->  (handoff / gates)  ->  workflow-guide
```

As mesmas operações estão disponíveis pelo CLI para gerenciamento de estado de baixo nível:

```bash
dotcontext admin workflow init "dark-mode" --description "Add dark mode" --scale MEDIUM
dotcontext admin workflow guide
dotcontext admin workflow status
dotcontext admin workflow advance --outputs plan.md
dotcontext admin workflow handoff planner developer --artifacts plan.md
```

:::tip
Para a lista completa de parâmetros de cada ferramenta `workflow-*`, veja a [referência de ferramentas MCP](/pt-br/reference/mcp-tools/).
:::

## Como os gates se conectam aos task contracts

Os gates verificam *que a fase tem permissão para terminar*. Os **task contracts** verificam *que o trabalho em si está pronto* — eles declaram os sensors que precisam passar e os artefatos que precisam existir antes que uma tarefa possa ser marcada como concluída. Os dois trabalham juntos: um gate de Verify só faz sentido se houver um contract descrevendo o que "verificado" significa.

Você define task contracts durante o workflow (por exemplo com `workflow-manage` `action: "defineTask"`), e o harness os avalia contra execuções de sensors e artefatos registrados.

Veja [Task contracts e handoffs](/pt-br/concepts/task-contracts/) para o formato completo do contract e como a conclusão é avaliada.

## Para onde ir a seguir

- [Escrevendo planos](/pt-br/guides/authoring-plans/) — escreva o plano que a fase Plan produz e que os gates conferem.
- [Task contracts e handoffs](/pt-br/concepts/task-contracts/) — defina os gates que decidem quando o trabalho está de fato pronto.
- [Sensors](/pt-br/concepts/sensors/) — as verificações de qualidade que alimentam a fase Verify.
- [Referência de ferramentas MCP](/pt-br/reference/mcp-tools/) — todos os parâmetros de `workflow-init`, `workflow-status`, `workflow-advance` e `workflow-manage`.
