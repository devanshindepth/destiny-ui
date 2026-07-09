/**
 * WebSocket client for Design Studio editor.
 *
 * Connects to the server's WebSocket endpoint, handles all ServerMessage types,
 * and keeps Zustand stores in sync.  Implements exponential back-off reconnect
 * with a 30-second cap (Requirement 7.5).
 */

import type { ResolvedToken, TokenError } from '@destiny-ui/core';

import { useTokenStore } from '../stores/tokenStore.js';
import { useConnectionStore } from '../stores/connectionStore.js';
import { usePreviewStore } from '../stores/previewStore.js';

// ─── Message shapes (mirrors packages/server/src/wsServer.ts) ─────────────────

interface CssPatchMessage {
  type: 'css-patch';
  css: string;
  tokenIds: string[];
}

interface ErrorUpdateMessage {
  type: 'error-update';
  errors: TokenError[];
}

interface TokensReloadMessage {
  type: 'tokens-reload';
  tokens: ResolvedToken[];
}

interface HeartbeatMessage {
  type: 'heartbeat';
  timestamp: number;
}

type ServerMessage =
  | CssPatchMessage
  | ErrorUpdateMessage
  | TokensReloadMessage
  | HeartbeatMessage;

// ─── Public interface ──────────────────────────────────────────────────────────

export interface WsClientHandle {
  /** Open the WebSocket connection. Safe to call multiple times (no-op if already open). */
  connect(): void;
  /** Close the WebSocket connection and cancel any pending reconnect timer. */
  disconnect(): void;
}

// ─── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a managed WebSocket client that connects to `ws://localhost:{wsPort}`.
 *
 * @param wsPort  - The port the server's WebSocket endpoint is listening on.
 */
export function createWsClient(wsPort: number): WsClientHandle {
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let isManuallyClosed = false;

  // ── Store accessors ────────────────────────────────────────────────────────
  const tokenStore = () => useTokenStore.getState();
  const connectionStore = () => useConnectionStore.getState();
  const previewStore = () => usePreviewStore.getState();

  // ── Reconnect scheduling ────────────────────────────────────────────────────

  /**
   * Schedule a reconnect attempt using exponential back-off.
   * Delay = Math.min(1000 * 2^attempt, 30_000) ms.
   */
  function scheduleReconnect(attempt: number): void {
    const delay = Math.min(1000 * Math.pow(2, attempt), 30_000);

    connectionStore().setStatus('reconnecting');
    connectionStore().incrementReconnectAttempts();

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      openSocket();
    }, delay);
  }

  // ── Message handler ────────────────────────────────────────────────────────

  function handleMessage(event: MessageEvent): void {
    let msg: ServerMessage;

    try {
      msg = JSON.parse(event.data as string) as ServerMessage;
    } catch {
      console.warn('[WsClient] Failed to parse message:', event.data);
      return;
    }

    switch (msg.type) {
      case 'tokens-reload': {
        // Convert the flat array the server sends into the Map the store expects
        const map = new Map<string, ResolvedToken>();
        for (const token of msg.tokens) {
          map.set(token.token.id, token);
        }
        tokenStore().setTokens(map);
        break;
      }

      case 'css-patch': {
        connectionStore().setLastPatchTimestamp(Date.now());
        // Buffer the CSS in PreviewStore; PreviewFrame will flush it to the iframe
        previewStore().setPendingCss(msg.css);
        break;
      }

      case 'error-update': {
        tokenStore().setErrors(msg.errors);
        break;
      }

      case 'heartbeat': {
        // Confirms liveness; nothing to update in the stores
        console.debug('[WsClient] heartbeat', msg.timestamp);
        break;
      }

      default: {
        // Exhaustive guard — log unknown message types for debugging
        console.warn('[WsClient] Unknown message type:', (msg as { type: string }).type);
      }
    }
  }

  // ── Socket lifecycle ───────────────────────────────────────────────────────

  function openSocket(): void {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return; // already live or connecting
    }

    const url = `ws://localhost:${wsPort}`;
    socket = new WebSocket(url);

    socket.addEventListener('open', () => {
      connectionStore().setStatus('connected');
      connectionStore().resetReconnectAttempts();
    });

    socket.addEventListener('message', handleMessage);

    socket.addEventListener('close', () => {
      if (!isManuallyClosed) {
        connectionStore().setStatus('disconnected');
        const attempts = useConnectionStore.getState().reconnectAttempts;
        scheduleReconnect(attempts);
      }
    });

    socket.addEventListener('error', () => {
      // 'error' is always followed by 'close', so we let the close handler
      // drive reconnect logic.  We just update status here.
      connectionStore().setStatus('disconnected');
    });
  }

  // ── Public handle ──────────────────────────────────────────────────────────

  function connect(): void {
    isManuallyClosed = false;
    openSocket();
  }

  function disconnect(): void {
    isManuallyClosed = true;

    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (socket) {
      socket.close();
      socket = null;
    }

    connectionStore().setStatus('disconnected');
  }

  return { connect, disconnect };
}
