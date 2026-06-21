---
title: Políticas
description: Como o dotcontext usa documentos de política declarativos para controlar ações de tools e workflows com regras de allow, deny e aprovação.
sidebar:
  order: 5
---

Sensors dizem se o trabalho está *bom*. Políticas dizem se o trabalho é *permitido*. Elas são os guardrails do harness: regras declarativas de allow / deny / approve que controlam invocações de tools, alterações de paths e transições de fase sensíveis a risco — antes que aconteçam.

As políticas ficam em um único documento versionado, para que toda a equipe compartilhe os mesmos limites: protegendo paths críticos, bloqueando segredos e exigindo revisão onde isso importa.

:::tip
Políticas combinam naturalmente com [sensors](/pt-br/concepts/sensors/). Sensors verificam resultados; políticas restringem ações. Juntos, formam a camada de qualidade e segurança em torno do [workflow PREVC](/pt-br/concepts/prevc-workflow/).
:::

## O documento de política

As políticas ficam em `.context/config/policy.json`. Esse arquivo é **versionado e rastreado pelo git** — é configuração autorada, tratada como parte do seu projeto, não estado de runtime gerado.

```json
{
  "version": 1,
  "defaultEffect": "allow",
  "rules": [
    {
      "id": "protect-repository-core",
      "effect": "require_approval",
      "when": {
        "tools": ["harness"],
        "actions": ["phase.advance"],
        "paths": ["src/**", "lib/**"],
        "risk": "high"
      },
      "pattern": "**/*.{ts,tsx}",
      "approvalRole": "architect",
      "reason": "Core changes require review"
    }
  ]
}
```

### Campos de nível superior

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `version` | number | Versão do schema do documento de política. |
| `defaultEffect` | `allow` \| `deny` | O que acontece quando nenhuma regra corresponde a uma ação. |
| `rules` | array | Lista ordenada de regras de política, avaliadas em sequência. |

### Campos de uma regra

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `id` | string | Identificador estável da regra (usado nos resultados da avaliação). |
| `effect` | `allow` \| `deny` \| `require_approval` | O que a regra faz quando corresponde. |
| `when` | object | As condições sob as quais a regra corresponde (veja abaixo). |
| `pattern` | string | Glob opcional que restringe a regra a arquivos específicos. |
| `approvalRole` | string | Role necessária para aprovar quando `effect` é `require_approval` (ex.: `architect`). |
| `reason` | string | Explicação legível exibida na saída da avaliação. |

### O matcher `when`

O bloco `when` decide se uma regra se aplica a uma determinada ação:

| Condição | Correspondência | Exemplo |
| --- | --- | --- |
| `tools` | Match exato com o nome da tool | `["harness"]` |
| `actions` | Match exato ou por padrão com a ação | `["phase.advance"]` |
| `paths` | Glob / minimatch contra os paths de arquivos afetados | `["src/**", "lib/**"]` |
| `risk` | Limite — corresponde no nível indicado ou acima | `"high"` |

Os níveis de risco são ordenados: `low` (1), `medium` (2), `high` (3), `critical` (4). Uma regra com `risk: "high"` corresponde a ações marcadas como `high` ou `critical`.

## Como a avaliação controla ações

Quando uma ação de tool ou workflow é executada, o harness a avalia contra o documento de política. As regras são verificadas **em ordem**, e cada regra correspondente contribui para o resultado.

Uma avaliação de política retorna um veredito estruturado:

```ts
{
  allowed: boolean,           // a ação pode prosseguir?
  blocked: boolean,           // alguma regra de deny correspondeu?
  requiresApproval: boolean,  // há um gate de aprovação pendente?
  reasons: string[],          // explicações legíveis
  matchedRules: Array<{
    rule,
    requiresApproval,
    blocked,
    approved
  }>
}
```

Os três efeitos mapeiam para resultados claros:

- **`allow`** — a ação prossegue.
- **`deny`** — a ação é bloqueada (`blocked: true`, `allowed: false`). Sem caminho de override.
- **`require_approval`** — a ação fica retida até que a `approvalRole` indicada aprove. Até lá, `requiresApproval: true` e a ação não pode ser concluída.

Se nenhuma regra corresponder, o `defaultEffect` decide o resultado. Um `defaultEffect` de `deny` dá uma postura de negar por padrão, em que somente ações explicitamente permitidas passam.

:::caution
A ordem importa. As regras são avaliadas em sequência, e um match de `deny` bloqueia a ação independentemente de regras posteriores. Coloque suas proteções mais amplas onde fizerem sentido e mantenha os `id`s descritivos para que ações bloqueadas sejam fáceis de rastrear na saída de `reasons`.
:::

## A política de bootstrap

Quando o harness inicializa um projeto, ele escreve um `policy.json` inicial com três padrões sensatos:

| Regra | Efeito | Propósito |
| --- | --- | --- |
| `protect-repository-core` | `require_approval` | Controlar alterações de alto risco em paths de código-fonte críticos. |
| `protect-repository-config` | `require_approval` | Controlar alterações de alto risco em diretórios de configuração. |
| `block-secrets` | `deny` | Bloquear de forma rígida edições em arquivos com segredos, como `**/.env*` e `**/*.key`. |

Esses padrões são um ponto de partida, não uma política finalizada. Personalize-os para o seu repositório — veja [Customizando sensors e políticas](/pt-br/guides/customizing-sensors-and-policies/).

## Políticas e modo autônomo

O modo autônomo permite que um workflow pule os gates manuais que normalmente pausam a execução entre fases. Você o habilita no início do workflow (`workflow-init` com `autonomous: true`) ou alterna depois via `workflow-manage` (`action: "setAutonomous"`).

As políticas são uma camada separada e complementar:

- **Gates de workflow** (plano obrigatório, aprovação obrigatória) são checkpoints de *processo* entre fases. O modo autônomo é sobre pular esses gates.
- **Políticas** são regras de *conteúdo e risco* avaliadas por ação. Elas não são um gate de workflow que você desliga — uma regra de `deny` ainda bloqueia a ação, e uma regra de `require_approval` ainda exige sua `approvalRole`.

Na prática, isso significa que o modo autônomo mantém os agentes avançando pelas fases sem pausas manuais, enquanto o seu documento de política continua protegendo paths críticos e bloqueando segredos. Use políticas para definir os limites rígidos que você quer manter *mesmo quando* um workflow roda sem supervisão.

:::note
Pense nisso como dois botões. O modo autônomo controla *quanta cerimônia humana* um workflow precisa entre fases. As políticas controlam *o que pode acontecer*. Aumentar a autonomia nunca desliga os guardrails de política.
:::

## Gerenciando políticas com a tool harness

A tool MCP `harness` expõe operações de política diretamente, para que agentes possam inspecionar e ajustar a política ativa sem editar JSON na mão:

| Ação | Propósito |
| --- | --- |
| `listPolicies` | Lista as regras da política ativa. |
| `getPolicy` | Lê o documento de política atual. |
| `setPolicy` | Substitui o documento de política. |
| `registerPolicy` | Adiciona uma regra à política ativa. |
| `resetPolicy` | Restaura os padrões de bootstrap. |
| `evaluatePolicy` | Testa uma ação contra a política e inspeciona o veredito. |

Campos relevantes ao registrar ou avaliar uma regra incluem `scope`, `effect`, `target` e `pattern`.

## Para onde ir depois

- [Sensors](/pt-br/concepts/sensors/) — as verificações de qualidade que acompanham os guardrails de política.
- [Workflow PREVC](/pt-br/concepts/prevc-workflow/) — as fases que as políticas controlam.
- [Customizando sensors e políticas](/pt-br/guides/customizing-sensors-and-policies/) — ajuste `policy.json` e `sensors.json` para o seu repositório.
- [Referência de tools MCP](/pt-br/reference/mcp-tools/) — a superfície completa de ações da tool `harness`.
