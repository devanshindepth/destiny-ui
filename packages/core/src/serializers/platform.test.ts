import { describe, it, expect } from 'vitest';
import { buildTokenGraph } from '../graph.js';
import { serializeToSCSS } from './scss.js';
import { serializeToSwift } from './swift.js';
import { serializeToAndroid } from './android.js';
import type { Token } from '../types.js';

function makeToken(
  id: string,
  category: Token['category'],
  type: Token['type'],
  value: Token['value'],
): Token {
  const name = id.split('.').at(-1)!;
  return { id, name, category, type, value, sourceFile: '' };
}

describe('Platform Serializers', () => {
  const tokens = [
    makeToken('color.brand.primary', 'brand-colors', 'color', '#0066FFFF'),
    makeToken('spacing.base', 'spacing', 'dimension', '16px'),
    makeToken('color.alias', 'brand-colors', 'color', { $alias: 'color.brand.primary' }),
  ];

  it('generates SCSS correctly', () => {
    const graph = buildTokenGraph(tokens);
    const scss = serializeToSCSS(graph);
    
    expect(scss).toContain('$brand-colors-primary: #0066FFFF;');
    expect(scss).toContain('$spacing-base: 16px;');
    expect(scss).toContain('$brand-colors-alias: $brand-colors-primary;');
  });

  it('generates Swift correctly', () => {
    const graph = buildTokenGraph(tokens);
    const swift = serializeToSwift(graph);
    
    expect(swift).toContain('public enum Tokens {');
    expect(swift).toContain('public static let brandColorsPrimary = Color(hex: "#0066FFFF")');
    expect(swift).toContain('public static let spacingBase = CGFloat(16)');
    expect(swift).toContain('public static let brandColorsAlias = brandColorsPrimary');
  });

  it('generates Android XML correctly', () => {
    const graph = buildTokenGraph(tokens);
    const android = serializeToAndroid(graph);
    
    expect(android).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(android).toContain('<color name="brand_colors_primary">#0066FFFF</color>');
    expect(android).toContain('<dimen name="spacing_base">16dp</dimen>');
    expect(android).toContain('<color name="brand_colors_alias">@color/brand_colors_primary</color>');
  });
});
