import type { ResolvedToken, BaseValue, ShadowValue } from '@destiny-ui/core';
import { useTokenStore } from '../../stores';

interface TokenRowProps {
  resolvedToken: ResolvedToken;
}

function formatValue(value: BaseValue): string {
  if (Array.isArray(value)) return `[${value.join(', ')}]`;
  if (typeof value === 'object') {
    const sv = value as ShadowValue;
    return `${sv.offsetX} ${sv.offsetY} ${sv.blur} ${sv.spread} ${sv.color}`;
  }
  return String(value);
}

export function TokenRow({ resolvedToken }: TokenRowProps) {
  const { token, resolvedValue } = resolvedToken;
  const selectedId = useTokenStore((s) => s.selectedTokenId);
  const selectToken = useTokenStore((s) => s.selectToken);
  const errors = useTokenStore((s) => s.errors);

  const error = errors.find((e) => 'tokenId' in e && e.tokenId === token.id) ?? null;

  const isSelected = selectedId === token.id;
  const isColor = token.type === 'color';
  const colorValue = isColor && typeof resolvedValue === 'string' ? resolvedValue : null;

  return (
    <li
      class={`token-row${isSelected ? ' token-row--selected' : ''}${error ? ' token-row--error' : ''}`}
      role="option"
      aria-selected={isSelected}
      onClick={() => selectToken(token.id)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') selectToken(token.id);
      }}
    >
      {colorValue && (
        <span
          class="color-swatch"
          style={`background: ${colorValue}`}
          aria-hidden="true"
        />
      )}
      <span class="token-name">{token.name}</span>
      <span class="token-type" aria-label={`Type: ${token.type}`}>{token.type}</span>
      <span class="token-value" title={formatValue(resolvedValue)}>
        {formatValue(resolvedValue)}
      </span>
      {error && (
        <span class="error-badge" role="img" aria-label="Error">
          ⚠
        </span>
      )}
    </li>
  );
}
