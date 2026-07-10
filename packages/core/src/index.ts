export * from './types.js';
export * from './validation.js';
export * from './parser.js';
export * from './graph.js';
export { serializeToCSS } from './serializers/css.js';
export { serializeToSCSS } from './serializers/scss.js';
export { serializeToSwift } from './serializers/swift.js';
export { serializeToAndroid } from './serializers/android.js';
export { serializeToDTCG } from './serializers/dtcg.js';
export { filterTokens } from './search.js';
export { parseConfig } from './config.js';
export { transformToDTCG, type ImportFormat } from './import/legacy.js';

import { transformToDTCG, type ImportFormat } from './import/legacy.js';
import { parseTokenFile } from './parser.js';
import type { ParseResult } from './types.js';
import yaml from 'js-yaml';

/**
 * High-level import API that handles legacy format transformation.
 */
export function importTokens(content: string, parseFormat: 'json' | 'yaml', importFormat: ImportFormat = 'dtcg'): ParseResult {
  if (importFormat === 'dtcg') {
    return parseTokenFile(content, parseFormat);
  }

  // Parse raw content
  let root: unknown;
  if (parseFormat === 'json') {
    try {
      root = JSON.parse(content);
    } catch (e) {
      return parseTokenFile(content, parseFormat); // Let it handle the syntax error
    }
  } else {
    try {
      root = yaml.load(content);
    } catch (e) {
      return parseTokenFile(content, parseFormat);
    }
  }

  // Transform legacy to DTCG
  const transformed = transformToDTCG(root, importFormat);

  // Stringify and parse with strict DTCG parser
  return parseTokenFile(JSON.stringify(transformed), 'json');
}
