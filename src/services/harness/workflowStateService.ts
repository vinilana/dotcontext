/**
 * Harness Workflow State Service
 *
 * Canonical persistence for workflow orchestration state. PREVC status now
 * lives under .context/harness/workflows and legacy status.yaml is only read
 * for migration.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import type { PrevcStatus } from '../../workflow/types';

export interface HarnessWorkflowStateServiceOptions {
  contextPath: string;
}

export interface HarnessWorkflowRecord {
  version: 1;
  workflowType: 'prevc';
  updatedAt: string;
  status: PrevcStatus;
}

export class HarnessWorkflowStateService {
  constructor(private readonly options: HarnessWorkflowStateServiceOptions) {}

  private get contextPath(): string {
    return path.resolve(this.options.contextPath);
  }

  private get workflowsPath(): string {
    return path.join(this.contextPath, 'harness', 'workflows');
  }

  private get currentPath(): string {
    return path.join(this.workflowsPath, 'prevc.json');
  }

  private get archivePath(): string {
    return path.join(this.workflowsPath, 'archive');
  }

  private async ensureLayout(): Promise<void> {
    await fs.ensureDir(this.workflowsPath);
  }

  async exists(): Promise<boolean> {
    return fs.pathExists(this.currentPath);
  }

  async load(): Promise<PrevcStatus> {
    const record = await fs.readJson(this.currentPath) as HarnessWorkflowRecord;
    return record.status;
  }

  loadSync(): PrevcStatus {
    const record = fs.readJsonSync(this.currentPath) as HarnessWorkflowRecord;
    return record.status;
  }

  async save(status: PrevcStatus): Promise<void> {
    await this.ensureLayout();
    const record: HarnessWorkflowRecord = {
      version: 1,
      workflowType: 'prevc',
      updatedAt: new Date().toISOString(),
      status,
    };
    await fs.writeJson(this.currentPath, record, { spaces: 2 });
  }

  async remove(): Promise<void> {
    if (await fs.pathExists(this.currentPath)) {
      await fs.remove(this.currentPath);
    }
  }

  async archive(name: string): Promise<void> {
    if (!(await fs.pathExists(this.currentPath))) {
      return;
    }

    await fs.ensureDir(this.archivePath);
    const safeName = name.replace(/[^a-zA-Z0-9-_]/g, '-');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await fs.move(
      this.currentPath,
      path.join(this.archivePath, `${safeName}-${timestamp}.json`)
    );
  }
}
