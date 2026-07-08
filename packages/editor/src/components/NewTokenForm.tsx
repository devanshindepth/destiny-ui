import { useState, useEffect } from 'preact/hooks';
import type { TokenCategory, TokenType, ResolvedToken, TokenError, ValidationError } from '@destiny-ui/core';
import { TOKEN_CATEGORIES, TYPES_FOR_CATEGORY } from '@destiny-ui/core';
import { useTokenStore } from '../stores/index.js';

async function postToken(body: {
  name: string;
  category: TokenCategory;
  type: TokenType;
  description?: string;
}): Promise<{ data: ResolvedToken[]; errors: TokenError[] }> {
  const res = await fetch('/api/tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<{ data: ResolvedToken[]; errors: TokenError[] }>;
}

interface NewTokenFormProps {
  onClose: () => void;
}

export function NewTokenForm({ onClose }: NewTokenFormProps) {
  const setTokens = useTokenStore((s) => s.setTokens);
  const selectToken = useTokenStore((s) => s.selectToken);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<TokenCategory>(TOKEN_CATEGORIES[0]);
  const [type, setType] = useState<TokenType>(TYPES_FOR_CATEGORY[TOKEN_CATEGORIES[0]][0]);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  // When category changes, reset type to the first valid type for that category
  useEffect(() => {
    setType(TYPES_FOR_CATEGORY[category][0]);
  }, [category]);

  async function handleSubmit(e: Event) {
    e.preventDefault();

    // Client-side empty check
    if (!name.trim()) {
      setNameError('Name is required.');
      return;
    }

    setNameError(null);
    setServerError(null);
    setSubmitting(true);

    try {
      const result = await postToken({
        name: name.trim(),
        category,
        type,
        description: description.trim() || undefined,
      });

      // Look for a validation error on the name field
      const ve = result.errors.find(
        (e): e is ValidationError => e.kind === 'validation' && e.field === 'name'
      );

      if (ve) {
        setNameError(ve.message);
        setSubmitting(false);
        return;
      }

      // Any other validation error — surface generically
      const anyError = result.errors.find((e) => e.kind === 'validation') as ValidationError | undefined;
      if (anyError) {
        setServerError(anyError.message);
        setSubmitting(false);
        return;
      }

      // Success: update store and navigate to new token
      const map = new Map(result.data.map((rt) => [rt.token.id, rt]));
      setTokens(map);

      // Find the newly created token (matches name + category + type)
      const newToken = result.data.find(
        (rt) =>
          rt.token.name === name.trim() &&
          rt.token.category === category &&
          rt.token.type === type
      );
      if (newToken) {
        selectToken(newToken.token.id);
      }

      onClose();
    } catch {
      setServerError('An unexpected error occurred. Please try again.');
      setSubmitting(false);
    }
  }

  function handleOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('new-token-form__overlay')) {
      onClose();
    }
  }

  return (
    <div class="new-token-form__overlay" onClick={handleOverlayClick} role="dialog" aria-modal="true" aria-labelledby="new-token-form-title">
      <div class="new-token-form">
        <h2 id="new-token-form-title" class="new-token-form__title">New token</h2>

        <form onSubmit={handleSubmit} noValidate>
          {/* Name */}
          <div class="new-token-form__field">
            <label class="new-token-form__label" for="ntf-name">Name</label>
            <input
              id="ntf-name"
              type="text"
              class="new-token-form__input"
              value={name}
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
              placeholder="e.g. primary"
              disabled={submitting}
              aria-required="true"
              aria-describedby={nameError ? 'ntf-name-error' : undefined}
            />
            {nameError && (
              <p id="ntf-name-error" class="new-token-form__error" role="alert">
                {nameError}
              </p>
            )}
          </div>

          {/* Category */}
          <div class="new-token-form__field">
            <label class="new-token-form__label" for="ntf-category">Category</label>
            <select
              id="ntf-category"
              class="new-token-form__select"
              value={category}
              onChange={(e) => setCategory((e.target as HTMLSelectElement).value as TokenCategory)}
              disabled={submitting}
            >
              {TOKEN_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Type */}
          <div class="new-token-form__field">
            <label class="new-token-form__label" for="ntf-type">Type</label>
            <select
              id="ntf-type"
              class="new-token-form__select"
              value={type}
              onChange={(e) => setType((e.target as HTMLSelectElement).value as TokenType)}
              disabled={submitting}
            >
              {TYPES_FOR_CATEGORY[category].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div class="new-token-form__field">
            <label class="new-token-form__label" for="ntf-description">Description <span style="font-weight: 400; text-transform: none;">(optional)</span></label>
            <textarea
              id="ntf-description"
              class="new-token-form__textarea"
              value={description}
              onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
              placeholder="Describe this token's intended use"
              rows={3}
              disabled={submitting}
            />
          </div>

          {/* Generic server error */}
          {serverError && (
            <p class="new-token-form__error" role="alert">
              {serverError}
            </p>
          )}

          <div class="new-token-form__actions">
            <button
              type="submit"
              class="btn btn--primary"
              disabled={submitting}
              aria-busy={submitting}
            >
              {submitting ? 'Creating…' : 'Create token'}
            </button>
            <button
              type="button"
              class="btn btn--secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
