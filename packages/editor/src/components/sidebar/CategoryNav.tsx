import { TOKEN_CATEGORIES } from '@destiny-ui/core';
import { useTokenStore } from '../../stores/index.js';

function formatCategory(cat: string): string {
  return cat
    .split('-')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

export function CategoryNav() {
  const selectedCategory = useTokenStore((s) => s.selectedCategory);
  const selectCategory = useTokenStore((s) => s.selectCategory);
  const tokens = useTokenStore((s) => s.tokens);

  const allCount = tokens.size;

  return (
    <nav class="category-nav" aria-label="Token categories" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <button 
        class={`category-heading ${selectedCategory === null ? 'active' : ''}`}
        onClick={() => selectCategory(null)}
        style={{ 
          width: '100%', textAlign: 'left', background: selectedCategory === null ? 'rgba(134, 185, 176, 0.1)' : 'transparent', 
          border: 'none', cursor: 'pointer', padding: '8px', color: selectedCategory === null ? '#86b9b0' : 'inherit',
          borderRadius: '4px'
        }}
      >
        All Tokens ({allCount})
      </button>

      {TOKEN_CATEGORIES.map((cat) => {
        const count = Array.from(tokens.values()).filter(t => t.token.category === cat).length;
        if (count === 0) return null;

        const isActive = selectedCategory === cat;
        return (
          <button 
            key={cat}
            class={`category-heading ${isActive ? 'active' : ''}`}
            onClick={() => selectCategory(cat)}
            style={{ 
              width: '100%', textAlign: 'left', background: isActive ? 'rgba(134, 185, 176, 0.1)' : 'transparent', 
              border: 'none', cursor: 'pointer', padding: '8px', paddingLeft: '16px',
              color: isActive ? '#86b9b0' : 'inherit', borderRadius: '4px'
            }}
          >
            {formatCategory(cat)} ({count})
          </button>
        );
      })}
    </nav>
  );
}
