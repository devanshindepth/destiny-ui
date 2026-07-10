/**
 * outputPersistence — writes full CSS and DTCG output files to disk.
 *
 * Called on startup (after building the initial TokenGraph) and after every
 * token mutation (API or file watcher).  The WebSocket push always uses delta
 * CSS; this module is responsible for the on-disk representation only.
 *
 * Requirements: 8.1–8.3, 9.1–9.3
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import {
  serializeToCSS,
  serializeToDTCG,
  type DesignStudioConfig,
} from '@destiny-ui/core';

import { type EngineState } from './engineState.js';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Serialize the current `state.graph` to CSS and DTCG and write both output
 * files to disk.
 *
 * - CSS  → `<config.cssOutputDir>/tokens.css`   (full, no delta)
 * - DTCG → `<config.dtcgOutputDir>/tokens.json` (or `tokens.yaml` when
 *           `config.outputFormat === 'yaml'`)
 *
 * Output directories are created automatically if they don't exist.
 *
 * Errors are logged to stderr but not thrown — a write failure should never
 * crash the development server.
 */
export async function persistOutputFiles(
  state: EngineState,
  config: DesignStudioConfig,
): Promise<void> {
  await Promise.all([
    writeCssOutputFile(state, config),
    writeDtcgOutputFile(state, config),
  ]);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function writeCssOutputFile(
  state: EngineState,
  config: DesignStudioConfig,
): Promise<void> {
  try {
    const cssDir = path.resolve(config.cssOutputDir);
    await fs.mkdir(cssDir, { recursive: true });

    const css = serializeToCSS(state.graph, {});
    const outPath = path.join(cssDir, 'tokens.css');
    await fs.writeFile(outPath, css, 'utf8');
  } catch (err) {
    console.error(
      '[design-studio] Failed to write CSS output file:',
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function writeDtcgOutputFile(
  state: EngineState,
  config: DesignStudioConfig,
): Promise<void> {
  try {
    const dtcgDir = path.resolve(config.dtcgOutputDir);
    await fs.mkdir(dtcgDir, { recursive: true });

    const format = config.outputFormat ?? 'json';
    const ext = format === 'yaml' ? 'yaml' : 'json';
    const content = serializeToDTCG(state.graph, { format });
    const outPath = path.join(dtcgDir, `tokens.${ext}`);
    await fs.writeFile(outPath, content, 'utf8');
  } catch (err) {
    console.error(
      '[design-studio] Failed to write DTCG output file:',
      err instanceof Error ? err.message : String(err),
    );
  }
}
