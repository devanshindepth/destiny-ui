/**
 * Android XML serializer.
 *
 * Converts a TokenGraph into Android XML resource format.
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

function snakeCase(str: string): string {
  return str.replace(/[-.\s]+/g, '_').toLowerCase();
}

function androidResourceName(category: string, name: string): string {
  return snakeCase(`${category}_${name}`);
}

function serializeBaseValue(value: BaseValue, category: string): string {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (typeof value === 'object' && value !== null) {
    const s = value as ShadowValue;
    return `${s.offsetX} ${s.offsetY} ${s.blur} ${s.color}`; // simplified for XML text
  }
  
  let strVal = String(value);
  if (category.includes('dimension') || category.includes('spacing') || category.includes('sizing')) {
    if (strVal.endsWith('px')) strVal = strVal.replace('px', 'dp');
  }
  
  return strVal;
}

function resolveAliasVar(graph: TokenGraph, aliasTarget: string, category: string): string {
  const target = graph.tokens.get(aliasTarget);
  let resName = '';
  let resCategory = category;

  if (!target) {
    const parts = aliasTarget.split('.');
    resName = parts[parts.length - 1];
    resCategory = parts[0] ?? 'unknown';
  } else {
    resName = target.name;
    resCategory = target.category;
  }

  const prefix = resCategory.includes('color') ? '@color/' : '@dimen/';
  return `${prefix}${androidResourceName(resCategory, resName)}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function serializeToAndroid(
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
    const prop = androidResourceName(token.category, token.name);
    let androidValue: string;

    if (isAlias(token.value)) {
      androidValue = resolveAliasVar(graph, token.value.$alias, token.category);
    } else {
      androidValue = serializeBaseValue(token.value, token.category);
    }

    const tag = token.category.includes('color') ? 'color' : 'dimen';
    lines.push(`    <${tag} name="${prop}">${androidValue}</${tag}>`);
  }

  return `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${lines.join('\n')}\n</resources>\n`;
}
