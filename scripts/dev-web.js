#!/usr/bin/env node

const { spawn } = require('child_process');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const processes = [
  {
    name: 'api',
    command: npm,
    args: ['run', 'dev:web-api'],
  },
  {
    name: 'ui',
    command: npm,
    args: ['run', 'dev:web-ui'],
  },
];

const children = [];
let shuttingDown = false;

function prefix(name, chunk) {
  const lines = chunk.toString().split(/\r?\n/);
  for (const line of lines) {
    if (line.length > 0) {
      process.stdout.write(`[web:${name}] ${line}\n`);
    }
  }
}

function stopAll(signal = 'SIGTERM') {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

function stopAllAndExit(signal, code) {
  stopAll(signal);
  setTimeout(() => process.exit(code), 500).unref();
}

for (const proc of processes) {
  const child = spawn(proc.command, proc.args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  children.push(child);

  child.stdout.on('data', (chunk) => prefix(proc.name, chunk));
  child.stderr.on('data', (chunk) => prefix(proc.name, chunk));

  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }
    stopAll();
    if (signal) {
      process.exit(1);
    }
    process.exit(code ?? 0);
  });

  child.on('error', (error) => {
    process.stderr.write(`[web:${proc.name}] ${error.message}\n`);
    stopAll();
    process.exit(1);
  });
}

process.on('SIGINT', () => stopAllAndExit('SIGINT', 130));
process.on('SIGTERM', () => stopAllAndExit('SIGTERM', 143));
