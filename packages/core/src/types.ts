// ─── Token Categories ───────────────────────────────────────────────────────

export type TokenCategory =
  | 'brand-colors'
  | 'semantic-colors'
  | 'typography'
  | 'spacing'
  | 'border-radius'
  | 'shadows'
  | 'motion'
  | 'breakpoints';

// ─── Token Types ─────────────────────────────────────────────────────────────

export type TokenType =
  | 'color'
  | 'fontFamily'
  | 'fontSize'
  | 'fontWeight'
  | 'lineHeight'
  | 'letterSpacing'
  | 'dimension'
  | 'shadow'
  | 'duration'
  | 'cubicBezier';

// ─── Values ───────────────────────────────────────────────────────────────────

export interface ShadowValue {
  offsetX: string;
  offsetY: string;
  blur: string;
  spread: string;
  color: string; // #RRGGBBAA
}

export type BaseValue =
  | string       // color (#RRGGBBAA), dimension ("16px"), fontFamily, duration, etc.
  | number       // fontWeight, lineHeight (unitless)
  | number[]     // cubicBezier [x1, y1, x2, y2]
  | ShadowValue; // composite shadow

export interface AliasValue {
  $alias: string; // e.g. "color.brand.primary"
}

export type TokenValue = BaseValue | AliasValue;

export function isAlias(value: TokenValue): value is AliasValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    '$alias' in value
  );
}

// ─── Token ───────────────────────────────────────────────────────────────────

export interface Token {
  id: string;           // dot-notation path, e.g. "color.brand.primary"
  name: string;         // human label
  category: TokenCategory;
  type: TokenType;
  value: TokenValue;    // BaseValue | AliasValue
  description?: string;
  sourceFile: string;   // absolute path to originating Token_File
}

// ─── Token Graph ─────────────────────────────────────────────────────────────

export interface TokenGraph {
  // id → Token (all tokens, base and alias)
  readonly tokens: ReadonlyMap<string, Token>;

  // id → set of ids that this token directly aliases (outgoing edges)
  readonly edges: ReadonlyMap<string, ReadonlySet<string>>;

  // id → set of ids that alias this token (incoming edges, reverse index)
  readonly reverseEdges: ReadonlyMap<string, ReadonlySet<string>>;

  // pre-computed topological order (base tokens first)
  readonly topoOrder: ReadonlyArray<string>;

  // cached resolution results (invalidated on mutation)
  readonly resolvedCache: ReadonlyMap<string, ResolvedToken | TokenError>;
}

// ─── Resolved Token ──────────────────────────────────────────────────────────

export interface ResolvedToken {
  token: Token;
  resolvedValue: BaseValue;   // the primitive value after alias chain resolution
  aliasChain: string[];        // token IDs traversed during resolution (empty for base tokens)
}

// ─── Error Types ─────────────────────────────────────────────────────────────

export type TokenError =
  | ParseError
  | ValidationError
  | UnresolvedReferenceError
  | CycleError
  | FileWriteError
  | ChecksumMismatchError;

export interface ParseError {
  kind: 'parse';
  filePath: string;
  line: number;
  column?: number;
  message: string;
}

export interface ValidationError {
  kind: 'validation';
  tokenId: string;
  field: 'value' | 'type' | 'name';
  message: string;
}

export interface UnresolvedReferenceError {
  kind: 'unresolved-reference';
  tokenId: string;
  referencedId: string;
}

export interface CycleError {
  kind: 'cycle';
  cycle: string[];  // ordered list of token IDs forming the cycle
}

export interface FileWriteError {
  kind: 'file-write';
  path: string;
  reason: string;
}

export interface ChecksumMismatchError {
  kind: 'checksum-mismatch';
  path: string;
  storedChecksum: string;
  computedChecksum: string;
}

// ─── Public API Types ─────────────────────────────────────────────────────────

// ParseResult returned by parseTokenFile
export interface ParseResult {
  tokens: Token[];
  errors: (ParseError | ValidationError)[];
}

// CSS serialization options
export interface CSSSerializeOptions {
  tokenIds?: string[];  // optional delta-only output; if omitted, serialize all tokens
}

// DTCG serialization options
export interface DTCGSerializeOptions {
  format: 'json' | 'yaml';
}

// ─── Config Types ─────────────────────────────────────────────────────────────

export interface DesignStudioConfig {
  tokensDir: string;              // default: "./tokens"
  cssOutputDir: string;           // default: "./dist/css"
  dtcgOutputDir: string;          // default: "./dist/tokens"
  httpPort: number;               // default: 3300
  wsPort: number;                 // default: 3301
  outputFormat: 'json' | 'yaml'; // default: "json"
  previewPath: string | null;     // default: null
}

export interface ConfigError {
  kind: 'config';
  key: string;
  expectedType: string;
  receivedType: string;
  message: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

// Canonical ordering of token categories (used for CSS output ordering)
export const TOKEN_CATEGORIES: readonly TokenCategory[] = [
  'brand-colors',
  'semantic-colors',
  'typography',
  'spacing',
  'border-radius',
  'shadows',
  'motion',
  'breakpoints',
] as const;

// Maps each category to its valid token types
export const TYPES_FOR_CATEGORY: Record<TokenCategory, readonly TokenType[]> = {
  'brand-colors':   ['color'],
  'semantic-colors': ['color'],
  'typography':     ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'],
  'spacing':        ['dimension'],
  'border-radius':  ['dimension'],
  'shadows':        ['shadow'],
  'motion':         ['duration', 'cubicBezier'],
  'breakpoints':    ['dimension'],
};
