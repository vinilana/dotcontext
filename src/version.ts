/**
 * Centralized version and package constants
 *
 * Single source of truth for version information.
 * Uses fs.readFileSync to avoid JSON import compatibility issues
 * across different Node.js versions and module formats.
 */

import * as fs from 'fs';
import * as path from 'path';

const packageJsonPath = path.resolve(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

export const VERSION: string = pkg.version;
export const PACKAGE_NAME: string = pkg.name;
