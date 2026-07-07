/**
 * DTCG token file parser.
 *
 * Supports JSON and YAML input.  The returned {@link ParseResult} contains
 * every successfully parsed token plus all accumulated {@link ParseError}
 * and {@link ValidationError} records — callers should inspect `errors`
 * even when `tokens` is non-empty.
 */

import yaml from 'js-yaml';

import {
  TOKEN_CATEGORIES,
  TYPES_FOR_CATEGORY,
  type ParseResult,
  type ParseError,
  type ValidationError,
  type Token,
  type TokenCategory,
  type TokenType,
  type TokenValue,
  type AliasValue,
  type BaseValue,
} from './types.js';

import { validateTokenValue } from './validation.js';

// ─── Category mapping ────────────────────────────────────────────────────────

/**
 * Maps common DTCG top-level group names (as they appear in token files) to
 * the canonical {@link TokenCategory} values used by Design Studio.
 *
 * The mapping attempts a direct match first, then a fuzzy lookup via this
 * table, and finally falls back to the first TOKEN_CATEGORIES entry so that
 * unknown groups are never silently dropped.
 */
const CATEGORY_MAP: Record<string, TokenCategory> = {
  // direct matches (DTCG key == category value)
  'brand-colors': 'brand-colors',
  'semantic-colors': 'semantic-colors',
  'typography': 'typography',
  'spacing': 'spacing',
  'border-radius': 'border-radius',
  'shadows': 'shadows',
  'motion': 'motion',
  'breakpoints': 'breakpoints',

  // common aliases
  color: 'brand-colors',
  colors: 'brand-colors',
  'brand-color': 'brand-colors',
  'brandColors': 'brand-colors',
  'semanticColors': 'semantic-colors',
  'semantic': 'semantic-colors',
  'font': 'typography',
  'fonts': 'typography',
  'type': 'typography',
  'space': 'spacing',
  'radius': 'border-radius',
  'borderRadius': 'border-radius',
  'shadow': 'shadows',
  'animation': 'motion',
  'transition': 'motion',
  'breakpoint': 'breakpoints',
  'size': 'breakpoints',
  'screen': 'breakpoints',
  'viewport': 'breakpoints',
};

function deriveCategory(topLevelKey: string): TokenCategory {
  const direct = TOKEN_CATEGORIES.find((c) => c === topLevelKey);
  if (direct) return direct;

  const mapped = CATEGORY_MAP[topLevelKey];
  if (mapped) return mapped;

  // Fallback: return the first category so the token is still collected
  return TOKEN_CATEGORIES[0];
}

// ─── Type guard ───────────────────────────────────────────────────────────────

const VALID_TYPES = new Set<string>([
  'color',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'dimension',
  'shadow',
  'duration',
  'cubicBezier',
]);

function isTokenType(value: unknown): value is TokenType {
  return typeof value === 'string' && VALID_TYPES.has(value);
}

// ─── Alias detection & conversion ─────────────────────────────────────────────

/** DTCG alias syntax: `{some.token.path}` */
const ALIAS_RE = /^\{([^}]+)\}$/;

function parseValue(raw: unknown): TokenValue {
  if (typeof raw === 'string') {
    const m = ALIAS_RE.exec(raw);
    if (m) {
      return { $alias: m[1] } as AliasValue;
    }
  }
  // ShadowValue — object without $alias, not an array
  if (
    typeof raw === 'object' &&
    raw !== null &&
    !Array.isArray(raw) &&
    !('$alias' in raw)
  ) {
    return raw as BaseValue;
  }
  return raw as BaseValue;
}

// ─── Traversal ────────────────────────────────────────────────────────────────

/**
 * Determine whether a node is a DTCG token leaf (has a `$value` property).
 */
function isTokenNode(node: unknown): node is Record<string, unknown> {
  return (
    typeof node === 'object' &&
    node !== null &&
    !Array.isArray(node) &&
    '$value' in (node as Record<string, unknown>)
  );
}

function isGroupNode(node: unknown): node is Record<string, unknown> {
  return (
    typeof node === 'object' &&
    node !== null &&
    !Array.isArray(node) &&
    !('$value' in (node as Record<string, unknown>))
  );
}

/**
 * Recursively walk a DTCG object.
 *
 * @param node       - Current subtree being visited.
 * @param pathParts  - Key-path segments accumulated so far.
 * @param category   - Token_Category derived from the top-level key.
 * @param tokens     - Accumulator for successfully parsed tokens.
 * @param errors     - Accumulator for validation errors.
 */
function traverse(
  node: unknown,
  pathParts: string[],
  category: TokenCategory,
  tokens: Token[],
  errors: ValidationError[],
): void {
  if (!isGroupNode(node)) return;

  for (const [key, child] of Object.entries(node)) {
    // Skip DTCG metadata keys at group level (e.g., $extensions, $metadata)
    if (key.startsWith('$')) continue;

    const childPath = [...pathParts, key];

    if (isTokenNode(child)) {
      parseTokenNode(child, childPath, category, tokens, errors);
    } else if (isGroupNode(child)) {
      traverse(child, childPath, category, tokens, errors);
    }
    // Scalar children that are neither token nodes nor group nodes are ignored.
  }
}

/**
 * Parse a single DTCG token node, accumulate validated token or errors.
 */
function parseTokenNode(
  node: Record<string, unknown>,
  pathParts: string[],
  category: TokenCategory,
  tokens: Token[],
  errors: ValidationError[],
): void {
  const id = pathParts.join('.');
  const name = pathParts[pathParts.length - 1];

  // ── $type ──────────────────────────────────────────────────────────────────
  if (!('$type' in node) || node['$type'] === undefined || node['$type'] === null) {
    errors.push({
      kind: 'validation',
      tokenId: id,
      field: 'type',
      message: `Token "${id}" is missing the required "$type" field.`,
    });
    return; // cannot validate value without type
  }

  if (!isTokenType(node['$type'])) {
    errors.push({
      kind: 'validation',
      tokenId: id,
      field: 'type',
      message: `Token "${id}" has an unrecognized "$type" value: ${JSON.stringify(node['$type'])}. Expected one of: ${[...VALID_TYPES].join(', ')}.`,
    });
    return;
  }

  const type: TokenType = node['$type'];

  // ── $value ─────────────────────────────────────────────────────────────────
  if (!('$value' in node) || node['$value'] === undefined || node['$value'] === null) {
    errors.push({
      kind: 'validation',
      tokenId: id,
      field: 'value',
      message: `Token "${id}" is missing the required "$value" field.`,
    });
    return;
  }

  const rawValue = node['$value'];
  const value = parseValue(rawValue);

  // ── Validate value (skip validation for alias tokens) ──────────────────────
  if (!isAliasValue(value)) {
    const valErr = validateTokenValue(type, value, category);
    if (valErr) {
      errors.push({
        ...valErr,
        tokenId: id,
      });
      return;
    }
  }

  // ── Check type is valid for this category ──────────────────────────────────
  const allowedTypes = TYPES_FOR_CATEGORY[category];
  if (!allowedTypes.includes(type)) {
    errors.push({
      kind: 'validation',
      tokenId: id,
      field: 'type',
      message: `Token "${id}" has type "${type}" which is not valid for category "${category}". Expected one of: ${allowedTypes.join(', ')}.`,
    });
    return;
  }

  // ── $description (optional) ────────────────────────────────────────────────
  const description =
    typeof node['$description'] === 'string' ? node['$description'] : undefined;

  tokens.push({
    id,
    name,
    category,
    type,
    value,
    ...(description !== undefined ? { description } : {}),
    sourceFile: '',
  });
}

function isAliasValue(v: TokenValue): v is AliasValue {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    '$alias' in v
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a DTCG token file from a string.
 *
 * @param content  - Raw file content (JSON or YAML).
 * @param format   - File format; determines the first-pass parser.
 * @returns        - Parsed tokens and any accumulated errors.
 */
export function parseTokenFile(
  content: string,
  format: 'json' | 'yaml',
): ParseResult {
  const tokens: Token[] = [];
  const errors: ParseError[] = [];
  const validationErrors: ValidationError[] = [];

  // ── 1. Parse raw content into an object ────────────────────────────────────
  let root: unknown;

  if (format === 'json') {
    try {
      root = JSON.parse(content);
    } catch (err) {
      const syntaxErr = err as SyntaxError;

      // Attempt to extract line number from V8 SyntaxError message, e.g.
      // "Unexpected token … in JSON at position N" or "… at line L column C"
      let line = 0;
      const lineMatch = /line (\d+)/i.exec(syntaxErr.message);
      const colMatch = /column (\d+)/i.exec(syntaxErr.message);
      if (lineMatch) line = parseInt(lineMatch[1], 10);

      const parseError: ParseError = {
        kind: 'parse',
        filePath: '',
        line,
        message: `JSON syntax error: ${syntaxErr.message}`,
      };
      if (colMatch) {
        parseError.column = parseInt(colMatch[1], 10);
      }

      errors.push(parseError);
      return { tokens, errors };
    }
  } else {
    try {
      root = yaml.load(content);
    } catch (err) {
      const yamlErr = err as yaml.YAMLException;
      const mark = yamlErr.mark;
      errors.push({
        kind: 'parse',
        filePath: '',
        line: mark ? mark.line + 1 : 0, // js-yaml lines are 0-indexed
        column: mark ? mark.column + 1 : undefined,
        message: `YAML syntax error: ${yamlErr.reason ?? yamlErr.message}`,
      });
      return { tokens, errors };
    }
  }

  // ── 2. Root must be a plain object ─────────────────────────────────────────
  if (root === null || root === undefined) {
    // An empty file produces no tokens and no errors
    return { tokens, errors };
  }

  if (typeof root !== 'object' || Array.isArray(root)) {
    errors.push({
      kind: 'parse',
      filePath: '',
      line: 0,
      message: `Token file root must be a plain object, got: ${Array.isArray(root) ? 'array' : typeof root}.`,
    });
    return { tokens, errors };
  }

  // ── 3. Walk top-level keys — each maps to a category ──────────────────────
  const rootObj = root as Record<string, unknown>;

  for (const [topKey, subtree] of Object.entries(rootObj)) {
    // Skip reserved DTCG metadata at root level
    if (topKey.startsWith('$')) continue;

    const category = deriveCategory(topKey);

    if (isTokenNode(subtree)) {
      // Edge case: top-level key is itself a token node
      parseTokenNode(subtree, [topKey], category, tokens, validationErrors);
    } else if (isGroupNode(subtree)) {
      traverse(subtree, [topKey], category, tokens, validationErrors);
    }
  }

  return {
    tokens,
    errors: [...errors, ...validationErrors],
  };
}
