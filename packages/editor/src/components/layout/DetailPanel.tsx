import { useState, useEffect } from 'preact/hooks';
import type { BaseValue, TokenValue, ValidationError, ResolvedToken, TokenError } from '@destiny-ui/core';
import { isAlias } from '@destiny-ui/core';
import { useTokenStore } from '../../stores/index.js';
import { TokenMetadata } from '../detail/TokenMetadata.js';
import { ValueEditor } from '../detail/ValueEditor.js';
import { AliasResolver } from '../detail/AliasResolver.js';
import { DependentsList } from '../detail/DependentsList.js';

// ── API helpers ───────────────────────────────────────────────────────────────

async function putToken(
  id: string,
  value: TokenValue
): Promise<{ data: ResolvedToken[]; errors: TokenError[] }> {
  const res = await fetch(`/api/tokens/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });
  return res.json() as Promise<{ data: ResolvedToken[]; errors: TokenError[] }>;
}

interface DeleteSuccessResponse {
  data: ResolvedToken[];
  errors: TokenError[];
}

interface DeleteDependentsResponse {
  data: { dependents: string[] };
  errors: never[];
}

type DeleteResponse =
  | { status: 409; body: DeleteDependentsResponse }
  | { status: number; body: DeleteSuccessResponse };

async function deleteToken(id: string, confirm = false): Promise<DeleteResponse> {
  const url = confirm
    ? `/api/tokens/${encodeURIComponent(id)}?confirm=true`
    : `/api/tokens/${encodeURIComponent(id)}`;
  const res = await fetch(url, { method: 'DELETE' });
  const body = await res.json();
  if (res.status === 409) {
    return { status: 409, body: body as DeleteDependentsResponse };
  }
  return { status: res.status, body: body as DeleteSuccessResponse };
}

// ── DetailPanel ───────────────────────────────────────────────────────────────

type SaveState = 'idle' | 'saving' | 'success';
type DeleteState = 'idle' | 'deleting' | 'confirming' | 'running';

export function DetailPanel() {
  const selectedTokenId = useTokenStore((s: { selectedTokenId: string | null }) => s.selectedTokenId);
  const tokens = useTokenStore((s: { tokens: Map<string, ResolvedToken> }) => s.tokens);
  const setTokens = useTokenStore((s: { setTokens: (t: Map<string, ResolvedToken>) => void }) => s.setTokens);
  const selectToken = useTokenStore((s: { selectToken: (id: string | null) => void }) => s.selectToken);

  // The resolved token currently being edited
  const resolvedToken = selectedTokenId ? tokens.get(selectedTokenId) ?? null : null;

  // Local edit state — tracks the working value (may be BaseValue or AliasValue)
  const [editValue, setEditValue] = useState<TokenValue | null>(null);

  // Reset edit value when selected token changes
  useEffect(() => {
    if (resolvedToken) {
      setEditValue(resolvedToken.token.value);
    } else {
      setEditValue(null);
    }
    setValidationError(null);
    setDependents(null);
    setSaveState('idle');
    setDeleteState('idle');
  }, [selectedTokenId]);

  // UI state
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [deleteState, setDeleteState] = useState<DeleteState>('idle');
  const [validationError, setValidationError] = useState<ValidationError | null>(null);
  const [dependents, setDependents] = useState<string[] | null>(null);

  // ── Save handler ────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!resolvedToken || editValue === null) return;
    setSaveState('saving');
    setValidationError(null);
    try {
      const result = await putToken(resolvedToken.token.id, editValue);
      const ve = result.errors.find(
        (e): e is ValidationError =>
          e.kind === 'validation' && (e as ValidationError).tokenId === resolvedToken.token.id
      );
      if (ve) {
        setValidationError(ve);
        setSaveState('idle');
      } else {
        const map = new Map(result.data.map((rt) => [rt.token.id, rt]));
        setTokens(map);
        setSaveState('success');
        setTimeout(() => setSaveState('idle'), 1500);
      }
    } catch {
      setSaveState('idle');
    }
  }

  // ── Delete handler ──────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!resolvedToken) return;
    setDeleteState('deleting');
    try {
      const result = await deleteToken(resolvedToken.token.id, false);
      if (result.status === 409) {
        const dep409 = result.body as DeleteDependentsResponse;
        setDependents(dep409.data.dependents);
        setDeleteState('confirming');
      } else {
        const successBody = result.body as DeleteSuccessResponse;
        const map = new Map(successBody.data.map((rt) => [rt.token.id, rt]));
        setTokens(map);
        selectToken(null);
        setDeleteState('idle');
      }
    } catch {
      setDeleteState('idle');
    }
  }

  async function handleConfirmDelete() {
    if (!resolvedToken) return;
    setDeleteState('running');
    try {
      const result = await deleteToken(resolvedToken.token.id, true);
      const successBody = result.body as DeleteSuccessResponse;
      const map = new Map(successBody.data.map((rt) => [rt.token.id, rt]));
      setTokens(map);
      selectToken(null);
      setDeleteState('idle');
    } catch {
      setDeleteState('idle');
    }
  }

  function handleCancelDelete() {
    setDependents(null);
    setDeleteState('idle');
  }

  // ── Render: nothing selected ────────────────────────────────────────────────

  if (!resolvedToken || editValue === null) {
    return (
      <main class="detail-panel" data-testid="detail-panel">
        <p class="detail-panel__placeholder">Select a token to inspect it</p>
      </main>
    );
  }

  const { token, resolvedValue, aliasChain } = resolvedToken;
  const isAliasToken = isAlias(token.value);

  // When the token is an alias, the "edit value" for the alias reference is the $alias string.
  const aliasString = isAliasToken ? (token.value as { $alias: string }).$alias : '';

  // The base value to pass to <ValueEditor> when not editing an alias reference
  const baseEditValue: BaseValue = isAliasToken
    ? resolvedValue
    : (editValue as BaseValue);

  const isSaving = saveState === 'saving';
  const isDeleting = deleteState === 'deleting';
  const isConfirming = deleteState === 'confirming';
  const isRunningDelete = deleteState === 'running';

  return (
    <main class="detail-panel" data-testid="detail-panel">
      <div class="detail-panel__content">
        {/* Token metadata (read-only) */}
        <TokenMetadata token={token} />

        <hr class="detail-panel__divider" />

        {/* Alias resolution chain (shown only for alias tokens) */}
        {isAliasToken && aliasChain.length > 0 && (
          <>
            <AliasResolver aliasChain={aliasChain} resolvedValue={resolvedValue} />
            <hr class="detail-panel__divider" />
          </>
        )}

        {/* Value editor section */}
        <section class="detail-panel__editor-section" aria-label="Edit token value">
          <h3 class="detail-panel__section-heading">Value</h3>

          {isAliasToken ? (
            /* Alias token: allow editing the $alias reference string */
            <div class="detail-panel__alias-edit">
              <label class="value-editor__label" for="alias-ref-input">
                Alias reference
              </label>
              <input
                id="alias-ref-input"
                type="text"
                class="value-editor__text-input value-editor__text-input--full value-editor__text-input--mono"
                value={aliasString}
                onInput={(e) =>
                  setEditValue({ $alias: (e.target as HTMLInputElement).value })
                }
                placeholder="token.id.path"
                aria-label="Alias reference token ID"
              />
            </div>
          ) : (
            /* Base token: full type-specific editor */
            <ValueEditor
              type={token.type}
              value={baseEditValue}
              onChange={(v: BaseValue) => setEditValue(v)}
            />
          )}

          {/* Inline validation error */}
          {validationError && (
            <p class="detail-panel__validation-error" role="alert">
              {validationError.message}
            </p>
          )}
        </section>

        {/* Dependents confirmation dialog (shown after attempting delete) */}
        {isConfirming && dependents && (
          <>
            <hr class="detail-panel__divider" />
            <DependentsList
              dependents={dependents}
              onConfirm={handleConfirmDelete}
              onCancel={handleCancelDelete}
              isDeleting={isRunningDelete}
            />
          </>
        )}

        {/* Action buttons */}
        <div class="detail-panel__actions">
          <button
            class="btn btn--primary"
            onClick={handleSave}
            disabled={isSaving || isDeleting || isRunningDelete}
            aria-busy={isSaving}
          >
            {saveState === 'saving' ? 'Saving…' : saveState === 'success' ? 'Saved ✓' : 'Save'}
          </button>
          <button
            class="btn btn--danger"
            onClick={handleDelete}
            disabled={isSaving || isDeleting || isConfirming || isRunningDelete}
            aria-busy={isDeleting}
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </main>
  );
}
