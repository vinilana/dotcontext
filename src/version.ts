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

let cachedPackageMetadata: PackageMetadata | null = null;

function loadPackageMetadata(): PackageMetadata {
  if (cachedPackageMetadata) {
    return cachedPackageMetadata;
  }

  try {
    const packageJsonPath = path.resolve(__dirname, '../package.json');
    const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
    cachedPackageMetadata = JSON.parse(packageJsonContent) as PackageMetadata;
    return cachedPackageMetadata;
  } catch (error) {
    throw new Error(
      `Failed to load package metadata from package.json: ${(error as Error).message}`
    );
  }
}

const pkg = loadPackageMetadata();

export const VERSION = pkg.version;
export const PACKAGE_NAME = pkg.name;
