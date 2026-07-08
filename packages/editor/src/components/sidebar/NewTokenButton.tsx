interface NewTokenButtonProps {
  onClick: () => void;
}

export function NewTokenButton({ onClick }: NewTokenButtonProps) {
  return (
    <div class="sidebar-toolbar">
      <button
        class="btn btn--primary new-token-btn"
        onClick={onClick}
        aria-label="Create new token"
      >
        + New token
      </button>
    </div>
  );
}
