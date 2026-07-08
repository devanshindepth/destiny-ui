/**
 * EngineState — holds the mutable server-side state for the Design Studio
 * development server.  All mutations go through core functions that return
 * new immutable graphs; the state object itself is simply a container for
 * the latest snapshot.
 */

import {
  buildTokenGraph,
  type TokenGraph,
  type TokenError,
  type DesignStudioConfig,
} from '@destiny-ui/core';

// ─── Type ─────────────────────────────────────────────────────────────────────

export interface EngineState {
  /** The current token dependency graph (immutable snapshot). */
  graph: TokenGraph;
  /** Current resolved config (may differ from disk if hot-reloaded). */
  config: DesignStudioConfig;
  /** All accumulated errors from the most recent parse + validation run. */
  errors: TokenError[];
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a fresh EngineState from a config.
 * The graph starts empty — callers are expected to load token files and call
 * `buildTokenGraph` to populate it before the HTTP server starts accepting
 * traffic.
 */
export function createEngineState(config: DesignStudioConfig): EngineState {
  return {
    graph: buildTokenGraph([]),
    config,
    errors: [],
  };
}
