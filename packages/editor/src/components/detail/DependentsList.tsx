interface DependentsListProps {
  dependents: string[];           // token IDs that depend on the token being deleted
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}

export function DependentsList({
  dependents,
  onConfirm,
  onCancel,
  isDeleting,
}: DependentsListProps) {
  return (
    <section class="dependents-list" role="alertdialog" aria-labelledby="dependents-heading">
      <h3 id="dependents-heading" class="dependents-list__heading">
        This token has {dependents.length} dependent{dependents.length !== 1 ? 's' : ''}
      </h3>
      <p class="dependents-list__warning">
        The following tokens reference this token. Deleting it will break their alias chains.
      </p>
      <ul class="dependents-list__items" aria-label="Dependent tokens">
        {dependents.map((id) => (
          <li key={id} class="dependents-list__item">
            <span class="dependents-list__id">{id}</span>
          </li>
        ))}
      </ul>
      <div class="dependents-list__actions">
        <button
          class="btn btn--danger"
          onClick={onConfirm}
          disabled={isDeleting}
          aria-busy={isDeleting}
        >
          {isDeleting ? 'Deleting…' : 'Confirm delete'}
        </button>
        <button class="btn btn--secondary" onClick={onCancel} disabled={isDeleting}>
          Cancel
        </button>
      </div>
    </section>
  );
}
