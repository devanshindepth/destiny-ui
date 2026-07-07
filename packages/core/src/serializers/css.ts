/**
 * CSS custom properties serializer.
 *
 * Converts a TokenGraph into a `:root { ... }` block containing one
 * `--{category}-{name}: {value};` declaration per resolved token.
 *
 * Ordering:
 *   1. Canonical TokenCategory order (TOKEN_CATEGORIES)
 *   2. Alphabetically by token name within each category
 *
 * Alias tokens emit `var(--{category}-{referenced-name})` — never the
 * resolved primitive value.
 */

import {
  isAlias,
  TOKEN_CATEGORIES,
  type CSSSerializeOptions,
  type ShadowValue,
  type BaseValue,
  type Token,
  type TokenGraph,
} from '../types.js';

// ─── Value serialization ──────────────────────────────────────────────────────

/**
 * Serialize a BaseValue to its CSS string representation.
 */
function serializeBaseValue(value: BaseValue): string {
  if (Array.isArray(value)) {
    // cubicBezier: [x1, y1, x2, y2]
    return `cubic-bezier(${value.join(', ')})`;
  }

  if (typeof value === 'object' && value !== null) {
    // ShadowValue composite
    const s = value as ShadowValue;
    return `${s.offsetX} ${s.offsetY} ${s.blur} ${s.spread} ${s.color}`;
  }

  // string | number
  return String(value);
}

/**
 * Derive the CSS custom property name for a token: `--{category}-{name}`.
 *
 * The token name may itself contain dots (deep path segments); replace them
 * with hyphens to keep the property name valid CSS.
 */
function cssPropertyName(category: string, name: string): string {
  const safeName = name.replace(/\./g, '-');
  return `--${category}-${safeName}`;
}

/**
 * Get the referenced token's category and last-segment name from the alias
 * chain, in order to emit `var(--{category}-{name})`.
 *
 * The alias `$alias` value is the full dot-notation token ID of the direct
 * referent, e.g. `"color.brand.primary"`.  We look it up in the graph to
 * get its category and name.
 */
function resolveAliasVar(graph: TokenGraph, aliasTarget: string): string {
  const target = graph.tokens.get(aliasTarget);
  if (!target) {
    // Fallback: use the last segment of the dotted path as the name,
    // and derive category from the first segment if possible.
    const parts = aliasTarget.split('.');
    const name = parts[parts.length - 1];
    const category = parts[0] ?? 'unknown';
    return `var(${cssPropertyName(category, name)})`;
  }
  return `var(${cssPropertyName(target.category, target.name)})`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Serialize a TokenGraph to a CSS string containing a single `:root { ... }`
 * block with one custom property declaration per token.
 *
 * @param graph   - The resolved token graph to serialize.
 * @param options - Optional serialization options.
 *   - `tokenIds`: when provided, only tokens whose IDs appear in this array
 *     are emitted (delta output).
 * @returns A CSS string ready to write to a `.css` file or inject into a
 *   `<style>` element.
 */
export function serializeToCSS(
  graph: TokenGraph,
  options: CSSSerializeOptions = {},
): string {
  const { tokenIds } = options;

  // Build an allowed-set for O(1) lookup when delta mode is active.
  const allowedIds: ReadonlySet<string> | null =
    tokenIds !== undefined ? new Set(tokenIds) : null;

  // Collect tokens, filtered by allowedIds if present.
  const tokens: Token[] = [];
  for (const token of graph.tokens.values()) {
    if (allowedIds === null || allowedIds.has(token.id)) {
      tokens.push(token);
    }
  }

  // Sort: canonical category order first, then alphabetically by token name.
  const categoryIndex = new Map<string, number>();
  TOKEN_CATEGORIES.forEach((cat, idx) => categoryIndex.set(cat, idx));

  tokens.sort((a, b) => {
    const catA = categoryIndex.get(a.category) ?? Infinity;
    const catB = categoryIndex.get(b.category) ?? Infinity;
    if (catA !== catB) return catA - catB;
    return a.name.localeCompare(b.name);
  });

  // Build declaration lines.
  const lines: string[] = [];
  for (const token of tokens) {
    const prop = cssPropertyName(token.category, token.name);
    let cssValue: string;

    if (isAlias(token.value)) {
      cssValue = resolveAliasVar(graph, token.value.$alias);
    } else {
      cssValue = serializeBaseValue(token.value);
    }

    lines.push(`  ${prop}: ${cssValue};`);
  }

  if (lines.length === 0) {
    return ':root {}\n';
  }

  return `:root {\n${lines.join('\n')}\n}\n`;
}
