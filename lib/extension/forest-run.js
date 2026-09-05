// @ts-check
/**
 * Shared live TILES runner: mutate wm.forest → paint → one commit.
 * CommandHandler and DnD import this; do not import command.js from here.
 */

import { getOpSet, runOpAbstract } from "../opsets/index.js";
import { wrapMonitorMax1 } from "../rulesets/mark2.js";
import { Logger } from "../shared/logger.js";
import { ancestorMonitor, createTomApi, isUnderFloats } from "../tom/index.js";
import { resyncWmAndPaint, resyncWmToReality } from "./observe-reality.js";
import { NODE_TYPES } from "./tree-types.js";
import {
  ensureLiveForest,
  liveForestPaintHooks,
  paintWmForest,
  presentWmSlots,
  resolveForestFocusId,
} from "./tom-live.js";
import * as Utils from "./utils.js";

/** @param {import('./window.js').WindowManager} wm */
function workareasFromTree(wm) {
  const tree = wm?.tree;
  if (!tree || typeof tree.getNodeByType !== "function") return [];
  const mons = tree.getNodeByType(NODE_TYPES.MONITOR) || [];
  const display = global.display;
  let primary = 0;
  try {
    if (typeof display?.get_primary_monitor === "function") {
      primary = display.get_primary_monitor();
    }
  } catch (_e) {
    primary = 0;
  }
  return mons.map((mon, i) => {
    const id = String(mon.nodeValue ?? `mo${i}`);
    const idx = Utils.monitorIndex(id);
    let g = null;
    try {
      if (idx >= 0 && typeof display?.get_monitor_geometry === "function") {
        g = display.get_monitor_geometry(idx);
      }
    } catch (_e) {
      g = null;
    }
    if (!g) g = mon.rect;
    return {
      id,
      x: g?.x ?? 0,
      y: g?.y ?? 0,
      width: g?.width ?? 1920,
      height: g?.height ?? 1080,
      primary: idx === primary,
    };
  });
}

/**
 * Mutate durable wm.forest, paint live chrome, one commit. FLOATS are not targets.
 * @param {import('./window.js').WindowManager} wm
 * @param {any} focusNodeWindow
 * @param {(draft: any, api: any) => { ok?: boolean }} mutate
 * @param {string} reason
 * @param {{
 *   treatGrabTileAsTiles?: boolean,
 *   getMins?: (id: string) => ({ width?: number, height?: number }|null|undefined),
 *   facts?: import('../agree/index.js').RealityFacts,
 * }} [opts]
 * @returns {boolean}
 */
export function runLiveForest(wm, focusNodeWindow, mutate, reason, opts = {}) {
  if (!focusNodeWindow || !wm?.tree) return false;
  if (typeof focusNodeWindow.isFloat === "function" && focusNodeWindow.isFloat()) return false;
  const meta = focusNodeWindow.nodeValue;
  if (meta && meta.minimized) return false;

  const hooks = liveForestPaintHooks(wm, {
    workareas: workareasFromTree(wm),
    ...(opts.treatGrabTileAsTiles ? { treatGrabTileAsTiles: true } : {}),
  });

  const forest = ensureLiveForest(wm, hooks);
  if (!forest) return false;

  const focusId = resolveForestFocusId(wm, focusNodeWindow);
  if (!focusId || !forest.nodes[focusId]) return false;
  forest.focusId = focusId;
  forest.selectionId = focusId;
  hooks.focusId = focusId;

  const cur = forest.nodes[focusId];
  if (cur && isUnderFloats(forest, cur)) return false;

  // Mark 2 only after AGREE; mins C5 lives in this resync, not a second loop.
  const gateOpts = {
    includeMins: true,
    skipSingletonSettle: true,
    ...(opts.getMins ? { getMins: opts.getMins } : {}),
    ...(opts.facts ? { facts: opts.facts } : {}),
  };
  const gate = resyncWmToReality(wm, "mark2-gate", gateOpts);
  if (gate && !gate.ok) {
    Logger.debug(
      `mark2-gate fail via=${reason} drifts=${(gate.drifts && gate.drifts.length) || 0}`
    );
    return false;
  }
  const gated = forest.nodes[focusId];
  if (!gated || isUnderFloats(forest, gated)) return false;

  wm.unfreezeRender();
  const api = createTomApi();
  api.hydrateSeq(forest);

  const r = runOpAbstract(forest, api, (draft) => {
    const dcur = draft.focusId ? draft.nodes[draft.focusId] : null;
    const mon = dcur ? ancestorMonitor(draft, dcur) : null;
    if (mon) wrapMonitorMax1(draft, mon);
    api.hydrateSeq(draft);
    const result = mutate(draft, api);
    if (result?.ok) {
      const set = getOpSet("mark2");
      const s = typeof set.settle === "function" ? set.settle(draft) : null;
      Logger.trace(
        `settle mark2-post pruned=${s?.pruned ?? 0} collapsed=${s?.collapsed ?? 0} reason=${reason}`
      );
    }
    return result;
  });
  if (!r?.ok) {
    Logger.debug(`mark2 fail via=${reason} reason=${r?.reason || "no-ok"}`);
    return false;
  }

  paintWmForest(wm, hooks);
  resyncWmAndPaint(wm, "mark2-post", {
    includeMins: true,
    paintHooks: hooks,
    ...(opts.getMins ? { getMins: opts.getMins } : {}),
  });
  // Forest slots → Meta before idle commitLayout (GetTree WINDOW rect is
  // Meta frame). Group-tab otherwise stays ~1/2 until idle present.
  if (!wm._forgePresentingSlots) {
    wm._forgePresentingSlots = true;
    try {
      presentWmSlots(wm, reason);
    } finally {
      wm._forgePresentingSlots = false;
    }
  }

  const liveFocus = wm.liveById?.get(forest.focusId) || focusNodeWindow;
  try {
    liveFocus?.nodeValue?.raise?.();
  } catch (_e) {
    /* disposed Meta */
  }
  wm.commitLayout(reason, { force: true });
  wm.settleTabFocus(liveFocus);
  wm.movePointerWith(liveFocus);
  return true;
}

/**
 * @param {import('./window.js').WindowManager} wm
 * @param {any} focusNodeWindow
 * @param {string} op
 * @param {string} [dir]
 * @param {string} reason
 * @param {{ treatGrabTileAsTiles?: boolean, onto?: string, insertIndex?: number, place?: string }} [opts]
 * @returns {boolean}
 */
export function runMark2(wm, focusNodeWindow, op, dir, reason, opts = {}) {
  if (!dir) return false;
  const body = getOpSet("mark2").ops[op];
  if (typeof body !== "function") return false;
  const ptr =
    opts.onto != null || opts.insertIndex != null || opts.place != null
      ? { onto: opts.onto, insertIndex: opts.insertIndex, place: opts.place }
      : undefined;
  return runLiveForest(
    wm,
    focusNodeWindow,
    (draft, api) => body(draft, api, dir, ptr),
    reason,
    opts
  );
}
