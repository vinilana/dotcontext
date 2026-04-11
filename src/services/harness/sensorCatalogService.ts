/**
 * Harness Sensor Catalog Service
 *
 * Bootstraps a user-editable sensor catalog under .context/harness/sensors.json
 * and resolves the effective shell-based sensors for workflow/harness runtime.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { StackDetector, type StackInfo } from '../stack/stackDetector';

export type HarnessSensorCatalogSeverity = 'critical' | 'warning' | 'info';

export interface HarnessShellSensorConfig {
  id: string;
  name: string;
  description?: string;
  severity: HarnessSensorCatalogSeverity;
  blocking?: boolean;
  enabled?: boolean;
  command: string;
  script?: string;
}

export interface HarnessSensorCatalogDocument {
  version: 1;
  generatedAt: string;
  source: 'bootstrap' | 'manual';
  stack?: {
    primaryLanguage: string | null;
    languages: string[];
    frameworks: string[];
    buildTools: string[];
    testFrameworks: string[];
    packageManager: string | null;
  };
  sensors: HarnessShellSensorConfig[];
}

export interface HarnessSensorCatalogServiceOptions {
  repoPath: string;
  contextPath?: string;
}

export class HarnessSensorCatalogService {
  constructor(private readonly options: HarnessSensorCatalogServiceOptions) {}

  private get repoPath(): string {
    return path.resolve(this.options.repoPath);
  }

  private get contextPath(): string {
    return this.options.contextPath
      ? path.resolve(this.options.contextPath)
      : path.join(this.repoPath, '.context');
  }

  get configPath(): string {
    return path.join(this.contextPath, 'harness', 'sensors.json');
  }

  async bootstrap(force: boolean = false): Promise<HarnessSensorCatalogDocument> {
    const existing = await this.load();
    if (existing && !force) {
      return existing;
    }

    const stack = await new StackDetector().detect(this.repoPath);
    const document: HarnessSensorCatalogDocument = {
      version: 1,
      generatedAt: new Date().toISOString(),
      source: 'bootstrap',
      stack: this.serializeStack(stack),
      sensors: this.detectSensorsSync(),
    };

    await fs.ensureDir(path.dirname(this.configPath));
    await fs.writeJson(this.configPath, document, { spaces: 2 });
    return document;
  }

  async load(): Promise<HarnessSensorCatalogDocument | null> {
    if (!(await fs.pathExists(this.configPath))) {
      return null;
    }

    return fs.readJson(this.configPath) as Promise<HarnessSensorCatalogDocument>;
  }

  loadSync(): HarnessSensorCatalogDocument | null {
    if (!fs.existsSync(this.configPath)) {
      return null;
    }

    return fs.readJsonSync(this.configPath) as HarnessSensorCatalogDocument;
  }

  resolveEffectiveSensorsSync(): HarnessShellSensorConfig[] {
    const document = this.loadSync();
    const sourceSensors = document?.sensors ?? this.detectSensorsSync();
    return sourceSensors
      .filter((sensor) => sensor.enabled !== false)
      .map((sensor) => ({
        ...sensor,
        blocking: sensor.blocking ?? sensor.severity === 'critical',
      }));
  }

  detectSensorsSync(): HarnessShellSensorConfig[] {
    const packageJsonPath = path.join(this.repoPath, 'package.json');
    const hasPackageJson = fs.existsSync(packageJsonPath);
    const hasPyProject = fs.existsSync(path.join(this.repoPath, 'pyproject.toml'));
    const hasRequirements = fs.existsSync(path.join(this.repoPath, 'requirements.txt'));
    const hasSetupPy = fs.existsSync(path.join(this.repoPath, 'setup.py'));
    const hasGoMod = fs.existsSync(path.join(this.repoPath, 'go.mod'));
    const hasCargoToml = fs.existsSync(path.join(this.repoPath, 'Cargo.toml'));
    const hasMaven = fs.existsSync(path.join(this.repoPath, 'pom.xml'));
    const hasGradle = fs.existsSync(path.join(this.repoPath, 'build.gradle'))
      || fs.existsSync(path.join(this.repoPath, 'build.gradle.kts'))
      || fs.existsSync(path.join(this.repoPath, 'gradlew'));

    if (hasPackageJson) {
      return this.detectNodeSensors(packageJsonPath);
    }

    if (hasGoMod) {
      return [
        {
          id: 'build',
          name: 'Build',
          description: 'Compile Go packages',
          severity: 'critical',
          command: 'go build ./...',
        },
        {
          id: 'test',
          name: 'Test',
          description: 'Run Go test suite',
          severity: 'critical',
          command: 'go test ./...',
        },
        {
          id: 'lint',
          name: 'Vet',
          description: 'Run go vet static checks',
          severity: 'warning',
          command: 'go vet ./...',
        },
      ];
    }

    if (hasCargoToml) {
      return [
        {
          id: 'build',
          name: 'Build',
          description: 'Compile Rust crates',
          severity: 'critical',
          command: 'cargo build',
        },
        {
          id: 'test',
          name: 'Test',
          description: 'Run Rust test suite',
          severity: 'critical',
          command: 'cargo test',
        },
      ];
    }

    if (hasMaven) {
      return [
        {
          id: 'build',
          name: 'Build',
          description: 'Build Maven project without tests',
          severity: 'critical',
          command: 'mvn -q -DskipTests package',
        },
        {
          id: 'test',
          name: 'Test',
          description: 'Run Maven test suite',
          severity: 'critical',
          command: 'mvn -q test',
        },
      ];
    }

    if (hasGradle) {
      return [
        {
          id: 'build',
          name: 'Build',
          description: 'Build Gradle project without tests',
          severity: 'critical',
          command: './gradlew build -x test',
        },
        {
          id: 'test',
          name: 'Test',
          description: 'Run Gradle test suite',
          severity: 'critical',
          command: './gradlew test',
        },
      ];
    }

    if (hasPyProject || hasRequirements || hasSetupPy) {
      const sensors: HarnessShellSensorConfig[] = [
        {
          id: 'test',
          name: 'Test',
          description: 'Run Python test suite with pytest',
          severity: 'critical',
          command: 'python -m pytest',
        },
      ];

      const hasMypyConfig = fs.existsSync(path.join(this.repoPath, 'mypy.ini'))
        || fs.existsSync(path.join(this.repoPath, '.mypy.ini'));
      const hasRuffConfig = fs.existsSync(path.join(this.repoPath, 'ruff.toml'))
        || fs.existsSync(path.join(this.repoPath, '.ruff.toml'));
      const hasFlake8Config = fs.existsSync(path.join(this.repoPath, '.flake8'))
        || fs.existsSync(path.join(this.repoPath, 'setup.cfg'));

      if (hasMypyConfig) {
        sensors.push({
          id: 'typecheck',
          name: 'Typecheck',
          description: 'Run mypy type checks',
          severity: 'critical',
          command: 'python -m mypy .',
        });
      }

      if (hasRuffConfig) {
        sensors.push({
          id: 'lint',
          name: 'Lint',
          description: 'Run Ruff lint checks',
          severity: 'warning',
          command: 'python -m ruff check .',
        });
      } else if (hasFlake8Config) {
        sensors.push({
          id: 'lint',
          name: 'Lint',
          description: 'Run Flake8 lint checks',
          severity: 'warning',
          command: 'python -m flake8 .',
        });
      }

      return sensors;
    }

    return [];
  }

  private detectNodeSensors(packageJsonPath: string): HarnessShellSensorConfig[] {
    const packageJson = fs.readJsonSync(packageJsonPath) as { scripts?: Record<string, string> };
    const scripts = packageJson.scripts || {};
    const sensors: HarnessShellSensorConfig[] = [];

    if (scripts.build) {
      sensors.push({
        id: 'build',
        name: 'Build',
        description: 'Run package build script',
        severity: 'critical',
        command: 'npm run build',
        script: 'build',
      });
    }

    if (scripts.test) {
      sensors.push({
        id: 'test',
        name: 'Test',
        description: 'Run package test script',
        severity: 'critical',
        command: 'npm test -- --runInBand',
        script: 'test',
      });
    }

    if (scripts.lint) {
      sensors.push({
        id: 'lint',
        name: 'Lint',
        description: 'Run package lint script',
        severity: 'warning',
        command: 'npm run lint',
        script: 'lint',
      });
    }

    if (scripts.typecheck) {
      sensors.push({
        id: 'typecheck',
        name: 'Typecheck',
        description: 'Run package typecheck script',
        severity: 'critical',
        command: 'npm run typecheck',
        script: 'typecheck',
      });
    }

    if (scripts.test && fs.existsSync(path.join(this.repoPath, 'src', 'tests', 'integrity', 'postRefactoringIntegrity.test.ts'))) {
      sensors.push({
        id: 'structural',
        name: 'Structural Integrity',
        description: 'Run repository structural integrity suite',
        severity: 'critical',
        command: 'npm test -- --runInBand --runTestsByPath src/tests/integrity/postRefactoringIntegrity.test.ts',
      });
    }

    return sensors;
  }

  private serializeStack(stack: StackInfo): HarnessSensorCatalogDocument['stack'] {
    return {
      primaryLanguage: stack.primaryLanguage,
      languages: stack.languages,
      frameworks: stack.frameworks,
      buildTools: stack.buildTools,
      testFrameworks: stack.testFrameworks,
      packageManager: stack.packageManager,
    };
  }
}
