/**
 * WatcherBridge — wires the FileWatcher to the token engine and WebSocket
 * broadcast.  Listens for add/change/unlink events, diffs the graph, applies
 * mutations, and broadcasts the appropriate ServerMessage to all clients.
 *
 * Requirements:
 *   11.2 — On file change, diff tokens and apply incremental graph mutations.
 *   11.3 — On file change, broadcast CssPatchMessage with delta CSS.
 *   11.4 — On file unlink, remove all tokens from that file and broadcast
 *           TokensReloadMessage.
 *   7.6  — Error state is broadcast via ErrorUpdateMessage after every change.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import {
  parseTokenFile,
  addToken,
  removeToken,
  updateTokenValue,
  serializeToCSS,
  resolveAll,
  type TokenError,
  type ResolvedToken,
} from '@destiny-ui/core';

import { createFileWatcher, type FileWatcher } from './fileWatcher.js';
import { type EngineState } from './engineState.js';
import { type ServerMessage } from './wsServer.js';
import { persistOutputFiles } from './outputPersistence.js';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Wire a FileWatcher to the token engine and WebSocket broadcast.
 *
 * @param state       - Mutable engine state; graph and errors are updated in place.
 * @param broadcast   - Callback to push a ServerMessage to all WS clients.
 * @param tokensDir   - The root directory being watched.
 * @param debounceMs  - Optional debounce delay forwarded to the FileWatcher.
 * @returns The created FileWatcher (caller is responsible for closing it).
 */
export function wireFileWatcher(
  state: EngineState,
  broadcast: (msg: ServerMessage) => void,
  tokensDir: string,
  debounceMs?: number,
): FileWatcher {
  return createFileWatcher({
    tokensDir,
    debounceMs,
    onChange(filePath, event) {
      // filePath from chokidar is relative to tokensDir (cwd option).
      const absoluteFilePath = path.resolve(tokensDir, filePath);

      if (event === 'add' || event === 'change') {
        handleAddOrChange(state, broadcast, absoluteFilePath).catch((err) => {
          console.error('[watcherBridge] Error handling file event:', err);
        });
      } else if (event === 'unlink') {
        handleUnlink(state, broadcast, absoluteFilePath).catch((err) => {
          console.error('[watcherBridge] Error handling unlink event:', err);
        });
      }
    },
  });
}

// ─── Event handlers ───────────────────────────────────────────────────────────

/**
 * Handle `add` and `change` events.
 *
 * 1. Read file content.
 * 2. Parse tokens from content.
 * 3. Diff new parsed tokens against existing tokens for this file in the graph.
 * 4. Apply addToken / updateTokenValue / removeToken mutations.
 * 5. Serialize delta CSS for affected token IDs.
 * 6. Update state.errors.
 * 7. Broadcast CssPatchMessage + ErrorUpdateMessage.
 */
async function handleAddOrChange(
  state: EngineState,
  broadcast: (msg: ServerMessage) => void,
  absoluteFilePath: string,
): Promise<void> {
  // ── 1. Read file ─────────────────────────────────────────────────────────
  let content: string;
  try {
    content = await fs.readFile(absoluteFilePath, 'utf8');
  } catch (err) {
    const readError: TokenError = {
      kind: 'file-write',
      path: absoluteFilePath,
      reason: err instanceof Error ? err.message : String(err),
    };
    state.errors = [
      ...state.errors.filter((e) => !isErrorForFile(e, absoluteFilePath)),
      readError,
    ];
    broadcast({ type: 'error-update', errors: state.errors });
    return;
  }

  // ── 2. Detect format and parse ─────────────────────────────────────────
  const ext = path.extname(absoluteFilePath).toLowerCase();
  const format: 'json' | 'yaml' =
    ext === '.yaml' || ext === '.yml' ? 'yaml' : 'json';

  const parseResult = parseTokenFile(content, format);

  // Stamp each parsed token with the absolute source file path
  const newTokens = parseResult.tokens.map((t) => ({
    ...t,
    sourceFile: absoluteFilePath,
  }));

  // Stamp parse errors with the file path
  const newErrors = parseResult.errors.map((e) => {
    if (e.kind === 'parse') {
      return { ...e, filePath: absoluteFilePath };
    }
    return e;
  });

  // ── 3. Collect existing tokens from the graph for this file ───────────
  const existingTokenIds = new Set<string>();
  for (const [id, token] of state.graph.tokens) {
    if (token.sourceFile === absoluteFilePath) {
      existingTokenIds.add(id);
    }
  }

  const newTokenMap = new Map(newTokens.map((t) => [t.id, t]));
  const affectedIds = new Set<string>();

  // ── 4. Diff and apply mutations ───────────────────────────────────────
  // Tokens in new parse but not in graph → add
  for (const [id, newToken] of newTokenMap) {
    if (!existingTokenIds.has(id)) {
      state.graph = addToken(state.graph, newToken);
      affectedIds.add(id);
    }
  }

  // Tokens in both → update if value changed
  for (const [id, newToken] of newTokenMap) {
    if (existingTokenIds.has(id)) {
      const existing = state.graph.tokens.get(id);
      if (existing && !valuesEqual(existing.value, newToken.value)) {
        state.graph = updateTokenValue(state.graph, id, newToken.value);
        affectedIds.add(id);
      } else {
        // No value change, but still report as affected for CSS re-emit
        affectedIds.add(id);
      }
    }
  }

  // Tokens in graph but not in new parse → remove
  for (const id of existingTokenIds) {
    if (!newTokenMap.has(id)) {
      state.graph = removeToken(state.graph, id);
      affectedIds.add(id);
    }
  }

  // ── 5. Update state.errors ───────────────────────────────────────────
  state.errors = [
    ...state.errors.filter((e) => !isErrorForFile(e, absoluteFilePath)),
    ...newErrors,
  ];

  // ── 6. Serialize delta CSS for affected token IDs ────────────────────
  // Only serialize IDs that still exist in the graph (removed ones have no CSS)
  const existingAffectedIds = [...affectedIds].filter((id) =>
    state.graph.tokens.has(id),
  );

  const deltaCss =
    existingAffectedIds.length > 0
      ? serializeToCSS(state.graph, { tokenIds: existingAffectedIds })
      : ':root {}\n';

  // ── 7. Broadcast ─────────────────────────────────────────────────────
  broadcast({
    type: 'css-patch',
    css: deltaCss,
    tokenIds: existingAffectedIds,
  });
  broadcast({ type: 'error-update', errors: state.errors });

  // Write full CSS and DTCG output files to disk (req 8.1–8.3, 9.1–9.3)
  await persistOutputFiles(state, state.config);
}

/**
 * Handle `unlink` events.
 *
 * 1. Collect all tokenIds in the graph for this file.
 * 2. Remove each token from the graph.
 * 3. Remove errors associated with those tokens.
 * 4. Resolve all remaining tokens.
 * 5. Broadcast TokensReloadMessage + ErrorUpdateMessage.
 */
async function handleUnlink(
  state: EngineState,
  broadcast: (msg: ServerMessage) => void,
  absoluteFilePath: string,
): Promise<void> {
  // ── 1. Collect token IDs from this file ───────────────────────────────
  const tokenIdsToRemove: string[] = [];
  for (const [id, token] of state.graph.tokens) {
    if (token.sourceFile === absoluteFilePath) {
      tokenIdsToRemove.push(id);
    }
  }

  // ── 2. Remove each token ──────────────────────────────────────────────
  for (const id of tokenIdsToRemove) {
    state.graph = removeToken(state.graph, id);
  }

  // ── 3. Remove errors for this file ────────────────────────────────────
  state.errors = state.errors.filter(
    (e) => !isErrorForFile(e, absoluteFilePath),
  );

  // ── 4. Build full resolved token list ─────────────────────────────────
  const resolvedMap = resolveAll(state.graph);
  const resolvedTokens: ResolvedToken[] = [];
  for (const [, entry] of resolvedMap) {
    if (!('kind' in entry)) {
      resolvedTokens.push(entry as ResolvedToken);
    }
  }

  // ── 5. Broadcast ──────────────────────────────────────────────────────
  broadcast({ type: 'tokens-reload', tokens: resolvedTokens });
  broadcast({ type: 'error-update', errors: state.errors });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Determine whether a TokenError is associated with the given file.
 * Covers parse errors (filePath), file-write errors (path), validation errors
 * (tokenId prefix derived from file path — best-effort), and checksum errors.
 */
function isErrorForFile(error: TokenError, absoluteFilePath: string): boolean {
  switch (error.kind) {
    case 'parse':
      return error.filePath === absoluteFilePath;
    case 'file-write':
    case 'checksum-mismatch':
      return error.path === absoluteFilePath;
    case 'validation':
    case 'unresolved-reference':
    case 'cycle':
      // These errors don't carry a file path — they are cleared when the
      // file's tokens are removed from state.errors during a file change.
      // They will be filtered by token ID when the new parse result replaces them.
      return false;
    default:
      return false;
  }
}

/**
 * Deep-equality check for TokenValue.
 * Used to avoid spurious `updateTokenValue` calls when the value hasn't changed.
 */
function valuesEqual(
  a: import('@destiny-ui/core').TokenValue,
  b: import('@destiny-ui/core').TokenValue,
): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  // Both objects (AliasValue or ShadowValue or array)
  return JSON.stringify(a) === JSON.stringify(b);
}
