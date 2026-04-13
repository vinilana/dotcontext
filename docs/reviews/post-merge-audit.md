# Auditoria Pós-merge `fix/v0.9.3-review`

Iteração 1 do Ralph loop · 2026-04-13

## Veredito

**O harness NÃO garante execução verdadeira hoje.** `completePhase` (`src/workflow/orchestrator.ts:243-271`) só chama `gateChecker.enforceGates`, que verifica apenas `plan_required` e `approval_required`. A infraestrutura de verificação real existe em `taskContractsService.ts:235-288` (`evaluateTaskCompletion`, `missingSensors`, `missingArtifacts`, `blockingFindings`) mas **não é consultada na transição de fase**. LLM chama `workflow-advance` e passa mesmo com `canComplete=false`.

## P0 — Bloqueantes ao objetivo

- **P0-1 · Gates não consultam evidência.** `orchestrator.ts:252-257`. Fix: `enforceGates` recebe `taskCompletion`; bloqueia quando `canComplete===false && !force`.
- **P0-2 · `autonomous_mode=true` zera todos os gates.** `gateChecker.ts:116-124`. Fix: autonomous suprime só `plan_required`/`approval_required`, nunca evidência.
- **P0-3 · Silent fail em `syncPlanMarkdown`.** `orchestrator.ts:262-268` (`catch {}`). Divergência entre tracking JSON, status YAML e markdown fica invisível. Fix: erro bloqueia `completePhase`; teste de invariante cross-source.
- **P0-4 · Zero teste e2e de "LLM mente que terminou".** Fix: `src/services/workflow/__tests__/falseCompletion.e2e.ts` simulando advance sem sensor/artifact.

## P1 — Débito estrutural

- **P1-1** `workflowService.ts` ainda 1093 linhas (meta <900). Extrair `HarnessSessionFacade` (linhas ~790-1013).
- **P1-2** `WorkflowStatePort` `@deprecated` mas ainda importado por `orchestrator.ts:25,58`. Deletar + swap por `HarnessWorkflowStateService`.
- **P1-3** `PREVC_ROLE_MODEL` ↔ `ROLE_CONFIG`: ambos exportados; consumers divididos. Tornar `ROLE_CONFIG` não-exportado ou migrar tudo a `PREVC_ROLE_MODEL`.
- **P1-4** `checkGates` aceita `nextPhase` fora da sequência (só valida skip). Adicionar validação de existência.

## P2 — Cosméticos

- **P2-1** Boundary test não cobre re-exports nem `workflow/types` transitivos.
- **P2-2** Concurrency test de colaboração não cobre processos separados (só Promise.all in-process).

## Próximas 3 alavancas (critério de aceite verificável)

1. **`evaluateTaskCompletion` integrado em `enforceGates`.**
   Aceite: teste em `gateChecker.test.ts` onde E→V com `requiredSensors=['tests']` sem sensor run → throw `WorkflowGateError(gate='execution_evidence')`. Teste inverso: com sensor `passed` + artifact → permite.
2. **`acceptance` em `PlanExecutionTracking.steps`** (em curso — implementer agent).
   Aceite: `markStepDone` executa `command`, exige exit 0, persiste `acceptanceRun`; falha mantém step e não persiste novo status.
3. **E2e "LLM mente que terminou".**
   Aceite: SMALL workflow. P→R sem plan → throw. R→E com plan sem approval → throw. E→V sem sensor required → throw. Assertions sobre tracking+status+harness session pós-bloqueio.

## Nota estratégica

Streams A/B/C/D melhoraram qualidade/arquitetura mas **não endereçaram o objetivo central**. Próximas iterações devem priorizar verificação de execução real, não mais refactoring cosmético.
