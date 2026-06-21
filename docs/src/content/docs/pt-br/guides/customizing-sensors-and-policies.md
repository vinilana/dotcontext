---
title: Personalizando sensores & políticas
description: Edite .context/config/sensors.json e policy.json para impor checagens de qualidade e regras de aprovação específicas do projeto no harness.
sidebar:
  order: 4
---

Quando você faz o bootstrap de um projeto, o dotcontext escreve dois arquivos de configuração que o harness lê para impor qualidade: `.context/config/sensors.json` e `.context/config/policy.json`. As versões geradas no bootstrap são um ponto de partida razoável, mas vêm de heurísticas — elas ainda não sabem quais comandos importam no *seu* repositório, nem quais caminhos o time quer proteger.

Este guia mostra como assumir o controle dos dois arquivos: substituir os padrões do bootstrap por comandos reais do projeto, ajustar severidades e o comportamento de bloqueio, e escrever regras de policy que controlam as ações do workflow.

:::tip
Ambos os arquivos ficam em `.context/config/` e são **versionados** — faça commit deles junto do código para que o time inteiro (e cada agente) imponha os mesmos gates. Veja [O layout do .context](/pt-br/reference/configuration/) para o que é versionado vs. ignorado.
:::

## Antes de começar

Estes são os conceitos por trás dos dois arquivos:

- [Sensores](/pt-br/concepts/sensors/) — checagens de qualidade executáveis que emitem resultados pass/fail/blocked durante um workflow.
- [Políticas](/pt-br/concepts/policies/) — regras declarativas de allow/deny/require-approval aplicadas a ações do workflow e mudanças de caminho.

Ambos são consultados pelo harness em runtime, então editá-los muda o comportamento sem tocar em código ou prompts.

## Personalizando sensores

`.context/config/sensors.json` é o **catálogo de sensores** — a lista de checagens de qualidade que o harness pode executar, mais um snapshot da stack do seu projeto. Um catálogo de bootstrap se parece com isto:

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
      "id": "test",
      "name": "Test",
      "description": "Run package test script",
      "severity": "critical",
      "blocking": true,
      "enabled": true,
      "command": "npm test -- --runInBand",
      "script": "test"
    }
  ]
}
```

### Passo 1 — Substitua os comandos do bootstrap por comandos reais

O catálogo de bootstrap adivinha comandos a partir da sua stack. Abra o arquivo e substitua cada `command` pela invocação exata que seu projeto usa. Para um repositório Node/TypeScript pode ser:

```json
{
  "sensors": [
    {
      "id": "build",
      "name": "Build",
      "description": "Compile the project",
      "severity": "critical",
      "blocking": true,
      "enabled": true,
      "command": "npm run build"
    },
    {
      "id": "test",
      "name": "Test suite",
      "description": "Run the full test suite",
      "severity": "critical",
      "blocking": true,
      "enabled": true,
      "command": "npm test -- --runInBand"
    },
    {
      "id": "typecheck",
      "name": "Typecheck",
      "description": "Type validation without emit",
      "severity": "critical",
      "blocking": true,
      "enabled": true,
      "command": "npm run typecheck"
    },
    {
      "id": "lint",
      "name": "Lint",
      "description": "Static analysis",
      "severity": "warning",
      "blocking": false,
      "enabled": true,
      "command": "npm run lint"
    }
  ]
}
```

Use o comando que *de fato* quebra o CI no seu projeto. Se seus testes rodam via `pytest`, `cargo test` ou `go test ./...`, coloque isso em `command` — sensores são comandos de shell agnósticos de linguagem.

### Passo 2 — Defina `source` como `manual`

O processo de bootstrap pode regenerar um catálogo cujo `source` é `"bootstrap"`. Depois de personalizar o arquivo, mude o campo de nível superior para que suas edições sejam tratadas como autoritativas:

```json
{
  "version": 1,
  "source": "manual"
}
```

:::caution
Deixar `source` como `"bootstrap"` sinaliza que o catálogo é gerado automaticamente e pode ser sobrescrito em um novo bootstrap. Defini-lo como `"manual"` marca o catálogo como propriedade do seu time.
:::

### Passo 3 — Ajuste severidades e bloqueio

Cada sensor carrega uma `severity` e uma flag `blocking` que decidem como uma falha é tratada:

| Campo | Valores | O que controla |
| --- | --- | --- |
| `severity` | `critical`, `warning` | Quão séria é uma falha; aparece em failure datasets e nos quality scores. |
| `blocking` | `true`, `false` | Se uma execução falha bloqueia a conclusão do workflow/task. |
| `enabled` | `true`, `false` | Se o sensor está apto a rodar. |

Um padrão comum: deixar `build`, `test` e `typecheck` como `critical` + `blocking`, mantendo `lint` como um `warning` não-bloqueante para que problemas de estilo apareçam sem travar a entrega.

### Como os sensores rodam

Quando o harness executa um sensor, ele emite um resultado estruturado e o registra como um trace (`event: "sensor.run"`) na sessão ativa:

```json
{
  "status": "passed",
  "summary": "All 214 tests passed",
  "evidence": ["coverage/lcov-report/index.html"]
}
```

`status` pode ser `passed`, `failed`, `skipped` ou `blocked`. Sensores obrigatórios que não terminam como `passed` bloqueiam a conclusão de um task contract — veja [Task contracts & handoffs](/pt-br/concepts/task-contracts/).

Você pode disparar sensores pela ferramenta MCP `workflow-manage` com `action: "runSensors"`, ou pela ação `recordSensor` da ferramenta `harness`. Os task contracts referenciam sensores pelo seu `id` em `requiredSensors`.

## Personalizando políticas

`.context/config/policy.json` é um **documento de policy** — regras declarativas que permitem (allow), negam (deny) ou exigem aprovação para ações do workflow e mudanças de caminho. Uma policy de bootstrap protege caminhos centrais, diretórios de config e segredos:

```json
{
  "version": 1,
  "defaultEffect": "allow",
  "rules": [
    {
      "id": "protect-repository-core",
      "effect": "require_approval",
      "when": {
        "paths": ["src/**", "lib/**"],
        "risk": "high"
      },
      "approvalRole": "architect",
      "reason": "Core changes require review"
    },
    {
      "id": "block-secrets",
      "effect": "deny",
      "when": {
        "paths": ["**/.env*", "**/*.key"]
      },
      "reason": "Never touch secrets"
    }
  ]
}
```

### Regras e efeitos

Uma policy é um `defaultEffect` mais uma lista ordenada de `rules`. Cada regra combina um matcher `when` com um `effect`:

| Campo | Valores | Significado |
| --- | --- | --- |
| `defaultEffect` | `allow`, `deny` | Resultado quando nenhuma regra casa. |
| `effect` | `allow`, `deny`, `require_approval` | O que acontece quando a regra casa. |
| `approvalRole` | um papel PREVC (ex.: `architect`) | Quem deve aprovar quando `effect` é `require_approval`. |
| `reason` | string | Justificativa legível que aparece no resultado da avaliação. |

O bloco `when` decide contra o que uma regra é avaliada:

| Matcher | Tipo | Casa com |
| --- | --- | --- |
| `tools` | array | Nome da ferramenta (ex.: `["harness"]`). |
| `actions` | array | Nome da ação (ex.: `["phase.advance"]`). |
| `paths` | array | Caminhos de arquivo via glob/minimatch (ex.: `["src/**"]`). |
| `risk` | `low`, `medium`, `high`, `critical` | Casa no limiar ou acima dele. |

Você também pode definir um `pattern` de nível superior em uma regra (ex.: `"**/*.{ts,tsx}"`) para restringi-la a tipos de arquivo específicos.

### Passo 1 — Ajuste os caminhos protegidos

Atualize os globs de `paths` para casar com o layout do seu repositório. Se o seu código-fonte vive em `app/` e `packages/`, proteja esses em vez de `src/` e `lib/`:

```json
{
  "id": "protect-repository-core",
  "effect": "require_approval",
  "when": {
    "paths": ["app/**", "packages/**"],
    "risk": "high"
  },
  "approvalRole": "reviewer",
  "reason": "Core packages require a reviewer sign-off"
}
```

### Passo 2 — Adicione regras específicas do projeto

Componha regras a partir dos matchers acima. Alguns exemplos:

```json
{
  "rules": [
    {
      "id": "deny-migration-edits-mid-flight",
      "effect": "deny",
      "when": {
        "paths": ["db/migrations/**"],
        "actions": ["phase.advance"]
      },
      "reason": "Migrations are frozen during execution"
    },
    {
      "id": "approve-infra-changes",
      "effect": "require_approval",
      "when": {
        "paths": ["infra/**", "**/*.tf"],
        "risk": "medium"
      },
      "approvalRole": "architect",
      "reason": "Infrastructure changes need an architect"
    }
  ]
}
```

As regras são avaliadas **em ordem**, então coloque regras `deny` mais amplas antes das `allow` mais restritas quando precisar de uma postura default-deny para um caminho.

### Como as políticas são avaliadas

Quando uma ação do workflow roda, o harness avalia a policy e retorna um veredito estruturado:

```json
{
  "allowed": false,
  "blocked": false,
  "requiresApproval": true,
  "reasons": ["Core changes require review"],
  "matchedRules": [
    { "rule": "protect-repository-core", "requiresApproval": true, "blocked": false, "approved": false }
  ]
}
```

Regras `require_approval` não bloqueiam de imediato — elas pausam para que o `approvalRole` indicado dê o aval. Você pode registrar, inspecionar e avaliar políticas pela ferramenta MCP `harness` (`registerPolicy`, `listPolicies`, `getPolicy`, `setPolicy`, `resetPolicy`, `evaluatePolicy`).

## Faça commit das suas mudanças

Como os dois arquivos são versionados, faça commit deles no seu fluxo normal:

```bash
git add .context/config/sensors.json .context/config/policy.json
git commit -m "chore(context): customize sensors and policies"
```

Todo mundo que der pull no repositório — e cada agente que ler o `.context/` — agora impõe as mesmas checagens e gates.

## Próximos passos

- [Sensores](/pt-br/concepts/sensors/) — o modelo completo de sensores, formatos de resultado e built-ins.
- [Políticas](/pt-br/concepts/policies/) — semântica de avaliação e o conjunto de regras de bootstrap.
- [Configuração & o layout do .context](/pt-br/reference/configuration/) — cada arquivo de configuração e o que o git versiona.
- [Task contracts & handoffs](/pt-br/concepts/task-contracts/) — como `requiredSensors` controla a conclusão.
