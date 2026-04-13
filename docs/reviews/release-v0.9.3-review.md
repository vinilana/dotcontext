# Revisão Crítica — Release v0.9.3

Branch: `release/v0.9.3` vs `main` · Data: 2026-04-13
Objetivo: apontar AI slop, fragilidades e complexidade sem propósito; propor correções concretas antes de publicar.

## TL;DR

O release executa uma decomposição ambiciosa (statusManager, planLinker, guidance, collaboration persistence), mas em boa parte **move código para novos arquivos sem criar fronteiras reais**. Três problemas estruturais atravessam tudo:

1. **Ports e registries fake** — abstrações de injeção com uma única implementação, constantes centralizadas que continuam duplicadas.
2. **Duas fontes de verdade no domínio de plans** — markdown e tracking JSON coexistem sem invariante; merge manual frágil.
3. **Persistência de colaboração sem segurança mínima** — escrita não atômica, sem GC, sem cobertura de falha I/O.

Nenhum desses problemas é bloqueante em cenários single-instance/happy-path, mas todos viram incidente em produção real. Recomendo tratar (2.1), (4.1), (4.2) e (4.4) antes de publicar a tag.

---

## 1. Status Manager (split em `src/workflow/status/*` e `src/workflow/legacy/*`)

### Problemas

1. **Wrappers pass-through** — `PrevcStatusRuntimeService.transitionToPhase / markPhaseComplete / completePhaseTransition` (runtimeStatusService.ts) apenas delegam para `statusTransitions.ts`. Três camadas para a mesma operação: `statusManager → runtimeStatusService → statusTransitions`.
2. **Port fake** — `WorkflowStatePort` (workflowStatePort.ts) tem uma única implementação (`HarnessWorkflowStateService`), nenhum teste substitui o port, nenhum fallback real. É DI decorativo.
3. **History reconstruída em dois lugares** — `statusMigration.ts` itera fases manualmente para reconstruir `execution.history`, enquanto `statusExecution.ts` expõe `ensureExecutionHistory/appendExecutionHistoryEntry` que fariam o mesmo trabalho — e não são usados pelo caminho de migração.
4. **Parser YAML legacy frágil** — `parseLegacyStatusYaml` (statusYaml.ts) faz split por `:` e um `unquote()` que não lida com aspas escapadas; nenhum teste de YAML malformado, skip inline ou campos parciais.
5. **Cache stale invisível** — `cachedStatus` em `statusManager` só é invalidado em `remove`/`archive`. Edição externa do arquivo (cenário real com MCP + CLI em paralelo) retorna dado obsoleto sem sinal.
6. **Caminhos sync/async duplicados** — `readStatus` e `readStatusSync` repetem lógica.

### Soluções

- **Colapsar camadas**: mover transições direto para `runtimeStatusService`; `statusTransitions.ts` vira utilitário privado interno ou some.
- **Eliminar o port**: injete `HarnessWorkflowStateService` diretamente. Quando surgir segunda implementação real (HTTP/worker), crie o port aí — não antes.
- **Uma única API de history**: migração legacy deve usar `appendExecutionHistoryEntry` em loop, não reconstrução manual. Garante paridade com runtime.
- **Cobertura de teste real**: fase `skipped` no meio do fluxo, YAML parcial/malformado, cache invalidado por mtime.
- **Cache baseado em mtime** (ou remoção do cache se a leitura já é barata).

---

## 2. Plan Linker (split em `src/workflow/plans/*`)

### Problemas

1. **Duas fontes de verdade** — `LinkedPlan` (parseada da markdown) e `PlanExecutionTracking` (JSON em disco) descrevem ambas o estado de fases/steps. `planExecutionResolver.resolve()` faz merge manual sem invariante; divergência de IDs produz perda silenciosa.
2. **god-class remanescente** — `planLinker.ts` ainda concentra I/O, parsing, tracking updates, index refresh e commit em um só agregador. `updatePlanPhase()` toca todos esses concerns de uma vez.
3. **Sobreposição entre novos serviços** — `planExecutionResolver`, `planTrackingStore`, `planIndexProjector` recalculam progresso e relêem o disco em múltiplos pontos; `calculateProgress` roda duas vezes em `updatePlanPhase`/`recordDecision`.
4. **`types.ts` não é só tipos** — mistura tipos de documento e execução e ainda carrega o mapa `PLAN_PHASE_TO_PREVC` hardcoded, que deveria viver com as fases.
5. **`frontMatter.ts` inflado (+311 LOC)** — wrappers finos em torno de `js-yaml` + type guard trivial; sem validação de schema.
6. **`planCommitService.ts` (69 linhas)** — wrapper de um método; separação prematura.
7. **Testes só no happy path** — não cobrem: divergência document-ID ↔ tracking-ID, tracking órfão (markdown removido), escrita concorrente.

### Soluções

- **Tracking JSON como fonte única canônica de runtime**; markdown vira projeção read-only. Paring de status a partir do markdown deve ser exclusivo do caminho legacy.
- **Extrair orquestrador de update** (`PlanUpdateOrchestrator`): load → apply → save → reindex → commit. `planLinker` fica como facade de queries.
- **Cache com invalidação explícita** em `planIndexProjector`; `planExecutionResolver` deve ser stateless.
- **Separar tipos**: `types.ts` para domínio documental; novo `executionTypes.ts` para tracking; mapa de fases em `src/workflow/phases.ts`.
- **Validação com zod** substituindo os wrappers de frontmatter.
- **Testes de invariante**: `LinkedPlan.phases[i].id === tracking.phases[id]`; stale tracking; writers concorrentes.
- **Remover `planCommitService`** e inlinar no orquestrador acima.

---

## 3. Arquitetura, Barrels e Fronteira `cli -> harness <- mcp`

### Problemas

1. **`registries/prevcModel.ts` (363 linhas) não é fonte canônica** — dados de fase/role/agente/docs ainda aparecem em `phases.ts`, `roles.ts`, `prevcConfig.ts`, `agentOrchestrator.ts`. A centralização é nominal; alterar um agente exige edição multi-arquivo.
2. **Duplicação guidance** — `guidance/orchestrationGuidance.ts` (puro) e `orchestration/workflowGuidanceService.ts` (com I/O via skillRegistry) produzem guidance sobrepostos, com fronteira de responsabilidade nebulosa.
3. **Barrel vazado** — `src/workflow/index.ts` foi estreitado, mas consumidores (incluindo MCP) importam de `workflow/registries/*`, `workflow/phases`, `workflow/plans`, `workflow/roles` diretamente.
4. **MCP gateway furando a boundary** — `services/mcp/gateway/workflowManage.ts` importa `PHASE_NAMES_EN`, `createPlanLinker`, `ROLE_DISPLAY_NAMES` direto do `workflow/*`. Contraria `cli -> harness <- mcp`.
5. **`getNextActivePhase` frágil** — itera sobre `PREVC_PHASE_ORDER` sem type guard em `status.phases[phase]`; retorna `null` silencioso.
6. **Parâmetro `nextPhase` em `checkGates` bypassa skip** — permite forçar uma fase `skipped` como alvo, quebrando a promessa da mudança "gate segue a progressão executável".

### Soluções

- **Uma fonte só para definições PREVC**: consolidar em `prevcConfig.ts` (ou novo `workflow/models/definitions.ts`); `prevcModel.ts` fica só com type defs.
- **Fundir guidance**: `orchestrationGuidance.ts` vira helpers privados dentro de `WorkflowGuidanceService`; saída única.
- **Expor no barrel** o que MCP/CLI legitimamente precisa (display names, factories); proibir import de submódulos a partir de `services/mcp/*`.
- **Adicionar métodos de fachada em `WorkflowService`** (`getPhaseDisplayName`, `getPlanLinkerForWorkflow`) para remover o import direto em `workflowManage.ts`.
- **Validar phase em `getNextActivePhase`**: throw com contexto quando a fase não existe no status.
- **Remover override de `nextPhase` em `checkGates`** ou validar que a fase não está marcada como skipped.

---

## 4. Persistência de Colaboração (`fileCollaborationStore`, `workflowService`)

### Problemas

1. **Escrita não atômica** — `saveSessions()` chama `fs.writeJsonSync` direto no arquivo final. Instâncias MCP/CLI concorrentes corrompem silenciosamente. **Bloqueante.**
2. **Sem tratamento de I/O** — sem try/catch em `loadSessions`/`saveSessions`; arquivo corrompido, permissão ou disco cheio derrubam o processo sem fallback.
3. **Sem versionamento efetivo** — campo `version: 1` presente, mas nenhuma rotina `migrate(n -> n+1)`.
4. **Sem GC** — sessões `concluded` permanecem indefinidamente; arquivo cresce linearmente.
5. **`workflowService.ts` inchado** (≈1189 linhas) — concentra derivação de task contract, plan linking, colaboração; viola SRP.
6. **Rehidratação inconsistente** — `Date` serializa para ISO string e volta como `Date` novo; qualquer comparação por identidade ou lógica dependente de timestamp exato diverge.
7. **API duplicada** — `createSession` vs `startSession`: apenas um persiste.
8. **Cópias shallow** de `participants` / `contributions` — alias de referência persiste.
9. **Sem testes de falha** — zero cenários de JSON corrompido, permissões, escrita concorrente, disco cheio.

### Soluções

- **Write atômico**: `fs.writeFile(tmp)` + `fs.rename(tmp, final)`; opcionalmente advisory lock via arquivo `.lock`.
- **Wrapper I/O resiliente**: leitura falha → retorna `[]` e loga; escrita falha → relança com contexto.
- **Migração de schema**: função `migrateDocument(version)` com degraus v1→v2 preparados.
- **GC** em `persistSessions`: remover `concluded` com `startedAt < now - maxAge` (configurável, default 30 dias).
- **Extrair** `DerivedPlanTaskContractBuilder` e `LinkedPlanResolver` de `workflowService`; meta < 900 linhas.
- **Timestamps como `number` (ms)** no record serializado para eliminar drift.
- **API única**: manter `startSession` pública; `createSession` vira privado ou some.
- **Testes**: JSON corrompido, escrita concorrente (`Promise.all`), falha simulada de `fs`.

---

## 5. Prioridade de Correção

| # | Item | Por quê | Esforço |
|---|------|---------|---------|
| 1 | 4.1 Write atômico em `fileCollaborationStore` | Corrupção silenciosa em uso real | Baixo |
| 2 | 4.2 Tratamento de I/O | Crash por arquivo corrompido | Baixo |
| 3 | 2.1 Tracking JSON como fonte única | Divergência de estado entre doc e execução | Médio |
| 4 | 3.4 MCP parar de importar `workflow/*` internos | Viola boundary declarada no `CLAUDE.md` | Baixo |
| 5 | 1.1 + 1.2 Remover wrappers e port fake | AI slop puro, zera ruído | Baixo |
| 6 | 3.1 Consolidar definições PREVC | Reduz edição multi-arquivo | Médio |
| 7 | 4.4 GC de sessões concluídas | Crescimento linear do arquivo | Baixo |
| 8 | 2.2 + 4.5 Quebrar god-classes remanescentes | Acoplamento + difícil de testar | Médio |
| 9 | 1.4 + 2.7 + 4.9 Testes de invariante e falha | Release sem rede de segurança | Médio |
| 10 | 3.2 Fundir guidance duplicado | Nome sugere sobreposição | Baixo |

## 6. O Que Já Estava Errado Antes de v0.9.3

Para não culpar o release pelo que ele herdou:

- `planLinker.ts` já era uma god-class desde antes; o split trouxe superfície sem removê-la.
- `statusManager.ts` de 1074 linhas já era o ponto fraco; o split é movimento na direção certa, mas parou no meio.
- O padrão de constantes PREVC espalhadas em múltiplos módulos antecede `prevcModel.ts`.
- Ausência de write atômico em JSONs de `.context/` é padrão no repo, não inovação deste release — mas agora afeta colaboração multi-agente, onde o risco concreto aparece.

## 7. Critério de "Pronto para Tag"

Release só deveria ser tag'ado após:

- Item 1 (write atômico) mergeado e coberto por teste de concorrência.
- Item 2 (I/O handling) mergeado.
- Item 4 (imports do MCP) auditado: nenhum `from '../../../workflow/(phases|roles|plans|registries)'` em `services/mcp/*`.
- Item 5 (pass-throughs e port fake) removidos — são pura dívida.

Os demais podem entrar em v0.9.4 sem risco.
