/**
 * FileWatcher — watches a directory for token file changes and emits debounced
 * change events.
 *
 * Requirements:
 *   11.1 — File_Watcher SHALL detect Token_File changes within 500 ms.
 *   11.5 — Rapid successive saves < 100 ms apart are debounced to a single
 *           reload (debounceMs default = 80 ms).
 */

import path from 'node:path';

import chokidar from 'chokidar';

// ─── Types ────────────────────────────────────────────────────────────────────

export type WatchEvent = 'add' | 'change' | 'unlink';

export interface FileWatcherOptions {
  /** Directory to watch recursively for token files. */
  tokensDir: string;
  /**
   * Debounce delay in milliseconds.  When multiple events arrive for the same
   * file within this window only the last one fires `onChange`.
   * @default 80
   */
  debounceMs?: number;
  /** Called once per file per debounce window with the resolved path and event type. */
  onChange: (filePath: string, event: WatchEvent) => void;
}

export interface FileWatcher {
  /** Stop watching and release all resources. */
  close(): Promise<void>;
  /**
   * Resolves once chokidar has finished its initial directory scan and is
   * actively watching for changes.  Tests should await this before writing
   * files to ensure no events are missed.
   */
  ready: Promise<void>;
}

// ─── Implementation ───────────────────────────────────────────────────────────

/** Token file extensions that the watcher cares about. */
const TOKEN_EXTS = new Set(['.json', '.yaml', '.yml']);

function isTokenFile(absPath: string): boolean {
  return TOKEN_EXTS.has(path.extname(absPath).toLowerCase());
}

/**
 * Create a file watcher that monitors `tokensDir` recursively for `.json`,
 * `.yaml`, and `.yml` changes, debouncing rapid events per-file.
 *
 * Note: chokidar v4 has a known issue on Windows where glob patterns combined
 * with the `cwd` option do not fire events correctly.  We work around this by
 * watching the directory directly and filtering by extension in the handlers.
 * The `onChange` callback still receives *relative* paths (relative to
 * `tokensDir`) so callers can use `path.resolve(tokensDir, filePath)` as
 * before.
 */
export function createFileWatcher(options: FileWatcherOptions): FileWatcher {
  const { tokensDir, debounceMs = 80, onChange } = options;

  // Per-file debounce timers: relative filePath → pending NodeJS.Timeout
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  // Watch the directory directly (no glob, no cwd) to avoid a chokidar v4
  // Windows bug where cwd + glob silently drops events.
  const watcher = chokidar.watch(tokensDir, {
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: false,
  });

  const ready = new Promise<void>((resolve) => {
    watcher.on('ready', resolve);
  });

  function schedule(absPath: string, event: WatchEvent): void {
    if (!isTokenFile(absPath)) return;
    // Convert absolute path back to relative so the API contract is unchanged.
    const relPath = path.relative(tokensDir, absPath).replace(/\\/g, '/');
    const existing = timers.get(relPath);
    if (existing !== undefined) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      timers.delete(relPath);
      onChange(relPath, event);
    }, debounceMs);
    timers.set(relPath, timer);
  }

  watcher.on('add', (absPath) => schedule(absPath, 'add'));
  watcher.on('change', (absPath) => schedule(absPath, 'change'));
  watcher.on('unlink', (absPath) => schedule(absPath, 'unlink'));

  return {
    ready,
    async close(): Promise<void> {
      // Cancel all pending debounce timers before closing the watcher.
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
      await watcher.close();
    },
  };
}
