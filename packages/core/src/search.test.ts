import { describe, it, expect } from 'vitest';
import { filterTokens } from './search.js';
import type { ResolvedToken, Token } from './types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeToken(overrides: Partial<Token> = {}): Token {
  return {
    id: 'color.brand.primary',
    name: 'primary',
    category: 'brand-colors',
    type: 'color',
    value: '#0066FFFF',
    sourceFile: '/tokens/colors.json',
    ...overrides,
  };
}

function makeResolved(tokenOverrides: Partial<Token> = {}): ResolvedToken {
  const token = makeToken(tokenOverrides);
  return {
    token,
    resolvedValue: typeof token.value === 'object' && '$alias' in token.value
      ? '#0066FFFF'
      : token.value as ResolvedToken['resolvedValue'],
    aliasChain: [],
  };
}

// ─── Empty query ──────────────────────────────────────────────────────────────

describe('filterTokens – empty query', () => {
  it('returns all tokens when query is empty string', () => {
    const tokens = [
      makeResolved({ name: 'primary', type: 'color', value: '#0066FFFF' }),
      makeResolved({ id: 'spacing.4', name: '4', category: 'spacing', type: 'dimension', value: '16px' }),
    ];
    const result = filterTokens(tokens, '');
    expect(result).toBe(tokens); // same reference
    expect(result).toHaveLength(2);
  });

  it('returns empty array unchanged when query is empty string', () => {
    const result = filterTokens([], '');
    expect(result).toEqual([]);
  });
});

// ─── Name matching ────────────────────────────────────────────────────────────

describe('filterTokens – name matching', () => {
  it('matches token by exact name', () => {
    const tokens = [
      makeResolved({ name: 'primary' }),
      makeResolved({ id: 'color.brand.secondary', name: 'secondary' }),
    ];
    const result = filterTokens(tokens, 'primary');
    expect(result).toHaveLength(1);
    expect(result[0].token.name).toBe('primary');
  });

  it('matches name case-insensitively', () => {
    const tokens = [makeResolved({ name: 'Primary' })];
    expect(filterTokens(tokens, 'primary')).toHaveLength(1);
    expect(filterTokens(tokens, 'PRIMARY')).toHaveLength(1);
    expect(filterTokens(tokens, 'pRiMaRy')).toHaveLength(1);
  });

  it('matches partial substring of name', () => {
    const tokens = [makeResolved({ name: 'brand-primary' })];
    expect(filterTokens(tokens, 'prim')).toHaveLength(1);
  });

  it('does not match when name does not contain query', () => {
    const tokens = [makeResolved({ name: 'primary' })];
    expect(filterTokens(tokens, 'secondary')).toHaveLength(0);
  });
});

// ─── Type matching ────────────────────────────────────────────────────────────

describe('filterTokens – type matching', () => {
  it('matches token by exact type', () => {
    const tokens = [
      makeResolved({ type: 'color' }),
      makeResolved({ id: 'spacing.4', name: '4', category: 'spacing', type: 'dimension', value: '16px' }),
    ];
    const result = filterTokens(tokens, 'dimension');
    expect(result).toHaveLength(1);
    expect(result[0].token.type).toBe('dimension');
  });

  it('matches type case-insensitively', () => {
    const tokens = [makeResolved({ type: 'color' })];
    expect(filterTokens(tokens, 'COLOR')).toHaveLength(1);
    expect(filterTokens(tokens, 'Color')).toHaveLength(1);
  });

  it('matches partial substring of type', () => {
    const tokens = [
      makeResolved({ type: 'fontFamily', name: 'base', category: 'typography', value: 'Inter' }),
    ];
    expect(filterTokens(tokens, 'font')).toHaveLength(1);
  });
});

// ─── Value matching ───────────────────────────────────────────────────────────

describe('filterTokens – value matching', () => {
  it('matches string value (color hex)', () => {
    const tokens = [makeResolved({ value: '#0066FFFF' })];
    expect(filterTokens(tokens, '0066FF')).toHaveLength(1);
  });

  it('matches string value case-insensitively', () => {
    const tokens = [makeResolved({ value: '#0066FFFF' })];
    expect(filterTokens(tokens, '0066ff')).toHaveLength(1);
    expect(filterTokens(tokens, '0066FF')).toHaveLength(1);
  });

  it('matches number value by stringified form', () => {
    const tokens = [
      makeResolved({ type: 'fontWeight', name: 'bold', category: 'typography', value: 700 }),
    ];
    expect(filterTokens(tokens, '700')).toHaveLength(1);
  });

  it('matches alias value by {$alias} stringified form', () => {
    const aliasValue = { $alias: 'color.brand.primary' };
    const rt: ResolvedToken = {
      token: makeToken({ value: aliasValue }),
      resolvedValue: '#0066FFFF',
      aliasChain: ['color.brand.primary'],
    };
    // alias is stringified as "{color.brand.primary}"
    expect(filterTokens([rt], 'color.brand.primary')).toHaveLength(1);
    expect(filterTokens([rt], '{color.brand.primary}')).toHaveLength(1);
  });

  it('matches shadow value via JSON stringify', () => {
    const shadowValue = {
      offsetX: '0px',
      offsetY: '4px',
      blur: '8px',
      spread: '0px',
      color: '#00000040',
    };
    const rt: ResolvedToken = {
      token: makeToken({ type: 'shadow', category: 'shadows', value: shadowValue }),
      resolvedValue: shadowValue,
      aliasChain: [],
    };
    expect(filterTokens([rt], 'offsetX')).toHaveLength(1);
    expect(filterTokens([rt], '0000040')).toHaveLength(1);
  });

  it('matches cubicBezier array value via JSON stringify', () => {
    const bezier = [0.4, 0, 0.2, 1];
    const rt: ResolvedToken = {
      token: makeToken({ type: 'cubicBezier', category: 'motion', value: bezier }),
      resolvedValue: bezier,
      aliasChain: [],
    };
    expect(filterTokens([rt], '0.4')).toHaveLength(1);
    expect(filterTokens([rt], '0.2,1')).toHaveLength(1);
  });

  it('does not match when value does not contain query', () => {
    const tokens = [makeResolved({ value: '#0066FFFF' })];
    expect(filterTokens(tokens, 'AABBCC')).toHaveLength(0);
  });
});

// ─── Multi-field and order ────────────────────────────────────────────────────

describe('filterTokens – multi-field and ordering', () => {
  it('returns all tokens that match any field', () => {
    const tokens = [
      makeResolved({ name: 'color-token', type: 'dimension', value: '16px' }),   // matches name
      makeResolved({ id: 'spacing.4', name: 'base', category: 'spacing', type: 'color', value: '16px' }), // matches type
      makeResolved({ id: 'spacing.8', name: 'wide', category: 'spacing', type: 'dimension', value: 'color' }), // matches value
      makeResolved({ id: 'shadows.card', name: 'card', category: 'shadows', type: 'shadow', value: '8px' }), // no match
    ];
    const result = filterTokens(tokens, 'color');
    expect(result).toHaveLength(3);
  });

  it('preserves original order', () => {
    const tokens = [
      makeResolved({ id: 'a', name: 'alpha' }),
      makeResolved({ id: 'b', name: 'beta' }),
      makeResolved({ id: 'c', name: 'alpha-secondary' }),
    ];
    const result = filterTokens(tokens, 'alpha');
    expect(result.map((r) => r.token.id)).toEqual(['a', 'c']);
  });

  it('returns empty array when nothing matches', () => {
    const tokens = [
      makeResolved({ name: 'primary', type: 'color', value: '#0066FFFF' }),
    ];
    expect(filterTokens(tokens, 'zzznomatch')).toHaveLength(0);
  });

  it('mixed-case query matches lowercase field value', () => {
    const tokens = [makeResolved({ name: 'primary' })];
    expect(filterTokens(tokens, 'PRImary')).toHaveLength(1);
  });
});
