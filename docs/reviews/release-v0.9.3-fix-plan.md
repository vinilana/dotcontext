# Plano de Correção — release v0.9.3

Branch de integração: `fix/v0.9.3-review`
Base: `390a401`
Referência: `docs/reviews/release-v0.9.3-review.md`

Os 4 streams abaixo são disjuntos por arquivo (no máximo sobreposição leve em `workflowService.ts`, onde o Stream A fica dono e o Stream C aguarda merge). Cada stream roda em worktree isolada, entrega commits próprios, e é integrado na ordem A → B → D → C.

---

## Stream A — Persistência de Colaboração (bloqueante)

**Owner:** agent-collab · **Prioridade:** P0

**Escopo:**
- `src/services/workflow/fileCollaborationStore.ts`
- `src/services/workflow/fileCollaborationStore.test.ts`
- `src/services/workflow/workflowService.ts` (apenas colaboração + extrações de `DerivedPlanTaskContractBuilder`)

**Itens a resolver:**
1. Write atômico (`tmp` + `rename`) com advisory lock opcional (`.lock` file).
2. Try/catch em `loadSessions`/`saveSessions`: leitura falha → `[]` + log; escrita falha → relança.
3. Função `migrateDocument(version)` com degraus preparados para v1→v2.
4. GC: remover sessões `concluded` com `startedAt < now - maxAge` (default 30 dias, configurável).
5. Timestamps serializados como `number` (ms epoch), não ISO string.
6. Remover API duplicada (`createSession` vs `startSession`): manter apenas `startSession`.
7. Testes: JSON corrompido, permissão, escrita concorrente (`Promise.all`), falha simulada de `fs`.
8. Extrair `DerivedPlanTaskContractBuilder` de `workflowService.ts` (meta: arquivo < 900 linhas).

**Validação:** `npm run build && npm test -- --runInBand src/services/workflow`

---

## Stream B — Status Manager Cleanup

**Owner:** agent-status · **Prioridade:** P1

**Escopo:**
- `src/workflow/status/*`
- `src/workflow/legacy/*`

**Itens a resolver:**
1. Colapsar pass-throughs: métodos de `runtimeStatusService` que só delegam a `statusTransitions` devem absorver a lógica ou remover a camada intermediária.
2. Remover `WorkflowStatePort` e injetar `HarnessWorkflowStateService` diretamente (port fake, uma única implementação sem teste substituindo).
3. Unificar reconstrução de `execution.history`: migração legacy deve usar `appendExecutionHistoryEntry` em loop; remover reconstrução manual de `statusMigration.ts`.
4. Fortalecer `parseLegacyStatusYaml` (aspas escapadas, skip inline, YAML parcial) + testes cobrindo esses casos.
5. Cache `cachedStatus` em `statusManager`: invalidar por mtime, ou remover se leitura for barata.
6. Remover duplicação sync/async quando possível.

**Validação:** `npm run build && npm test -- --runInBand src/workflow/status`

---

## Stream C — Plan Domain Consolidação

**Owner:** agent-plan · **Prioridade:** P0 (depende de merge de A)

**Escopo:**
- `src/workflow/plans/*`
- `src/services/harness/plansService.ts` (apenas consumo)
- `src/services/workflow/workflowService.ts` (após merge do Stream A)

**Itens a resolver:**
1. Estabelecer `PlanExecutionTracking` (JSON) como única fonte canônica de runtime; markdown vira projeção read-only. Remover parsing de status a partir da markdown (exceto caminho legacy).
2. Introduzir `PlanUpdateOrchestrator`: load → apply → save → reindex → commit. `planLinker` fica como facade de queries.
3. Cache com invalidação explícita em `planIndexProjector`; `planExecutionResolver` stateless/puro.
4. Separar tipos: `types.ts` (documento) vs `executionTypes.ts` (tracking). Mover `PLAN_PHASE_TO_PREVC` para `src/workflow/phases.ts`.
5. Validar frontmatter com `zod`; remover wrappers triviais de `frontMatter.ts`.
6. Remover `planCommitService.ts` (wrapper de um método), inlinar no orquestrador.
7. Testes de invariante: `LinkedPlan.phases[i].id === tracking.phases[id]`; tracking órfão; writers concorrentes.

**Validação:** `npm run build && npm test -- --runInBand src/workflow/plans`

---

## Stream D — Arquitetura e Boundaries

**Owner:** agent-arch · **Prioridade:** P1

**Escopo:**
- `src/workflow/index.ts`
- `src/workflow/registries/prevcModel.ts`
- `src/workflow/guidance/*` + `src/workflow/orchestration/workflowGuidanceService.ts`
- `src/services/mcp/gateway/workflowManage.ts`, `workflowStatus.ts`, `agent.ts`
- `src/workflow/gates/gateChecker.ts`
- `src/workflow/phases.ts` (helper `getNextActivePhase`)

**Itens a resolver:**
1. Uma fonte única para definições PREVC (phase/role/agent/docs): consolidar em `prevcConfig.ts` ou `workflow/models/definitions.ts`. `prevcModel.ts` fica apenas com type defs.
2. Fundir guidance duplicada: `orchestrationGuidance.ts` vira helpers privados dentro de `WorkflowGuidanceService`.
3. Barrel `workflow/index.ts` expõe o que MCP/CLI legitimamente precisa; proibir import de submódulos a partir de `services/mcp/*`. Adicionar lint rule ou teste guard.
4. Remover imports de `workflow/(phases|roles|plans|registries)` em `services/mcp/gateway/*`. Acesso via `WorkflowService` (`getPhaseDisplayName`, `getPlanLinkerForWorkflow`).
5. `getNextActivePhase`: type guard, erro com contexto quando fase ausente do status.
6. `checkGates`: remover override de `nextPhase` OU validar que não é skipped.

**Validação:** `npm run build && npm test -- --runInBand`

---

## Item adicional — Gates Executáveis (v0.9.4)

**Não incluído neste release** (escopo maior). Registrado como issue:

- Cada step em `PlanExecutionTracking` aceita `acceptance: { script: string }`.
- Transição `pending → done` só ocorre se o predicate script roda e retorna exit 0.
- `gateChecker` falha transição de fase se algum step `done` não tem evidência de predicate executado.
- Exemplo real: step "100% cobertura de i18n" rodaria `scripts/check-i18n-coverage.ts`; LLM não pode autodeclarar pronto.

---

## Protocolo de Integração

1. Agent completa trabalho em worktree própria, roda `npm run build && npm test -- --runInBand`.
2. Agent faz commits pequenos e coesos na sua branch de worktree; retorna path + branch.
3. Eu (team-lead) faço merge na ordem A → B → D → C em `fix/v0.9.3-review`, resolvendo conflitos.
4. Rodar `npm run build && npm test -- --runInBand && npm run build:packages && npm run smoke:packages` na branch final antes de PR para `release/v0.9.3`.
