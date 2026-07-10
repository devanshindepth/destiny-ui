/**
 * HTTP Server — Express-based REST API and static SPA server for Design Studio.
 *
 * Endpoints:
 *   GET  /api/health          → { ok: true }
 *   GET  /api/config          → current DesignStudioConfig
 *   GET  /api/tokens          → all resolved tokens + engine errors
 *   PUT  /api/tokens/:id      → update token value, persist, return new state
 *   POST /api/tokens          → create new token, persist
 *   DELETE /api/tokens/:id    → delete token (409 if dependents unless ?confirm=true)
 *   GET  /api/errors          → current engine errors
 *   GET  /*                   → serve static SPA files (catch-all)
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';

import {
  resolveAll,
  updateTokenValue,
  addToken,
  removeToken,
  getDependents,
  parseTokenFile,
  serializeToDTCG,
  serializeToCSS,
  isAlias,
  type DesignStudioConfig,
  type TokenError,
  type ResolvedToken,
  type Token,
  type TokenValue,
  type TokenCategory,
  type TokenType,
} from '@destiny-ui/core';

import { type EngineState } from './engineState.js';
import { type ServerMessage } from './wsServer.js';
import { persistOutputFiles } from './outputPersistence.js';

// ─── Response envelope ────────────────────────────────────────────────────────

interface ApiResponse<T> {
  data: T | null;
  errors: TokenError[];
}

function ok<T>(data: T, errors: TokenError[] = []): ApiResponse<T> {
  return { data, errors };
}

function fail(errors: TokenError[]): ApiResponse<null> {
  return { data: null, errors };
}

// ─── Persistence helpers ──────────────────────────────────────────────────────

/**
 * Detect the file format from its extension.
 */
function detectFormat(filePath: string): 'json' | 'yaml' {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.yaml' || ext === '.yml' ? 'yaml' : 'json';
}

/**
 * Read a token file, update the given token's entry in it, then write it back.
 *
 * Strategy:
 *  1. Read the current file content.
 *  2. Parse it back into tokens via parseTokenFile (to get all tokens in file).
 *  3. Replace the matching token, re-build a minimal graph for that file's
 *     tokens, serialize back to DTCG and write.
 *
 * NOTE: We re-serialize the *whole file* to avoid drift between the in-memory
 * graph and the on-disk representation.  Only the file that owns the changed
 * token is touched.
 */
async function persistTokenFile(
  state: EngineState,
  sourceFile: string,
): Promise<TokenError | null> {
  try {
    const format = detectFormat(sourceFile);

    // Collect all tokens that belong to this source file from the current graph
    const fileTokens: Token[] = [];
    for (const token of state.graph.tokens.values()) {
      if (token.sourceFile === sourceFile) {
        fileTokens.push(token);
      }
    }

    // Build a temporary graph just for serialization purposes
    const { buildTokenGraph } = await import('@destiny-ui/core');
    const tmpGraph = buildTokenGraph(fileTokens);

    const content = serializeToDTCG(tmpGraph, { format });
    await fs.writeFile(sourceFile, content, 'utf8');
    return null;
  } catch (err) {
    return {
      kind: 'file-write',
      path: sourceFile,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Resolved token extraction ────────────────────────────────────────────────

interface TokensPayload {
  tokens: Array<ResolvedToken & { error?: TokenError }>;
  errors: TokenError[];
}

function buildTokensPayload(state: EngineState): TokensPayload {
  const resolved = resolveAll(state.graph);
  const tokens: Array<ResolvedToken & { error?: TokenError }> = [];

  for (const [, entry] of resolved) {
    if ((entry as TokenError).kind !== undefined) {
      // It's an error entry — still surface it with the raw token if available
      const err = entry as TokenError;
      const tokenId =
        'tokenId' in err ? err.tokenId : 'cycle' in err ? (err as { cycle: string[] }).cycle[0] : '';
      const rawToken = tokenId ? state.graph.tokens.get(tokenId) : undefined;
      if (rawToken) {
        tokens.push({
          token: rawToken,
          resolvedValue: rawToken.value as never,
          aliasChain: [],
          error: err,
        });
      }
    } else {
      tokens.push(entry as ResolvedToken);
    }
  }

  return { tokens, errors: state.errors };
}

// ─── Request body types ───────────────────────────────────────────────────────

interface PutTokenBody {
  value: TokenValue;
}

interface PostTokenBody {
  id: string;
  name: string;
  category: TokenCategory;
  type: TokenType;
  value: TokenValue;
  description?: string;
  sourceFile: string;
}

// ─── Server factory ───────────────────────────────────────────────────────────

/**
 * Create and return an `http.Server` that mounts the Design Studio REST API
 * and serves the editor SPA as static files.
 *
 * @param config    - Design Studio configuration (ports, paths, etc.)
 * @param state     - Mutable engine state object shared with the caller.
 *                    All API mutations update this object in-place so that
 *                    WebSocket handlers (owned by the caller) can observe
 *                    the latest graph and errors.
 * @param distPath  - Optional path to the SPA dist directory.  Defaults to a
 *                    sensible relative path for development.
 * @param broadcast - Optional callback invoked after every successful token
 *                    mutation with the appropriate `ServerMessage` to push to
 *                    all connected WebSocket clients.
 */
export function createServer(
  config: DesignStudioConfig,
  state: EngineState,
  distPath?: string,
  broadcast?: (message: ServerMessage) => void,
): http.Server {
  const app = express();
  app.use(express.json());

  // Resolve the SPA dist path.
  // fileURLToPath correctly handles Windows file:///C:/... URLs, converting
  // them to C:\... paths, which path.resolve then processes correctly.
  const spaDistPath =
    distPath ??
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../editor/dist',
    );

  // ── GET /api/health ──────────────────────────────────────────────────────
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json(ok({ ok: true }));
  });

  // ── GET /api/config ──────────────────────────────────────────────────────
  app.get('/api/config', (_req: Request, res: Response) => {
    res.json(ok(state.config));
  });

  // ── GET /api/errors ──────────────────────────────────────────────────────
  app.get('/api/errors', (_req: Request, res: Response) => {
    res.json(ok(state.errors));
  });

  // ── GET /api/tokens ──────────────────────────────────────────────────────
  app.get('/api/tokens', (_req: Request, res: Response) => {
    const payload = buildTokensPayload(state);
    res.json(ok(payload.tokens, payload.errors));
  });

  // ── PUT /api/tokens/:id ──────────────────────────────────────────────────
  app.put('/api/tokens/:id', async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as PutTokenBody;

    if (body === undefined || body.value === undefined) {
      res.status(400).json(fail([
        {
          kind: 'validation',
          tokenId: id,
          field: 'value',
          message: 'Request body must contain a "value" field.',
        },
      ]));
      return;
    }

    const existingToken = state.graph.tokens.get(id);
    if (!existingToken) {
      res.status(404).json(fail([
        {
          kind: 'validation',
          tokenId: id,
          field: 'value',
          message: `Token "${id}" not found.`,
        },
      ]));
      return;
    }

    // Validate alias reference exists (if new value is an alias)
    if (isAlias(body.value)) {
      const targetId = body.value.$alias;
      if (!state.graph.tokens.has(targetId)) {
        res.status(422).json(fail([
          {
            kind: 'unresolved-reference',
            tokenId: id,
            referencedId: targetId,
          },
        ]));
        return;
      }
    }

    // Update graph (returns new immutable graph)
    const newGraph = updateTokenValue(state.graph, id, body.value);
    state.graph = newGraph;

    // Persist the token's source file
    const writeErr = await persistTokenFile(state, existingToken.sourceFile);
    if (writeErr) {
      state.errors = [...state.errors, writeErr];
    }

    // Write full CSS and DTCG output files to disk (req 8.1–8.3, 9.1–9.3)
    await persistOutputFiles(state, config);

    const payload = buildTokensPayload(state);

    // Broadcast delta CSS patch + errors to WebSocket clients
    if (broadcast) {
      const deltaCss = serializeToCSS(state.graph, { tokenIds: [id] });
      broadcast({ type: 'css-patch', css: deltaCss, tokenIds: [id] });
      broadcast({ type: 'error-update', errors: state.errors });
    }

    res.json(ok(payload.tokens, payload.errors));
  });

  // ── POST /api/tokens ─────────────────────────────────────────────────────
  app.post('/api/tokens', async (req: Request, res: Response) => {
    const body = req.body as PostTokenBody;

    // Basic validation
    if (!body?.id || !body?.name || !body?.category || !body?.type || body?.value === undefined || !body?.sourceFile) {
      res.status(400).json(fail([
        {
          kind: 'validation',
          tokenId: body?.id ?? '(unknown)',
          field: 'name',
          message: 'Request body must contain: id, name, category, type, value, sourceFile.',
        },
      ]));
      return;
    }

    // Check for duplicate id
    if (state.graph.tokens.has(body.id)) {
      res.status(409).json(fail([
        {
          kind: 'validation',
          tokenId: body.id,
          field: 'name',
          message: `Token with id "${body.id}" already exists.`,
        },
      ]));
      return;
    }

    // Check for duplicate name within the same category
    for (const token of state.graph.tokens.values()) {
      if (token.category === body.category && token.name === body.name) {
        res.status(409).json(fail([
          {
            kind: 'validation',
            tokenId: body.id,
            field: 'name',
            message: `A token named "${body.name}" already exists in category "${body.category}".`,
          },
        ]));
        return;
      }
    }

    // Validate alias reference exists (if value is an alias)
    if (isAlias(body.value)) {
      const targetId = body.value.$alias;
      if (!state.graph.tokens.has(targetId)) {
        res.status(422).json(fail([
          {
            kind: 'unresolved-reference',
            tokenId: body.id,
            referencedId: targetId,
          },
        ]));
        return;
      }
    }

    const newToken: Token = {
      id: body.id,
      name: body.name,
      category: body.category,
      type: body.type,
      value: body.value,
      sourceFile: body.sourceFile,
      ...(body.description !== undefined ? { description: body.description } : {}),
    };

    const newGraph = addToken(state.graph, newToken);
    state.graph = newGraph;

    const writeErr = await persistTokenFile(state, body.sourceFile);
    if (writeErr) {
      state.errors = [...state.errors, writeErr];
    }

    // Write full CSS and DTCG output files to disk (req 8.1–8.3, 9.1–9.3)
    await persistOutputFiles(state, config);

    const payload = buildTokensPayload(state);

    // Broadcast delta CSS patch + errors to WebSocket clients
    if (broadcast) {
      const deltaCss = serializeToCSS(state.graph, { tokenIds: [body.id] });
      broadcast({ type: 'css-patch', css: deltaCss, tokenIds: [body.id] });
      broadcast({ type: 'error-update', errors: state.errors });
    }

    res.status(201).json(ok(payload.tokens, payload.errors));
  });

  // ── DELETE /api/tokens/:id ───────────────────────────────────────────────
  app.delete('/api/tokens/:id', async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const confirm = req.query['confirm'] === 'true';

    const existingToken = state.graph.tokens.get(id);
    if (!existingToken) {
      res.status(404).json(fail([
        {
          kind: 'validation',
          tokenId: id,
          field: 'name',
          message: `Token "${id}" not found.`,
        },
      ]));
      return;
    }

    // Check dependents
    const dependents = getDependents(state.graph, id);
    if (dependents.length > 0 && !confirm) {
      res.status(409).json({ data: { dependents }, errors: [] });
      return;
    }

    const newGraph = removeToken(state.graph, id);
    state.graph = newGraph;

    const writeErr = await persistTokenFile(state, existingToken.sourceFile);
    if (writeErr) {
      state.errors = [...state.errors, writeErr];
    }

    // Write full CSS and DTCG output files to disk (req 8.1–8.3, 9.1–9.3)
    await persistOutputFiles(state, config);

    const payload = buildTokensPayload(state);

    // After deletion, broadcast a full tokens-reload since the token no longer
    // exists (delta CSS for a deleted token would be empty / meaningless).
    // Also broadcast updated errors.
    if (broadcast) {
      const resolvedTokens = resolveAll(state.graph);
      const tokens: import('@destiny-ui/core').ResolvedToken[] = [];
      for (const [, entry] of resolvedTokens) {
        if (!('kind' in entry)) {
          tokens.push(entry as import('@destiny-ui/core').ResolvedToken);
        }
      }
      broadcast({ type: 'tokens-reload', tokens });
      broadcast({ type: 'error-update', errors: state.errors });
    }

    res.json(ok(payload.tokens, payload.errors));
  });

  // ── Static SPA (catch-all) ───────────────────────────────────────────────
  app.use(express.static(spaDistPath));

  app.get('*', (_req: Request, res: Response) => {
    const indexPath = path.join(spaDistPath, 'index.html');
    res.sendFile(indexPath, (err) => {
      if (err) {
        // SPA dist not built yet — return a helpful placeholder
        res.status(200).send(
          '<!DOCTYPE html><html><body>' +
          '<p>Design Studio editor is not built yet. ' +
          'Run <code>pnpm --filter @destiny-ui/editor build</code> first.</p>' +
          '</body></html>',
        );
      }
    });
  });

  // ── Error handler ────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[design-studio] Unhandled error:', err);
    res.status(500).json(fail([
      {
        kind: 'file-write',
        path: '',
        reason: err.message,
      },
    ]));
  });

  return http.createServer(app);
}
