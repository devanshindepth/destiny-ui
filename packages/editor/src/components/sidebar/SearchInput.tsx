import { useTokenStore } from '../../stores';

export function SearchInput() {
  const searchQuery = useTokenStore((s) => s.searchQuery);
  const setSearchQuery = useTokenStore((s) => s.setSearchQuery);

  return (
    <div class="search-container">
      <input
        type="search"
        class="search-input"
        placeholder="Search tokens..."
        value={searchQuery}
        onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
        aria-label="Search tokens"
      />
    </div>
  );
}
