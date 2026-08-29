// @ts-check
/**
 * Shared live TILES runner: project → mutate → apply-back → one commit.
 * CommandHandler and DnD import this; do not import command.js from here.
 */

import St from "gi://St";

import { getOpSet, runOpAbstract } from "../opsets/index.js";
import { wrapMonitorMax1 } from "../rulesets/mark2.js";
import { ancestorMonitor, isUnderFloats } from "../tom/index.js";
import { NODE_TYPES, Node } from "./tree.js";
import { windowIdFromMeta } from "./tree-snapshot.js";
import { applyLiveForest, projectLiveForest } from "./tom-live.js";
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
 * Project live TILES, mutate, apply-back, one commit. FLOATS are not targets.
 * @param {import('./window.js').WindowManager} wm
 * @param {any} focusNodeWindow
 * @param {(draft: any, api: any) => { ok?: boolean }} mutate
 * @param {string} reason
 * @param {{ treatGrabTileAsTiles?: boolean }} [opts]
 * @returns {boolean}
 */
export function runLiveForest(wm, focusNodeWindow, mutate, reason, opts = {}) {
  if (!focusNodeWindow || !wm?.tree) return false;
  if (typeof focusNodeWindow.isFloat === "function" && focusNodeWindow.isFloat()) return false;
  const meta = focusNodeWindow.nodeValue;
  if (meta && meta.minimized) return false;

  const windowIdOf = (node) => windowIdFromMeta(node?.nodeValue);
  const focusId = windowIdOf(focusNodeWindow);
  if (!focusId) return false;

  wm.unfreezeRender();
  const hooks = {
    windowIdOf,
    createCon: () => {
      const con = new Node(NODE_TYPES.CON, new St.Bin());
      if (wm.tree.settings) con.settings = wm.tree.settings;
      return con;
    },
    workareas: workareasFromTree(wm),
    focusId,
  };
  if (opts.treatGrabTileAsTiles) hooks.treatGrabTileAsTiles = true;
  const projected = projectLiveForest(wm.tree, hooks);
  if (!projected) return false;
  const { forest, liveById, api } = projected;
  const cur = forest.focusId ? forest.nodes[forest.focusId] : null;
  if (cur && isUnderFloats(forest, cur)) return false;
  const r = runOpAbstract(forest, api, (draft) => {
    const dcur = draft.focusId ? draft.nodes[draft.focusId] : null;
    const mon = dcur ? ancestorMonitor(draft, dcur) : null;
    if (mon) wrapMonitorMax1(draft, mon);
    api.hydrateSeq(draft);
    return mutate(draft, api);
  });
  if (!r?.ok) return false;
  applyLiveForest(forest, liveById, hooks);
  const liveFocus = liveById.get(forest.focusId) || focusNodeWindow;
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
 * @param {{ treatGrabTileAsTiles?: boolean }} [opts]
 * @returns {boolean}
 */
export function runMark2(wm, focusNodeWindow, op, dir, reason, opts = {}) {
  if (!dir) return false;
  const body = getOpSet("mark2").ops[op];
  if (typeof body !== "function") return false;
  return runLiveForest(wm, focusNodeWindow, (draft, api) => body(draft, api, dir), reason, opts);
}
