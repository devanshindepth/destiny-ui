import { useState, useEffect } from 'preact/hooks';
import { useTokenStore } from '../../stores/index.js';
import type { ResolvedToken, TokenValue } from '@destiny-ui/core';
import { isAlias } from '@destiny-ui/core';

export function TokenGrid() {
  const selectedCategory = useTokenStore((s) => s.selectedCategory);
  const selectToken = useTokenStore((s) => s.selectToken);
  const filteredTokens = useTokenStore((s) => s.filteredTokens)();
  const setTokens = useTokenStore((s) => s.setTokens);

  // Get tokens for the grid
  const gridTokens = selectedCategory 
    ? filteredTokens.filter(rt => rt.token.category === selectedCategory)
    : filteredTokens;

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Clear selection if category changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectedCategory]);

  const toggleAll = (e: Event) => {
    const checked = (e.target as HTMLInputElement).checked;
    if (checked) {
      setSelectedIds(new Set(gridTokens.map(t => t.token.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // Bulk delete
  const [isDeleting, setIsDeleting] = useState(false);
  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);
    try {
      // Very simple bulk delete (iterating) - in a real app you might want a bulk delete API.
      // But we can just use Promise.all or run them sequentially.
      for (const id of selectedIds) {
        // Skip confirm for bulk delete in this prototype, or assume force=true.
        await fetch(`/api/tokens/${encodeURIComponent(id)}?confirm=true`, { method: 'DELETE' });
      }
      
      // Reload tokens from server to get accurate state
      const res = await fetch('/api/tokens');
      const data = await res.json();
      const map = new Map(data.map((rt: ResolvedToken) => [rt.token.id, rt]));
      setTokens(map);
      setSelectedIds(new Set());
    } catch (e) {
      console.error("Bulk delete failed", e);
    } finally {
      setIsDeleting(false);
    }
  };

  // Inline edit
  const handleInlineEdit = async (id: string, value: string) => {
    // If it starts with { and ends with }, treat as alias
    let newVal: TokenValue = value;
    if (value.startsWith('{') && value.endsWith('}')) {
      newVal = { $alias: value.slice(1, -1) };
    }

    try {
      const res = await fetch(`/api/tokens/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: newVal }),
      });
      const result = await res.json();
      if (!result.errors || result.errors.length === 0) {
        const map = new Map(result.data.map((rt: ResolvedToken) => [rt.token.id, rt]));
        setTokens(map);
      }
    } catch (e) {
      console.error("Inline edit failed", e);
    }
  };

  if (gridTokens.length === 0) {
    return (
      <main class="token-grid-container" style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
        <p style={{ color: 'var(--color-text-secondary)' }}>No tokens found.</p>
      </main>
    );
  }

  const allSelected = gridTokens.length > 0 && selectedIds.size === gridTokens.length;
  const indeterminate = selectedIds.size > 0 && selectedIds.size < gridTokens.length;

  return (
    <main class="token-grid-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px', overflowY: 'auto' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {selectedCategory ? selectedCategory : 'All Tokens'}
        </h2>
        {selectedIds.size > 0 && (
          <button 
            class="btn btn--danger"
            onClick={handleDeleteSelected}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : `Delete Selected (${selectedIds.size})`}
          </button>
        )}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
            <th style={{ padding: '8px' }}>
              <input 
                type="checkbox" 
                checked={allSelected} 
                ref={el => { if (el) el.indeterminate = indeterminate; }}
                onChange={toggleAll} 
              />
            </th>
            <th style={{ padding: '8px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Name</th>
            <th style={{ padding: '8px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Value</th>
            <th style={{ padding: '8px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Type</th>
            <th style={{ padding: '8px' }}></th>
          </tr>
        </thead>
        <tbody>
          {gridTokens.map((rt) => {
            const valString = isAlias(rt.token.value) 
              ? `{${rt.token.value.$alias}}` 
              : typeof rt.token.value === 'object' 
                ? '[Composite]' 
                : String(rt.token.value);
            
            const isPrimitive = typeof rt.token.value !== 'object' || isAlias(rt.token.value);

            return (
              <tr key={rt.token.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '8px' }}>
                  <input 
                    type="checkbox" 
                    checked={selectedIds.has(rt.token.id)}
                    onChange={() => toggleRow(rt.token.id)}
                  />
                </td>
                <td style={{ padding: '8px', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                  {rt.token.name}
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{rt.token.id}</div>
                </td>
                <td style={{ padding: '8px' }}>
                  {isPrimitive ? (
                    <input 
                      type="text" 
                      defaultValue={valString}
                      onBlur={(e) => handleInlineEdit(rt.token.id, (e.target as HTMLInputElement).value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      style={{ 
                        background: 'transparent', border: '1px solid transparent', 
                        padding: '4px 8px', borderRadius: '4px', width: '100%',
                        color: 'inherit', fontFamily: 'monospace'
                      }}
                      onFocus={(e) => (e.target as HTMLInputElement).style.border = '1px solid var(--color-brand)'}
                    />
                  ) : (
                    <span style={{ padding: '4px 8px', color: 'var(--color-text-secondary)' }}>{valString}</span>
                  )}
                </td>
                <td style={{ padding: '8px', color: 'var(--color-text-secondary)' }}>
                  {rt.token.type}
                </td>
                <td style={{ padding: '8px', textAlign: 'right' }}>
                  <button 
                    onClick={() => selectToken(rt.token.id)}
                    style={{ background: 'transparent', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '4px 12px', cursor: 'pointer', color: 'var(--color-text-primary)' }}
                  >
                    Edit Detail
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
