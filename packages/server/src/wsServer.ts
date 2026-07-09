/**
 * WebSocket Server — real-time token change broadcast for Design Studio.
 *
 * Responsibilities:
 *   - Accept WebSocket connections from Editor clients.
 *   - On new client connection: send `TokensReloadMessage` with the current
 *     resolved token state.
 *   - `broadcast(message)`: push a serialized `ServerMessage` to every
 *     connected client whose `readyState` is `OPEN`.
 *   - Heartbeat: every 30 seconds send a `HeartbeatMessage` to all open
 *     clients to maintain connection liveness.
 *
 * Message types:
 *   CssPatchMessage      { type: 'css-patch',      css: string,              tokenIds: string[] }
 *   ErrorUpdateMessage   { type: 'error-update',   errors: TokenError[]                         }
 *   TokensReloadMessage  { type: 'tokens-reload',  tokens: ResolvedToken[]                      }
 *   HeartbeatMessage     { type: 'heartbeat',       timestamp: number                            }
 */

import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

import {
  resolveAll,
  type DesignStudioConfig,
  type TokenError,
  type ResolvedToken,
} from '@destiny-ui/core';

import { type EngineState } from './engineState.js';

// ─── Message types ────────────────────────────────────────────────────────────

export interface CssPatchMessage {
  type: 'css-patch';
  css: string;
  tokenIds: string[];
}

export interface ErrorUpdateMessage {
  type: 'error-update';
  errors: TokenError[];
}

export interface TokensReloadMessage {
  type: 'tokens-reload';
  tokens: ResolvedToken[];
}

export interface HeartbeatMessage {
  type: 'heartbeat';
  timestamp: number;
}

export type ServerMessage =
  | CssPatchMessage
  | ErrorUpdateMessage
  | TokensReloadMessage
  | HeartbeatMessage;

// ─── WsServer interface ───────────────────────────────────────────────────────

export interface WsServer {
  /** Broadcast a message to all connected clients with readyState OPEN. */
  broadcast(message: ServerMessage): void;
  /** Stop accepting new connections and terminate the heartbeat timer. */
  close(): void;
  /** The underlying ws.WebSocketServer instance. */
  wss: WebSocketServer;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Build the current resolved token list from engine state.
 * Errors and unresolved tokens are omitted — we only surface ResolvedToken
 * entries to the client on initial load.
 */
function buildResolvedTokens(state: EngineState): ResolvedToken[] {
  const resolved = resolveAll(state.graph);
  const tokens: ResolvedToken[] = [];
  for (const [, entry] of resolved) {
    // TokenError entries have a `kind` property; ResolvedToken entries do not.
    if (!('kind' in entry)) {
      tokens.push(entry as ResolvedToken);
    }
  }
  return tokens;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Create a WebSocket server for Design Studio.
 *
 * @param config      - Design Studio configuration.  `config.wsPort` is used
 *                      when no `server` is provided.
 * @param state       - Mutable engine state.  Read on every new connection to
 *                      produce the initial `TokensReloadMessage`.
 * @param httpServer  - Optional HTTP server to attach to.  When provided the
 *                      WebSocket server is attached via the `server` option and
 *                      `config.wsPort` is ignored.
 */
export function createWsServer(
  config: DesignStudioConfig,
  state: EngineState,
  httpServer?: http.Server,
): WsServer {
  // Either attach to the HTTP server (path-based upgrade) or listen on a
  // dedicated port.
  const wss = httpServer
    ? new WebSocketServer({ server: httpServer, path: '/ws' })
    : new WebSocketServer({ port: config.wsPort });

  // ── New client connection ──────────────────────────────────────────────────
  wss.on('connection', (ws: WebSocket) => {
    // Send full token state immediately so the client can bootstrap.
    const tokens = buildResolvedTokens(state);
    const reloadMsg: TokensReloadMessage = {
      type: 'tokens-reload',
      tokens,
    };
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(reloadMsg));
    }
  });

  // ── Heartbeat timer ────────────────────────────────────────────────────────
  const heartbeatTimer = setInterval(() => {
    const msg: HeartbeatMessage = {
      type: 'heartbeat',
      timestamp: Date.now(),
    };
    const payload = JSON.stringify(msg);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Prevent the timer from keeping the Node.js process alive when the server
  // is shut down.
  heartbeatTimer.unref();

  // ── Public API ─────────────────────────────────────────────────────────────
  function broadcast(message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  function close(): void {
    clearInterval(heartbeatTimer);
    wss.close();
  }

  return { broadcast, close, wss };
}
