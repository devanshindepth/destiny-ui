import type { ResolvedToken } from '@destiny-ui/core';
import { TokenRow } from './TokenRow';

interface TokenListProps {
  tokens: ResolvedToken[];
}

export function TokenList({ tokens }: TokenListProps) {
  return (
    <ul class="token-list" role="list">
      {tokens.map((rt) => (
        <TokenRow key={rt.token.id} resolvedToken={rt} />
      ))}
    </ul>
  );
}
