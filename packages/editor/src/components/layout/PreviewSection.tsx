import { useState, useMemo } from 'preact/hooks';
import { PreviewFrame } from '../PreviewFrame.js';
import { useTokenStore } from '../../stores/index.js';
import { 
  buildTokenGraph, 
  serializeToCSS, 
  serializeToSCSS, 
  serializeToSwift, 
  serializeToAndroid 
} from '@destiny-ui/core';

export function PreviewSection() {
  const [activeTab, setActiveTab] = useState<'ui' | 'css' | 'scss' | 'swift' | 'android'>('ui');
  const tokensMap = useTokenStore((s) => s.tokens);

  const generatedCode = useMemo(() => {
    if (activeTab === 'ui') return '';
    const tokenArray = Array.from(tokensMap.values()).map((rt) => rt.token);
    try {
      const graph = buildTokenGraph(tokenArray);
      if (activeTab === 'css') return serializeToCSS(graph);
      if (activeTab === 'scss') return serializeToSCSS(graph);
      if (activeTab === 'swift') return serializeToSwift(graph);
      if (activeTab === 'android') return serializeToAndroid(graph);
    } catch (e) {
      return `Error generating code: ${String(e)}`;
    }
    return '';
  }, [activeTab, tokensMap]);

  return (
    <section class="preview-section" data-testid="preview-section" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', marginBottom: '16px' }}>
        {(['ui', 'css', 'scss', 'swift', 'android'] as const).map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{ 
              background: 'transparent', 
              border: 'none', 
              borderBottom: activeTab === tab ? '2px solid var(--color-brand)' : '2px solid transparent',
              padding: '8px 16px', 
              cursor: 'pointer',
              color: activeTab === tab ? 'var(--color-brand)' : 'var(--color-text-secondary)',
              textTransform: 'uppercase',
              fontWeight: 600,
              fontSize: '0.8rem'
            }}
          >
            {tab}
          </button>
        ))}
      </div>
      
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {activeTab === 'ui' ? (
          <PreviewFrame />
        ) : (
          <pre style={{ 
            background: 'var(--color-surface)', 
            padding: '16px', 
            borderRadius: '8px', 
            overflowX: 'auto',
            color: 'var(--color-text-primary)',
            fontSize: '0.9rem',
            fontFamily: 'monospace',
            margin: 0,
            border: '1px solid var(--color-border)'
          }}>
            {generatedCode}
          </pre>
        )}
      </div>
    </section>
  );
}
