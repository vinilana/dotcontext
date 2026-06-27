---
title: Gaps e specs dos hooks
description: Registro dos gaps de hooks endereçados no dotcontext para tornar bootstrap, tracing e workflow PREVC mais guiados.
sidebar:
  order: 5
---

Este documento registra os gaps de hooks que motivaram a implementação de readiness, preflight PREVC, diagnóstico e tracing mais rico. Ele complementa o [fluxo de sessão com hooks](/pt-br/guides/hook-session-flow/): lá está o comportamento operacional; aqui estão as specs e os critérios que orientaram a entrega.

## Objetivo

Hooks devem manter a sessão do agente leve e contínua, mas não podem deixar o usuário sem direção quando o projeto ainda não está pronto para aproveitar o dotcontext.

O comportamento desejado é:

- orientar sem bloquear;
- evitar ruído em toda sessão;
- transformar estados incompletos em próximos passos concretos;
- preservar a separação entre hooks e MCP;
- manter stdout dos hooks machine-readable.

## Estado atual resumido

| Situação | Comportamento atual |
| --- | --- |
| Repositório sem `.context/` | `SessionStart` injeta dica curta com host e próximo passo para configurar MCP + rodar `context init`, sem criar `.context/`, runtime ou logs |
| `.context/` parcial | `SessionStart` lista até três lacunas principais e aponta a próxima ação |
| `.context/` pronto | `SessionStart` injeta resumo compacto, navegação e, quando aplicável, lembrete controlado de workflow ausente |
| Workflow PREVC ativo | `SessionStart` injeta preflight curto com fase, gate provável, plano/task contract e evidências esperadas |
| `Write`, `Edit`, `Bash` | `PostToolUse` anexa `tool.use` em `trace.jsonl`; `Bash` recebe classificação best-effort |
| Sem sessão harness vinculada | Trace é ignorado ou a sessão é recriada quando possível |
| Sem workflow PREVC ativo | `Stop` retorna `{"continue": true}` silenciosamente |
| Workflow PREVC ativo | `Stop` injeta resumo de próximos passos via `workflow-guide` |
| Erro de hook/tracing | Hook continua para não quebrar a sessão do agente; falhas repetidas de trace são registradas em `.context/runtime/hooks/trace-failures.json` |
| Codex configurado | `hook doctor codex` verifica configuração, trust hints, `.context/`, workflow, trace recente e falhas de trace |
| Sessão em subdiretório | Dispatch resolve o root por `--repo-path`, ancestral com `.context/`, `cwd`, depois `process.cwd()` |

## Status da entrega

| Gap | Status | Evidência principal |
| --- | --- | --- |
| Gap 1: sem `.context/` | Implementado | `SessionStart` sem `.context/` não cria runtime/logs e é coberto para Claude Code e Codex |
| Gap 2: contexto parcial | Implementado | readiness tiers `missing`, `partial`, `ready` com lacunas limitadas a três |
| Gap 3: sem workflow PREVC | Implementado | lembrete de workflow ausente com cooldown em `.context/runtime/hooks/reminders.json`; `Stop` permanece silencioso |
| Gap 4: workflow ativo sem plano/task contract | Implementado | preflight PREVC no `SessionStart` com fase, gate provável e riscos |
| Gap 5: Codex hooks não confiados | Implementado | docs tratam `/hooks` como obrigatório e `hook doctor codex` expõe checklist |
| Gap 6: tracing silencioso demais | Implementado | contador/diagnóstico em `.context/runtime/hooks/trace-failures.json` e exposição no doctor |
| Gap 7: Bash sem classificação | Implementado | trace `tool.use` inclui `classification` best-effort para comandos conhecidos |
| Gap 8: root em subdiretório | Implementado | helper compartilhado resolve root ascendente e preserva precedência de `--repo-path` |

## Gap 1: repositório sem `.context/`

### Problema

Hoje o hook apenas informa que `.context/` não existe. Isso evita criar runtime antes da hora, mas não oferece um caminho guiado o suficiente para o usuário sair do estado “não inicializado”.

Exemplo atual:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "dotcontext: no .context/ — run npx @dotcontext/mcp install and initialize context."
  }
}
```

### Impacto

- O usuário pode não saber qual comando/prompt usar em seguida.
- O agente pode seguir desenvolvendo sem contexto persistente.
- Não há sinal durável de que o projeto iniciou sessões sem contexto.

### Spec proposta: bootstrap guidance sem side effects

No `SessionStart`, quando `.context/` não existe:

1. Não criar `.context/runtime`.
2. Injetar uma mensagem curta com duas ações explícitas:
   - instalar/configurar MCP;
   - pedir ao agente para rodar `context init`.
3. Incluir o host detectado na mensagem quando possível.
4. Registrar somente em log externo se já existir `.context/logs`; caso contrário, não escrever nada no repositório.

Mensagem proposta:

```text
dotcontext: this repository does not have .context/ yet.
Next step: configure MCP and ask the agent to run context init in this project.
```

### Critérios de aceite

- `SessionStart` sem `.context/` não cria `.context/`, `.context/runtime` nem `.context/logs`.
- A saída continua sendo JSON válido para o host.
- A mensagem não aparece em `PostToolUse` nem em `Stop`.
- Testes cobrem Claude Code e Codex.

## Gap 2: `.context/` existe, mas está incompleto

### Problema

O hook distingue “inicializado” de “não inicializado”, mas o usuário pode estar em estados intermediários: docs existem sem agents, workflow ausente, harness pronto sem plano, ou scaffolds ainda não preenchidos.

### Impacto

- A mensagem “scaffold ready” pode soar mais completa do que o estado real.
- O agente pode não saber que ainda precisa preencher docs, criar plano ou iniciar workflow.

### Spec proposta: readiness tiers

Classificar o estado de contexto em tiers:

| Tier | Condição | Mensagem |
| --- | --- | --- |
| `missing` | Sem `.context/` | orientar MCP + `context init` |
| `partial` | `.context/` existe, mas faltam áreas centrais | listar lacunas principais |
| `ready` | docs/agents/skills e harness prontos | resumo compacto atual |
| `workflow-ready` | workflow PREVC ativo ou pronto para iniciar | incluir próxima ação PREVC |

Exemplo de saída para estado parcial:

```text
dotcontext: .context/ exists, but setup is still missing: workflow, plans.
Next step: Use MCP to start workflow-init or create/link a plan.
```

### Critérios de aceite

- `SessionStart` diferencia `partial` de `ready`.
- A mensagem lista no máximo três lacunas para não virar ruído.
- O comportamento atual para contexto completo permanece compacto.

## Gap 3: usuário não está trabalhando em workflow PREVC

### Problema

Hoje `Stop` é silencioso quando não há workflow PREVC ativo. Isso reduz ruído, mas não ajuda o usuário a perceber que está desenvolvendo fora do fluxo PREVC.

### Impacto

- Trabalho real pode acontecer sem plano, gates ou evidência de execução.
- Traces existem, mas não estão conectados a uma fase de workflow.
- O usuário só descobre tarde que não há workflow ativo.

### Spec proposta: lembrete controlado de workflow ausente

Adicionar uma política de lembrete leve para ausência de workflow PREVC:

1. No primeiro `SessionStart` do dia por repositório, se `.context/` está pronto e não há workflow ativo, injetar uma dica curta.
2. Não mostrar esse lembrete em todo `Stop`.
3. Permitir opt-out por configuração.
4. Nunca bloquear a sessão.

Mensagem proposta:

```text
dotcontext: context is loaded, but no PREVC workflow is active.
For gated work and evidence, start a workflow with workflow-init through MCP.
```

### Critérios de aceite

- Sem workflow ativo não gera ruído em toda sessão.
- O lembrete tem cooldown por repositório.
- `Stop` continua silencioso sem workflow ativo, exceto se uma configuração explícita pedir lembretes no fim.

## Gap 4: workflow ativo sem plano linkado ou sem task contract útil

### Problema

Mesmo com workflow ativo, o usuário pode estar em uma fase que exige plano, aprovação, sensores ou artifacts, mas os hooks só mostram o resumo do `workflow-guide` no fim.

### Impacto

- O agente pode trabalhar durante a sessão inteira antes de descobrir que está bloqueado por plano ou evidência.
- A fase PREVC perde força como guia de execução em tempo real.

### Spec proposta: preflight PREVC no SessionStart

Quando houver workflow ativo, `SessionStart` deve consultar um resumo leve do estado PREVC:

- fase atual;
- próximo gate provável;
- plano linkado ou ausente;
- task contract ativo ou ausente;
- sensores/artifacts exigidos, quando houver.

Exemplo:

```text
dotcontext workflow: phase E is in progress.
Likely gate: execution evidence before advancing.
```

### Critérios de aceite

- A mensagem cabe em poucas linhas.
- Não substitui `workflow-guide`; apenas antecipa riscos no começo da sessão.
- Se o workflow estiver corrompido, o hook continua silencioso e não bloqueia.

## Gap 5: Codex hooks instalados, mas não confiados

### Problema

No Codex, depois da instalação, o usuário precisa rodar `/hooks` e confiar nos hooks do projeto. Se ele não fizer isso, dotcontext está configurado no arquivo, mas não executa.

### Impacto

- O usuário acredita que hooks estão ativos, mas nenhum evento chega ao harness.
- Não há trace nem bootstrap.

### Spec proposta: verificação pós-instalação documentada e detectável

1. O instalador já deve continuar mostrando o lembrete de trust.
2. A documentação deve tratar isso como passo obrigatório.
3. Criar um comando de diagnóstico futuro:

```bash
npx -y @dotcontext/cli@latest hook doctor codex
```

O `doctor` não precisa provar que o TUI confiou nos hooks, mas pode verificar:

- arquivo `.codex/hooks.json` ou `.codex/config.toml`;
- `[features].hooks = true` quando TOML;
- comando dotcontext presente;
- `.context/` inicializado;
- último trace recente, se existir.

### Critérios de aceite

- `hook doctor codex` retorna checklist machine-readable com opção human-readable.
- Docs orientam `/hooks` logo após install.
- Nenhum hook runtime depende desse diagnóstico.

## Gap 6: tracing silencioso demais quando falha

### Problema

Falha ao anexar trace não bloqueia a sessão, o que é correto. Porém, quando isso acontece repetidamente, o usuário não percebe que perdeu histórico durável.

### Impacto

- A sessão parece normal, mas `trace.jsonl` fica incompleto.
- Diagnóstico posterior fica difícil.

### Spec proposta: contador de falhas não intrusivo

Quando `appendTrace` falhar:

1. Continuar retornando `{"continue": true}`.
2. Incrementar um contador em estado runtime, quando `.context/` existir.
3. Expor o contador em `hook doctor`.
4. Mostrar aviso somente se houver falhas repetidas dentro de uma janela curta.

### Critérios de aceite

- Primeira falha de trace não aparece para o usuário.
- Falhas repetidas aparecem como diagnóstico, não como bloqueio.
- O estado de falhas fica em `.context/runtime/hooks/`, não em docs versionados.

## Gap 7: comandos Bash sem classificação

### Problema

Hoje `Bash` é registrado como `tool.use`, mas o hook não classifica se o comando foi teste, build, lint, migração ou operação destrutiva.

### Impacto

- O trace existe, mas o workflow não aproveita totalmente esse sinal.
- Sensores e gates ainda dependem de chamadas explícitas pelo MCP.

### Spec proposta: classificação leve de Bash

Adicionar classificação opcional no trace:

| Comando | Categoria sugerida |
| --- | --- |
| `npm test`, `pnpm test`, `jest`, `vitest` | `test` |
| `npm run build`, `tsc` | `build` |
| `eslint`, `npm run lint` | `lint` |
| `git status`, `git diff` | `inspection` |

Exemplo de trace:

```json
{
  "event": "tool.use",
  "message": "Bash",
  "data": {
    "classification": "test",
    "tool_input": {
      "command": "npm test -- --runInBand"
    }
  }
}
```

### Critérios de aceite

- Classificação é best-effort e nunca bloqueia.
- Não executa comandos extras.
- Não altera sensores existentes.

## Gap 8: usuário trabalha fora do root esperado

### Problema

O hook usa `cwd` do host ou `--repo-path`. Em monorepos ou sessões abertas em subdiretórios, o root esperado pode não ser óbvio.

### Impacto

- O hook pode procurar `.context/` no lugar errado.
- Traces podem ser vinculados ao projeto errado.

### Spec proposta: resolução explícita de root

1. Resolver root procurando `.context/` para cima a partir de `cwd`.
2. Se houver múltiplos candidatos, preferir o mais próximo.
3. Permitir override por `--repo-path`.
4. Incluir o root resolvido na saída verbose ou no diagnóstico.

### Critérios de aceite

- Subdiretório de um repo com `.context/` usa o root correto.
- `--repo-path` continua tendo precedência.
- O comportamento é coberto por testes com monorepo simples.

## Priorização sugerida

| Prioridade | Gap | Por quê |
| --- | --- | --- |
| P0 | Sem `.context/` | Primeiro contato do usuário; precisa ser claro e sem side effects |
| P0 | Sem workflow PREVC ativo | Evita trabalho fora do fluxo esperado |
| P1 | Contexto parcial | Melhora onboarding e reduz falsa sensação de setup completo |
| P1 | Workflow sem plano/task contract | Evita bloqueios descobertos tarde |
| P1 | Codex não confiado | Configuração parece pronta, mas não executa |
| P2 | Falhas repetidas de trace | Diagnóstico e confiabilidade |
| P2 | Classificação de Bash | Enriquece dados para gates futuros |
| P2 | Root em monorepo/subdir | Importante para projetos maiores |

## Specs de implementação

### Spec A: Hook readiness summary

Criar uma função reutilizável no harness/application que retorne:

```ts
interface HookReadinessSummary {
  context: 'missing' | 'partial' | 'ready';
  workflow: 'none' | 'active' | 'complete' | 'invalid';
  missing: string[];
  nextAction?: string;
}
```

Uso:

- `SessionStart` de Claude/Codex;
- `session_start` de Pi;
- futuro `hook doctor`.

### Spec B: Hook reminder policy

Criar política simples em runtime:

```json
{
  "workflowMissingReminder": {
    "lastShownAt": "2026-06-26T10:00:00.000Z",
    "cooldownHours": 24
  }
}
```

Local sugerido:

```text
.context/runtime/hooks/reminders.json
```

### Spec C: Hook doctor

Novo comando:

```bash
npx -y @dotcontext/cli@latest hook doctor
npx -y @dotcontext/cli@latest hook doctor codex --json
```

Checklist mínimo:

- host suportado detectado;
- config de hook encontrada;
- dispatch command atual;
- `.context/` encontrado;
- workflow ativo ou ausente;
- sessão/trace recente;
- falhas recentes de trace.

### Spec D: Root resolver para hooks

Extrair resolução de root para helper compartilhado:

1. `--repo-path`, se informado;
2. subir a partir de `cwd` procurando `.context/`;
3. fallback para `cwd`;
4. fallback final para `process.cwd()`.

## Fora de escopo por enquanto

- Hooks iniciarem `context init` automaticamente.
- Hooks avançarem workflow PREVC automaticamente.
- Hooks bloquearem desenvolvimento por falta de workflow.
- Hooks executarem sensores por conta própria em todo `Stop`.
- Escrever arquivos versionados quando `.context/` não existe.
