import type { BaseValue, ShadowValue } from '@destiny-ui/core';

interface AliasResolverProps {
  aliasChain: string[];       // token IDs traversed (first = original alias, last = resolved primitive's id)
  resolvedValue: BaseValue;   // final resolved primitive value
}

function formatResolvedValue(value: BaseValue): string {
  if (Array.isArray(value)) return `[${value.join(', ')}]`;
  if (typeof value === 'object' && value !== null) {
    const sv = value as ShadowValue;
    return `${sv.offsetX} ${sv.offsetY} ${sv.blur} ${sv.spread} ${sv.color}`;
  }
  return String(value);
}

export function AliasResolver({ aliasChain, resolvedValue }: AliasResolverProps) {
  if (aliasChain.length === 0) return null;

  return (
    <section class="alias-resolver" aria-label="Alias resolution chain">
      <h3 class="alias-resolver__heading">Alias chain</h3>
      <ol class="alias-resolver__chain" aria-label="Resolution path">
        {aliasChain.map((id, i) => (
          <li key={id} class="alias-resolver__step">
            <span class="alias-resolver__id">{id}</span>
            {i < aliasChain.length - 1 && (
              <span class="alias-resolver__arrow" aria-hidden="true">→</span>
            )}
          </li>
        ))}
        <li class="alias-resolver__step alias-resolver__step--resolved">
          <span class="alias-resolver__arrow" aria-hidden="true">→</span>
          <span class="alias-resolver__resolved-value" aria-label="Resolved primitive value">
            {formatResolvedValue(resolvedValue)}
          </span>
        </li>
      </ol>
    </section>
  );
}
