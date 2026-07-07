import { describe, it, expect } from 'vitest';
import { parseConfig } from './config.js';
import type { DesignStudioConfig } from './types.js';

// ─── Default config ───────────────────────────────────────────────────────────

const ALL_DEFAULTS: DesignStudioConfig = {
  tokensDir: './tokens',
  cssOutputDir: './dist/css',
  dtcgOutputDir: './dist/tokens',
  httpPort: 3300,
  wsPort: 3301,
  outputFormat: 'json',
  previewPath: null,
};

const ALL_KEYS: Array<keyof DesignStudioConfig> = [
  'tokensDir',
  'cssOutputDir',
  'dtcgOutputDir',
  'httpPort',
  'wsPort',
  'outputFormat',
  'previewPath',
];

// ─── Empty object → all defaults ─────────────────────────────────────────────

describe('parseConfig – empty object', () => {
  it('applies all defaults when given an empty object', () => {
    const { config, notices, error } = parseConfig({});
    expect(error).toBeUndefined();
    expect(config).toEqual(ALL_DEFAULTS);
  });

  it('emits a notice for every key when given an empty object', () => {
    const { notices } = parseConfig({});
    expect(notices).toHaveLength(ALL_KEYS.length);
    // Each known key should have a notice
    for (const key of ALL_KEYS) {
      expect(notices.some((n) => n.includes(`"${key}"`))).toBe(true);
    }
  });

  it('notice messages mention the default value', () => {
    const { notices } = parseConfig({});
    expect(notices.some((n) => n.includes('./tokens'))).toBe(true);
    expect(notices.some((n) => n.includes('3300'))).toBe(true);
  });
});

// ─── Valid complete config ────────────────────────────────────────────────────

describe('parseConfig – valid complete config', () => {
  it('returns no error and no notices for a fully-specified valid config', () => {
    const raw: DesignStudioConfig = {
      tokensDir: './src/tokens',
      cssOutputDir: './out/css',
      dtcgOutputDir: './out/tokens',
      httpPort: 4000,
      wsPort: 4001,
      outputFormat: 'yaml',
      previewPath: '/preview',
    };
    const { config, notices, error } = parseConfig(raw);
    expect(error).toBeUndefined();
    expect(notices).toHaveLength(0);
    expect(config).toEqual(raw);
  });
});

// ─── Missing one key ──────────────────────────────────────────────────────────

describe('parseConfig – missing one key', () => {
  it('emits a notice and uses default for the missing key', () => {
    const raw = {
      tokensDir: './src/tokens',
      cssOutputDir: './out/css',
      dtcgOutputDir: './out/tokens',
      httpPort: 4000,
      wsPort: 4001,
      outputFormat: 'yaml',
      // previewPath omitted
    };
    const { config, notices, error } = parseConfig(raw);
    expect(error).toBeUndefined();
    expect(config.previewPath).toBe(null);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain('"previewPath"');
    expect(notices[0]).toContain('null');
  });
});

// ─── Wrong type for string key ────────────────────────────────────────────────

describe('parseConfig – wrong type for string key', () => {
  it('returns ConfigError when tokensDir is a number', () => {
    const { error, config } = parseConfig({ tokensDir: 42 });
    expect(error).toBeDefined();
    expect(error?.kind).toBe('config');
    expect(error?.key).toBe('tokensDir');
    expect(error?.expectedType).toBe('string');
    expect(error?.receivedType).toBe('number');
  });

  it('applies default for the errored key', () => {
    const { config } = parseConfig({ tokensDir: 42 });
    expect(config.tokensDir).toBe('./tokens');
  });

  it('still applies defaults and notices for other missing keys', () => {
    const { config, notices } = parseConfig({ tokensDir: 42 });
    // All other keys were missing, so they get defaults and notices
    expect(config.cssOutputDir).toBe('./dist/css');
    expect(notices.length).toBeGreaterThan(0);
  });
});

// ─── Wrong type for number key ────────────────────────────────────────────────

describe('parseConfig – wrong type for number key', () => {
  it('returns ConfigError when httpPort is a string', () => {
    const { error } = parseConfig({ httpPort: '3300' });
    expect(error).toBeDefined();
    expect(error?.key).toBe('httpPort');
    expect(error?.expectedType).toBe('number');
    expect(error?.receivedType).toBe('string');
  });

  it('returns ConfigError when wsPort is null', () => {
    const { error } = parseConfig({ wsPort: null });
    expect(error).toBeDefined();
    expect(error?.key).toBe('wsPort');
    expect(error?.expectedType).toBe('number');
    expect(error?.receivedType).toBe('null');
  });

  it('applies default for the errored wsPort key', () => {
    const { config } = parseConfig({ wsPort: 'bad' });
    expect(config.wsPort).toBe(3301);
  });
});

// ─── Invalid outputFormat ─────────────────────────────────────────────────────

describe('parseConfig – invalid outputFormat', () => {
  it('returns ConfigError with expectedType "json" | "yaml" for invalid string value', () => {
    const { error } = parseConfig({ outputFormat: 'xml' });
    expect(error).toBeDefined();
    expect(error?.key).toBe('outputFormat');
    expect(error?.expectedType).toBe('"json" | "yaml"');
  });

  it('returns ConfigError for outputFormat as number', () => {
    const { error } = parseConfig({ outputFormat: 1 });
    expect(error).toBeDefined();
    expect(error?.key).toBe('outputFormat');
    expect(error?.expectedType).toBe('"json" | "yaml"');
  });

  it('accepts "json" without error', () => {
    const { error } = parseConfig({ outputFormat: 'json' });
    expect(error).toBeUndefined();
  });

  it('accepts "yaml" without error', () => {
    const { error } = parseConfig({ outputFormat: 'yaml' });
    expect(error).toBeUndefined();
  });
});

// ─── previewPath ──────────────────────────────────────────────────────────────

describe('parseConfig – previewPath', () => {
  it('accepts previewPath: null', () => {
    const { error, config } = parseConfig({
      ...ALL_DEFAULTS,
      previewPath: null,
    });
    expect(error).toBeUndefined();
    expect(config.previewPath).toBe(null);
  });

  it('accepts previewPath: string', () => {
    const { error, config } = parseConfig({
      ...ALL_DEFAULTS,
      previewPath: '/path/to/preview',
    });
    expect(error).toBeUndefined();
    expect(config.previewPath).toBe('/path/to/preview');
  });

  it('returns ConfigError when previewPath is a number', () => {
    const { error } = parseConfig({ previewPath: 123 });
    expect(error).toBeDefined();
    expect(error?.key).toBe('previewPath');
    expect(error?.expectedType).toBe('string | null');
    expect(error?.receivedType).toBe('number');
  });

  it('returns ConfigError when previewPath is a boolean', () => {
    const { error } = parseConfig({ previewPath: true });
    expect(error).toBeDefined();
    expect(error?.key).toBe('previewPath');
    expect(error?.receivedType).toBe('boolean');
  });

  it('returns ConfigError when previewPath is an array', () => {
    const { error } = parseConfig({ previewPath: [] });
    expect(error).toBeDefined();
    expect(error?.key).toBe('previewPath');
    expect(error?.receivedType).toBe('array');
  });
});

// ─── Unrecognized keys ────────────────────────────────────────────────────────

describe('parseConfig – unrecognized keys', () => {
  it('emits a notice for unrecognized keys', () => {
    const { notices, error } = parseConfig({ unknownProp: 'value' });
    expect(error).toBeUndefined();
    expect(notices.some((n) => n.includes('"unknownProp"') && n.includes('unrecognized'))).toBe(true);
  });

  it('does not include unrecognized key in config', () => {
    const { config } = parseConfig({ unknownProp: 'value' });
    expect(Object.keys(config)).not.toContain('unknownProp');
  });

  it('still applies defaults for missing known keys alongside unrecognized ones', () => {
    const { config, notices } = parseConfig({ unknownProp: 'x', tokensDir: './custom' });
    expect(config.tokensDir).toBe('./custom');
    expect(config.cssOutputDir).toBe('./dist/css'); // default
    // notice for unrecognized key
    expect(notices.some((n) => n.includes('"unknownProp"'))).toBe(true);
  });
});

// ─── Non-object raw input ─────────────────────────────────────────────────────

describe('parseConfig – non-object raw input', () => {
  it('treats null as empty object — all defaults, all notices, no error', () => {
    const { config, notices, error } = parseConfig(null);
    expect(error).toBeUndefined();
    expect(config).toEqual(ALL_DEFAULTS);
    expect(notices).toHaveLength(ALL_KEYS.length);
  });

  it('treats array as empty object', () => {
    const { config, notices, error } = parseConfig([1, 2, 3]);
    expect(error).toBeUndefined();
    expect(config).toEqual(ALL_DEFAULTS);
    expect(notices).toHaveLength(ALL_KEYS.length);
  });

  it('treats string as empty object', () => {
    const { config, notices, error } = parseConfig('some string');
    expect(error).toBeUndefined();
    expect(config).toEqual(ALL_DEFAULTS);
    expect(notices).toHaveLength(ALL_KEYS.length);
  });

  it('treats number as empty object', () => {
    const { config, error } = parseConfig(42);
    expect(error).toBeUndefined();
    expect(config).toEqual(ALL_DEFAULTS);
  });

  it('treats undefined as empty object', () => {
    const { config, error } = parseConfig(undefined);
    expect(error).toBeUndefined();
    expect(config).toEqual(ALL_DEFAULTS);
  });
});

// ─── Error stops at first type error ──────────────────────────────────────────

describe('parseConfig – error stops at first type error', () => {
  it('returns only the first error when multiple keys have wrong types', () => {
    const { error } = parseConfig({ tokensDir: 1, httpPort: 'bad' });
    // Should return an error for the first key encountered in order
    expect(error).toBeDefined();
    // The error should be for tokensDir (first in KNOWN_KEYS order)
    expect(error?.key).toBe('tokensDir');
  });
});
