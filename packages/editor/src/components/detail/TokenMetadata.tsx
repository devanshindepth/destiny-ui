import type { Token } from '@destiny-ui/core';

interface TokenMetadataProps {
  token: Token;
}

export function TokenMetadata({ token }: TokenMetadataProps) {
  return (
    <section class="token-metadata" aria-label="Token metadata">
      <dl class="token-metadata__grid">
        <div class="token-metadata__row">
          <dt class="token-metadata__label">Name</dt>
          <dd class="token-metadata__value">{token.name}</dd>
        </div>
        <div class="token-metadata__row">
          <dt class="token-metadata__label">ID</dt>
          <dd class="token-metadata__value token-metadata__value--mono">{token.id}</dd>
        </div>
        <div class="token-metadata__row">
          <dt class="token-metadata__label">Category</dt>
          <dd class="token-metadata__value">{token.category}</dd>
        </div>
        <div class="token-metadata__row">
          <dt class="token-metadata__label">Type</dt>
          <dd class="token-metadata__value">{token.type}</dd>
        </div>
        {token.description && (
          <div class="token-metadata__row">
            <dt class="token-metadata__label">Description</dt>
            <dd class="token-metadata__value">{token.description}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
