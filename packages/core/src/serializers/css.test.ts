import { describe, it, expect } from 'vitest';
import { buildTokenGraph } from '../graph.js';
import { serializeToCSS } from './css.js';
import type { Token } from '../types.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeToken(
  id: string,
  name: string,
  category: Token['category'],
  type: Token['type'],
  value: Token['value'],
): Token {
  return { id, name, category, type, value, sourceFile: '' };
}

// ─── Basic output ─────────────────────────────────────────────────────────────

describe('serializeToCSS – basic output', () => {
  it('wraps declarations in :root { }', () => {
    const token = makeToken(
      'brand-colors.primary',
      'primary',
      'brand-colors',
      'color',
      '#0066FFFF',
    );
    const graph = buildTokenGraph([token]);
    const css = serializeToCSS(graph);
    expect(css).toMatch(/^:root \{/);
    expect(css).toMatch(/\}\n$/);
  });

  it('emits --{category}-{name}: {value};', () => {
    const token = makeToken(
      'spacing.base',
      'base',
      'spacing',
      'dimension',
      '16px',
    );
    const graph = buildTokenGraph([token]);
    const css = serializeToCSS(graph);
    expect(css).toContain('  --spacing-base: 16px;');
  });

  it('returns :root {}\\n for an empty graph', () => {
    const graph = buildTokenGraph([]);
    const css = serializeToCSS(graph);
    expect(css).toBe(':root {}\n');
  });
});

// ─── Value serialization ──────────────────────────────────────────────────────

describe('serializeToCSS – value serialization', () => {
  it('serializes color string as-is', () => {
    const token = makeToken(
      'brand-colors.accent',
      'accent',
      'brand-colors',
      'color',
      '#FF5733FF',
    );
    const graph = buildTokenGraph([token]);
    expect(serializeToCSS(graph)).toContain('--brand-colors-accent: #FF5733FF;');
  });

  it('serializes numeric value (fontWeight)', () => {
    const token = makeToken(
      'typography.bold',
      'bold',
      'typography',
      'fontWeight',
      700,
    );
    const graph = buildTokenGraph([token]);
    expect(serializeToCSS(graph)).toContain('--typography-bold: 700;');
  });

  it('serializes cubicBezier array as cubic-bezier(…)', () => {
    const token = makeToken(
      'motion.ease',
      'ease',
      'motion',
      'cubicBezier',
      [0.4, 0, 0.2, 1],
    );
    const graph = buildTokenGraph([token]);
    expect(serializeToCSS(graph)).toContain(
      '--motion-ease: cubic-bezier(0.4, 0, 0.2, 1);',
    );
  });

  it('serializes shadow object as offsetX offsetY blur spread color', () => {
    const token = makeToken(
      'shadows.card',
      'card',
      'shadows',
      'shadow',
      { offsetX: '0px', offsetY: '4px', blur: '8px', spread: '0px', color: '#00000040' },
    );
    const graph = buildTokenGraph([token]);
    expect(serializeToCSS(graph)).toContain(
      '--shadows-card: 0px 4px 8px 0px #00000040;',
    );
  });
});

// ─── Alias tokens ─────────────────────────────────────────────────────────────

describe('serializeToCSS – alias tokens', () => {
  it('emits var(--{category}-{name}) for alias tokens, not the resolved value', () => {
    const primary = makeToken(
      'brand-colors.primary',
      'primary',
      'brand-colors',
      'color',
      '#0066FFFF',
    );
    const action = makeToken(
      'semantic-colors.action',
      'action',
      'semantic-colors',
      'color',
      { $alias: 'brand-colors.primary' },
    );
    const graph = buildTokenGraph([primary, action]);
    const css = serializeToCSS(graph);
    expect(css).toContain('--semantic-colors-action: var(--brand-colors-primary);');
    // Must NOT emit the resolved primitive for the alias token
    expect(css).not.toMatch(/--semantic-colors-action: #0066FFFF/);
  });

  it('uses the referenced token\'s category and name in var()', () => {
    const base = makeToken(
      'spacing.sm',
      'sm',
      'spacing',
      'dimension',
      '8px',
    );
    const alias = makeToken(
      'border-radius.tight',
      'tight',
      'border-radius',
      'dimension',
      { $alias: 'spacing.sm' },
    );
    const graph = buildTokenGraph([base, alias]);
    const css = serializeToCSS(graph);
    expect(css).toContain('--border-radius-tight: var(--spacing-sm);');
  });
});

// ─── Ordering ─────────────────────────────────────────────────────────────────

describe('serializeToCSS – ordering', () => {
  it('sorts by canonical category order', () => {
    const spacing = makeToken('spacing.base', 'base', 'spacing', 'dimension', '8px');
    const brand = makeToken('brand-colors.primary', 'primary', 'brand-colors', 'color', '#000000FF');
    const motion = makeToken('motion.fast', 'fast', 'motion', 'duration', '150ms');
    const graph = buildTokenGraph([spacing, brand, motion]);
    const css = serializeToCSS(graph);
    const brandPos = css.indexOf('--brand-colors-');
    const spacingPos = css.indexOf('--spacing-');
    const motionPos = css.indexOf('--motion-');
    expect(brandPos).toBeLessThan(spacingPos);
    expect(spacingPos).toBeLessThan(motionPos);
  });

  it('sorts alphabetically within a category', () => {
    const z = makeToken('spacing.z-space', 'z-space', 'spacing', 'dimension', '32px');
    const a = makeToken('spacing.a-space', 'a-space', 'spacing', 'dimension', '4px');
    const m = makeToken('spacing.m-space', 'm-space', 'spacing', 'dimension', '16px');
    const graph = buildTokenGraph([z, a, m]);
    const css = serializeToCSS(graph);
    const posA = css.indexOf('--spacing-a-space');
    const posM = css.indexOf('--spacing-m-space');
    const posZ = css.indexOf('--spacing-z-space');
    expect(posA).toBeLessThan(posM);
    expect(posM).toBeLessThan(posZ);
  });
});

// ─── Delta output (tokenIds filter) ───────────────────────────────────────────

describe('serializeToCSS – delta output', () => {
  it('emits only tokens in tokenIds when provided', () => {
    const primary = makeToken('brand-colors.primary', 'primary', 'brand-colors', 'color', '#0066FFFF');
    const secondary = makeToken('brand-colors.secondary', 'secondary', 'brand-colors', 'color', '#FF0000FF');
    const graph = buildTokenGraph([primary, secondary]);
    const css = serializeToCSS(graph, { tokenIds: ['brand-colors.primary'] });
    expect(css).toContain('--brand-colors-primary:');
    expect(css).not.toContain('--brand-colors-secondary:');
  });

  it('returns :root {}\\n when tokenIds is an empty array', () => {
    const token = makeToken('spacing.base', 'base', 'spacing', 'dimension', '8px');
    const graph = buildTokenGraph([token]);
    const css = serializeToCSS(graph, { tokenIds: [] });
    expect(css).toBe(':root {}\n');
  });

  it('emits all tokens when tokenIds is undefined', () => {
    const a = makeToken('brand-colors.a', 'a', 'brand-colors', 'color', '#111111FF');
    const b = makeToken('brand-colors.b', 'b', 'brand-colors', 'color', '#222222FF');
    const graph = buildTokenGraph([a, b]);
    const css = serializeToCSS(graph, {});
    expect(css).toContain('--brand-colors-a:');
    expect(css).toContain('--brand-colors-b:');
  });
});
