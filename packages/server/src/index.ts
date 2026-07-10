/**
 * @destiny-ui/server — public API
 *
 * Exports the HTTP server factory, the WebSocket server factory, shared
 * message types, and the EngineState type + helper so that the CLI (and tests)
 * can import everything they need from a single location.
 */

export { createServer } from './httpServer.js';
export { createEngineState, type EngineState } from './engineState.js';
export {
  createWsServer,
  type WsServer,
  type ServerMessage,
  type CssPatchMessage,
  type ErrorUpdateMessage,
  type TokensReloadMessage,
  type HeartbeatMessage,
} from './wsServer.js';
export {
  createFileWatcher,
  type FileWatcher,
  type FileWatcherOptions,
  type WatchEvent,
} from './fileWatcher.js';
export { wireFileWatcher } from './watcherBridge.js';
export { persistOutputFiles } from './outputPersistence.js';
