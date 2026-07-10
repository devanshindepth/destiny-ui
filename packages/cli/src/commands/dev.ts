/**
 * `design-studio dev` command implementation.
 *
 * Flow (from design doc):
 *   1. Read and validate design-studio.config.json
 *   2. Verify tokensDir exists (exit non-zero if not)
 *   3. Find available HTTP port (start at httpPort config, increment if in use)
 *   4. Start HTTP server (with broadcast wired via mutable ref)
 *   5. Start WebSocket server (attached to HTTP server)
 *   6. Load all token files → build TokenGraph → generate initial CSS
 *   7. Start File Watcher on tokensDir
 *   8. Open browser at http://localhost:{port}
 *   9. Print server URL to stdout
 *  10. Block until SIGINT/SIGTERM; gracefully shut down
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 15.1, 15.2
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';

import open from 'open';

import {
  parseConfig,
  parseTokenFile,
  buildTokenGraph,
  type Token,
  type TokenError,
} from '@destiny-ui/core';

import {
  createServer,
  createWsServer,
  createEngineState,
  wireFileWatcher,
  persistOutputFiles,
  type FileWatcher,
  type ServerMessage,
} from '@destiny-ui/server';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Attempt to bind a TCP server on `port`. Resolves true if the port is free,
 * false if it is already in use (EADDRINUSE). Rejects for other errors.
 */
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        reject(err);
      }
    });
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Find the first free port starting at `startPort`, trying up to `maxAttempts`
 * consecutive ports. Returns the chosen port or throws if none are available.
 */
async function findFreePort(
  startPort: number,
  maxAttempts = 10,
): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    if (await isPortFree(port)) {
      return port;
    }
  }
  throw new Error(
    `No free port found in range ${startPort}–${startPort + maxAttempts - 1}.`,
  );
}

/**
 * Recursively walk a directory and return absolute paths of all token files
 * (.json, .yaml, .yml).
 */
function scanTokenFiles(dir: string): string[] {
  const TOKEN_EXTS = new Set(['.json', '.yaml', '.yml']);
  const results: string[] = [];

  function walk(current: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (
        entry.isFile() &&
        TOKEN_EXTS.has(path.extname(entry.name).toLowerCase())
      ) {
        results.push(full);
      }
    }
  }

  walk(dir);
  return results;
}

// ─── Dev command ──────────────────────────────────────────────────────────────

export async function runDev(): Promise<void> {
  // ── 1. Read and validate design-studio.config.json ───────────────────────
  const configPath = path.resolve(process.cwd(), 'design-studio.config.json');

  let rawConfig: unknown;
  try {
    const text = await fsp.readFile(configPath, 'utf8');
    rawConfig = JSON.parse(text);
  } catch {
    // Missing or unreadable — use all defaults
    rawConfig = {};
  }

  const { config, notices, error: configError } = parseConfig(rawConfig);

  // Print notices for defaulted/unrecognized keys
  for (const notice of notices) {
    console.log(`[design-studio] Notice: ${notice}`);
  }

  if (configError) {
    console.error(`[design-studio] Configuration error: ${configError.message}`);
    process.exit(1);
  }

  // ── 2. Verify tokensDir exists ────────────────────────────────────────────
  const tokensDirAbs = path.resolve(process.cwd(), config.tokensDir);

  if (!fs.existsSync(tokensDirAbs)) {
    console.error(
      `[design-studio] Error: tokens directory not found at "${tokensDirAbs}".`,
    );
    console.error(
      `[design-studio] Run "design-studio init" first to scaffold the project.`,
    );
    process.exit(1);
  }

  // ── 3. Find available HTTP port ───────────────────────────────────────────
  let httpPort: number;
  try {
    httpPort = await findFreePort(config.httpPort);
  } catch (err) {
    console.error(
      `[design-studio] Error: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  if (httpPort !== config.httpPort) {
    console.log(
      `[design-studio] Port ${config.httpPort} is in use; using port ${httpPort} instead.`,
    );
  } else {
    console.log(`[design-studio] HTTP server port: ${httpPort}`);
  }

  // ── 4 & 5. Start HTTP server and WebSocket server ─────────────────────────
  const engineState = createEngineState({ ...config, httpPort });

  // Use a mutable broadcast ref so we can create the HTTP server once, then
  // point the ref at the real WsServer.broadcast after the WS server is ready.
  // This avoids the double-server-creation anti-pattern.
  const broadcastRef: { fn: (msg: ServerMessage) => void } = {
    fn: (_msg) => { /* no-op until wsServer is ready */ },
  };

  // Create the HTTP server with a stable broadcast callback that delegates
  // through the ref.  The ref will be updated to the real broadcast below.
  const httpServer: http.Server = createServer(
    config,
    engineState,
    undefined,
    (msg) => broadcastRef.fn(msg),
  );

  // Attach the WebSocket server to the same HTTP server.
  const wsServer = createWsServer(config, engineState, httpServer);

  // Wire the real broadcast into the ref so all future HTTP mutations push
  // WebSocket messages to connected clients.
  broadcastRef.fn = wsServer.broadcast.bind(wsServer);

  // Start listening on the chosen port.
  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(httpPort, () => resolve());
  });

  // ── 6. Load all token files and build initial TokenGraph ──────────────────
  const tokenFiles = scanTokenFiles(tokensDirAbs);
  const allTokens: Token[] = [];
  const allErrors: TokenError[] = [];

  for (const filePath of tokenFiles) {
    let content: string;
    try {
      content = await fsp.readFile(filePath, 'utf8');
    } catch (err) {
      allErrors.push({
        kind: 'file-write',
        path: filePath,
        reason: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    const ext = path.extname(filePath).toLowerCase();
    const format: 'json' | 'yaml' =
      ext === '.yaml' || ext === '.yml' ? 'yaml' : 'json';

    const parsed = parseTokenFile(content, format);

    // Stamp each token with the absolute source file path
    for (const token of parsed.tokens) {
      allTokens.push({ ...token, sourceFile: filePath });
    }
    allErrors.push(...parsed.errors);
  }

  const graph = buildTokenGraph(allTokens);
  engineState.graph = graph;
  engineState.errors = allErrors;

  // Generate initial full CSS and write output files to disk (req 8.1–8.3, 9.1–9.3)
  await persistOutputFiles(engineState, config);

  // ── 7. Start File Watcher ─────────────────────────────────────────────────
  let fileWatcher: FileWatcher;
  try {
    fileWatcher = wireFileWatcher(
      engineState,
      broadcastRef.fn,
      tokensDirAbs,
    );
  } catch (err) {
    console.error(
      `[design-studio] Failed to start file watcher: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  // ── 8 & 9. Open browser and print URL ────────────────────────────────────
  const url = `http://localhost:${httpPort}`;
  console.log(`[design-studio] Design Studio is running at ${url}`);

  try {
    await open(url);
  } catch {
    // Opening the browser is best-effort — don't fail startup if it errors
    console.log(`[design-studio] Could not open browser automatically. Visit: ${url}`);
  }

  // ── 10. Block until SIGINT/SIGTERM; graceful shutdown ────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[design-studio] Received ${signal}, shutting down…`);

    try {
      await fileWatcher.close();
    } catch {
      // ignore watcher close errors
    }

    wsServer.close();

    httpServer.close(() => {
      console.log('[design-studio] Server stopped.');
      process.exit(0);
    });

    // Force-exit after 5 seconds if graceful shutdown hangs
    setTimeout(() => {
      console.error('[design-studio] Forced exit after timeout.');
      process.exit(1);
    }, 5000).unref();
  };

  process.once('SIGINT', () => { void shutdown('SIGINT'); });
  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
}
