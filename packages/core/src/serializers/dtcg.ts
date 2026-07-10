/**
 * DTCG (W3C Design Token Community Group) serializer.
 *
 * Converts a TokenGraph into a nested W3C DTCG JSON or YAML object.
 * Each token leaf node has `$value`, `$type`, and optional `$description`.
 *
 * Alias tokens are emitted using DTCG curly-brace reference syntax:
 * `{ "$value": "{target.id}" }` so they round-trip through the parser.
 */

import yaml from 'js-yaml';

import {
  isAlias,
  type DTCGSerializeOptions,
  type TokenGraph,
  type BaseValue,
  type ShadowValue,
} from '../types.js';

// ─── Types ───────────────────────────────────────────────────────────────────

type DTCGLeaf = {
  $value: BaseValue | string;
  $type: string;
  $description?: string;
  $extensions?: {
    modes?: Record<string, unknown>;
  };
};

type DTCGNode = DTCGLeaf | DTCGTree;

interface DTCGTree {
  [key: string]: DTCGNode;
}

// ─── Nested object construction ───────────────────────────────────────────────

/**
 * Set a value at a deeply nested path within an object, creating intermediate
 * objects as needed. The path is an array of key segments.
 */
function setNestedValue(
  root: DTCGTree,
  pathParts: string[],
  leaf: DTCGLeaf,
): void {
  let current: DTCGTree = root;

  for (let i = 0; i < pathParts.length - 1; i++) {
    const key = pathParts[i];
    if (!(key in current) || typeof current[key] !== 'object' || '$value' in (current[key] as object)) {
      current[key] = {} as DTCGTree;
    }
    current = current[key] as DTCGTree;
  }

  const lastKey = pathParts[pathParts.length - 1];
  current[lastKey] = leaf;
}

// ─── Value serialization ──────────────────────────────────────────────────────

function serializeBaseValue(value: unknown): any {
  if (typeof value === 'object' && value !== null) {
    if ('$alias' in value && typeof (value as any)['$alias'] === 'string') {
      return `{${(value as any)['$alias']}}`;
    }
    if (Array.isArray(value)) {
      return value.map(serializeBaseValue);
    }
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = serializeBaseValue(v);
    }
    return result;
  }
  return value;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Serialize a TokenGraph to a W3C DTCG token file string.
 *
 * @param graph   - The token graph to serialize.
 * @param options - Serialization options: `format` is `'json'` or `'yaml'`.
 * @returns       - A JSON or YAML string representing the DTCG token file.
 */
export function serializeToDTCG(
  graph: TokenGraph,
  options: DTCGSerializeOptions,
): string {
  const root: DTCGTree = {};

  for (const token of graph.tokens.values()) {
    const pathParts = token.id.split('.');

    let $value: BaseValue | string;

    if (isAlias(token.value)) {
      // Emit DTCG curly-brace reference syntax: "{target.id}"
      $value = `{${token.value.$alias}}`;
    } else {
      $value = serializeBaseValue(token.value);
    }

    const leaf: DTCGLeaf = {
      $value,
      $type: token.type,
    };

    if (token.description !== undefined) {
      leaf.$description = token.description;
    }

    if (token.modes !== undefined) {
      const modes: Record<string, unknown> = {};
      for (const [modeName, modeVal] of Object.entries(token.modes)) {
        if (isAlias(modeVal)) {
          modes[modeName] = `{${modeVal.$alias}}`;
        } else {
          modes[modeName] = serializeBaseValue(modeVal);
        }
      }
      leaf.$extensions = { modes };
    }

    setNestedValue(root, pathParts, leaf);
  }

  if (options.format === 'yaml') {
    return yaml.dump(root);
  }

  return JSON.stringify(root, null, 2);
}
