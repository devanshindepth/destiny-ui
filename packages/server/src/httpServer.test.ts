/**
 * Integration tests for the Design Studio HTTP API.
 *
 * Uses supertest against a real in-memory EngineState (no disk I/O — fs
 * write calls are mocked out so tests stay fast and side-effect-free).
 *
 * Requirements: 5.3, 5.5, 5.6
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

// Mock fs/promises so persistTokenFile never touches the disk.
// The module must expose a `default` export because httpServer.ts imports
// `fs` as `import fs from 'node:fs/promises'` (default import).
vi.mock('node:fs/promises', () => ({
  default: {
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import {
  buildTokenGraph,
  addToken as coreAddToken,
  type Token,
  type DesignStudioConfig,
} from '@destiny-ui/core';

import { createServer } from './httpServer.js';
import { createEngineState, type EngineState } from './engineState.js';

// ─── Shared test config ────────────────────────────────────────────────────────

const testConfig: DesignStudioConfig = {
  tokensDir: './tokens',
  cssOutputDir: './dist/css',
  dtcgOutputDir: './dist/tokens',
  httpPort: 3300,
  wsPort: 3301,
  outputFormat: 'json',
  previewPath: null,
};

// ─── Test fixture tokens ───────────────────────────────────────────────────────

const BASE_TOKEN: Token = {
  id: 'color.brand.primary',
  name: 'Brand Primary',
  category: 'brand-colors',
  type: 'color',
  value: '#FF0000FF',
  sourceFile: '/tmp/tokens/brand.json',
};

const ALIAS_TOKEN: Token = {
  id: 'color.semantic.action',
  name: 'Action',
  category: 'semantic-colors',
  type: 'color',
  value: { $alias: 'color.brand.primary' },
  sourceFile: '/tmp/tokens/semantic.json',
};

const EXTRA_TOKEN: Token = {
  id: 'color.brand.secondary',
  name: 'Brand Secondary',
  category: 'brand-colors',
  type: 'color',
  value: '#0000FFFF',
  sourceFile: '/tmp/tokens/brand.json',
};

/**
 * Build a fresh EngineState with 3 tokens:
 *   - color.brand.primary  (base color)
 *   - color.brand.secondary (base color)
 *   - color.semantic.action (aliases color.brand.primary)
 */
function buildTestState(): EngineState {
  const state = createEngineState(testConfig);
  let graph = buildTokenGraph([BASE_TOKEN, EXTRA_TOKEN, ALIAS_TOKEN]);
  state.graph = graph;
  return state;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('returns { data: { ok: true }, errors: [] }', async () => {
    const state = createEngineState(testConfig);
    const server = createServer(testConfig, state, '/nonexistent/spa');
    const res = await request(server).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { ok: true }, errors: [] });
  });
});

describe('GET /api/config', () => {
  it('returns the current config', async () => {
    const state = createEngineState(testConfig);
    const server = createServer(testConfig, state, '/nonexistent/spa');
    const res = await request(server).get('/api/config');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      httpPort: 3300,
      wsPort: 3301,
      outputFormat: 'json',
    });
    expect(res.body.errors).toEqual([]);
  });
});

describe('GET /api/tokens', () => {
  it('returns empty array for an empty state', async () => {
    const state = createEngineState(testConfig);
    const server = createServer(testConfig, state, '/nonexistent/spa');
    const res = await request(server).get('/api/tokens');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.errors).toEqual([]);
  });

  it('returns all tokens when the state has tokens', async () => {
    const state = buildTestState();
    const server = createServer(testConfig, state, '/nonexistent/spa');
    const res = await request(server).get('/api/tokens');

    expect(res.status).toBe(200);
    const ids = (res.body.data as Array<{ token: Token }>).map((t) => t.token.id);
    expect(ids).toContain('color.brand.primary');
    expect(ids).toContain('color.brand.secondary');
    expect(ids).toContain('color.semantic.action');
  });
});

describe('POST /api/tokens', () => {
  it('creates a token and returns 201 — token appears in subsequent GET', async () => {
    const state = createEngineState(testConfig);
    const server = createServer(testConfig, state, '/nonexistent/spa');

    const newToken = {
      id: 'color.brand.new',
      name: 'Brand New',
      category: 'brand-colors',
      type: 'color',
      value: '#00FF00FF',
      sourceFile: '/tmp/tokens/brand.json',
    };

    const postRes = await request(server).post('/api/tokens').send(newToken);
    expect(postRes.status).toBe(201);
    const postIds = (postRes.body.data as Array<{ token: Token }>).map((t) => t.token.id);
    expect(postIds).toContain('color.brand.new');

    // Token should also appear in a subsequent GET
    const getRes = await request(server).get('/api/tokens');
    const getIds = (getRes.body.data as Array<{ token: Token }>).map((t) => t.token.id);
    expect(getIds).toContain('color.brand.new');
  });

  it('returns 400 for missing required fields', async () => {
    const state = createEngineState(testConfig);
    const server = createServer(testConfig, state, '/nonexistent/spa');

    // Missing 'value' and 'sourceFile'
    const res = await request(server).post('/api/tokens').send({
      id: 'color.brand.oops',
      name: 'Oops',
      category: 'brand-colors',
      type: 'color',
    });

    expect(res.status).toBe(400);
    expect(res.body.data).toBeNull();
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  it('returns 400 for an empty body', async () => {
    const state = createEngineState(testConfig);
    const server = createServer(testConfig, state, '/nonexistent/spa');

    const res = await request(server).post('/api/tokens').send({});
    expect(res.status).toBe(400);
    expect(res.body.data).toBeNull();
  });

  it('returns 409 for a duplicate token id', async () => {
    const state = buildTestState();
    const server = createServer(testConfig, state, '/nonexistent/spa');

    // Try to create a token with an id that already exists
    const res = await request(server).post('/api/tokens').send({
      id: 'color.brand.primary',
      name: 'Brand Primary Duplicate',
      category: 'brand-colors',
      type: 'color',
      value: '#FFFFFFFF',
      sourceFile: '/tmp/tokens/brand.json',
    });

    expect(res.status).toBe(409);
    expect(res.body.data).toBeNull();
    expect(res.body.errors[0]?.kind).toBe('validation');
  });
});

describe('PUT /api/tokens/:id', () => {
  it('updates a token value and returns the new state', async () => {
    const state = buildTestState();
    const server = createServer(testConfig, state, '/nonexistent/spa');

    const res = await request(server)
      .put('/api/tokens/color.brand.primary')
      .send({ value: '#ABCDEFFF' });

    expect(res.status).toBe(200);
    const updated = (res.body.data as Array<{ token: Token; resolvedValue: string }>)
      .find((t) => t.token.id === 'color.brand.primary');
    expect(updated).toBeDefined();
    expect(updated!.resolvedValue).toBe('#ABCDEFFF');
    expect(res.body.errors).toEqual([]);
  });

  it('returns 404 for a non-existent token id', async () => {
    const state = buildTestState();
    const server = createServer(testConfig, state, '/nonexistent/spa');

    const res = await request(server)
      .put('/api/tokens/does.not.exist')
      .send({ value: '#FFFFFFFF' });

    expect(res.status).toBe(404);
    expect(res.body.data).toBeNull();
  });

  it('returns 400 when the body is missing the value field', async () => {
    const state = buildTestState();
    const server = createServer(testConfig, state, '/nonexistent/spa');

    // Send a body without `value`
    const res = await request(server)
      .put('/api/tokens/color.brand.primary')
      .send({ notAValue: 'something' });

    expect(res.status).toBe(400);
    expect(res.body.data).toBeNull();
  });

  it('returns 400 when no body is provided', async () => {
    const state = buildTestState();
    const server = createServer(testConfig, state, '/nonexistent/spa');

    const res = await request(server)
      .put('/api/tokens/color.brand.primary')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.status).toBe(400);
    expect(res.body.data).toBeNull();
  });
});

describe('DELETE /api/tokens/:id', () => {
  it('returns 404 for a non-existent token id', async () => {
    const state = buildTestState();
    const server = createServer(testConfig, state, '/nonexistent/spa');

    const res = await request(server).delete('/api/tokens/does.not.exist');
    expect(res.status).toBe(404);
    expect(res.body.data).toBeNull();
  });

  it('returns 409 with dependents when token is referenced by another token', async () => {
    const state = buildTestState();
    const server = createServer(testConfig, state, '/nonexistent/spa');

    // color.semantic.action aliases color.brand.primary, so deleting
    // color.brand.primary without confirm should yield 409
    const res = await request(server).delete('/api/tokens/color.brand.primary');

    expect(res.status).toBe(409);
    expect(Array.isArray(res.body.data.dependents)).toBe(true);
    expect(res.body.data.dependents).toContain('color.semantic.action');
    expect(res.body.errors).toEqual([]);
  });

  it('deletes successfully with ?confirm=true even when token has dependents', async () => {
    const state = buildTestState();
    const server = createServer(testConfig, state, '/nonexistent/spa');

    const res = await request(server)
      .delete('/api/tokens/color.brand.primary?confirm=true');

    expect(res.status).toBe(200);
    const ids = (res.body.data as Array<{ token: Token }>).map((t) => t.token.id);
    expect(ids).not.toContain('color.brand.primary');
  });

  it('deletes a token with no dependents without confirmation', async () => {
    const state = buildTestState();
    const server = createServer(testConfig, state, '/nonexistent/spa');

    // color.brand.secondary has no aliases pointing to it
    const res = await request(server).delete('/api/tokens/color.brand.secondary');

    expect(res.status).toBe(200);
    const ids = (res.body.data as Array<{ token: Token }>).map((t) => t.token.id);
    expect(ids).not.toContain('color.brand.secondary');
  });
});

describe('GET /api/errors', () => {
  it('returns an empty error list when there are no errors', async () => {
    const state = createEngineState(testConfig);
    const server = createServer(testConfig, state, '/nonexistent/spa');

    const res = await request(server).get('/api/errors');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [], errors: [] });
  });

  it('returns accumulated engine errors', async () => {
    const state = createEngineState(testConfig);
    state.errors = [
      { kind: 'file-write', path: '/tmp/tokens/brand.json', reason: 'permission denied' },
    ];
    const server = createServer(testConfig, state, '/nonexistent/spa');

    const res = await request(server).get('/api/errors');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].kind).toBe('file-write');
  });
});
