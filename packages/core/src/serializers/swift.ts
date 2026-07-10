/**
 * Swift token serializer.
 *
 * Converts a TokenGraph into a Swift enum containing static let properties.
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

function camelCase(str: string): string {
  return str.replace(/[-_.\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''));
}

function swiftPropertyName(category: string, name: string): string {
  return camelCase(`${category}-${name}`);
}

function serializeBaseValue(value: BaseValue, category: string): string {
  if (Array.isArray(value)) {
    return `[${value.join(', ')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const s = value as ShadowValue;
    return `Shadow(offsetX: "${s.offsetX}", offsetY: "${s.offsetY}", blur: "${s.blur}", spread: "${s.spread}", color: "${s.color}")`;
  }
  
  const strVal = String(value);
  if (category.includes('color')) {
    return `Color(hex: "${strVal}")`;
  }
  if (category.includes('dimension') || category.includes('spacing') || category.includes('sizing')) {
    const num = parseFloat(strVal);
    if (!isNaN(num)) return `CGFloat(${num})`;
  }
  
  return `"${strVal}"`;
}

function resolveAliasVar(graph: TokenGraph, aliasTarget: string): string {
  const target = graph.tokens.get(aliasTarget);
  if (!target) {
    const parts = aliasTarget.split('.');
    const name = parts[parts.length - 1];
    const category = parts[0] ?? 'unknown';
    return swiftPropertyName(category, name);
  }
  return swiftPropertyName(target.category, target.name);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function serializeToSwift(
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
    const prop = swiftPropertyName(token.category, token.name);
    let swiftValue: string;

    if (isAlias(token.value)) {
      swiftValue = resolveAliasVar(graph, token.value.$alias);
    } else {
      swiftValue = serializeBaseValue(token.value, token.category);
    }

    lines.push(`    public static let ${prop} = ${swiftValue}`);
  }

  return `import SwiftUI\n\npublic enum Tokens {\n${lines.join('\n')}\n}\n`;
}
