import { describe, it, expect } from 'vitest';
import { validateTokenValue, validateTokenName } from './validation.js';
import type { TokenCategory } from './types.js';

// ─── validateTokenValue ───────────────────────────────────────────────────────

describe('validateTokenValue – color', () => {
  it('accepts a valid #RRGGBBAA string', () => {
    expect(validateTokenValue('color', '#FF5733FF')).toBeNull();
    expect(validateTokenValue('color', '#00000000')).toBeNull();
    expect(validateTokenValue('color', '#aAbBcCdD')).toBeNull();
  });

  it('rejects a 6-digit hex (#RRGGBB)', () => {
    const e = validateTokenValue('color', '#FF5733');
    expect(e).not.toBeNull();
    expect(e?.field).toBe('value');
  });

  it('rejects a non-hex string', () => {
    expect(validateTokenValue('color', 'red')).not.toBeNull();
    expect(validateTokenValue('color', 'rgba(0,0,0,1)')).not.toBeNull();
  });

  it('rejects non-string types', () => {
    expect(validateTokenValue('color', 123)).not.toBeNull();
    expect(validateTokenValue('color', null)).not.toBeNull();
  });
});

describe('validateTokenValue – dimension', () => {
  it('accepts px values', () => {
    expect(validateTokenValue('dimension', '16px')).toBeNull();
    expect(validateTokenValue('dimension', '0px')).toBeNull();
    expect(validateTokenValue('dimension', '1.5px')).toBeNull();
  });

  it('accepts rem values', () => {
    expect(validateTokenValue('dimension', '1rem')).toBeNull();
    expect(validateTokenValue('dimension', '0.5rem')).toBeNull();
  });

  it('rejects values without suffix', () => {
    expect(validateTokenValue('dimension', '16')).not.toBeNull();
    expect(validateTokenValue('dimension', 16)).not.toBeNull();
  });

  it('rejects other suffixes', () => {
    expect(validateTokenValue('dimension', '16em')).not.toBeNull();
    expect(validateTokenValue('dimension', '100%')).not.toBeNull();
  });

  it('breakpoints category only accepts px', () => {
    expect(validateTokenValue('dimension', '768px', 'breakpoints')).toBeNull();
    expect(validateTokenValue('dimension', '48rem', 'breakpoints')).not.toBeNull();
  });

  it('spacing and border-radius categories accept both px and rem', () => {
    expect(validateTokenValue('dimension', '8px', 'spacing')).toBeNull();
    expect(validateTokenValue('dimension', '0.5rem', 'spacing')).toBeNull();
    expect(validateTokenValue('dimension', '4px', 'border-radius')).toBeNull();
    expect(validateTokenValue('dimension', '0.25rem', 'border-radius')).toBeNull();
  });
});

describe('validateTokenValue – duration', () => {
  it('accepts ms values', () => {
    expect(validateTokenValue('duration', '200ms')).toBeNull();
    expect(validateTokenValue('duration', '0ms')).toBeNull();
    expect(validateTokenValue('duration', '1.5ms')).toBeNull();
  });

  it('rejects values without ms suffix', () => {
    expect(validateTokenValue('duration', '200')).not.toBeNull();
    expect(validateTokenValue('duration', '200s')).not.toBeNull();
    expect(validateTokenValue('duration', 200)).not.toBeNull();
  });
});

describe('validateTokenValue – cubicBezier', () => {
  it('accepts an array of exactly 4 numbers', () => {
    expect(validateTokenValue('cubicBezier', [0.4, 0, 0.2, 1])).toBeNull();
    expect(validateTokenValue('cubicBezier', [0, 0, 1, 1])).toBeNull();
  });

  it('rejects arrays with wrong length', () => {
    expect(validateTokenValue('cubicBezier', [0.4, 0, 0.2])).not.toBeNull();
    expect(validateTokenValue('cubicBezier', [0.4, 0, 0.2, 1, 0])).not.toBeNull();
  });

  it('rejects non-number elements', () => {
    expect(validateTokenValue('cubicBezier', [0.4, 0, '0.2', 1])).not.toBeNull();
    expect(validateTokenValue('cubicBezier', [0.4, 0, NaN, 1])).not.toBeNull();
  });

  it('rejects non-array values', () => {
    expect(validateTokenValue('cubicBezier', '0.4 0 0.2 1')).not.toBeNull();
    expect(validateTokenValue('cubicBezier', { x1: 0.4 })).not.toBeNull();
  });
});

describe('validateTokenValue – shadow', () => {
  const valid = {
    offsetX: '2px',
    offsetY: '4px',
    blur: '8px',
    spread: '0px',
    color: '#00000080',
  };

  it('accepts a fully valid shadow object', () => {
    expect(validateTokenValue('shadow', valid)).toBeNull();
  });

  it('accepts rem dimensions in shadow fields', () => {
    expect(
      validateTokenValue('shadow', { ...valid, offsetX: '0.5rem' })
    ).toBeNull();
  });

  it('rejects missing fields', () => {
    const { color, ...noColor } = valid;
    expect(validateTokenValue('shadow', noColor)).not.toBeNull();

    const { offsetX, ...noOffsetX } = valid;
    expect(validateTokenValue('shadow', noOffsetX)).not.toBeNull();
  });

  it('rejects invalid color in shadow', () => {
    expect(
      validateTokenValue('shadow', { ...valid, color: '#FF0000' })
    ).not.toBeNull();
  });

  it('rejects invalid dimension in shadow fields', () => {
    expect(
      validateTokenValue('shadow', { ...valid, blur: '8' })
    ).not.toBeNull();
    expect(
      validateTokenValue('shadow', { ...valid, spread: '2em' })
    ).not.toBeNull();
  });

  it('rejects non-object values', () => {
    expect(validateTokenValue('shadow', 'drop-shadow(2px 4px 8px)')).not.toBeNull();
    expect(validateTokenValue('shadow', null)).not.toBeNull();
  });
});

describe('validateTokenValue – typography types', () => {
  it('fontFamily: accepts non-empty strings', () => {
    expect(validateTokenValue('fontFamily', 'Inter')).toBeNull();
    expect(validateTokenValue('fontFamily', 'Inter, sans-serif')).toBeNull();
  });

  it('fontFamily: rejects empty string and non-string', () => {
    expect(validateTokenValue('fontFamily', '')).not.toBeNull();
    expect(validateTokenValue('fontFamily', 123)).not.toBeNull();
  });

  it('fontSize: accepts non-empty strings', () => {
    expect(validateTokenValue('fontSize', '16px')).toBeNull();
    expect(validateTokenValue('fontSize', '1rem')).toBeNull();
    expect(validateTokenValue('fontSize', '1em')).toBeNull();
  });

  it('fontSize: rejects empty string and non-string', () => {
    expect(validateTokenValue('fontSize', '')).not.toBeNull();
    expect(validateTokenValue('fontSize', 16)).not.toBeNull();
  });

  it('fontWeight: accepts positive numbers', () => {
    expect(validateTokenValue('fontWeight', 400)).toBeNull();
    expect(validateTokenValue('fontWeight', 700)).toBeNull();
  });

  it('fontWeight: accepts keyword strings', () => {
    expect(validateTokenValue('fontWeight', 'bold')).toBeNull();
    expect(validateTokenValue('fontWeight', 'normal')).toBeNull();
  });

  it('fontWeight: rejects 0, negative, NaN, null', () => {
    expect(validateTokenValue('fontWeight', 0)).not.toBeNull();
    expect(validateTokenValue('fontWeight', -100)).not.toBeNull();
    expect(validateTokenValue('fontWeight', NaN)).not.toBeNull();
    expect(validateTokenValue('fontWeight', null)).not.toBeNull();
  });

  it('lineHeight: accepts non-negative numbers and strings', () => {
    expect(validateTokenValue('lineHeight', 1.5)).toBeNull();
    expect(validateTokenValue('lineHeight', 0)).toBeNull();
    expect(validateTokenValue('lineHeight', '1.5rem')).toBeNull();
  });

  it('lineHeight: rejects negative numbers and invalid types', () => {
    expect(validateTokenValue('lineHeight', -1)).not.toBeNull();
    expect(validateTokenValue('lineHeight', null)).not.toBeNull();
  });

  it('letterSpacing: accepts finite numbers and strings', () => {
    expect(validateTokenValue('letterSpacing', 0)).toBeNull();
    expect(validateTokenValue('letterSpacing', 0.05)).toBeNull();
    expect(validateTokenValue('letterSpacing', '0.05em')).toBeNull();
    expect(validateTokenValue('letterSpacing', '-1px')).toBeNull();
  });

  it('letterSpacing: rejects NaN, Infinity, null', () => {
    expect(validateTokenValue('letterSpacing', NaN)).not.toBeNull();
    expect(validateTokenValue('letterSpacing', Infinity)).not.toBeNull();
    expect(validateTokenValue('letterSpacing', null)).not.toBeNull();
  });
});

describe('validateTokenValue – error shape', () => {
  it('returns a ValidationError with kind="validation" and tokenId=""', () => {
    const e = validateTokenValue('color', 'bad');
    expect(e).toMatchObject({
      kind: 'validation',
      tokenId: '',
      field: 'value',
    });
    expect(typeof e?.message).toBe('string');
    expect(e!.message.length).toBeGreaterThan(0);
  });
});

// ─── validateTokenName ────────────────────────────────────────────────────────

describe('validateTokenName', () => {
  const cat: TokenCategory = 'brand-colors';

  it('accepts a valid unique name', () => {
    expect(validateTokenName('primary', [], cat)).toBeNull();
    expect(validateTokenName('brand-blue', [], cat)).toBeNull();
    expect(validateTokenName('color.brand.primary', [], cat)).toBeNull();
  });

  it('rejects an empty name', () => {
    const e = validateTokenName('', [], cat);
    expect(e).not.toBeNull();
    expect(e?.field).toBe('name');
  });

  it('rejects a name that starts with a digit', () => {
    const e = validateTokenName('1primary', [], cat);
    expect(e).not.toBeNull();
    expect(e?.field).toBe('name');
  });

  it('rejects a name with invalid characters', () => {
    expect(validateTokenName('my token', [], cat)).not.toBeNull();
    expect(validateTokenName('token!', [], cat)).not.toBeNull();
  });

  it('rejects a duplicate name within the same category', () => {
    const existing = ['brand-colors.primary', 'brand-colors.secondary'];
    const e = validateTokenName('primary', existing, 'brand-colors');
    expect(e).not.toBeNull();
    expect(e?.field).toBe('name');
    expect(e?.message).toMatch(/already exists/i);
  });

  it('allows the same name in a different category', () => {
    const existing = ['brand-colors.primary'];
    // "primary" in semantic-colors should be fine
    expect(validateTokenName('primary', existing, 'semantic-colors')).toBeNull();
  });

  it('returns error with kind="validation" and field="name"', () => {
    const e = validateTokenName('', [], cat);
    expect(e?.kind).toBe('validation');
    expect(e?.field).toBe('name');
  });
});
