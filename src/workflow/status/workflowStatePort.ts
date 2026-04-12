import type { PrevcStatus } from '../types';

/**
 * Narrow persistence port for canonical PREVC workflow state.
 *
 * The workflow layer depends on this abstraction, while harness implements it.
 */
export interface WorkflowStatePort {
  exists(): Promise<boolean>;
  existsSync(): boolean;
  load(): Promise<PrevcStatus>;
  loadSync(): PrevcStatus;
  save(status: PrevcStatus): Promise<void>;
  remove(): Promise<void>;
  archive(name: string): Promise<void>;
}
