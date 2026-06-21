---
title: Escrevendo planos
description: Faça o scaffold de um plano, escreva suas fases e os requisitos de evidência de execução, e faça o link com o workflow PREVC para que o harness imponha gates reais de conclusão.
sidebar:
  order: 3
---

Um **plano** é a ponte entre intenção e enforcement. Ele descreve *o que* você pretende construir e *como* — dividido em fases PREVC, steps e entregáveis — e, o mais importante, declara a **evidência de execução** (sensors e artifacts) que precisa existir antes que uma fase possa ser concluída.

Quando você faz o link de um plano a um workflow, o harness deriva dele um **task contract**. É esse contract que o gate `execution_evidence` consulta para decidir se a execução realmente aconteceu — e não apenas se alguém *disse* que aconteceu.

Este guia mostra como fazer o scaffold de um plano, escrever seu frontmatter e fazer o link para que esses gates passem a ter significado.

:::tip[Novo nos conceitos?]
Leia [Task contracts](/pt-br/concepts/task-contracts/) e o [workflow PREVC](/pt-br/concepts/prevc-workflow/) primeiro. Este guia parte do princípio de que você já sabe o que são fase, sensor e contract.
:::

## Por que planos importam

Sem um plano, um workflow pode avançar pelas fases apenas com a palavra do agente. Com um plano linkado:

- Cada fase PREVC carrega uma lista de **required sensors** e **required artifacts**.
- Esses requisitos fluem para um task contract derivado.
- O gate `execution_evidence` (E → V) bloqueia o avanço até que o contract possa ser concluído — ou seja, os sensors obrigatórios tenham **passado** e os artifacts obrigatórios tenham sido **registrados**.

Em resumo: um plano transforma "confie em mim" em "me mostre".

## Faça o scaffold de um plano

Planos são **MCP-first**. Use a action `scaffoldPlan` da ferramenta `context` para gerar um template de plano baseado em frontmatter dentro de `.context/plans/`.

```jsonc
// Ferramenta MCP: context
{
  "action": "scaffoldPlan",
  "repoPath": "/caminho/para/projeto",
  "planName": "dark-mode",
  "title": "Adicionar dark mode",
  "summary": "Introduzir um toggle de tema com preferência persistida e cobertura total de i18n."
}
```

| Parâmetro | Propósito |
| --- | --- |
| `action` | Deve ser `scaffoldPlan`. |
| `planName` | Identificador do plano; vira o nome do arquivo (slug). |
| `title` | Título legível do plano. |
| `summary` | Objetivo do plano em uma linha. |
| `repoPath` | Raiz do projeto (informe na primeira chamada; fica em cache depois). |

Isso grava um arquivo de plano em `.context/plans/<slug>.md` — por exemplo `.context/plans/dark-mode.md`. O scaffolder também inspeciona sua stack e pré-sugere requisitos de fase (por exemplo, um sensor `tests-passing` quando encontra um script de teste).

:::note[Onde os planos ficam]
`.context/plans/` é tratado como estado de trabalho local e fica fora do git por padrão. Se o seu time quiser versionar um plano, faça o commit explicitamente.
:::

## Frontmatter do plano

O arquivo gerado é um documento Markdown cujo frontmatter YAML carrega o plano estruturado. O harness lê o frontmatter; o corpo em prosa abaixo dele é para humanos.

```yaml
---
type: plan
name: dark-mode
description: Adicionar um toggle de tema dark mode.
planSlug: dark-mode
summary: "Introduzir um toggle de tema com preferência persistida e cobertura total de i18n."
agents:
  - type: "developer"
    role: "Implementar o toggle e a persistência"
  - type: "qa"
    role: "Validar temas e i18n"
docs:
  - ".context/docs/architecture.md"
phases:
  - id: "plan-1"
    name: "Desenhar o toggle"
    prevc: "P"
    summary: "Decidir a abordagem de armazenamento e tematização."
    deliverables:
      - "tech-spec do armazenamento de tema"
    steps:
      - order: 1
        description: "Escolher uma estratégia de persistência (localStorage vs. cookie)."
        assignee: "planner"
        deliverables:
          - ".context/docs/tech-spec.md"
  - id: "exec-1"
    name: "Implementar dark mode"
    prevc: "E"
    summary: "Construir o toggle, ligar a persistência, adicionar traduções."
    required_sensors:
      - "tests-passing"
      - "typecheck-clean"
      - "i18n-coverage"
    required_artifacts:
      - kind: "glob"
        glob: "src/theme/**/*.ts"
        minMatches: 1
      - "changelog"
    steps:
      - order: 1
        description: "Adicionar o context de tema e o componente de toggle."
        assignee: "developer"
        deliverables:
          - "src/theme/ThemeProvider.tsx"
generated: 2026-06-05
status: unfilled
scaffoldVersion: "2.0.0"
---
```

### Campos da fase

Cada entrada em `phases[]` mapeia uma fase local do plano para uma fase PREVC.

| Campo | Tipo | Significado |
| --- | --- | --- |
| `id` | string | Identificador estável da fase (ex.: `exec-1`). |
| `name` | string | Nome de exibição da fase. |
| `prevc` | `P` \| `R` \| `E` \| `V` \| `C` | Para qual fase PREVC ela mapeia. |
| `summary` | string | Objetivo da fase em uma linha. |
| `deliverables` | string[] | O que a fase como um todo deve produzir. |
| `steps` | object[] | Itens de trabalho ordenados dentro da fase. |
| `required_sensors` | string[] | IDs de sensors que devem **passar** antes que a fase possa ser concluída. |
| `required_artifacts` | (string \| spec)[] | Artifacts que devem ser **registrados** antes da conclusão. |

### Campos do step

Cada entrada em `phases[].steps[]` é uma unidade concreta de trabalho.

| Campo | Tipo | Significado |
| --- | --- | --- |
| `order` | number | Posição do step dentro da fase. |
| `description` | string | O que o step faz. |
| `assignee` | string | Role ou agente responsável (ex.: `developer`). |
| `deliverables` | string[] | Arquivos ou saídas que o step produz. |

### Required sensors

`required_sensors` lista IDs de sensors do seu [catálogo de sensors](/pt-br/concepts/sensors/) (`.context/config/sensors.json`). Os IDs devem bater exatamente — por exemplo `tests-passing`, `typecheck-clean` ou `i18n-coverage`. Uma fase só é considerada concluída quando cada sensor listado tem uma execução registrada com `status: "passed"` na session.

### Required artifacts

`required_artifacts` aceita uma string curta (interpretada como o **name** exato de um artifact) ou uma spec estruturada para matching flexível:

| Spec | Casa com |
| --- | --- |
| `"changelog"` | Um artifact registrado com `name: "changelog"`. |
| `{ kind: "name", name: "..." }` | Name exato do artifact. |
| `{ kind: "path", path: "..." }` | Path exato do artifact. |
| `{ kind: "glob", glob: "...", minMatches?: n }` | Pelo menos `minMatches` artifacts que casam com o glob. |
| `{ kind: "file-count", glob: "...", min: n }` | Pelo menos `min` arquivos que casam com o glob. |

Specs de glob e file-count também podem varrer a working tree, então um contract pode ser satisfeito por arquivos que existem no repo mesmo que `recordArtifact` nunca tenha sido chamado para eles.

## Por que as fases de Execution devem declarar `required_sensors`

Este é o hábito mais importante ao escrever planos.

O gate `execution_evidence` dispara na transição **E → V**. Ele procura um task contract ativo e verifica se esse contract pode ser concluído. Há duas formas pelas quais ele bloqueia você:

1. **Sem contract ativo.** Se nada estiver linkado, o gate não tem o que verificar e recusa o avanço. A solução é fazer o link de um plano (para que um contract seja derivado) ou definir uma task explicitamente.
2. **Evidência incompleta.** Se existe um contract mas seus required sensors não passaram ou seus required artifacts não foram registrados, o gate reporta os itens faltantes e bloqueia o avanço.

Se a sua fase de Execution não declarar **nenhum** `required_sensors` e **nenhum** `required_artifacts`, o contract derivado é trivialmente satisfeito — o gate vira carimbo automático. Declarar requisitos na fase de Execution é a forma canônica de tornar o `execution_evidence` significativo: ele força execuções reais de teste, type checks reais e saída registrada de verdade antes que a validação possa começar.

:::caution[Não deixe Execution vazia]
Uma fase de Execution com `required_sensors` vazio anula o propósito do workflow. No mínimo, exija os sensors que provam que sua mudança é sólida — tipicamente `tests-passing` e `typecheck-clean`.
:::

Quando o gate te bloqueia, ele diz exatamente o que fazer em seguida, por exemplo:

```text
Execution evidence is incomplete: required sensors not passed (tests-passing).
Hint: Run the required sensors via harness({ action: "runSensors", sensorIds: ["tests-passing"] })
and record the required artifacts via harness({ action: "recordArtifact", ... }) before advancing.
```

## Faça o link de um plano

O scaffold grava o arquivo; o **link** o ativa. A action `link` da ferramenta `plan` anexa o plano ao workflow atual e deriva um task contract a partir dos requisitos de cada fase.

```jsonc
// Ferramenta MCP: plan
{
  "action": "link",
  "planSlug": "dark-mode"
}
```

Depois de linkado:

- O plano aparece entre os planos ativos do workflow.
- Os `required_sensors` e `required_artifacts` de cada fase populam os campos `requiredSensors` e `requiredArtifacts` do task contract derivado.
- O gate `execution_evidence` passa a ter algo concreto para checar.

Você pode inspecionar o plano linkado e seu mapeamento de fases a qualquer momento:

```jsonc
// Ferramenta MCP: plan
{ "action": "getLinked" }
```

```jsonc
// Ferramenta MCP: plan
{ "action": "getDetails", "planSlug": "dark-mode" }
```

## Um fluxo típico de escrita

1. Faça o scaffold da estrutura com `context({ action: "scaffoldPlan", ... })`.
2. Edite `.context/plans/<slug>.md` — detalhe fases, steps, entregáveis e (o mais importante) `required_sensors` / `required_artifacts` na fase de Execution.
3. Faça o link com `plan({ action: "link", planSlug: "<slug>" })`.
4. Rode o workflow. Ao chegar em **E → V**, rode os sensors obrigatórios e registre os artifacts para que o gate passe.
5. Acompanhe o progresso com `plan({ action: "updateStep", ... })` e `plan({ action: "updatePhase", ... })` conforme o trabalho avança.

## Leitura relacionada

- [Task contracts](/pt-br/concepts/task-contracts/) — como requisitos viram gates aplicáveis.
- [Workflow PREVC](/pt-br/concepts/prevc-workflow/) — as fases e transições para as quais um plano mapeia.
- [Sensors](/pt-br/concepts/sensors/) — os checks de qualidade referenciados por `required_sensors`.
- [Referência de ferramentas MCP](/pt-br/reference/mcp-tools/) — listas completas de actions de `context` e `plan`.
