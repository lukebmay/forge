// @ts-check
/**
 * AGREE / DRIFT predicate + TOM RESYNC (D093). Pure; no host, paint, or metrics.
 */

import { paneRect } from "../presenter/index.js";
import { settleForest } from "../rulesets/mark2.js";
import {
  ancestorMonitor,
  destroyNode,
  floatsOf,
  moveWindowToFloats,
  moveWindowToTiles,
  tilesOf,
  walk,
  windowIsFloating,
} from "../tom/index.js";

/** @typedef {import('../tom/kernel.js').Forest} Forest */
/** @typedef {import('../tom/kernel.js').Node} Node */

export const DRIFT = Object.freeze({
  MISSING_HOST: "missing-host",
  ORPHAN_HOST: "orphan-host",
  FLOAT_MISMATCH: "float-mismatch",
  MON_MISMATCH: "mon-mismatch",
  MINS: "mins",
  SINGLETON_TAB: "singleton-tab",
});

/**
 * @typedef {{
 *   exists: boolean,
 *   floating?: boolean,
 *   monitorId?: string|null,
 *   mins?: { width?: number, height?: number }|null,
 * }} WindowFact
 *
 * @typedef {{
 *   windows: Record<string, WindowFact>,
 *   minsEps?: number,
 * }} RealityFacts
 *
 * @typedef {{
 *   kind: string,
 *   id: string,
 *   detail?: string,
 *   expected?: unknown,
 *   actual?: unknown,
 * }} Drift
 *
 * @typedef {{ ok: true, drifts: [] } | { ok: false, drifts: Drift[] }} AgreeResult
 *
 * @typedef {{
 *   ok: boolean,
 *   drifts: Drift[],
 *   rounds: number,
 *   steps: string[],
 * }} ResyncResult
 */

/** Max agree→fix→settle loops in one resync. */
export const RESYNC_MAX_ROUNDS = 4;

/**
 * @param {Forest|null|undefined} forest
 * @param {RealityFacts|null|undefined} facts
 * @returns {{ ok: boolean, drifts: Drift[] }}
 */
export function agree(forest, facts) {
  /** @type {Drift[]} */
  const drifts = [];
  const windows = facts?.windows && typeof facts.windows === "object" ? facts.windows : {};
  const rawEps = facts?.minsEps;
  const eps = Number.isFinite(Number(rawEps)) ? Math.abs(Number(rawEps)) : 4;

  const membershipWins = forestWindows(forest);
  for (const node of membershipWins) {
    const fact = windows[node.id];
    if (!fact || fact.exists !== true) {
      drifts.push({
        kind: DRIFT.MISSING_HOST,
        id: node.id,
        expected: true,
        actual: fact ? fact.exists : undefined,
      });
      continue;
    }

    const floating = windowIsFloating(forest, node);
    if (typeof fact.floating === "boolean" && fact.floating !== floating) {
      drifts.push({
        kind: DRIFT.FLOAT_MISMATCH,
        id: node.id,
        expected: floating,
        actual: fact.floating,
      });
    }

    if (floating) continue;

    const mid = fact.monitorId;
    if (typeof mid === "string" && mid !== "") {
      const monId = ancestorMonitor(forest, node)?.id ?? null;
      if (monId !== mid) {
        drifts.push({
          kind: DRIFT.MON_MISMATCH,
          id: node.id,
          expected: monId,
          actual: mid,
        });
      }
    }

    if (hasMins(fact.mins)) {
      const rect = paneRect(forest, node);
      if (rect) {
        const slot = { width: rect.w, height: rect.h };
        if (slotOverflowsMins(slot, fact.mins, eps)) {
          drifts.push({
            kind: DRIFT.MINS,
            id: node.id,
            expected: fact.mins,
            actual: slot,
          });
        }
      }
    }
  }

  for (const id of Object.keys(windows)) {
    const fact = windows[id];
    if (!fact || fact.exists !== true) continue;
    const node = forest?.nodes?.[id];
    if (!node || node.kind !== "WINDOW") {
      drifts.push({
        kind: DRIFT.ORPHAN_HOST,
        id,
        expected: "WINDOW",
        actual: node?.kind ?? null,
      });
    }
  }

  const tiles = forest ? tilesOf(forest) : null;
  if (tiles && forest) {
    walk(forest, tiles, (n) => {
      if (n.kind === "CON" && n.layout === "TABBED" && n.childIds.length === 1) {
        drifts.push({
          kind: DRIFT.SINGLETON_TAB,
          id: n.id,
          expected: { minChildren: 2 },
          actual: n.childIds.length,
        });
      }
    });
  }

  return { ok: drifts.length === 0, drifts };
}

/**
 * @param {unknown} map
 * @returns {RealityFacts}
 */
export function factsFromWindowMap(map) {
  /** @type {Record<string, WindowFact>} */
  const windows = {};
  if (!map) return { windows };
  if (map instanceof Map) {
    for (const [id, fact] of map) {
      if (id != null && id !== "" && fact && typeof fact === "object") {
        windows[String(id)] = /** @type {WindowFact} */ (fact);
      }
    }
    return { windows };
  }
  if (typeof map === "object") {
    for (const id of Object.keys(map)) {
      const fact = /** @type {Record<string, WindowFact>} */ (map)[id];
      if (fact && typeof fact === "object") windows[id] = fact;
    }
  }
  return { windows };
}

/**
 * TOM-toward-REALITY: atomics + RuleSet settle, then re-agree. Mutates forest.
 * Does not invent WINDOW nodes for orphan-host (map/open is R3).
 *
 * @param {Forest|null|undefined} forest
 * @param {RealityFacts|null|undefined} facts
 * @param {{ maxRounds?: number }} [options]
 * @returns {ResyncResult}
 */
export function resyncToReality(forest, facts, options = {}) {
  /** @type {string[]} */
  const steps = [];
  const rawMax = options.maxRounds;
  const maxRounds = Number.isFinite(Number(rawMax))
    ? Math.max(1, Math.floor(Number(rawMax)))
    : RESYNC_MAX_ROUNDS;

  if (!forest || typeof forest !== "object") {
    return { ok: true, drifts: [], rounds: 0, steps };
  }

  let last = agree(forest, facts);
  if (last.ok) return { ok: true, drifts: [], rounds: 0, steps };

  let rounds = 0;
  while (rounds < maxRounds) {
    rounds += 1;
    applyStructuralFixes(forest, facts, last.drifts, steps);
    settleForest(forest);
    steps.push("settleForest");

    last = agree(forest, facts);
    if (last.ok) return { ok: true, drifts: [], rounds, steps };

    const floated = applyMinsFailSafe(forest, last.drifts, steps);
    if (floated) {
      settleForest(forest);
      steps.push("settleForest");
      last = agree(forest, facts);
      if (last.ok) return { ok: true, drifts: [], rounds, steps };
    }
  }

  return { ok: last.ok, drifts: last.drifts, rounds, steps };
}

/**
 * WINDOWs under FLOATS or TILES (membership SoT).
 * @param {Forest|null|undefined} f
 * @returns {Node[]}
 */
function forestWindows(f) {
  /** @type {Node[]} */
  const out = [];
  if (!f) return out;
  const tiles = tilesOf(f);
  if (tiles) {
    walk(f, tiles, (n) => {
      if (n.kind === "WINDOW") out.push(n);
    });
  }
  const floats = floatsOf(f);
  if (floats) {
    walk(f, floats, (n) => {
      if (n.kind === "WINDOW") out.push(n);
    });
  }
  return out;
}

/** @param {{ width?: number, height?: number }|null|undefined} m */
function hasMins(m) {
  return !!m && ((Number(m.width) || 0) > 0 || (Number(m.height) || 0) > 0);
}

/**
 * Local copy of open-min-place `slotOverflowsMins` — no extension imports.
 * @param {{ width?: number, height?: number }|null|undefined} slotRect
 * @param {{ width?: number, height?: number }|null|undefined} mins
 * @param {number} [eps=4]
 */
function slotOverflowsMins(slotRect, mins, eps = 4) {
  const slotW = Number(slotRect?.width) || 0;
  const slotH = Number(slotRect?.height) || 0;
  if (!(slotW > 0) || !(slotH > 0)) return false;
  const e = Number.isFinite(Number(eps)) ? Math.abs(Number(eps)) : 4;
  const mw = Number(mins?.width) || 0;
  const mh = Number(mins?.height) || 0;
  return exceeds(mw, slotW + e) || exceeds(mh, slotH + e);
}

/** @param {number} min @param {number} size */
function exceeds(min, size) {
  return min > 0 && size > 0 && min > size;
}

/**
 * @param {Forest} forest
 * @param {RealityFacts|null|undefined} facts
 * @param {Drift[]} drifts
 * @param {string[]} steps
 */
function applyStructuralFixes(forest, facts, drifts, steps) {
  const windows = facts?.windows && typeof facts.windows === "object" ? facts.windows : {};

  for (const d of drifts) {
    if (d.kind !== DRIFT.MISSING_HOST) continue;
    if (!forest.nodes[d.id]) continue;
    const r = destroyNode(forest, d.id);
    if (r?.ok) steps.push(`destroyNode:${d.id}`);
  }

  for (const d of drifts) {
    if (d.kind !== DRIFT.FLOAT_MISMATCH) continue;
    const node = forest.nodes[d.id];
    if (!node || node.kind !== "WINDOW") continue;
    if (d.actual === true) {
      const r = moveWindowToFloats(forest, node);
      if (r?.ok) steps.push(`moveWindowToFloats:${d.id}`);
    } else if (d.actual === false) {
      const dest = resolveTilesMonitor(forest, windows[d.id]);
      if (!dest) continue;
      const r = moveWindowToTiles(forest, node, dest);
      if (r?.ok) steps.push(`moveWindowToTiles:${d.id}`);
    }
  }
}

/**
 * FLOAT terminator for remaining mins drift. Share/tab adjust stays C5 until R4.
 * @param {Forest} forest
 * @param {Drift[]} drifts
 * @param {string[]} steps
 * @returns {boolean}
 */
function applyMinsFailSafe(forest, drifts, steps) {
  let floated = false;
  for (const d of drifts) {
    if (d.kind !== DRIFT.MINS) continue;
    const node = forest.nodes[d.id];
    if (!node || node.kind !== "WINDOW") continue;
    const r = moveWindowToFloats(forest, node);
    if (r?.ok) {
      steps.push(`floatFailSafe:${d.id}`);
      floated = true;
    }
  }
  return floated;
}

/**
 * @param {Forest} forest
 * @param {WindowFact|undefined} fact
 * @returns {Node|null}
 */
function resolveTilesMonitor(forest, fact) {
  const mid = fact?.monitorId;
  if (typeof mid === "string" && mid !== "") {
    const n = forest.nodes[mid];
    if (n?.kind === "MONITOR") return n;
  }
  return forest.monitors?.[0] || null;
}
