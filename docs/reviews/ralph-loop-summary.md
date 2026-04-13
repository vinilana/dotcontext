# Ralph Loop — Summary (v0.9.3 hardening)

Branch: `fix/v0.9.3-review` · Base: `release/v0.9.3` (`390a401`)
Iterações: 6 · Commits: 36 · Arquivos: 100 · Linhas: +11.116 / −3.520 · Testes: 401/401 (62 suítes)

## Objetivo declarado pelo usuário

> "harness consiga garantir que tarefas sejam verdadeiramente executadas e que o LLM só diga que concluiu quando de fato tiver concluido."

## Onde estávamos antes

- `completePhase` chamava só `enforceGates` com flags declarativos (`plan_required`, `approval_required`).
- `autonomous_mode=true` zerava todos os gates.
- `evaluateTaskCompletion` existia em `taskContractsService` mas **não era consultado** na transição de fase.
- Steps em `PlanExecutionTracking` mudavam para `done` por autodeclaração do LLM via MCP — nada verificava.
- `syncPlanMarkdown` falhava em `catch {}` silencioso.
- Plans podiam ser linkados sem declarar qualquer critério de verificação.

## O que mudou

### Verificação em 3 camadas

1. **Step-level acceptance** (iter 2)
   Cada step pode declarar `acceptance: { kind: 'shell', command: string[] }`. `PlanUpdateOrchestrator.markStepDone()` executa o predicate via `spawn(shell:false)` antes de persistir `done`. Falha → `AcceptanceFailedError`, step preservado, run persistido em `acceptanceRun` para auditoria.

2. **Phase-level execution_evidence gate** (iter 2–3)
   Nova gate em `checkGates`. Consulta `evaluateTaskCompletion` do active task contract. E→V bloqueado até `requiredSensors` rodarem com `passed:true` e `requiredArtifacts` estarem presentes. `autonomous_mode` agora suprime SÓ policies, nunca evidência.

3. **Plan declara requisitos** (iter 3)
   Frontmatter de plan aceita `phases[].required_sensors` e `required_artifacts`. `DerivedPlanTaskContractBuilder` propaga no contract. `plan link` rejeita plan com fase E sem requisitos declarados (hard fail, sem escape).

### Specs ricas de artifact (iter 4)

`RequiredArtifactSpec` tipado: `name` | `path` | `glob` | `file-count`. Glob usa `minimatch`. `fromFilesystem: true` (iter 5) varre working tree com timeout 5s, ignorando `node_modules/.git/dist`, com escape-prevention por prefixo.

### Sensores embutidos (iter 5–6)

- **`i18n-coverage`**: compara keys entre base locale e outros locales. Retorna `{coverage, missingKeys}`. Fecha literalmente o incidente que originou a Ralph loop.
- **`tests-passing`**: `npm test -- --json` + parse jest, ou `kind:'exit-code'`. Timeout 300s.
- **`typecheck-clean`**: `tsc --noEmit` exit 0. Timeout 120s. Tail stderr em failures.

### Scaffold auto-detect (iter 6)

`suggestPhaseRequirements(repoPath)` detecta `locales/*.json`, `package.json:scripts.test`, `tsconfig.json`, `.eslintrc*`. `PlanGenerator` preenche `required_sensors` quando a fase não declara nada. Nunca sobrescreve.

### Invariantes e cross-source (iter 3)

- `WorkflowStateDesyncError` + `assertPhaseStatusConverges` rodam ao final de `completePhase`.
- `syncPlanMarkdown` não é mais silent fail.
- Boundary test estático: `services/mcp/**` proibido de importar submódulos de `workflow/(phases|roles|plans|registries|status|gates|orchestration)`.

### Débito pago (iters 1–3)

- `WorkflowStatePort` removido (era DI fake).
- `ROLE_CONFIG` virou `@internal`; `PREVC_ROLE_MODEL` é canonical.
- `HarnessSessionFacade` extraído → `workflowService.ts` 1132 → 785 linhas.
- `planCommitService` removido (wrapper trivial).
- `FileCollaborationStore` ganhou write atômico (tmp+rename), GC de sessões >30d, timestamps numéricos, schema v1→v2 migração.

## O que NÃO foi feito (consciente)

- `RequiredArtifactSpec` kind `regex` (conteúdo de arquivo).
- Sensor `lint` nativo (hoje depende do catálogo shell).
- Sensores específicos de monorepo (`pnpm-workspace`, `vitest`).
- Auto-detect para `required_artifacts` (só sensors hoje).
- Teste multi-processo de concorrência de colaboração (só `Promise.all` in-process).
- Consolidação `prevcModel.ts` → `prevcConfig.ts` (ambos coexistem; usamos `PREVC_ROLE_MODEL` canonical).

Esses itens estão em território de retorno marginal decrescente: custam manutenção sem endereçar o objetivo central.

## Resposta ao incidente de i18n

Um plan hoje pode declarar:

```yaml
phases:
  - phase: E
    required_sensors: [i18n-coverage]
    required_artifacts:
      - { kind: glob, glob: "locales/*.json", minMatches: 5, fromFilesystem: true }
```

`workflow-advance` de E→V **não** aceitará mesmo com `autonomous_mode=true` enquanto:

- O sensor `i18n-coverage` não tiver rodado.
- Ou tiver rodado mas qualquer locale tiver `missingKeys` não-vazio.
- Ou o working tree tiver menos de 5 arquivos `locales/*.json`.

LLM autodeclarar "terminei" não move o ponteiro.

## Validação

```bash
npm run build           # clean
npm test -- --runInBand # 62 suítes, 401 testes, 0 falhas
```

## Próximos passos sugeridos

1. Abrir PR `fix/v0.9.3-review → release/v0.9.3`.
2. Rodar `npm run build:packages && npm run smoke:packages` antes da tag.
3. Backlog de baixo leverage (para outra release): regex content spec, sensor `lint` nativo, invariante plan↔status via `PLAN_PHASE_TO_PREVC`.
