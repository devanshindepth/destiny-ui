/**
 * Integration tests — File Watcher
 *
 * Requirements: 11.1, 11.2, 11.5, 7.6
 *
 * Tests:
 *   createFileWatcher — onChange events:
 *     1. Writing a .json file to tokensDir emits 'add' event after debounce
 *     2. Modifying an existing .json file emits 'change' event after debounce
 *     3. Deleting an existing .json file emits 'unlink' event after debounce
 *     4. Rapid successive writes (< 80 ms apart) emit only ONE onChange (debounce)
 *     5. Non-token files (.txt) are ignored — no onChange fires
 *
 *   wireFileWatcher — WebSocket broadcast integration:
 *     6. Writing a .json token file triggers CssPatchMessage broadcast within 200 ms
 *     7. Deleting a .json token file triggers TokensReloadMessage broadcast within 200 ms
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createFileWatcher, type FileWatcher, type WatchEvent } from './fileWatcher.js';
import { wireFileWatcher } from './watcherBridge.js';
import { createEngineState } from './engineState.js';
import { type ServerMessage } from './wsServer.js';
import { type DesignStudioConfig } from '@destiny-ui/core';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Poll until `condition()` returns true or `maxMs` elapses.
 * Throws if the deadline is exceeded.
 */
async function waitFor(condition: () => boolean, maxMs = 500): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > maxMs) throw new Error('waitFor timed out');
    await new Promise<void>((r) => setTimeout(r, 10));
  }
}

/** Minimal DTCG fixture with one color token. */
const TOKEN_FIXTURE = JSON.stringify({
  color: {
    brand: {
      primary: {
        $type: 'color',
        $value: '#FF0000FF',
      },
    },
  },
});

// ─── createFileWatcher — onChange events ──────────────────────────────────────

describe('createFileWatcher — onChange events', () => {
  let tokensDir: string;
  let watcher: FileWatcher | null;

  beforeEach(async () => {
    tokensDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fw-test-'));
    watcher = null;
  });

  afterEach(async () => {
    if (watcher) {
      await watcher.close();
      watcher = null;
    }
    await fs.rm(tokensDir, { recursive: true, force: true });
  });

  // ── Test 1: add event ──────────────────────────────────────────────────────

  it('emits add event when a .json file is written to tokensDir', async () => {
    const events: Array<{ filePath: string; event: WatchEvent }> = [];

    watcher = createFileWatcher({
      tokensDir,
      debounceMs: 80,
      onChange(filePath, event) {
        events.push({ filePath, event });
      },
    });

    // Wait for chokidar to finish its initial scan before writing the file.
    await watcher.ready;

    const tokenFile = path.join(tokensDir, 'brand.json');
    await fs.writeFile(tokenFile, TOKEN_FIXTURE, 'utf8');

    await waitFor(() => events.some((e) => e.event === 'add'), 600);

    const addEvent = events.find((e) => e.event === 'add');
    expect(addEvent).toBeDefined();
    expect(addEvent!.event).toBe('add');
    // chokidar emits relative paths (cwd: tokensDir)
    expect(addEvent!.filePath).toBe('brand.json');
  });

  // ── Test 2: change event ───────────────────────────────────────────────────

  it('emits change event when an existing .json file is modified', async () => {
    // Pre-create the file before the watcher starts so the initial 'add'
    // fires on watcher creation; we await ready + the initial add to settle
    // before testing the 'change' event.
    const tokenFile = path.join(tokensDir, 'brand.json');
    await fs.writeFile(tokenFile, TOKEN_FIXTURE, 'utf8');

    const events: Array<{ filePath: string; event: WatchEvent }> = [];

    watcher = createFileWatcher({
      tokensDir,
      debounceMs: 80,
      onChange(filePath, event) {
        events.push({ filePath, event });
      },
    });

    // Wait for initial scan to complete and initial 'add' event to arrive
    await watcher.ready;
    await waitFor(() => events.some((e) => e.event === 'add'), 500);

    // Clear captured events, then modify the file
    events.length = 0;
    const modified = JSON.stringify({
      color: { brand: { primary: { $type: 'color', $value: '#00FF00FF' } } },
    });
    await fs.writeFile(tokenFile, modified, 'utf8');

    await waitFor(() => events.some((e) => e.event === 'change'), 600);

    const changeEvent = events.find((e) => e.event === 'change');
    expect(changeEvent).toBeDefined();
    expect(changeEvent!.event).toBe('change');
    expect(changeEvent!.filePath).toBe('brand.json');
  });

  // ── Test 3: unlink event ───────────────────────────────────────────────────

  it('emits unlink event when an existing .json file is deleted', async () => {
    const tokenFile = path.join(tokensDir, 'brand.json');
    await fs.writeFile(tokenFile, TOKEN_FIXTURE, 'utf8');

    const events: Array<{ filePath: string; event: WatchEvent }> = [];

    watcher = createFileWatcher({
      tokensDir,
      debounceMs: 80,
      onChange(filePath, event) {
        events.push({ filePath, event });
      },
    });

    // Wait for initial scan + initial add to settle
    await watcher.ready;
    await waitFor(() => events.some((e) => e.event === 'add'), 500);

    events.length = 0;
    await fs.unlink(tokenFile);

    await waitFor(() => events.some((e) => e.event === 'unlink'), 600);

    const unlinkEvent = events.find((e) => e.event === 'unlink');
    expect(unlinkEvent).toBeDefined();
    expect(unlinkEvent!.event).toBe('unlink');
    expect(unlinkEvent!.filePath).toBe('brand.json');
  });

  // ── Test 4: debounce — rapid writes collapse to one onChange ───────────────

  it('rapid successive writes (< 80 ms apart) emit only ONE onChange', async () => {
    const events: Array<{ filePath: string; event: WatchEvent }> = [];

    watcher = createFileWatcher({
      tokensDir,
      debounceMs: 80,
      onChange(filePath, event) {
        events.push({ filePath, event });
      },
    });

    // Wait for chokidar to be ready before writing files
    await watcher.ready;

    const tokenFile = path.join(tokensDir, 'rapid.json');

    // Write the file 3 times within ~30 ms total — all within the 80 ms debounce window
    await fs.writeFile(tokenFile, TOKEN_FIXTURE, 'utf8');
    await new Promise<void>((r) => setTimeout(r, 10));
    await fs.writeFile(tokenFile, TOKEN_FIXTURE, 'utf8');
    await new Promise<void>((r) => setTimeout(r, 10));
    await fs.writeFile(tokenFile, TOKEN_FIXTURE, 'utf8');

    // Wait for the debounce to flush (80 ms debounce + buffer)
    await new Promise<void>((r) => setTimeout(r, 250));

    // Only 1 event should have fired despite 3 writes
    expect(events.length).toBe(1);
  });

  // ── Test 5: non-token files are ignored ───────────────────────────────────

  it('ignores non-token files (.txt) — no onChange fires', async () => {
    const events: Array<{ filePath: string; event: WatchEvent }> = [];

    watcher = createFileWatcher({
      tokensDir,
      debounceMs: 80,
      onChange(filePath, event) {
        events.push({ filePath, event });
      },
    });

    await watcher.ready;

    // Write a .txt file — not matched by the glob **/*.{json,yaml,yml}
    const txtFile = path.join(tokensDir, 'notes.txt');
    await fs.writeFile(txtFile, 'hello', 'utf8');

    // Wait long enough that a debounce + delivery would have occurred
    await new Promise<void>((r) => setTimeout(r, 300));

    expect(events.length).toBe(0);
  });
});

// ─── wireFileWatcher — WebSocket broadcast integration ────────────────────────

describe('wireFileWatcher — WebSocket broadcast integration', () => {
  let tokensDir: string;
  let watcher: FileWatcher | null;

  const testConfig: DesignStudioConfig = {
    tokensDir: './tokens',
    cssOutputDir: './dist/css',
    dtcgOutputDir: './dist/tokens',
    httpPort: 3400,
    wsPort: 3401,
    outputFormat: 'json',
    previewPath: null,
  };

  beforeEach(async () => {
    tokensDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fw-bridge-'));
    watcher = null;
  });

  afterEach(async () => {
    if (watcher) {
      await watcher.close();
      watcher = null;
    }
    await fs.rm(tokensDir, { recursive: true, force: true });
  });

  // ── Test 6: CssPatchMessage on add/change ─────────────────────────────────

  it('broadcasts CssPatchMessage within 200 ms of writing a .json token file', async () => {
    const broadcast = vi.fn<(msg: ServerMessage) => void>();
    const state = createEngineState(testConfig);

    watcher = wireFileWatcher(state, broadcast, tokensDir, 80);

    // Wait for chokidar to be ready before writing the file
    await watcher.ready;

    const tokenFile = path.join(tokensDir, 'brand.json');
    const writeTime = Date.now();
    await fs.writeFile(tokenFile, TOKEN_FIXTURE, 'utf8');

    await waitFor(
      () => broadcast.mock.calls.some(([msg]) => msg.type === 'css-patch'),
      500,
    );

    const elapsed = Date.now() - writeTime;
    expect(elapsed).toBeLessThan(500);

    const patchCall = broadcast.mock.calls.find(([msg]) => msg.type === 'css-patch');
    expect(patchCall).toBeDefined();

    const patchMsg = patchCall![0];
    expect(patchMsg.type).toBe('css-patch');
    if (patchMsg.type === 'css-patch') {
      expect(typeof patchMsg.css).toBe('string');
      expect(patchMsg.css.length).toBeGreaterThan(0);
      expect(Array.isArray(patchMsg.tokenIds)).toBe(true);
    }
  });

  // ── Test 7: TokensReloadMessage on unlink ─────────────────────────────────

  it('broadcasts TokensReloadMessage within 200 ms of deleting a .json token file', async () => {
    // Pre-create file so watcher picks it up on start (ignoreInitial: false)
    const tokenFile = path.join(tokensDir, 'brand.json');
    await fs.writeFile(tokenFile, TOKEN_FIXTURE, 'utf8');

    const broadcast = vi.fn<(msg: ServerMessage) => void>();
    const state = createEngineState(testConfig);

    watcher = wireFileWatcher(state, broadcast, tokensDir, 80);

    // Wait for initial scan to complete and the initial add/css-patch to fire
    await watcher.ready;
    await waitFor(
      () => broadcast.mock.calls.some(([msg]) => msg.type === 'css-patch'),
      500,
    );

    // Clear call history then delete the file
    broadcast.mockClear();
    const deleteTime = Date.now();
    await fs.unlink(tokenFile);

    await waitFor(
      () => broadcast.mock.calls.some(([msg]) => msg.type === 'tokens-reload'),
      500,
    );

    const elapsed = Date.now() - deleteTime;
    expect(elapsed).toBeLessThan(500);

    const reloadCall = broadcast.mock.calls.find(([msg]) => msg.type === 'tokens-reload');
    expect(reloadCall).toBeDefined();

    const reloadMsg = reloadCall![0];
    expect(reloadMsg.type).toBe('tokens-reload');
    if (reloadMsg.type === 'tokens-reload') {
      expect(Array.isArray(reloadMsg.tokens)).toBe(true);
    }
  });
});
