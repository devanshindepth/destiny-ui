import { describe, it, expect } from 'vitest';
import { buildTokenGraph, updateTokenValue } from './graph.js';
import type { Token } from './types.js';

describe('Graph Engine - Conditional Modes', () => {
  it('resolves tokens deeply based on activeMode', () => {
    const tokens: Token[] = [
      {
        id: 'color.base.white',
        name: 'white',
        category: 'brand-colors',
        type: 'color',
        value: '#ffffff',
        sourceFile: '',
      },
      {
        id: 'color.base.black',
        name: 'black',
        category: 'brand-colors',
        type: 'color',
        value: '#000000',
        sourceFile: '',
      },
      {
        id: 'color.bg',
        name: 'bg',
        category: 'brand-colors',
        type: 'color',
        value: { $alias: 'color.base.white' },
        modes: {
          dark: { $alias: 'color.base.black' },
        },
        sourceFile: '',
      },
    ];

    const graph = buildTokenGraph(tokens);
    const bgNode = graph.resolvedCache.get('color.bg');

    expect(bgNode).toBeDefined();
    if (bgNode && !('kind' in bgNode)) {
      expect(bgNode.resolvedValue).toBe('#ffffff');
      expect(bgNode.modes?.dark).toBe('#000000');
    } else {
      throw new Error('Expected ResolvedToken');
    }
  });

  it('detects cycles spanning across modes', () => {
    const tokens: Token[] = [
      {
        id: 'color.a',
        name: 'a',
        category: 'brand-colors',
        type: 'color',
        value: '#ffffff',
        modes: {
          dark: { $alias: 'color.b' },
        },
        sourceFile: '',
      },
      {
        id: 'color.b',
        name: 'b',
        category: 'brand-colors',
        type: 'color',
        value: { $alias: 'color.a' },
        sourceFile: '',
      },
    ];

    const graph = buildTokenGraph(tokens);
    const aNode = graph.resolvedCache.get('color.a');
    const bNode = graph.resolvedCache.get('color.b');

    // Both should be marked as CycleError
    expect(aNode).toBeDefined();
    expect((aNode as any).kind).toBe('cycle');
    
    expect(bNode).toBeDefined();
    expect((bNode as any).kind).toBe('cycle');
  });
});
