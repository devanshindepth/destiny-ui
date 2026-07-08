import { TOKEN_CATEGORIES } from '@destiny-ui/core';
import { useTokenStore } from '../../stores';
import { TokenList } from './TokenList';

function formatCategory(cat: string): string {
  return cat
    .split('-')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

export function CategoryNav() {
  const filteredTokens = useTokenStore((s) => s.filteredTokens)();

  if (filteredTokens.length === 0) {
    return (
      <div class="no-results" role="status">
        No tokens match your search.
      </div>
    );
  }

  const grouped = TOKEN_CATEGORIES.map((cat) => ({
    category: cat,
    tokens: filteredTokens.filter((rt) => rt.token.category === cat),
  })).filter((g) => g.tokens.length > 0);

  return (
    <nav class="category-nav" aria-label="Token categories">
      {grouped.map(({ category, tokens }) => (
        <section key={category} class="category-section">
          <h2 class="category-heading">{formatCategory(category)}</h2>
          <TokenList tokens={tokens} />
        </section>
      ))}
    </nav>
  );
}
