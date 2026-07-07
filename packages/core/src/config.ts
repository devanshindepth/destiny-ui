import type { DesignStudioConfig, ConfigError } from './types.js';

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULTS: DesignStudioConfig = {
  tokensDir: './tokens',
  cssOutputDir: './dist/css',
  dtcgOutputDir: './dist/tokens',
  httpPort: 3300,
  wsPort: 3301,
  outputFormat: 'json',
  previewPath: null,
};

// Known keys and their expected types (used for type-checking and ordering notices)
const KNOWN_KEYS = [
  'tokensDir',
  'cssOutputDir',
  'dtcgOutputDir',
  'httpPort',
  'wsPort',
  'outputFormat',
  'previewPath',
] as const satisfies ReadonlyArray<keyof DesignStudioConfig>;

type KnownKey = (typeof KNOWN_KEYS)[number];

// ─── Type helpers ─────────────────────────────────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getReceivedType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Validates a single known key's value against its expected schema.
 * Returns a `ConfigError` if invalid, or `null` if valid.
 */
function validateKnownKey(
  key: KnownKey,
  value: unknown
): ConfigError | null {
  switch (key) {
    case 'tokensDir':
    case 'cssOutputDir':
    case 'dtcgOutputDir': {
      if (typeof value !== 'string') {
        return {
          kind: 'config',
          key,
          expectedType: 'string',
          receivedType: getReceivedType(value),
          message: `Config key "${key}" must be a string, but received ${getReceivedType(value)}.`,
        };
      }
      return null;
    }

    case 'httpPort':
    case 'wsPort': {
      if (typeof value !== 'number') {
        return {
          kind: 'config',
          key,
          expectedType: 'number',
          receivedType: getReceivedType(value),
          message: `Config key "${key}" must be a number, but received ${getReceivedType(value)}.`,
        };
      }
      return null;
    }

    case 'outputFormat': {
      if (value !== 'json' && value !== 'yaml') {
        return {
          kind: 'config',
          key,
          expectedType: '"json" | "yaml"',
          receivedType: getReceivedType(value),
          message: `Config key "${key}" must be "json" or "yaml", but received ${JSON.stringify(value)}.`,
        };
      }
      return null;
    }

    case 'previewPath': {
      if (value !== null && typeof value !== 'string') {
        return {
          kind: 'config',
          key,
          expectedType: 'string | null',
          receivedType: getReceivedType(value),
          message: `Config key "${key}" must be a string or null, but received ${getReceivedType(value)}.`,
        };
      }
      return null;
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parses an unknown raw value as a {@link DesignStudioConfig}.
 *
 * - Missing keys receive documented defaults and emit a notice.
 * - Wrong-typed keys produce a {@link ConfigError}; remaining missing keys still
 *   get defaults and emit notices.
 * - Unrecognized keys emit a notice and are ignored.
 * - Non-object raw input is treated as an empty object.
 *
 * @returns `{ config, notices }` on success, `{ config, notices, error }` on type error.
 */
export function parseConfig(raw: unknown): {
  config: DesignStudioConfig;
  notices: string[];
  error?: ConfigError;
} {
  const notices: string[] = [];

  // Treat non-plain-object as empty config
  const obj: Record<string, unknown> = isPlainObject(raw) ? raw : {};

  // Warn about unrecognized keys
  const knownSet = new Set<string>(KNOWN_KEYS);
  for (const key of Object.keys(obj)) {
    if (!knownSet.has(key)) {
      notices.push(`Config key "${key}" is unrecognized and will be ignored`);
    }
  }

  // Build config, collecting defaults and checking types
  const config = { ...DEFAULTS } as DesignStudioConfig;
  let firstError: ConfigError | undefined;

  for (const key of KNOWN_KEYS) {
    if (!(key in obj)) {
      // Key missing — use default and emit notice
      const defaultVal = DEFAULTS[key];
      notices.push(
        `Config key "${key}" is missing; using default: ${JSON.stringify(defaultVal)}`
      );
      // config[key] already set to default via spread above
      continue;
    }

    const value = obj[key];
    const validationError = validateKnownKey(key, value);

    if (validationError !== null) {
      // Wrong type — record first error, leave default for this key, continue collecting notices
      if (firstError === undefined) {
        firstError = validationError;
      }
      // config[key] stays as default
      continue;
    }

    // Valid — apply the user-provided value
    (config as unknown as Record<string, unknown>)[key] = value;
  }

  if (firstError !== undefined) {
    return { config, notices, error: firstError };
  }

  return { config, notices };
}
