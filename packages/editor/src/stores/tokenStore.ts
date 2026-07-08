import { create } from 'zustand';
import { filterTokens } from '@destiny-ui/core';
import type { ResolvedToken, TokenError } from '@destiny-ui/core';

interface TokenStoreState {
  tokens: Map<string, ResolvedToken>;
  errors: TokenError[];
  selectedTokenId: string | null;
  searchQuery: string;
  // computed selector (not stored state)
  filteredTokens: () => ResolvedToken[];
  // actions
  setTokens: (tokens: Map<string, ResolvedToken>) => void;
  setErrors: (errors: TokenError[]) => void;
  selectToken: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
}

export const useTokenStore = create<TokenStoreState>()((set, get) => ({
  tokens: new Map(),
  errors: [],
  selectedTokenId: null,
  searchQuery: '',
  filteredTokens: () => {
    const { tokens, searchQuery } = get();
    return filterTokens(Array.from(tokens.values()), searchQuery);
  },
  setTokens: (tokens) => set({ tokens }),
  setErrors: (errors) => set({ errors }),
  selectToken: (id) => set({ selectedTokenId: id }),
  setSearchQuery: (q) => set({ searchQuery: q }),
}));
