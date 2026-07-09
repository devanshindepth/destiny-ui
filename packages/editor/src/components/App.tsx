import { useEffect } from 'preact/hooks';
import { Header } from './Header';
import { Sidebar } from './layout/Sidebar';
import { DetailPanel } from './layout/DetailPanel';
import { PreviewSection } from './layout/PreviewSection';
import { createWsClient } from '../ws/client';

/** Minimal shape we need from the config API response. */
interface ConfigApiResponse {
  data: {
    wsPort: number;
    [key: string]: unknown;
  } | null;
  errors: unknown[];
}

export function App() {
  useEffect(() => {
    let client: ReturnType<typeof createWsClient> | null = null;

    // Fetch the server config to learn the WS port, then connect.
    // Falls back to the default port (3001) if the fetch fails so the
    // editor is still usable during local development without a running server.
    async function initWs() {
      let wsPort = 3001;
      try {
        const res = await fetch('/api/config');
        if (res.ok) {
          const body = (await res.json()) as ConfigApiResponse;
          if (body.data && typeof body.data.wsPort === 'number') {
            wsPort = body.data.wsPort;
          }
        }
      } catch {
        console.warn('[App] Could not fetch /api/config; defaulting WS port to', wsPort);
      }

      client = createWsClient(wsPort);
      client.connect();
    }

    void initWs();

    return () => {
      client?.disconnect();
    };
  }, []); // run once on mount

  return (
    <div class="app-shell">
      <Header />
      <div class="app-body">
        <Sidebar />
        <DetailPanel />
        <PreviewSection />
      </div>
    </div>
  );
}
