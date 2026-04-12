#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const distDir = path.join(repoRoot, 'dist');
const outputRoot = path.join(repoRoot, '.release', 'packages');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      copyFile(srcPath, destPath);
    }
  }
}

function resetDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  ensureDir(dir);
}

function loadTemplate(name) {
  return fs.readFileSync(path.join(repoRoot, 'templates', 'packages', name), 'utf8');
}

function createManifest(rootPkg, packageName, description, main, types, options = {}) {
  const manifest = {
    name: packageName,
    version: rootPkg.version,
    description,
    license: rootPkg.license,
    repository: rootPkg.repository,
    homepage: rootPkg.homepage,
    bugs: rootPkg.bugs,
    engines: rootPkg.engines,
    main,
    types,
    files: ['dist/**/*', 'README.md', 'LICENSE'],
  };

  if (options.exports) manifest.exports = options.exports;
  if (options.bin) manifest.bin = options.bin;
  if (options.dependencies) manifest.dependencies = options.dependencies;
  if (options.files) manifest.files = options.files;

  return manifest;
}

function packageDependencies(rootPkg, names) {
  const picked = {};
  for (const name of names) {
    if (rootPkg.dependencies && rootPkg.dependencies[name]) {
      picked[name] = rootPkg.dependencies[name];
    }
  }
  return picked;
}

function buildBundles() {
  if (!fs.existsSync(distDir)) {
    throw new Error('dist/ does not exist. Run "npm run build" first.');
  }

  const rootPkg = readJson(path.join(repoRoot, 'package.json'));
  resetDir(outputRoot);

  const commonFiles = ['LICENSE'];
  const packages = [
    {
      slug: 'cli',
      manifest: createManifest(
        rootPkg,
        '@dotcontext/cli',
        'Operator-facing package for dotcontext',
        'dist/cli/index.js',
        'dist/cli/index.d.ts',
        {
          exports: { '.': './dist/cli/index.js' },
          bin: { dotcontext: 'dist/index.js' },
          dependencies: rootPkg.dependencies,
          files: ['dist/**/*', 'prompts/**/*', 'README.md', 'LICENSE'],
        }
      ),
      readme: loadTemplate('cli.README.md'),
      copyPrompts: true,
    },
    {
      slug: 'harness',
      manifest: createManifest(
        rootPkg,
        '@dotcontext/harness',
        'Reusable harness runtime for dotcontext',
        'dist/harness/index.js',
        'dist/harness/index.d.ts',
        {
          exports: { '.': './dist/harness/index.js' },
          dependencies: packageDependencies(rootPkg, [
            '@ai-sdk/anthropic',
            '@ai-sdk/google',
            '@ai-sdk/openai',
            '@modelcontextprotocol/sdk',
            'ai',
            'fs-extra',
            'glob',
            'ignore',
            'semver',
            'zod',
          ]),
        }
      ),
      readme: loadTemplate('harness.README.md'),
    },
    {
      slug: 'mcp',
      manifest: createManifest(
        rootPkg,
        '@dotcontext/mcp',
        'Model Context Protocol adapter for dotcontext',
        'dist/mcp/index.js',
        'dist/mcp/index.d.ts',
        {
          exports: { '.': './dist/mcp/index.js' },
          bin: { 'dotcontext-mcp': 'dist/mcp/bin.js' },
          dependencies: rootPkg.dependencies,
        }
      ),
      readme: loadTemplate('mcp.README.md'),
    },
  ];

  for (const pkg of packages) {
    const pkgRoot = path.join(outputRoot, pkg.slug);
    resetDir(pkgRoot);
    copyDir(distDir, path.join(pkgRoot, 'dist'));
    if (pkg.copyPrompts && fs.existsSync(path.join(repoRoot, 'prompts'))) {
      copyDir(path.join(repoRoot, 'prompts'), path.join(pkgRoot, 'prompts'));
    }
    for (const file of commonFiles) {
      copyFile(path.join(repoRoot, file), path.join(pkgRoot, file));
    }
    fs.writeFileSync(path.join(pkgRoot, 'README.md'), pkg.readme, 'utf8');
    writeJson(path.join(pkgRoot, 'package.json'), pkg.manifest);
  }

  console.log(`Prepared package bundles in ${outputRoot}`);
}

buildBundles();
