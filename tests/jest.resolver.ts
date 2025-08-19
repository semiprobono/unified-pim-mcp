/**
 * Custom Jest Module Resolver
 *
 * This resolver handles module resolution for the test environment,
 * particularly for ES modules and path aliases.
 */

import { resolve } from 'path';
import { pathsToModuleNameMapper } from 'ts-jest';
import { readFileSync } from 'fs';

// Read tsconfig.json to get path mappings
const tsConfig = JSON.parse(readFileSync('tsconfig.json', 'utf8'));

export default function customResolver(
  request: string,
  options: {
    basedir: string;
    defaultResolver: (request: string, options: any) => string;
    extensions?: string[];
    moduleDirectory?: string[];
    paths?: string[];
    packageFilter?: (pkg: any) => any;
    pathFilter?: (pkg: any, path: string, relativePath: string) => string;
  }
): string {
  // Handle path aliases from tsconfig.json
  if (request.startsWith('@/')) {
    const aliasedPath = request.replace('@/', './src/');
    return options.defaultResolver(aliasedPath, options);
  }

  if (request.startsWith('@domain/')) {
    const aliasedPath = request.replace('@domain/', './src/domain/');
    return options.defaultResolver(aliasedPath, options);
  }

  if (request.startsWith('@application/')) {
    const aliasedPath = request.replace('@application/', './src/application/');
    return options.defaultResolver(aliasedPath, options);
  }

  if (request.startsWith('@infrastructure/')) {
    const aliasedPath = request.replace('@infrastructure/', './src/infrastructure/');
    return options.defaultResolver(aliasedPath, options);
  }

  if (request.startsWith('@shared/')) {
    const aliasedPath = request.replace('@shared/', './src/shared/');
    return options.defaultResolver(aliasedPath, options);
  }

  if (request.startsWith('@config/')) {
    const aliasedPath = request.replace('@config/', './config/');
    return options.defaultResolver(aliasedPath, options);
  }

  if (request.startsWith('@tests/')) {
    const aliasedPath = request.replace('@tests/', './tests/');
    return options.defaultResolver(aliasedPath, options);
  }

  // Handle .js extensions in imports (common in ES modules)
  if (request.endsWith('.js')) {
    const tsRequest = request.replace(/\.js$/, '.ts');
    try {
      return options.defaultResolver(tsRequest, options);
    } catch {
      // If .ts file doesn't exist, fall back to default resolution
    }
  }

  // Use default resolver for everything else
  return options.defaultResolver(request, options);
}
