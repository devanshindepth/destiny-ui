/**
 * ErrorPanel — collapsible panel listing all current token errors.
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4
 */

import { useState } from 'preact/hooks';
import { useTokenStore } from '../stores/tokenStore.js';
import type { TokenError } from '@destiny-ui/core';

// ─── Badge styling per error kind ─────────────────────────────────────────────

const KIND_LABELS: Record<TokenError['kind'], string> = {
  validation: 'validation',
  'unresolved-reference': 'unresolved',
  cycle: 'cycle',
  parse: 'parse',
  'file-write': 'file-write',
  'checksum-mismatch': 'checksum',
};

// ─── Token ID extraction ──────────────────────────────────────────────────────

function getTokenId(error: TokenError): string | null {
  switch (error.kind) {
    case 'validation':
      return error.tokenId;
    case 'unresolved-reference':
      return error.tokenId;
    case 'cycle':
      return error.cycle[0] ?? null;
    case 'parse':
    case 'file-write':
    case 'checksum-mismatch':
      return null;
  }
}

// ─── Human-readable description ──────────────────────────────────────────────

function getDescription(error: TokenError): string {
  switch (error.kind) {
    case 'validation':
      return error.message;
    case 'unresolved-reference':
      return `Alias references non-existent token: ${error.referencedId}`;
    case 'cycle':
      return `Circular dependency: ${error.cycle.join(' → ')}`;
    case 'parse':
      return `Parse error in ${error.filePath}: ${error.message}`;
    case 'file-write':
      return `File write failed: ${error.reason}`;
    case 'checksum-mismatch':
      return `Checksum mismatch in ${error.path}`;
  }
}

// ─── Token name / display label ──────────────────────────────────────────────

function getTokenLabel(error: TokenError): string {
  const id = getTokenId(error);
  if (id) return id;
  if (error.kind === 'parse') return error.filePath;
  if (error.kind === 'checksum-mismatch') return error.path;
  if (error.kind === 'file-write') return error.path;
  return '—';
}

// ─── ErrorRow sub-component ──────────────────────────────────────────────────

interface ErrorRowProps {
  error: TokenError;
  onSelect: (tokenId: string) => void;
}

export function ErrorRow({ error, onSelect }: ErrorRowProps) {
  const tokenId = getTokenId(error);

  function handleClick() {
    if (tokenId) {
      onSelect(tokenId);
    }
  }

  return (
    <li
      class={`error-row${tokenId ? ' error-row--selectable' : ''}`}
      onClick={tokenId ? handleClick : undefined}
      role={tokenId ? 'button' : undefined}
      tabIndex={tokenId ? 0 : undefined}
      onKeyDown={tokenId ? (e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); } : undefined}
      data-testid="error-row"
    >
      <span
        class={`error-badge error-badge--${error.kind}`}
        data-testid="error-badge"
      >
        {KIND_LABELS[error.kind]}
      </span>
      <span class="error-row__token-name" data-testid="error-token-name">
        {getTokenLabel(error)}
      </span>
      <span class="error-row__description" data-testid="error-description">
        {getDescription(error)}
      </span>
    </li>
  );
}

// ─── ErrorPanel component ─────────────────────────────────────────────────────

export function ErrorPanel() {
  const errors = useTokenStore((s) => s.errors);
  const selectToken = useTokenStore((s) => s.selectToken);
  const [collapsed, setCollapsed] = useState(false);

  const errorCount = errors.length;

  return (
    <section class="error-panel" data-testid="error-panel">
      <button
        class="error-panel__toggle"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        data-testid="error-panel-toggle"
      >
        <span class="error-panel__title">Errors</span>
        {collapsed && errorCount > 0 && (
          <span class="error-panel__count-badge" data-testid="error-count-badge">
            {errorCount}
          </span>
        )}
        <span class="error-panel__chevron">{collapsed ? '▶' : '▼'}</span>
      </button>

      {!collapsed && (
        <div class="error-panel__body" data-testid="error-panel-body">
          {errorCount === 0 ? (
            <p class="error-panel__empty" data-testid="error-panel-empty">
              No errors
            </p>
          ) : (
            <ul class="error-panel__list" data-testid="error-panel-list">
              {errors.map((error, i) => (
                <ErrorRow
                  key={i}
                  error={error}
                  onSelect={selectToken}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
