/**
 * @deprecated Use `HarnessWorkflowStateService` directly.
 *
 * This file previously declared a `WorkflowStatePort` interface that existed
 * only to abstract a single implementation. The port has been collapsed; this
 * type alias remains as a compatibility shim for callers outside the status
 * package (e.g. `workflow/orchestrator.ts`) and should be removed along with
 * its last importer.
 */

import type { HarnessWorkflowStateService } from '../../services/harness/workflowStateService';

export type WorkflowStatePort = HarnessWorkflowStateService;
