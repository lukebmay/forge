// @ts-check
/**
 * Host observe + wm RESYNC (D093). Adapter-side; Meta stays out of the kernel.
 */

import { agree, DRIFT, resyncToReality } from "../agree/index.js";
import { floatsOf, parent as tomParent, tilesOf, walk, windowIsFloating } from "../tom/index.js";
import { recordAgree, recordDrift, recordResync, recordWarn } from "./metrics.js";
import { floatFailSafeMembership, reconcileForestWindows } from "./reconcile.js";
import { readWindowMinSize } from "./tree-layout.js";
import { forestSetWindowFloating, liveTilesParented, paintWmForest } from "./tom-live.js";

/** @typedef {import('../tom/kernel.js').Forest} Forest */
/** @typedef {import('../agree/index.js').RealityFacts} RealityFacts */
/** @typedef {import('../agree/index.js').ResyncResult} ResyncResult */

const DRIFT_LOG_CAP = 12;

/**
 * RealityFacts from wm.forest WINDOW ids + host bag / Meta.
 * Mins only when opts.includeMins (Mark 2 gate/post). Apply/map/close omit
 * mins so share/FLOAT is not a twin apply path. Never invent missing-host
 * from an unknown bag miss.
 *
 * @param {any} wm
 * @param {{
 *   includeMins?: boolean,
 *   getMins?: (id: string) => ({ width?: number, height?: number }|null|undefined),
 * }} [opts]
 * @returns {RealityFacts}
 */
export function observeReality(wm, opts = {}) {
  /** @type {RealityFacts["windows"]} */
  const windows = {};
  const forest = wm?.forest;
  if (!forest) return { windows };

  const includeMins = !!opts.includeMins;
  const getMins =
    typeof opts.getMins === "function" ? opts.getMins : includeMins ? hostMinsGetter(wm) : null;

  for (const node of forestWindows(forest)) {
    const bag = wm.hostBag?.get?.(node.id);
    const live = wm.liveById?.get?.(node.id);
    const meta = bag?.meta ?? live?.nodeValue ?? null;
    const exists = hostExists(meta);
    /** @type {import('../agree/index.js').WindowFact} */
    const fact = { exists };
    if (exists) {
      const floating = observeFloating(bag, live, forest, node, wm);
      if (typeof floating === "boolean") fact.floating = floating;
      const mid = observeMonitorId(wm, forest, live, meta);
      if (mid) fact.monitorId = mid;
      if (includeMins && getMins) {
        const mins = getMins(node.id);
        if (hasMins(mins)) {
          fact.mins = {
            width: Number(mins.width) || 0,
            height: Number(mins.height) || 0,
          };
        }
      }
    }
    windows[node.id] = fact;
  }
  return { windows };
}

/**
 * Observe → C5 mins adjust (when includeMins) → resyncToReality.
 * Logs metric agree/drift/resync. Refuse callers check `r && !r.ok`.
 *
 * @param {any} wm
 * @param {string} [reason]
 * @param {{
 *   includeMins?: boolean,
 *   getMins?: (id: string) => ({ width?: number, height?: number }|null|undefined),
 *   facts?: import('../agree/index.js').RealityFacts,
 *   skipSingletonSettle?: boolean,
 * }} [opts]
 * @returns {ResyncResult|null}
 */
export function resyncWmToReality(wm, reason = "resync", opts = {}) {
  const forest = wm?.forest;
  if (!forest || !wm._liveForestSeeded) return null;

  const includeMins = !!opts.includeMins;
  const skipSingletonSettle = !!opts.skipSingletonSettle;
  const observeOpts = { includeMins, getMins: opts.getMins };
  const injected = opts.facts && typeof opts.facts === "object";
  let facts = injected ? opts.facts : observeReality(wm, observeOpts);

  const before = agree(forest, facts);
  const beforeHost = skipSingletonSettle ? hostDrifts(before.drifts) : before.drifts;
  recordAgree({
    ok: beforeHost.length === 0,
    driftCount: beforeHost.length,
    reason,
  });
  if (beforeHost.length) {
    for (const d of beforeHost.slice(0, DRIFT_LOG_CAP)) {
      recordDrift(driftHuntFields(wm, forest, d, reason));
    }
  }

  /** @type {string[]} */
  const adapterSteps = [];
  if (includeMins) {
    const adj = adjustMinsTowardReality(wm, forest, opts.getMins);
    if (adj.steps.length) {
      adapterSteps.push(...adj.steps);
      if (!injected) facts = observeReality(wm, observeOpts);
      facts = factsWithFloated(facts, adj.floated);
    }
  }

  facts = denyIllegalFloatPromotion(wm, forest, facts, reason);

  if (skipSingletonSettle && hostDrifts(agree(forest, facts).drifts).length === 0) {
    const r = { ok: true, drifts: [], rounds: 0, steps: adapterSteps };
    recordResync({
      ok: true,
      rounds: 0,
      steps: r.steps,
      reason,
    });
    return r;
  }

  const r = resyncToReality(forest, facts);
  if (adapterSteps.length) r.steps = [...adapterSteps, ...r.steps];
  if (skipSingletonSettle) {
    r.drifts = hostDrifts(r.drifts);
    r.ok = r.drifts.length === 0;
  }
  if (!r.ok) {
    for (const d of r.drifts.slice(0, DRIFT_LOG_CAP)) {
      recordDrift(driftHuntFields(wm, forest, d, reason));
    }
  }
  recordResync({
    ok: r.ok,
    rounds: r.rounds,
    steps: r.steps,
    reason,
  });
  return r;
}

/**
 * RESYNC then present when the live Forest is seeded.
 * @param {any} wm
 * @param {string} [reason]
 * @param {{
 *   includeMins?: boolean,
 *   getMins?: (id: string) => ({ width?: number, height?: number }|null|undefined),
 *   facts?: import('../agree/index.js').RealityFacts,
 *   skipSingletonSettle?: boolean,
 *   paintHooks?: object,
 * }} [opts]
 * @returns {ResyncResult|null}
 */
export function resyncWmAndPaint(wm, reason = "resync", opts = {}) {
  const r = resyncWmToReality(wm, reason, opts);
  if (r && wm._liveForestSeeded && r.steps?.length) {
    paintWmForest(wm, opts.paintHooks);
  }
  return r;
}

/**
 * @param {Forest} f
 * @returns {import('../tom/kernel.js').Node[]}
 */
/** RuleSet-only: Mark 2 Join may add the second TAB child. */
function hostDrifts(drifts) {
  return (drifts || []).filter((d) => d.kind !== DRIFT.SINGLETON_TAB);
}

function forestWindows(f) {
  /** @type {import('../tom/kernel.js').Node[]} */
  const out = [];
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

/** @param {any} wm */
function hostMinsGetter(wm) {
  return (id) => hostMinsOf(wm, id);
}

/**
 * @param {any} wm
 * @param {string} id
 * @returns {{ width: number, height: number }}
 */
function hostMinsOf(wm, id) {
  const live = wm?.liveById?.get?.(id);
  const bag = wm?.hostBag?.get?.(id);
  const meta = bag?.meta ?? live?.nodeValue ?? null;
  if (!meta) return { width: 0, height: 0 };
  try {
    return readWindowMinSize(meta);
  } catch (_e) {
    return { width: 0, height: 0 };
  }
}

/**
 * Share/tab adjust then FLOAT fail-safe (C5 inside RESYNC).
 * @param {any} wm
 * @param {Forest} forest
 * @param {(id: string) => ({ width?: number, height?: number }|null|undefined)} [getMins]
 * @returns {{ steps: string[], floated: string[] }}
 */
function adjustMinsTowardReality(wm, forest, getMins) {
  const gm = typeof getMins === "function" ? getMins : (id) => hostMinsOf(wm, id);
  const rec = reconcileForestWindows(forest, gm, {
    floatFailSafe: (id) => floatWindowTowardReality(wm, forest, id),
  });
  /** @type {string[]} */
  const steps = [];
  for (const [id, r] of Object.entries(rec.results || {})) {
    if (r.status === "adjusted") steps.push(`tryAdjustShareForMins:${id}`);
    if (r.status === "floated") steps.push(`floatFailSafe:${id}`);
  }
  return { steps, floated: rec.floated || [] };
}

/**
 * @param {any} wm
 * @param {Forest} forest
 * @param {string} id
 */
function floatWindowTowardReality(wm, forest, id) {
  const live = wm?.liveById?.get?.(id);
  if (live && forestSetWindowFloating(wm, live, true)) {
    try {
      live.float = true;
    } catch (_e) {
      /* duck */
    }
    return;
  }
  floatFailSafeMembership(forest, id);
  try {
    wm?.hostBag?.set?.(id, { floating: true });
  } catch (_e) {
    /* duck bag */
  }
}

/**
 * @param {RealityFacts} facts
 * @param {string[]} floated
 * @returns {RealityFacts}
 */
function factsWithFloated(facts, floated) {
  if (!floated?.length) return facts;
  /** @type {RealityFacts["windows"]} */
  const windows = { ...(facts.windows || {}) };
  for (const id of floated) {
    const prev = windows[id] || { exists: true };
    windows[id] = { ...prev, floating: true };
  }
  return { ...facts, windows };
}

/** @param {any} meta */
function hostExists(meta) {
  if (meta && typeof meta === "object") {
    try {
      if (meta.destroyed === true) return false;
      if (typeof meta.get_id === "function") meta.get_id();
      return true;
    } catch (_e) {
      return false;
    }
  }
  return true;
}

/**
 * Forest TILES never yields fact.floating true (bag is a bridge, not a vote).
 * @param {any} bag
 * @param {any} live
 * @param {Forest} forest
 * @param {import('../tom/kernel.js').Node} node
 */
function observeFloating(bag, live, forest, node, wm) {
  if (node && forest && !windowIsFloating(forest, node)) {
    if (bag?.floating === false) return false;
    return undefined;
  }
  if (typeof bag?.floating === "boolean") return bag.floating;
  if (liveTilesParented(live, wm)) return undefined;
  try {
    if (typeof live?.isFloat === "function") return !!live.isFloat();
  } catch (_e) {
    /* disposed */
  }
  if (live?.mode === "FLOAT") return true;
  if (live?.mode === "TILE" || live?.mode === "GRAB_TILE") return false;
  return undefined;
}

/**
 * TILES Forest wins: strip fact.floating true and repair bag.floating false.
 * @param {any} wm
 * @param {Forest} forest
 * @param {RealityFacts} facts
 * @param {string} [reason]
 * @returns {RealityFacts}
 */
function denyIllegalFloatPromotion(wm, forest, facts, reason) {
  const windows = facts?.windows && typeof facts.windows === "object" ? facts.windows : {};
  let changed = false;
  /** @type {RealityFacts["windows"]} */
  const nextWindows = { ...windows };
  const seen = new Set();
  for (const node of forestWindows(forest)) {
    if (windowIsFloating(forest, node)) continue;
    seen.add(node.id);
    const fact = nextWindows[node.id];
    const live = wm?.liveById?.get?.(node.id);
    const bagTrue = wm?.hostBag?.get?.(node.id)?.floating === true;
    const factTrue = fact?.floating === true;
    const modeStuck = live?.mode === "FLOAT";
    if (!bagTrue && !factTrue && !modeStuck) continue;
    if (bagTrue) wm.hostBag?.set?.(node.id, { floating: false });
    if (modeStuck) {
      live.mode = "TILE";
      try {
        live.float = false;
      } catch (_e) {
        /* duck / disposed */
      }
    }
    if (factTrue) {
      const rest = { ...fact };
      delete rest.floating;
      nextWindows[node.id] = rest;
    }
    changed = true;
    recordWarn("float-promote-denied", { id: node.id, reason: reason || "-" });
  }
  for (const [id, fact] of Object.entries(windows)) {
    if (seen.has(id) || !fact || fact.floating !== true) continue;
    const node = forest.nodes[id];
    if (!node || node.kind !== "WINDOW" || windowIsFloating(forest, node)) continue;
    const rest = { ...fact };
    delete rest.floating;
    nextWindows[id] = rest;
    changed = true;
    recordWarn("float-promote-denied", { id, reason: reason || "-" });
  }
  return changed ? { ...facts, windows: nextWindows } : facts;
}

/**
 * @param {any} wm
 * @param {Forest} forest
 * @param {import('../agree/index.js').Drift} d
 * @param {string} [reason]
 */
function driftHuntFields(wm, forest, d, reason) {
  /** @type {Record<string, unknown>} */
  const fields = { kind: d.kind, id: d.id, reason: reason || "-" };
  if (d.expected !== undefined) fields.expected = d.expected;
  if (d.actual !== undefined) fields.actual = d.actual;
  if (d.kind !== DRIFT.FLOAT_MISMATCH) return fields;
  const bag = wm?.hostBag?.get?.(d.id);
  const live = wm?.liveById?.get?.(d.id);
  const node = forest?.nodes?.[d.id];
  const p = node ? tomParent(forest, node) : null;
  fields.bagFloating = typeof bag?.floating === "boolean" ? bag.floating : "-";
  fields.forestParent = p?.id || "-";
  fields.liveMode = live?.mode || "-";
  return fields;
}

/**
 * @param {any} wm
 * @param {Forest} forest
 * @param {any} live
 * @param {any} meta
 * @returns {string|null}
 */
function observeMonitorId(wm, forest, live, meta) {
  let cur = live;
  while (cur) {
    const isMon =
      (typeof cur.isMonitor === "function" && cur.isMonitor()) ||
      cur.nodeType === "MONITOR" ||
      cur.kind === "MONITOR";
    if (isMon && wm.liveById instanceof Map) {
      for (const [id, n] of wm.liveById) {
        if (n === cur && forest.nodes[id]?.kind === "MONITOR") return id;
      }
      const v = cur.nodeValue;
      if (typeof v === "string" && forest.nodes[v]?.kind === "MONITOR") return v;
    }
    cur = cur.parentNode;
  }

  let idx = -1;
  try {
    if (typeof meta?.get_monitor === "function") idx = Number(meta.get_monitor());
  } catch (_e) {
    idx = -1;
  }
  if (idx >= 0) {
    for (const mon of forest.monitors || []) {
      const m = /^mo(\d+)/.exec(String(mon.id));
      if (m && Number(m[1]) === idx) return mon.id;
    }
  }
  return null;
}
