import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { buildTokenGraph } from '../graph.js';
import { parseTokenFile } from '../parser.js';
import { serializeToDTCG } from './dtcg.js';
import type { Token } from '../types.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeToken(
  id: string,
  category: Token['category'],
  type: Token['type'],
  value: Token['value'],
  description?: string,
): Token {
  const name = id.split('.').at(-1)!;
  return { id, name, category, type, value, sourceFile: '', ...(description !== undefined ? { description } : {}) };
}

// ─── JSON output ─────────────────────────────────────────────────────────────

describe('serializeToDTCG – JSON output', () => {
  it('produces a nested object with correct $value and $type', () => {
    const token = makeToken(
      'color.brand.primary',
      'brand-colors',
      'color',
      '#0066FFFF',
    );
    const graph = buildTokenGraph([token]);
    const output = serializeToDTCG(graph, { format: 'json' });
    const parsed = JSON.parse(output);

    expect(parsed).toEqual({
      color: {
        brand: {
          primary: {
            $value: '#0066FFFF',
            $type: 'color',
          },
        },
      },
    });
  });

  it('includes $description when present on the token', () => {
    const token = makeToken(
      'color.brand.primary',
      'brand-colors',
      'color',
      '#0066FFFF',
      'Primary brand color',
    );
    const graph = buildTokenGraph([token]);
    const output = serializeToDTCG(graph, { format: 'json' });
    const parsed = JSON.parse(output);

    expect(parsed.color.brand.primary.$description).toBe('Primary brand color');
  });

  it('serializes nested aliases in composite tokens back to {token.id} syntax', () => {
    const token = makeToken(
      'shadow.card',
      'shadows',
      'shadow',
      {
        offsetX: '0px',
        offsetY: '4px',
        blur: '8px',
        spread: '0px',
        color: { $alias: 'color.shadow' }
      }
    );
    const graph = buildTokenGraph([token]);
    const output = serializeToDTCG(graph, { format: 'json' });
    const parsed = JSON.parse(output);

    expect(parsed.shadow.card.$value.color).toBe('{color.shadow}');
  });

  it('omits $description when absent', () => {
    const token = makeToken('spacing.base', 'spacing', 'dimension', '16px');
    const graph = buildTokenGraph([token]);
    const output = serializeToDTCG(graph, { format: 'json' });
    const parsed = JSON.parse(output);

    expect(parsed.spacing.base).not.toHaveProperty('$description');
  });

  it('serializes numeric value as-is', () => {
    const token = makeToken('typography.bold', 'typography', 'fontWeight', 700);
    const graph = buildTokenGraph([token]);
    const output = serializeToDTCG(graph, { format: 'json' });
    const parsed = JSON.parse(output);
    expect(parsed.typography.bold.$value).toBe(700);
  });

  it('serializes cubicBezier array as-is', () => {
    const token = makeToken('motion.ease', 'motion', 'cubicBezier', [0.4, 0, 0.2, 1]);
    const graph = buildTokenGraph([token]);
    const output = serializeToDTCG(graph, { format: 'json' });
    const parsed = JSON.parse(output);
    expect(parsed.motion.ease.$value).toEqual([0.4, 0, 0.2, 1]);
  });

  it('serializes shadow object as a nested DTCG value object', () => {
    const shadow = { offsetX: '0px', offsetY: '4px', blur: '8px', spread: '0px', color: '#00000040' };
    const token = makeToken('shadows.card', 'shadows', 'shadow', shadow);
    const graph = buildTokenGraph([token]);
    const output = serializeToDTCG(graph, { format: 'json' });
    const parsed = JSON.parse(output);
    expect(parsed.shadows.card.$value).toEqual(shadow);
  });

  it('returns "{}" for an empty graph', () => {
    const graph = buildTokenGraph([]);
    const output = serializeToDTCG(graph, { format: 'json' });
    expect(output).toBe('{}');
  });

  it('nests multiple tokens sharing a common path prefix', () => {
    const primary = makeToken('color.brand.primary', 'brand-colors', 'color', '#0066FFFF');
    const secondary = makeToken('color.brand.secondary', 'brand-colors', 'color', '#FF0000FF');
    const graph = buildTokenGraph([primary, secondary]);
    const output = serializeToDTCG(graph, { format: 'json' });
    const parsed = JSON.parse(output);

    expect(parsed.color.brand.primary.$value).toBe('#0066FFFF');
    expect(parsed.color.brand.secondary.$value).toBe('#FF0000FF');
  });
});

// ─── Alias tokens ─────────────────────────────────────────────────────────────

describe('serializeToDTCG – alias tokens', () => {
  it('emits $value as "{target.id}" curly-brace syntax', () => {
    const primary = makeToken('color.brand.primary', 'brand-colors', 'color', '#0066FFFF');
    const action = makeToken(
      'color.semantic.action',
      'semantic-colors',
      'color',
      { $alias: 'color.brand.primary' },
    );
    const graph = buildTokenGraph([primary, action]);
    const output = serializeToDTCG(graph, { format: 'json' });
    const parsed = JSON.parse(output);

    expect(parsed.color.semantic.action.$value).toBe('{color.brand.primary}');
  });

  it('emits $type from the alias token, not the referenced token', () => {
    const base = makeToken('spacing.sm', 'spacing', 'dimension', '8px');
    const alias = makeToken('border-radius.tight', 'border-radius', 'dimension', { $alias: 'spacing.sm' });
    const graph = buildTokenGraph([base, alias]);
    const output = serializeToDTCG(graph, { format: 'json' });
    const parsed = JSON.parse(output);

    expect(parsed['border-radius'].tight.$type).toBe('dimension');
    expect(parsed['border-radius'].tight.$value).toBe('{spacing.sm}');
  });
});

// ─── YAML output ─────────────────────────────────────────────────────────────

describe('serializeToDTCG – YAML output', () => {
  it('produces valid YAML that re-parses to the same structure as JSON', () => {
    const primary = makeToken('color.brand.primary', 'brand-colors', 'color', '#0066FFFF', 'Brand primary');
    const spacing = makeToken('spacing.base', 'spacing', 'dimension', '16px');
    const graph = buildTokenGraph([primary, spacing]);

    const jsonOutput = serializeToDTCG(graph, { format: 'json' });
    const yamlOutput = serializeToDTCG(graph, { format: 'yaml' });

    const fromJson = JSON.parse(jsonOutput);
    const fromYaml = yaml.load(yamlOutput);

    expect(fromYaml).toEqual(fromJson);
  });

  it('produces a non-empty string for a non-empty graph', () => {
    const token = makeToken('spacing.base', 'spacing', 'dimension', '16px');
    const graph = buildTokenGraph([token]);
    const output = serializeToDTCG(graph, { format: 'yaml' });
    expect(output.length).toBeGreaterThan(0);
  });

  it('produces empty YAML document for an empty graph', () => {
    const graph = buildTokenGraph([]);
    const output = serializeToDTCG(graph, { format: 'yaml' });
    // yaml.dump({}) produces "{}\n"
    const reparsed = yaml.load(output);
    expect(reparsed).toEqual({});
  });
});

// ─── Round-trip: JSON ─────────────────────────────────────────────────────────

describe('serializeToDTCG – round-trip JSON', () => {
  it('parseTokenFile(serializeToDTCG(graph, json)) returns equivalent tokens', () => {
    const primary = makeToken('color.brand.primary', 'brand-colors', 'color', '#0066FFFF', 'Main color');
    const spacing = makeToken('spacing.base', 'spacing', 'dimension', '16px');
    const graph = buildTokenGraph([primary, spacing]);

    const serialized = serializeToDTCG(graph, { format: 'json' });
    const result = parseTokenFile(serialized, 'json');

    expect(result.errors).toHaveLength(0);

    const byId = new Map(result.tokens.map((t) => [t.id, t]));

    const parsedPrimary = byId.get('color.brand.primary');
    expect(parsedPrimary).toBeDefined();
    expect(parsedPrimary!.value).toBe('#0066FFFF');
    expect(parsedPrimary!.type).toBe('color');
    expect(parsedPrimary!.description).toBe('Main color');

    const parsedSpacing = byId.get('spacing.base');
    expect(parsedSpacing).toBeDefined();
    expect(parsedSpacing!.value).toBe('16px');
    expect(parsedSpacing!.type).toBe('dimension');
  });

  it('round-trips alias tokens with curly-brace syntax through the parser', () => {
    const primary = makeToken('color.brand.primary', 'brand-colors', 'color', '#0066FFFF');
    const action = makeToken(
      'color.semantic.action',
      'semantic-colors',
      'color',
      { $alias: 'color.brand.primary' },
    );
    const graph = buildTokenGraph([primary, action]);

    const serialized = serializeToDTCG(graph, { format: 'json' });
    const result = parseTokenFile(serialized, 'json');

    expect(result.errors).toHaveLength(0);

    const parsedAlias = result.tokens.find((t) => t.id === 'color.semantic.action');
    expect(parsedAlias).toBeDefined();
    expect(parsedAlias!.value).toEqual({ $alias: 'color.brand.primary' });
  });
});

// ─── Round-trip: YAML ─────────────────────────────────────────────────────────

describe('serializeToDTCG – round-trip YAML', () => {
  it('parseTokenFile(serializeToDTCG(graph, yaml)) returns equivalent tokens', () => {
    const primary = makeToken('color.brand.primary', 'brand-colors', 'color', '#0066FFFF');
    const spacing = makeToken('spacing.base', 'spacing', 'dimension', '16px');
    const graph = buildTokenGraph([primary, spacing]);

    const serialized = serializeToDTCG(graph, { format: 'yaml' });
    const result = parseTokenFile(serialized, 'yaml');

    expect(result.errors).toHaveLength(0);

    const byId = new Map(result.tokens.map((t) => [t.id, t]));
    expect(byId.get('color.brand.primary')?.value).toBe('#0066FFFF');
    expect(byId.get('spacing.base')?.value).toBe('16px');
  });

  it('round-trips alias tokens via YAML', () => {
    const base = makeToken('spacing.sm', 'spacing', 'dimension', '8px');
    const alias = makeToken(
      'border-radius.tight',
      'border-radius',
      'dimension',
      { $alias: 'spacing.sm' },
    );
    const graph = buildTokenGraph([base, alias]);

    const serialized = serializeToDTCG(graph, { format: 'yaml' });
    const result = parseTokenFile(serialized, 'yaml');

    expect(result.errors).toHaveLength(0);

    const parsedAlias = result.tokens.find((t) => t.id === 'border-radius.tight');
    expect(parsedAlias).toBeDefined();
    expect(parsedAlias!.value).toEqual({ $alias: 'spacing.sm' });
  });
});
