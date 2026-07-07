import type { ResolvedToken } from './types.js';
import { isAlias } from './types.js';

/**
 * Converts a token's raw value into a searchable string.
 *
 * - AliasValue  → `"{$alias}"` (e.g. `"{color.brand.primary}"`)
 * - number[]    → JSON.stringify (cubicBezier arrays)
 * - ShadowValue → JSON.stringify
 * - string | number → String(value)
 */
function stringifyValue(value: unknown): string {
  if (isAlias(value as Parameters<typeof isAlias>[0])) {
    // AliasValue: { $alias: string }
    return `{${(value as { $alias: string }).$alias}}`;
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  if (typeof value === 'object' && value !== null) {
    // ShadowValue
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Filters an array of resolved tokens by a case-insensitive substring query.
 *
 * Matches against:
 *   - `token.name`  — the token's human label
 *   - `token.type`  — the token type string (e.g. "color", "dimension")
 *   - raw value stringified (see {@link stringifyValue})
 *
 * Returns the full list unchanged when `query` is an empty string.
 */
export function filterTokens(tokens: ResolvedToken[], query: string): ResolvedToken[] {
  if (query === '') {
    return tokens;
  }

  const lowerQuery = query.toLowerCase();

  return tokens.filter((rt) => {
    const { token } = rt;
    if (token.name.toLowerCase().includes(lowerQuery)) return true;
    if (token.type.toLowerCase().includes(lowerQuery)) return true;
    if (stringifyValue(token.value).toLowerCase().includes(lowerQuery)) return true;
    return false;
  });
}
