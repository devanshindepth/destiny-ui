/**
 * Integration tests — WebSocket protocol
 *
 * Requirements: 7.1, 7.4
 *
 * Tests:
 *   - TokensReloadMessage is sent on initial client connect
 *   - CssPatchMessage is received after a token update via PUT /api/tokens/:id
 *   - HeartbeatMessage is sent every 30 s (using fake timers)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import net from 'node:net';
import http from 'node:http';
import WebSocket from 'ws';

// Mock fs/promises so persistTokenFile never touches the disk.
vi.mock('node:fs/promises', () => ({
  default: {
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { buildTokenGraph, type Token, type DesignStudioConfig } from '@destiny-ui/core';
import { createServer } from './httpServer.js';
import { createWsServer, type ServerMessage } from './wsServer.js';
import { createEngineState, type EngineState } from './engineState.js';

// ─── Port helper ──────────────────────────────────────────────────────────────

/** Find a free TCP port by letting the OS assign one. */
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as net.AddressInfo;
      srv.close((err) => (err ? reject(err) : resolve(addr.port)));
    });
    srv.on('error', reject);
  });
}

// ─── Message collection helper ────────────────────────────────────────────────

/**
 * Connect a WebSocket client and collect all messages until `until(msg)`
 * returns true, then resolve with the full list.  Rejects on error or timeout.
 */
function collectMessages(
  url: string,
  until: (msgs: ServerMessage[]) => boolean,
  timeoutMs = 8000,
): Promise<ServerMessage[]> {
  return new Promise((resolve, reject) => {
    const msgs: ServerMessage[] = [];
    const ws = new WebSocket(url);

    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error(`Timed out after ${timeoutMs} ms. Collected: ${JSON.stringify(msgs)}`));
    }, timeoutMs);

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString()) as ServerMessage;
      msgs.push(msg);
      if (until(msgs)) {
        clearTimeout(timer);
        ws.terminate();
        resolve(msgs);
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      ws.terminate();
      reject(err);
    });
  });
}

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const BASE_TOKEN: Token = {
  id: 'color.brand.primary',
  name: 'Brand Primary',
  category: 'brand-colors',
  type: 'color',
  value: '#FF0000FF',
  sourceFile: '/tmp/tokens/brand.json',
};

function makeTestConfig(wsPort: number, httpPort: number): DesignStudioConfig {
  return {
    tokensDir: './tokens',
    cssOutputDir: './dist/css',
    dtcgOutputDir: './dist/tokens',
    httpPort,
    wsPort,
    outputFormat: 'json',
    previewPath: null,
  };
}

function buildTestState(config: DesignStudioConfig): EngineState {
  const state = createEngineState(config);
  state.graph = buildTokenGraph([BASE_TOKEN]);
  return state;
}

// ─── Test suites ──────────────────────────────────────────────────────────────

describe('TokensReloadMessage on connect', () => {
  let wsPort: number;
  let wsHandle: ReturnType<typeof createWsServer>;

  beforeEach(async () => {
    wsPort = await getFreePort();
    const httpPort = await getFreePort();
    const config = makeTestConfig(wsPort, httpPort);
    const state = buildTestState(config);
    wsHandle = createWsServer(config, state);
  });

  afterEach(() => {
    wsHandle.close();
  });

  it('sends TokensReloadMessage with current tokens immediately on connect', async () => {
    const msgs = await collectMessages(
      `ws://127.0.0.1:${wsPort}`,
      (m) => m.some((msg) => msg.type === 'tokens-reload'),
    );

    const reload = msgs.find((m) => m.type === 'tokens-reload');
    expect(reload).toBeDefined();
    expect(reload!.type).toBe('tokens-reload');

    if (reload!.type === 'tokens-reload') {
      expect(Array.isArray(reload!.tokens)).toBe(true);
      expect(reload!.tokens.length).toBeGreaterThan(0);
      const ids = reload!.tokens.map((t) => t.token.id);
      expect(ids).toContain('color.brand.primary');
    }
  }, 10_000);
});

// ─── CssPatchMessage after PUT ────────────────────────────────────────────────

describe('CssPatchMessage after PUT /api/tokens/:id', () => {
  let httpPort: number;
  let wsPort: number;
  let httpServer: http.Server;
  let wsHandle: ReturnType<typeof createWsServer>;

  beforeEach(async () => {
    httpPort = await getFreePort();
    wsPort = await getFreePort();
    const config = makeTestConfig(wsPort, httpPort);
    const state = buildTestState(config);

    // Wire WS broadcast into the HTTP server
    wsHandle = createWsServer(config, state);
    httpServer = createServer(
      config,
      state,
      '/nonexistent/spa',
      wsHandle.broadcast.bind(wsHandle),
    );

    await new Promise<void>((resolve) => httpServer.listen(httpPort, '127.0.0.1', resolve));
  });

  afterEach(async () => {
    await new Promise<void>((resolve) =>
      httpServer.close(() => resolve()),
    );
    wsHandle.close();
  });

  it('broadcasts CssPatchMessage after a successful PUT', async () => {
    // We need to:
    //  1. Connect the client and wait for the initial tokens-reload.
    //  2. Then issue the PUT.
    //  3. Then receive the css-patch.
    //
    // We use a single persistent client connection so we don't miss the patch.

    const receivedMessages: ServerMessage[] = [];

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${wsPort}`);

      const timeout = setTimeout(() => {
        ws.terminate();
        reject(new Error('Timed out waiting for CssPatchMessage'));
      }, 8000);

      ws.on('error', (err) => {
        clearTimeout(timeout);
        ws.terminate();
        reject(err);
      });

      ws.on('message', async (data) => {
        const msg = JSON.parse(data.toString()) as ServerMessage;
        receivedMessages.push(msg);

        if (msg.type === 'tokens-reload') {
          // Initial reload received — now send the PUT
          try {
            await fetch(`http://127.0.0.1:${httpPort}/api/tokens/color.brand.primary`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ value: '#00FF00FF' }),
            });
          } catch (err) {
            clearTimeout(timeout);
            ws.terminate();
            reject(err);
          }
        }

        if (msg.type === 'css-patch') {
          clearTimeout(timeout);
          ws.terminate();
          resolve();
        }
      });
    });

    const patch = receivedMessages.find((m) => m.type === 'css-patch');
    expect(patch).toBeDefined();
    expect(patch!.type).toBe('css-patch');

    if (patch!.type === 'css-patch') {
      expect(typeof patch!.css).toBe('string');
      expect(patch!.css.length).toBeGreaterThan(0);
      expect(Array.isArray(patch!.tokenIds)).toBe(true);
      expect(patch!.tokenIds).toContain('color.brand.primary');
    }
  }, 10_000);
});

// ─── HeartbeatMessage every 30 s ─────────────────────────────────────────────

describe('HeartbeatMessage every 30 s', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends HeartbeatMessage after 30 seconds', async () => {
    // -- Step 1: get ports with real timers --
    const wsPort = await getFreePort();
    const httpPort = await getFreePort();
    const config = makeTestConfig(wsPort, httpPort);
    const state = buildTestState(config);

    // -- Step 2: install fake timers BEFORE creating the WS server so the
    //    setInterval inside createWsServer is captured by the fake clock.
    //    Only intercept setInterval/clearInterval; leave everything else real
    //    so network I/O (socket connect, handshake) works normally.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const wsHandle = createWsServer(config, state);

    try {
      const heartbeats: ServerMessage[] = [];
      let reloadReceived = false;

      // heartbeatArrived resolves the moment we get a heartbeat message.
      let resolveHeartbeat!: () => void;
      const heartbeatArrived = new Promise<void>((resolve) => {
        resolveHeartbeat = resolve;
      });

      // -- Step 3: connect, attaching the message listener BEFORE open fires --
      const ws = new WebSocket(`ws://127.0.0.1:${wsPort}`);

      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as ServerMessage;
        if (msg.type === 'tokens-reload') {
          reloadReceived = true;
        }
        if (msg.type === 'heartbeat') {
          heartbeats.push(msg);
          resolveHeartbeat();
        }
      });

      // Wait for WS open (real TCP/socket, not timer-based).
      await new Promise<void>((resolve, reject) => {
        ws.once('open', resolve);
        ws.once('error', reject);
      });

      // Yield to the event loop so the initial tokens-reload message is delivered
      // (the server sends it synchronously in the 'connection' handler, but the
      // frame still has to travel through the loopback socket).
      await new Promise<void>((resolve) => setImmediate(resolve));
      await new Promise<void>((resolve) => setImmediate(resolve));

      // -- Step 4: advance fake clock by 30 s → fires the interval callback
      //    synchronously, which calls ws.send() for all connected clients.
      vi.advanceTimersByTime(30_000);

      // Switch back to real timers and yield to I/O so the WS frame is delivered.
      vi.useRealTimers();

      // Give the loopback socket a few event-loop turns to deliver the frame.
      await new Promise<void>((resolve) => setImmediate(resolve));
      await new Promise<void>((resolve) => setImmediate(resolve));

      await heartbeatArrived;
      ws.terminate();

      expect(heartbeats.length).toBeGreaterThanOrEqual(1);
      const hb = heartbeats[0]!;
      expect(hb.type).toBe('heartbeat');
      if (hb.type === 'heartbeat') {
        expect(typeof hb.timestamp).toBe('number');
      }
    } finally {
      wsHandle.close();
    }
  }, 15_000);
});
