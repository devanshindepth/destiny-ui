import { useConnectionStore } from '../stores';

export function Header() {
  const status = useConnectionStore((s) => s.status);

  const badgeClass = {
    connected: 'badge--connected',
    reconnecting: 'badge--reconnecting',
    disconnected: 'badge--disconnected',
  }[status];

  const badgeText = {
    connected: 'Connected',
    reconnecting: 'Reconnecting...',
    disconnected: 'Disconnected',
  }[status];

  return (
    <header class="app-header">
      <h1 class="app-title">Design Studio</h1>
      <span class={`status-badge ${badgeClass}`} role="status" aria-live="polite">
        {badgeText}
      </span>
    </header>
  );
}
