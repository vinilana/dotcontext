/**
 * Centralized version and package constants
 *
 * Single source of truth for version information.
 */

import * as fs from 'fs';
import * as path from 'path';

type PackageMetadata = {
  version: string;
  name: string;
};

function loadPackageMetadata(): PackageMetadata {
  const packageJsonPath = path.resolve(__dirname, '../package.json');
  const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
  return JSON.parse(packageJsonContent) as PackageMetadata;
}

const pkg = loadPackageMetadata();

export const VERSION = pkg.version;
export const PACKAGE_NAME = pkg.name;
