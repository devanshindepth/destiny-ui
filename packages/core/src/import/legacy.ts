export type ImportFormat = 'dtcg' | 'figma-tokens' | 'style-dictionary';

/**
 * Transforms legacy token formats (Figma Tokens, Style Dictionary) into 
 * W3C DTCG format by mapping `value` -> `$value`, `type` -> `$type`, etc.
 */
export function transformToDTCG(raw: unknown, format: ImportFormat): unknown {
  if (format === 'dtcg') return raw;
  
  if (format === 'figma-tokens' || format === 'style-dictionary') {
    return transformLegacyNode(raw);
  }
  
  return raw;
}

function transformLegacyNode(node: unknown): unknown {
  if (typeof node === 'object' && node !== null) {
    if (Array.isArray(node)) {
      return node.map(transformLegacyNode);
    }
    
    // Check if this object looks like a legacy token
    const isLegacyToken = 'value' in node;
    
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (isLegacyToken && k === 'value') {
        result['$value'] = transformLegacyNode(v);
      } else if (isLegacyToken && k === 'type') {
        result['$type'] = v;
      } else if (isLegacyToken && k === 'description') {
        result['$description'] = v;
      } else {
        result[k] = transformLegacyNode(v);
      }
    }
    return result;
  }
  return node;
}
