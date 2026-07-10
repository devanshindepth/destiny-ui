/**
 * SCSS variable serializer.
 *
 * Converts a TokenGraph into a series of `$category-name: value;` variables.
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

function serializeBaseValue(value: BaseValue): string {
  if (Array.isArray(value)) {
    return `cubic-bezier(${value.join(', ')})`;
  }
  if (typeof value === 'object' && value !== null) {
    const s = value as ShadowValue;
    return `${s.offsetX} ${s.offsetY} ${s.blur} ${s.spread} ${s.color}`;
  }
  return String(value);
}

function scssPropertyName(category: string, name: string): string {
  const safeName = name.replace(/\./g, '-');
  return `$${category}-${safeName}`;
}

function resolveAliasVar(graph: TokenGraph, aliasTarget: string): string {
  const target = graph.tokens.get(aliasTarget);
  if (!target) {
    const parts = aliasTarget.split('.');
    const name = parts[parts.length - 1];
    const category = parts[0] ?? 'unknown';
    return scssPropertyName(category, name);
  }
  return scssPropertyName(target.category, target.name);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function serializeToSCSS(
  graph: TokenGraph,
  options: CSSSerializeOptions = {},
): string {
  const { tokenIds } = options;

  const allowedIds: ReadonlySet<string> | null =
    tokenIds !== undefined ? new Set(tokenIds) : null;

  const tokens: Token[] = [];
  for (const token of graph.tokens.values()) {
    if (allowedIds === null || allowedIds.has(token.id)) {
      tokens.push(token);
    }
  }

  const categoryIndex = new Map<string, number>();
  TOKEN_CATEGORIES.forEach((cat, idx) => categoryIndex.set(cat, idx));

  tokens.sort((a, b) => {
    const catA = categoryIndex.get(a.category) ?? Infinity;
    const catB = categoryIndex.get(b.category) ?? Infinity;
    if (catA !== catB) return catA - catB;
    return a.name.localeCompare(b.name);
  });

  const lines: string[] = [];
  for (const token of tokens) {
    const prop = scssPropertyName(token.category, token.name);
    let cssValue: string;

    if (isAlias(token.value)) {
      cssValue = resolveAliasVar(graph, token.value.$alias);
    } else {
      cssValue = serializeBaseValue(token.value);
    }

    lines.push(`${prop}: ${cssValue};`);
  }

  return lines.join('\n') + '\n';
}
