#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const bundlesRoot = path.join(repoRoot, '.release', 'packages');
const rootPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

const bundles = [
  {
    slug: 'cli',
    packageName: '@dotcontext/cli',
    main: 'dist/cli/index.js',
    types: 'dist/cli/index.d.ts',
    expectedExports: [
      'MCPInstallService',
      'StateDetector',
      'SyncService',
      'ReportService',
    ],
    bin: 'dotcontext',
    requiresPrompts: true,
  },
  {
    slug: 'harness',
    packageName: '@dotcontext/harness',
    main: 'dist/harness/index.js',
    types: 'dist/harness/index.d.ts',
    expectedExports: [
      'HarnessExecutionService',
      'HarnessRuntimeStateService',
      'HarnessSensorsService',
      'HarnessTaskContractsService',
      'WorkflowService',
    ],
  },
  {
    slug: 'mcp',
    packageName: '@dotcontext/mcp',
    main: 'dist/mcp/index.js',
    types: 'dist/mcp/index.d.ts',
    expectedExports: [
      'AIContextMCPServer',
      'startMCPServer',
      'handleHarness',
      'handleWorkflowManage',
    ],
    bin: 'dotcontext-mcp',
  },
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function requireFresh(filePath) {
  const resolved = require.resolve(filePath);
  delete require.cache[resolved];
  return require(resolved);
}

function smokeBundle(bundle) {
  const bundleRoot = path.join(bundlesRoot, bundle.slug);
  const manifestPath = path.join(bundleRoot, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const mainPath = path.join(bundleRoot, bundle.main);
  const typesPath = path.join(bundleRoot, bundle.types);

  assert(manifest.name === bundle.packageName, `${bundle.slug}: package name mismatch`);
  assert(manifest.version === rootPackage.version, `${bundle.slug}: version mismatch`);
  assert(fs.existsSync(mainPath), `${bundle.slug}: main entry missing`);
  assert(fs.existsSync(typesPath), `${bundle.slug}: types entry missing`);
  assert(fs.existsSync(path.join(bundleRoot, 'README.md')), `${bundle.slug}: README missing`);
  assert(fs.existsSync(path.join(bundleRoot, 'LICENSE')), `${bundle.slug}: LICENSE missing`);

  if (bundle.bin) {
    assert(manifest.bin && manifest.bin[bundle.bin], `${bundle.slug}: bin entry missing`);
    assert(
      fs.existsSync(path.join(bundleRoot, manifest.bin[bundle.bin])),
      `${bundle.slug}: bin target missing`
    );
  }

  if (bundle.requiresPrompts) {
    assert(fs.existsSync(path.join(bundleRoot, 'prompts')), `${bundle.slug}: prompts missing`);
  }

  const mod = requireFresh(mainPath);
  for (const exportName of bundle.expectedExports) {
    assert(mod[exportName], `${bundle.slug}: missing export ${exportName}`);
  }

  return {
    bundle: bundle.slug,
    exports: bundle.expectedExports.length,
  };
}

function main() {
  if (!fs.existsSync(bundlesRoot)) {
    throw new Error('Bundle directory does not exist. Run "npm run build:packages" first.');
  }

  const summary = bundles.map(smokeBundle);
  console.log(`Smoke tests passed for ${summary.length} bundles in ${bundlesRoot}`);
}

main();
