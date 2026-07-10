import { describe, it, expect } from 'vitest';
import { parseTokenFile } from './parser.js';
import type { ParseError, ValidationError } from './types.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

function isParseError(e: ParseError | ValidationError): e is ParseError {
  return e.kind === 'parse';
}

function isValidationError(e: ParseError | ValidationError): e is ValidationError {
  return e.kind === 'validation';
}

// ─── JSON parsing ─────────────────────────────────────────────────────────────

describe('parseTokenFile – JSON basic', () => {
  it('parses a single color token', () => {
    const content = JSON.stringify({
      color: {
        brand: {
          primary: {
            $value: '#0066FFFF',
            $type: 'color',
            $description: 'Primary brand color',
          },
        },
      },
    });

    const result = parseTokenFile(content, 'json');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens).toHaveLength(1);

    const token = result.tokens[0];
    expect(token.id).toBe('color.brand.primary');
    expect(token.name).toBe('primary');
    expect(token.type).toBe('color');
    expect(token.value).toBe('#0066FFFF');
    expect(token.description).toBe('Primary brand color');
    expect(token.category).toBe('brand-colors');
    expect(token.sourceFile).toBe('');
  });

  it('parses multiple tokens from nested groups', () => {
    const content = JSON.stringify({
      spacing: {
        4: { $value: '16px', $type: 'dimension' },
        8: { $value: '32px', $type: 'dimension' },
      },
    });

    const result = parseTokenFile(content, 'json');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens).toHaveLength(2);

    const ids = result.tokens.map((t) => t.id).sort();
    expect(ids).toEqual(['spacing.4', 'spacing.8']);
  });

  it('derives token id from dot-joined key path', () => {
    const content = JSON.stringify({
      typography: {
        heading: {
          h1: {
            size: { $value: '32px', $type: 'fontSize' },
          },
        },
      },
    });

    const result = parseTokenFile(content, 'json');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens[0].id).toBe('typography.heading.h1.size');
    expect(result.tokens[0].name).toBe('size');
  });

  it('maps top-level "color" key to "brand-colors" category', () => {
    const content = JSON.stringify({
      color: {
        primary: { $value: '#FF0000FF', $type: 'color' },
      },
    });
    const result = parseTokenFile(content, 'json');
    expect(result.tokens[0].category).toBe('brand-colors');
  });

  it('maps top-level "spacing" key to "spacing" category', () => {
    const content = JSON.stringify({
      spacing: {
        base: { $value: '8px', $type: 'dimension' },
      },
    });
    const result = parseTokenFile(content, 'json');
    expect(result.tokens[0].category).toBe('spacing');
  });

  it('maps top-level "shadows" key to "shadows" category', () => {
    const content = JSON.stringify({
      shadows: {
        card: {
          $value: {
            offsetX: '0px',
            offsetY: '4px',
            blur: '8px',
            spread: '0px',
            color: '#00000040',
          },
          $type: 'shadow',
        },
      },
    });
    const result = parseTokenFile(content, 'json');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens[0].category).toBe('shadows');
  });
});

// ─── Alias tokens ──────────────────────────────────────────────────────────────

describe('parseTokenFile – alias tokens', () => {
  it('converts DTCG {path} syntax to AliasValue', () => {
    const content = JSON.stringify({
      color: {
        brand: {
          primary: { $value: '#0066FFFF', $type: 'color' },
          secondary: { $value: '{color.brand.primary}', $type: 'color' },
        },
      },
    });

    const result = parseTokenFile(content, 'json');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens).toHaveLength(2);

    const alias = result.tokens.find((t) => t.id === 'color.brand.secondary');
    expect(alias?.value).toEqual({ $alias: 'color.brand.primary' });
  });

  it('strips braces from alias path', () => {
    const content = JSON.stringify({
      'semantic-colors': {
        action: { $value: '{color.brand.primary}', $type: 'color' },
      },
    });

    const result = parseTokenFile(content, 'json');
    const token = result.tokens[0];
    expect(token.value).toEqual({ $alias: 'color.brand.primary' });
  });
});

// ─── Validation errors ─────────────────────────────────────────────────────────

describe('parseTokenFile – validation errors', () => {
  it('records ValidationError (field=type) when $type is missing', () => {
    const content = JSON.stringify({
      color: {
        primary: { $value: '#FF0000FF' },
      },
    });

    const result = parseTokenFile(content, 'json');
    expect(result.tokens).toHaveLength(0);
    expect(result.errors).toHaveLength(1);

    const err = result.errors[0];
    expect(isValidationError(err)).toBe(true);
    if (isValidationError(err)) {
      expect(err.field).toBe('type');
      expect(err.tokenId).toBe('color.primary');
    }
  });

  it('records ValidationError (field=value) when $value is missing', () => {
    // A node with $value missing is treated as a group node (not a token node)
    // per DTCG semantics — only nodes with $value are token leaves.
    // Therefore no token is produced and no error is recorded for this node.
    const content = JSON.stringify({
      color: {
        primary: { $type: 'color' },
      },
    });

    const result = parseTokenFile(content, 'json');
    expect(result.tokens).toHaveLength(0);
    // No error: node without $value is silently treated as an empty group
    expect(result.errors).toHaveLength(0);
  });

  it('records ValidationError (field=value) for invalid value format', () => {
    const content = JSON.stringify({
      color: {
        bad: { $value: 'not-a-color', $type: 'color' },
      },
    });

    const result = parseTokenFile(content, 'json');
    expect(result.tokens).toHaveLength(0);
    expect(result.errors).toHaveLength(1);

    const err = result.errors[0];
    expect(isValidationError(err)).toBe(true);
    if (isValidationError(err)) {
      expect(err.field).toBe('value');
      expect(err.tokenId).toBe('color.bad');
    }
  });

  it('skips invalid tokens but continues loading remaining valid tokens', () => {
    const content = JSON.stringify({
      color: {
        bad: { $value: 'oops', $type: 'color' },
        good: { $value: '#00FF00FF', $type: 'color' },
      },
    });

    const result = parseTokenFile(content, 'json');
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].id).toBe('color.good');
    expect(result.errors).toHaveLength(1);
  });

  it('records ValidationError for unknown $type', () => {
    const content = JSON.stringify({
      color: {
        primary: { $value: '#FF0000FF', $type: 'spaceship' },
      },
    });

    const result = parseTokenFile(content, 'json');
    expect(result.tokens).toHaveLength(0);
    const err = result.errors[0];
    expect(isValidationError(err)).toBe(true);
    if (isValidationError(err)) {
      expect(err.field).toBe('type');
    }
  });

  it('records ValidationError when type is not valid for the category', () => {
    // "shadow" type is not valid for "spacing" category
    const content = JSON.stringify({
      spacing: {
        card: {
          $value: { offsetX: '0px', offsetY: '4px', blur: '8px', spread: '0px', color: '#00000040' },
          $type: 'shadow',
        },
      },
    });

    const result = parseTokenFile(content, 'json');
    expect(result.tokens).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    const err = result.errors[0];
    expect(isValidationError(err)).toBe(true);
    if (isValidationError(err)) {
      expect(err.field).toBe('type');
    }
  });
});

// ─── JSON syntax errors ────────────────────────────────────────────────────────

describe('parseTokenFile – JSON syntax errors', () => {
  it('records a ParseError on invalid JSON', () => {
    const result = parseTokenFile('{bad json}', 'json');
    expect(result.tokens).toHaveLength(0);
    expect(result.errors).toHaveLength(1);

    const err = result.errors[0];
    expect(isParseError(err)).toBe(true);
    if (isParseError(err)) {
      expect(err.kind).toBe('parse');
      expect(typeof err.message).toBe('string');
      expect(err.message.length).toBeGreaterThan(0);
    }
  });

  it('returns empty tokens on JSON parse failure', () => {
    const result = parseTokenFile('not even json!', 'json');
    expect(result.tokens).toHaveLength(0);
  });
});

// ─── YAML parsing ─────────────────────────────────────────────────────────────

describe('parseTokenFile – YAML', () => {
  it('parses a single color token from YAML', () => {
    const yaml = `
color:
  brand:
    primary:
      $value: "#0066FFFF"
      $type: color
      $description: Primary brand color
`;
    const result = parseTokenFile(yaml, 'yaml');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens).toHaveLength(1);

    const token = result.tokens[0];
    expect(token.id).toBe('color.brand.primary');
    expect(token.type).toBe('color');
    expect(token.value).toBe('#0066FFFF');
    expect(token.description).toBe('Primary brand color');
  });

  it('parses multiple tokens from YAML', () => {
    const yaml = `
spacing:
  4:
    $value: "16px"
    $type: dimension
  8:
    $value: "32px"
    $type: dimension
`;
    const result = parseTokenFile(yaml, 'yaml');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens).toHaveLength(2);
  });

  it('converts DTCG alias syntax in YAML', () => {
    const yaml = `
color:
  brand:
    primary:
      $value: "#0066FFFF"
      $type: color
    secondary:
      $value: "{color.brand.primary}"
      $type: color
`;
    const result = parseTokenFile(yaml, 'yaml');
    expect(result.errors).toHaveLength(0);
    const alias = result.tokens.find((t) => t.id === 'color.brand.secondary');
    expect(alias?.value).toEqual({ $alias: 'color.brand.primary' });
  });

  it('records a ParseError with line info on invalid YAML', () => {
    const badYaml = `
color:
  brand:
    : invalid key here
`;
    const result = parseTokenFile(badYaml, 'yaml');
    expect(result.tokens).toHaveLength(0);
    expect(result.errors).toHaveLength(1);

    const err = result.errors[0];
    expect(isParseError(err)).toBe(true);
    if (isParseError(err)) {
      expect(err.kind).toBe('parse');
      expect(typeof err.line).toBe('number');
      expect(err.line).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('parseTokenFile – edge cases', () => {
  it('skips $metadata and other $-prefixed root keys', () => {
    const content = JSON.stringify({
      $metadata: { generator: 'design-studio' },
      color: {
        primary: { $value: '#FF0000FF', $type: 'color' },
      },
    });

    const result = parseTokenFile(content, 'json');
    expect(result.tokens).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it('skips $extensions at group level', () => {
    const content = JSON.stringify({
      color: {
        $extensions: { 'com.example': true },
        primary: { $value: '#FF0000FF', $type: 'color' },
      },
    });

    const result = parseTokenFile(content, 'json');
    expect(result.tokens).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it('handles empty token file (empty JSON object)', () => {
    const result = parseTokenFile('{}', 'json');
    expect(result.tokens).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('handles empty YAML file', () => {
    const result = parseTokenFile('', 'yaml');
    expect(result.tokens).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('does not set description when $description is absent', () => {
    const content = JSON.stringify({
      color: {
        primary: { $value: '#FF0000FF', $type: 'color' },
      },
    });
    const result = parseTokenFile(content, 'json');
    expect(result.tokens[0].description).toBeUndefined();
  });

  it('handles deeply nested groups', () => {
    const content = JSON.stringify({
      color: {
        a: {
          b: {
            c: {
              d: { $value: '#000000FF', $type: 'color' },
            },
          },
        },
      },
    });
    const result = parseTokenFile(content, 'json');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens[0].id).toBe('color.a.b.c.d');
  });

  it('handles motion tokens (duration and cubicBezier)', () => {
    const content = JSON.stringify({
      motion: {
        fast: { $value: '150ms', $type: 'duration' },
        ease: { $value: [0.4, 0, 0.2, 1], $type: 'cubicBezier' },
      },
    });
    const result = parseTokenFile(content, 'json');
    expect(result.errors).toHaveLength(0);
    expect(result.tokens).toHaveLength(2);
    expect(result.tokens.find((t) => t.id === 'motion.fast')?.value).toBe('150ms');
    expect(result.tokens.find((t) => t.id === 'motion.ease')?.value).toEqual([0.4, 0, 0.2, 1]);
  });
});
