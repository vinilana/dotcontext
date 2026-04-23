/**
 * Legacy PREVC workflow status migration.
 *
 * Handles reading, parsing, archiving, and removing the old status.yaml
 * projection without leaking YAML concerns into the runtime manager.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { PrevcStatus } from '../types';
import { parseLegacyStatusYaml } from './statusYaml';

export class LegacyWorkflowStatusMigrator {
  constructor(private readonly contextPath: string) {}

  private get legacyStatusPath(): string {
    return path.join(this.contextPath, 'workflow', 'status.yaml');
  }

  async exists(): Promise<boolean> {
    return fs.pathExists(this.legacyStatusPath);
  }

  existsSync(): boolean {
    return fs.existsSync(this.legacyStatusPath);
  }

  async load(): Promise<PrevcStatus> {
    const content = await fs.readFile(this.legacyStatusPath, 'utf-8');
    return parseLegacyStatusYaml(content);
  }

  loadSync(): PrevcStatus {
    const content = fs.readFileSync(this.legacyStatusPath, 'utf-8');
    return parseLegacyStatusYaml(content);
  }

  async remove(): Promise<void> {
    if (await fs.pathExists(this.legacyStatusPath)) {
      await fs.remove(this.legacyStatusPath);
    }
  }

  async archive(name: string): Promise<void> {
    if (!(await fs.pathExists(this.legacyStatusPath))) {
      return;
    }

    const archiveDir = path.join(this.contextPath, 'workflow', 'archive');
    const safeName = name.replace(/[^a-zA-Z0-9-_]/g, '-');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await fs.ensureDir(archiveDir);
    await fs.move(this.legacyStatusPath, path.join(archiveDir, `${safeName}-${timestamp}.legacy-status.yaml`));
  }
}
