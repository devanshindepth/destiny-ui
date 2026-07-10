import { describe, it, expect } from 'vitest';
import { transformToDTCG } from './legacy.js';

describe('Legacy Importer', () => {
  it('transforms Style Dictionary value to $value', () => {
    const raw = {
      color: {
        primary: { value: '#FF0000', type: 'color' }
      }
    };
    const result = transformToDTCG(raw, 'style-dictionary') as any;
    expect(result.color.primary.$value).toBe('#FF0000');
    expect(result.color.primary.$type).toBe('color');
    expect(result.color.primary.value).toBeUndefined();
  });

  it('transforms Figma Tokens themes and nested values', () => {
    const raw = {
      global: {
        spacing: {
          sm: { value: '4px', type: 'dimension', description: 'Small spacing' }
        },
        shadow: {
          card: {
            value: {
              offsetX: '0px',
              offsetY: '4px',
              blur: '8px',
              spread: '0px',
              color: '{color.shadow}'
            },
            type: 'shadow'
          }
        }
      }
    };

    const result = transformToDTCG(raw, 'figma-tokens') as any;
    expect(result.global.spacing.sm.$value).toBe('4px');
    expect(result.global.spacing.sm.$type).toBe('dimension');
    expect(result.global.spacing.sm.$description).toBe('Small spacing');

    const shadow = result.global.shadow.card;
    expect(shadow.$value.offsetX).toBe('0px');
    expect(shadow.$value.color).toBe('{color.shadow}');
    expect(shadow.$type).toBe('shadow');
  });
});
