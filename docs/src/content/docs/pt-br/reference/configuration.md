---
title: Referência de configuração
description: Referência dos arquivos de configuração versionados em .context/ — config.json, policy.json e sensors.json — além de variáveis de ambiente relevantes.
sidebar:
  order: 4
---

O dotcontext mantém uma separação clara entre **configuração autoral** e **estado gerado em runtime**. A configuração fica em `.context/config/` (mais um `.context/config.json` na raiz), foi feita para ser commitada no git e é compartilhada por todo o time e por cada agente que toca o repositório.

Esta página é a referência desses arquivos: para que serve cada um, qual a sua forma e se é versionado no git. Para os *conceitos* por trás deles, veja [Policies](/pt-br/concepts/policies/) e [Sensors e backpressure](/pt-br/concepts/sensors/).

## Os arquivos de configuração em resumo

| Arquivo | Propósito | Versionado no git | Fonte de verdade |
| --- | --- | --- | --- |
| `.context/config.json` | Configuração de geração de contexto para scaffolding reproduzível | Sim | Autoral / gerado no init |
| `.context/config/policy.json` | Regras de policy do harness e restrições de aprovação | Sim | Autoral / criado no bootstrap |
| `.context/config/sensors.json` | Catálogo de sensors para checagens de qualidade | Sim | Gerado no bootstrap, editado pelo time |

::: tip[Commit a sua config]
Tudo em `.context/config/` e o `.context/config.json` pertence ao controle de versão. É isso que torna os gates de qualidade e as policies reproduzíveis: cada pessoa do time e cada agente roda contra as mesmas regras. O diretório gerado `.context/runtime/` fica no gitignore — veja [O runtime do harness](/pt-br/concepts/harness-runtime/) para o layout completo.
:::

## `.context/config.json`

**Propósito:** persiste a configuração usada para gerar e regerar o seu scaffold de `.context/`, de modo que a estrutura seja reproduzível entre os checkouts do time.

**Classificação:** versionado, rastreado no git.

Este arquivo é escrito quando você faz o scaffold do contexto (a ação `context init` via MCP) e é lido pelos builders de contexto semântico para que reexecutar a geração produza resultados consistentes. Ele captura os metadados que guiaram o scaffold original, e não estado de runtime.

::: note
A criação de contexto e os fills são MCP-first — não existe um comando standalone de CLI que autora o `config.json`. Ele é produzido e mantido pela tool `context` do MCP. Veja [Usando o dotcontext com MCP](/pt-br/guides/using-with-mcp/).
:::

## `.context/config/policy.json`

**Propósito:** regras declarativas de allow / deny / require-approval aplicadas às ações de workflow — invocações de tools, mudanças de paths e gates baseados em risco para as transições de fase do PREVC.

**Classificação:** versionado, rastreado no git, autorado pelo time.

As policies são a forma de codificar "esse tipo de mudança precisa de review" ou "nunca toque em secrets" como dado que o runtime aplica, em vez de uma convenção que você torce para o agente lembrar. Leia [Policies](/pt-br/concepts/policies/) para o modelo completo; esta seção documenta a forma do arquivo.

### Forma do documento

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

| Campo | Tipo | Propósito |
| --- | --- | --- |
| `version` | number | Versão do schema do documento de policy |
| `defaultEffect` | `allow` \| `deny` | Efeito aplicado quando nenhuma regra casa |
| `rules[]` | array | Lista ordenada de regras de policy, avaliadas em sequência |

### Campos da regra

| Campo | Tipo | Propósito |
| --- | --- | --- |
| `id` | string | Identificador estável da regra |
| `effect` | `allow` \| `deny` \| `require_approval` | O que acontece quando a regra casa |
| `when` | object | As condições que precisam casar para a regra se aplicar |
| `when.tools` | string[] | Nomes de tools a casar (ex.: `harness`) |
| `when.actions` | string[] | Nomes de actions a casar (ex.: `phase.advance`) |
| `when.paths` | string[] | Padrões glob casados contra os paths dos arquivos |
| `when.risk` | `low` \| `medium` \| `high` \| `critical` | Limiar mínimo de risco para a regra se aplicar |
| `pattern` | string | Glob opcional que restringe a regra a arquivos específicos |
| `approvalRole` | string | Role necessário para aprovar quando `effect` é `require_approval` |
| `reason` | string | Justificativa legível, exibida no resultado da avaliação |

### Como as regras casam

Uma avaliação de policy percorre as regras em ordem e casa por:

- **`tools`** — match exato contra o nome da tool que invoca.
- **`actions`** — match exato ou por padrão contra a action.
- **`paths`** — glob / minimatch contra os paths dos arquivos afetados.
- **`risk`** — casa no limiar ou acima dele (`low` = 1, `medium` = 2, `high` = 3, `critical` = 4).

O resultado reporta `allowed`, `blocked`, `requiresApproval`, uma lista de `reasons` e as `matchedRules`.

### Policy de bootstrap

No init, um `policy.json` inicial é criado com três regras para você ter uma proteção sensata desde o começo:

| Regra | Efeito | O que protege |
| --- | --- | --- |
| `protect-repository-core` | `require_approval` | Mudanças de alto risco em paths de código core |
| `protect-repository-config` | `require_approval` | Mudanças de alto risco em diretórios de config |
| `block-secrets` | `deny` | Padrões de secret como `**/.env*` e `**/*.key` |

::: caution
A ordem importa. As regras são avaliadas de cima para baixo, e uma regra `deny` que casa deve ficar onde não possa ser enfraquecida por um `allow` mais amplo abaixo dela. Mantenha regras no estilo `block-secrets` estritas e explícitas.
:::

## `.context/config/sensors.json`

**Propósito:** o catálogo de checagens de qualidade executáveis (sensors) que o runtime pode rodar durante um workflow.

**Classificação:** versionado, rastreado no git. Gerado no bootstrap a partir do stack detectado e, depois, customizado pelo time.

Os sensors transformam "os testes passam" de uma afirmação em evidência registrada. O catálogo é o único lugar que os define. Para o conceito e como os resultados alimentam os gates de fase, veja [Sensors e backpressure](/pt-br/concepts/sensors/).

### Forma do catálogo

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

### Campos de nível superior

| Campo | Tipo | Propósito |
| --- | --- | --- |
| `version` | number | Versão do schema do catálogo |
| `generatedAt` | string | Quando o catálogo foi gerado |
| `source` | `bootstrap` \| `manual` | Se foi gerado ou escrito à mão |
| `stack` | object | Metadados do stack detectado que informaram os padrões |
| `sensors[]` | array | As definições de sensor que o runtime pode executar |

### Campos do sensor

| Campo | Tipo | Propósito |
| --- | --- | --- |
| `id` | string | Identificador estável referenciado por task contracts e gates |
| `name` | string | Rótulo legível |
| `description` | string | O que o sensor verifica |
| `severity` | `critical` \| `warning` | Quão sério é um falha |
| `blocking` | boolean | Se uma falha aplica backpressure |
| `enabled` | boolean | Se o runtime o executa |
| `command` | string | O comando de shell a executar |
| `script` | string | O script de pacote subjacente, quando aplicável |

### Sensors built-in e auto-detecção

No bootstrap o runtime inspeciona o seu repositório e sugere os sensors built-in que se aplicam:

| Sensor | O que verifica | Detectado a partir de |
| --- | --- | --- |
| `i18n-coverage` | Arquivos de locale não-base compartilham o keyset do locale base | `locales/*.json` ou `i18n/*.json` presentes |
| `tests-passing` | A suíte de testes passa | `scripts.test` no `package.json` |
| `typecheck-clean` | `tsc --noEmit` (ou comando configurado) sai limpo | `tsconfig.json` presente |

Uma config de ESLint também aciona um sensor `lint` sugerido (tipicamente um `warning` não-blocking).

::: tip
Desabilite um sensor sem perdê-lo definindo `"enabled": false`. A definição permanece no catálogo e no histórico do git para quando você quiser de volta.
:::

## Variáveis de ambiente

O dotcontext é configurado primariamente pelos arquivos acima, e não por variáveis de ambiente. O próprio entry point do servidor MCP não exige **nenhum ambiente** — o install padrão escreve um bloco `env` vazio:

```json
{
  "command": "npx",
  "args": ["-y", "@dotcontext/mcp@latest"],
  "env": {}
}
```

A CLI expõe os equivalentes em runtime como flags, e não como variáveis de ambiente — por exemplo `-r, --repo-path <path>` e `-v, --verbose` no comando `mcp`. Veja o [guia da CLI](/pt-br/guides/using-the-cli/) para a superfície completa.

::: note
Se um valor de configuração não está documentado aqui, ele não é um knob suportado — prefira a configuração baseada em arquivo e as flags da CLI acima a chutar variáveis de ambiente.
:::

## Onde esses arquivos ficam

```text
.context/
├── config.json              # config de geração de contexto (versionado)
└── config/
    ├── policy.json           # regras de policy (versionado)
    └── sensors.json          # catálogo de sensors (versionado)
```

Todo o resto que o harness escreve — sessions, estado de workflow, contracts, replays, datasets — fica sob a árvore `.context/runtime/`, que está no gitignore e é coberta em [O runtime do harness](/pt-br/concepts/harness-runtime/).

## Próximos passos

- Conheça o modelo por trás de `policy.json` em [Policies](/pt-br/concepts/policies/).
- Conheça o modelo por trás de `sensors.json` em [Sensors e backpressure](/pt-br/concepts/sensors/).
- Ajuste ambos os arquivos na prática em [Customizando sensors e policies](/pt-br/guides/customizing-sensors-and-policies/).
- Veja onde o estado gerado fica em [O runtime do harness](/pt-br/concepts/harness-runtime/).
