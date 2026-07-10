/**
 * Token Graph construction, resolution, and mutation.
 *
 * The TokenGraph is an immutable directed acyclic graph (DAG). All mutation
 * operations return a new graph rather than modifying the existing one.
 *
 * Key algorithms:
 * - Graph construction: Kahn's topological sort + cycle detection
 * - Resolution: in-place traversal of alias chains in topological order
 * - Incremental update: BFS over reverseEdges to find dependents, then
 *   re-resolve only the invalidated subset
 */

import {
  isAlias,
  type Token,
  type TokenGraph,
  type TokenValue,
  type ResolvedToken,
  type TokenError,
  type CycleError,
  type UnresolvedReferenceError,
  type BaseValue,
} from './types.js';

// ─── Alias resolution helpers ────────────────────────────────────────────────

function extractAliases(val: unknown): string[] {
  if (typeof val === 'object' && val !== null) {
    if ('$alias' in val && typeof (val as any)['$alias'] === 'string') {
      return [(val as any)['$alias']];
    }
    const aliases: string[] = [];
    if (Array.isArray(val)) {
      for (const item of val) aliases.push(...extractAliases(item));
    } else {
      for (const item of Object.values(val)) aliases.push(...extractAliases(item));
    }
    return aliases;
  }
  return [];
}

function resolveDeep(
  val: unknown,
  resolvedCache: Map<string, ResolvedToken | TokenError>,
  tokenId: string,
  activeMode?: string,
): { resolved: unknown; error?: UnresolvedReferenceError; chain: string[] } {
  if (typeof val === 'object' && val !== null) {
    if ('$alias' in val && typeof (val as any)['$alias'] === 'string') {
      const targetId = (val as any)['$alias'];
      const cached = resolvedCache.get(targetId);
      if (cached === undefined || (cached as TokenError).kind !== undefined) {
        return { 
          resolved: null, 
          error: { kind: 'unresolved-reference', tokenId, referencedId: targetId },
          chain: []
        };
      }
      const resolvedTarget = cached as ResolvedToken;
      let targetValue = resolvedTarget.resolvedValue;
      if (activeMode && resolvedTarget.modes?.[activeMode] !== undefined) {
        targetValue = resolvedTarget.modes[activeMode];
      }
      return { 
        resolved: targetValue,
        chain: [targetId, ...resolvedTarget.aliasChain] 
      };
    }
    if (Array.isArray(val)) {
      const resArray = [];
      const combinedChain: string[] = [];
      for (const item of val) {
        const r = resolveDeep(item, resolvedCache, tokenId, activeMode);
        if (r.error) return r;
        resArray.push(r.resolved);
        combinedChain.push(...r.chain);
      }
      return { resolved: resArray, chain: combinedChain };
    }
    const resObj: Record<string, unknown> = {};
    const combinedChain: string[] = [];
    for (const [k, v] of Object.entries(val)) {
      const r = resolveDeep(v, resolvedCache, tokenId, activeMode);
      if (r.error) return r;
      resObj[k] = r.resolved;
      combinedChain.push(...r.chain);
    }
    return { resolved: resObj, chain: combinedChain };
  }
  return { resolved: val, chain: [] };
}

// ─── Internal mutable graph type ─────────────────────────────────────────────

interface MutableGraph {
  tokens: Map<string, Token>;
  edges: Map<string, Set<string>>;
  reverseEdges: Map<string, Set<string>>;
  topoOrder: string[];
  resolvedCache: Map<string, ResolvedToken | TokenError>;
}

// ─── Edge helpers ─────────────────────────────────────────────────────────────

function addEdge(
  edges: Map<string, Set<string>>,
  from: string,
  to: string,
): void {
  let set = edges.get(from);
  if (!set) {
    set = new Set();
    edges.set(from, set);
  }
  set.add(to);
}

function removeEdge(
  edges: Map<string, Set<string>>,
  from: string,
  to: string,
): void {
  const set = edges.get(from);
  if (set) {
    set.delete(to);
    if (set.size === 0) {
      edges.delete(from);
    }
  }
}

// ─── Kahn's algorithm ────────────────────────────────────────────────────────

/**
 * Run Kahn's topological sort over the given token set.
 *
 * Returns:
 * - `topoOrder`: IDs in resolution order (base tokens first, no cycle nodes)
 * - `cycleNodes`: IDs of tokens that could never reach in-degree 0 (i.e.,
 *   are part of a cycle)
 */
function kahnSort(
  tokenIds: string[],
  edges: Map<string, Set<string>>,
  reverseEdges: Map<string, Set<string>>,
): { topoOrder: string[]; cycleNodes: Set<string> } {
  // Compute in-degree: number of tokens that THIS token depends on / aliases.
  // An edge from A → B means A aliases B, so B must be resolved before A.
  // In-degree of A = number of tokens A directly depends on = |edges[A]|.
  const inDegree = new Map<string, number>();
  for (const id of tokenIds) {
    inDegree.set(id, edges.get(id)?.size ?? 0);
  }

  // Queue nodes with in-degree 0 (base tokens that alias nothing)
  const queue: string[] = [];
  for (const id of tokenIds) {
    if ((inDegree.get(id) ?? 0) === 0) {
      queue.push(id);
    }
  }

  const topoOrder: string[] = [];

  while (queue.length > 0) {
    // Shift to get stable ordering (FIFO)
    const id = queue.shift()!;
    topoOrder.push(id);

    // For every token that depends on `id` (i.e., aliases `id`),
    // decrement its in-degree. If it reaches 0, enqueue it.
    const dependents = reverseEdges.get(id);
    if (dependents) {
      for (const dep of dependents) {
        const d = (inDegree.get(dep) ?? 0) - 1;
        inDegree.set(dep, d);
        if (d === 0) {
          queue.push(dep);
        }
      }
    }
  }

  // Any node not in topoOrder is part of a cycle
  const topoSet = new Set(topoOrder);
  const cycleNodes = new Set<string>();
  for (const id of tokenIds) {
    if (!topoSet.has(id)) {
      cycleNodes.add(id);
    }
  }

  return { topoOrder, cycleNodes };
}

// ─── Resolution ───────────────────────────────────────────────────────────────

/**
 * Resolve a single token given the already-populated resolvedCache.
 *
 * For base tokens: resolvedValue = token.value, aliasChain = [].
 * For alias tokens: look up the target in resolvedCache, inherit its
 * resolvedValue, and prepend the alias chain.
 */
function resolveOne(
  token: Token,
  resolvedCache: Map<string, ResolvedToken | TokenError>,
): ResolvedToken | TokenError {
  const result = resolveDeep(token.value, resolvedCache, token.id);
  if (result.error) return result.error;
  
  let modes: Record<string, BaseValue> | undefined = undefined;
  const chains = new Set<string>(result.chain);

  if (token.modes) {
    modes = {};
    for (const [modeName, modeVal] of Object.entries(token.modes)) {
      const modeResult = resolveDeep(modeVal, resolvedCache, token.id, modeName);
      if (modeResult.error) return modeResult.error;
      modes[modeName] = modeResult.resolved as BaseValue;
      for (const c of modeResult.chain) chains.add(c);
    }
  }

  return {
    token,
    resolvedValue: result.resolved as BaseValue,
    ...(modes ? { modes } : {}),
    aliasChain: Array.from(chains),
  };
}

/**
 * Resolve all tokens in topoOrder, then mark cycle nodes as CycleError.
 */
function resolveAll_internal(
  tokens: Map<string, Token>,
  topoOrder: string[],
  cycleNodes: Set<string>,
  existingCache?: Map<string, ResolvedToken | TokenError>,
  idsToResolve?: Set<string>,
): Map<string, ResolvedToken | TokenError> {
  const cache: Map<string, ResolvedToken | TokenError> =
    existingCache ?? new Map();

  // Mark all cycle nodes as CycleError
  if (cycleNodes.size > 0) {
    const cycleError: CycleError = {
      kind: 'cycle',
      cycle: [...cycleNodes],
    };
    for (const id of cycleNodes) {
      cache.set(id, cycleError);
    }
  }

  // Resolve tokens in topological order (bases first)
  for (const id of topoOrder) {
    if (idsToResolve !== undefined && !idsToResolve.has(id)) {
      continue;
    }
    const token = tokens.get(id);
    if (!token) continue;
    cache.set(id, resolveOne(token, cache));
  }

  return cache;
}

// ─── Build graph from scratch ─────────────────────────────────────────────────

/**
 * Build edges and reverseEdges maps from a token collection.
 */
function buildEdges(tokens: Map<string, Token>): {
  edges: Map<string, Set<string>>;
  reverseEdges: Map<string, Set<string>>;
} {
  const edges = new Map<string, Set<string>>();
  const reverseEdges = new Map<string, Set<string>>();

  for (const [id, token] of tokens) {
    const targets = extractAliases(token.value);
    if (token.modes) {
      for (const modeVal of Object.values(token.modes)) {
        targets.push(...extractAliases(modeVal));
      }
    }
    for (const targetId of targets) {
      addEdge(edges, id, targetId);
      addEdge(reverseEdges, targetId, id);
    }
  }

  return { edges, reverseEdges };
}

/**
 * Construct a TokenGraph from a flat list of tokens.
 *
 * Steps:
 * 1. Build tokens map
 * 2. Build edges/reverseEdges
 * 3. Kahn's sort + cycle detection
 * 4. Pre-resolve all tokens
 */
export function buildTokenGraph(tokens: Token[]): TokenGraph {
  const tokenMap = new Map<string, Token>();
  for (const t of tokens) {
    tokenMap.set(t.id, t);
  }

  const { edges, reverseEdges } = buildEdges(tokenMap);

  const tokenIds = [...tokenMap.keys()];
  const { topoOrder, cycleNodes } = kahnSort(tokenIds, edges, reverseEdges);

  const resolvedCache = resolveAll_internal(
    tokenMap,
    topoOrder,
    cycleNodes,
  );

  return {
    tokens: tokenMap,
    edges,
    reverseEdges,
    topoOrder,
    resolvedCache,
  };
}

// ─── Public resolution API ───────────────────────────────────────────────────

/**
 * Resolve a single token by ID.
 *
 * Returns the cached ResolvedToken if available, an UnresolvedReferenceError
 * if the token is not found, or a CycleError if the token is in a cycle.
 */
export function resolveToken(
  graph: TokenGraph,
  tokenId: string,
): ResolvedToken | CycleError | UnresolvedReferenceError {
  // Return cached result if present
  const cached = graph.resolvedCache.get(tokenId);
  if (cached !== undefined) {
    return cached as ResolvedToken | CycleError | UnresolvedReferenceError;
  }

  // Token not in graph at all
  if (!graph.tokens.has(tokenId)) {
    return {
      kind: 'unresolved-reference',
      tokenId,
      referencedId: tokenId,
    } satisfies UnresolvedReferenceError;
  }

  // Should not normally reach here — all tokens are resolved at build time.
  // Fallback: resolve on demand (mutable cache not possible, so just compute)
  const token = graph.tokens.get(tokenId)!;
  return resolveOne(
    token,
    graph.resolvedCache as Map<string, ResolvedToken | TokenError>,
  ) as ResolvedToken | CycleError | UnresolvedReferenceError;
}

/**
 * Return a new Map with all entries from resolvedCache.
 */
export function resolveAll(
  graph: TokenGraph,
): Map<string, ResolvedToken | TokenError> {
  return new Map(graph.resolvedCache);
}

// ─── Dependents (BFS over reverseEdges) ──────────────────────────────────────

/**
 * Find all tokens that transitively depend on `tokenId` (direct and indirect
 * aliases of the token).
 *
 * Performs BFS over reverseEdges.
 */
export function getDependents(
  graph: TokenGraph,
  tokenId: string,
): string[] {
  const visited = new Set<string>();
  const queue: string[] = [tokenId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const dependents = graph.reverseEdges.get(current);
    if (dependents) {
      for (const dep of dependents) {
        if (!visited.has(dep)) {
          visited.add(dep);
          queue.push(dep);
        }
      }
    }
  }

  return [...visited];
}

// ─── Incremental update helpers ───────────────────────────────────────────────

/**
 * Collect transitive dependents of `tokenId` (not including tokenId itself).
 * Returns a Set for O(1) lookup.
 */
function collectDependents(
  reverseEdges: Map<string, ReadonlySet<string>>,
  tokenId: string,
): Set<string> {
  const visited = new Set<string>();
  const queue: string[] = [tokenId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const deps = reverseEdges.get(current);
    if (deps) {
      for (const dep of deps) {
        if (!visited.has(dep)) {
          visited.add(dep);
          queue.push(dep);
        }
      }
    }
  }

  return visited;
}

/**
 * Re-resolve only the invalidated tokens (changed token + dependents), in
 * topological order.
 */
function reResolveInvalidated(
  tokens: Map<string, Token>,
  topoOrder: ReadonlyArray<string>,
  resolvedCache: Map<string, ResolvedToken | TokenError>,
  invalidated: Set<string>,
): void {
  // Remove invalidated entries from cache first
  for (const id of invalidated) {
    resolvedCache.delete(id);
  }

  // Re-resolve in topo order (only invalidated ones)
  for (const id of topoOrder) {
    if (!invalidated.has(id)) continue;
    const token = tokens.get(id);
    if (!token) continue;
    resolvedCache.set(id, resolveOne(token, resolvedCache));
  }
}

// ─── Mutation API ─────────────────────────────────────────────────────────────

/**
 * Return a new immutable graph with the given token's value updated.
 *
 * Only the changed token and its transitive dependents are re-resolved.
 * If the token doesn't exist in the graph, the original graph is returned
 * unchanged.
 */
export function updateTokenValue(
  graph: TokenGraph,
  tokenId: string,
  newValue: TokenValue,
): TokenGraph {
  if (!graph.tokens.has(tokenId)) {
    return graph;
  }

  const oldToken = graph.tokens.get(tokenId)!;
  const updatedToken: Token = { ...oldToken, value: newValue };

  // Copy tokens map
  const tokens = new Map(graph.tokens);
  tokens.set(tokenId, updatedToken);

  // Rebuild edges because the token's alias target may have changed
  const oldValue = oldToken.value;
  const edges = new Map<string, Set<string>>(
    [...graph.edges].map(([k, v]) => [k, new Set(v)]),
  );
  const reverseEdges = new Map<string, Set<string>>(
    [...graph.reverseEdges].map(([k, v]) => [k, new Set(v)]),
  );

  // Remove old alias edges for this token
  const oldTargets = extractAliases(oldValue);
  if (oldToken.modes) {
    for (const modeVal of Object.values(oldToken.modes)) {
      oldTargets.push(...extractAliases(modeVal));
    }
  }
  for (const oldTarget of oldTargets) {
    removeEdge(edges, tokenId, oldTarget);
    removeEdge(reverseEdges, oldTarget, tokenId);
  }

  // Add new alias edges if the new value is an alias
  const newTargets = extractAliases(newValue);
  if (updatedToken.modes) {
    for (const modeVal of Object.values(updatedToken.modes)) {
      newTargets.push(...extractAliases(modeVal));
    }
  }
  for (const newTarget of newTargets) {
    addEdge(edges, tokenId, newTarget);
    addEdge(reverseEdges, newTarget, tokenId);
  }

  // Recompute topo order (edge structure may have changed)
  const tokenIds = [...tokens.keys()];
  const { topoOrder, cycleNodes } = kahnSort(tokenIds, edges, reverseEdges);

  // Copy the resolved cache and invalidate the changed token + dependents
  const resolvedCache = new Map(graph.resolvedCache);

  // Mark all cycle nodes first
  if (cycleNodes.size > 0) {
    const cycleError: CycleError = {
      kind: 'cycle',
      cycle: [...cycleNodes],
    };
    for (const id of cycleNodes) {
      resolvedCache.set(id, cycleError);
    }
  }

  // Collect invalidated: changed token + all transitive dependents
  const invalidated = collectDependents(reverseEdges, tokenId);
  invalidated.add(tokenId);

  // Also invalidate any tokens that were previously in a cycle but no longer
  // are (cycle status may have changed)
  for (const id of resolvedCache.keys()) {
    const entry = resolvedCache.get(id);
    if (entry && (entry as TokenError).kind === 'cycle' && !cycleNodes.has(id)) {
      invalidated.add(id);
    }
  }

  reResolveInvalidated(tokens, topoOrder, resolvedCache, invalidated);

  return { tokens, edges, reverseEdges, topoOrder, resolvedCache };
}

/**
 * Return a new graph with the given token added.
 *
 * Fully rebuilds topo order and cache (new token may affect cycle detection).
 */
export function addToken(graph: TokenGraph, token: Token): TokenGraph {
  const tokens = new Map(graph.tokens);
  tokens.set(token.id, token);

  const { edges, reverseEdges } = buildEdges(tokens);

  const tokenIds = [...tokens.keys()];
  const { topoOrder, cycleNodes } = kahnSort(tokenIds, edges, reverseEdges);

  const resolvedCache = resolveAll_internal(
    tokens,
    topoOrder,
    cycleNodes,
  );

  return { tokens, edges, reverseEdges, topoOrder, resolvedCache };
}

/**
 * Return a new graph with the given token removed.
 *
 * Any tokens that aliased the removed token will resolve to
 * UnresolvedReferenceError.
 */
export function removeToken(
  graph: TokenGraph,
  tokenId: string,
): TokenGraph {
  if (!graph.tokens.has(tokenId)) {
    return graph;
  }

  const tokens = new Map(graph.tokens);
  tokens.delete(tokenId);

  const { edges, reverseEdges } = buildEdges(tokens);

  const tokenIds = [...tokens.keys()];
  const { topoOrder, cycleNodes } = kahnSort(tokenIds, edges, reverseEdges);

  const resolvedCache = resolveAll_internal(
    tokens,
    topoOrder,
    cycleNodes,
  );

  return { tokens, edges, reverseEdges, topoOrder, resolvedCache };
}
