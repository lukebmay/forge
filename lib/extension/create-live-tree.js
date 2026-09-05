// @ts-check
/**
 * Production ROOT invent: LiveHandle + Tree/Node API mixin.
 * Not GObject Tree. Tests may still `new Tree`.
 */

import St from "gi://St";

import { makeLiveHandle } from "./live-handle.js";
import { ensureLiveListMutators } from "./live-compat.js";
import { NODE_TYPES, LAYOUT_TYPES } from "./tree-types.js";
import { Node, Tree } from "./tree.js";
import { ROOT_SPINE_NAMES, attachRootManagers, attachRootSpineApi } from "./tree-api-root.js";
import { QUERY_NAMES, attachRootQueryApi } from "./tree-api-query.js";
import { TOPO_NAMES, attachRootTopoApi } from "./tree-api-topo.js";
import { NAV_NAMES, attachRootNavApi } from "./tree-api-nav.js";
import { PRESENT_NAMES, attachRootPresentApi } from "./tree-api-present.js";
import { CHROME_NAMES } from "./tree-api-chrome.js";
import { INVENT_NAMES, attachRootInventApi } from "./tree-api-invent.js";

/** WINDOW/CON Node proto — ROOT uses live-compat / makeLiveHandle instead. */
const NODE_ONLY_NAMES = new Set([
  "appendChild",
  "insertBefore",
  "replaceChildren",
  "removeChild",
  "index",
  "level",
  "nextSibling",
  "previousSibling",
  "actor",
  "rect",
  "windowActor",
  "float",
  "tile",
]);

/** Own fields on makeLiveHandle / live-compat — do not overlay Node getters. */
const LIVE_OWNED = new Set([
  "nodeType",
  "nodeValue",
  "parentNode",
  "childNodes",
  "firstChild",
  "lastChild",
  "mode",
  "percent",
  "userSized",
  "layout",
  "settings",
  "wm",
  "tab",
  "decoration",
  "app",
  "placeholder",
  "actorBin",
  "lastTabFocus",
  "isWindow",
  "isCon",
  "isMonitor",
  "isWorkspace",
  "isRoot",
  "isFloat",
  "isTile",
  "isGrabTile",
  "isTabbed",
  "isStacked",
  "isStackedOrTabbed",
  "isHSplit",
  "isVSplit",
  "isPlaceholder",
]);

const LIVE_OVERWRITE = new Set(["getNodeByType", "setLayout", "render"]);

/** Dual-write stay on class Tree. ROOT gets thin delegates (do not skip). */
const DUAL_WRITE_MOVE_NAMES = new Set(["move", "moveIn", "moveOut"]);

function attachRootMoveApi(live) {
  for (const name of DUAL_WRITE_MOVE_NAMES) {
    const fn = Tree.prototype[name];
    if (typeof fn !== "function") continue;
    live[name] = function (...args) {
      return fn.apply(this, args);
    };
  }
}

function bindClassApi(target, ctor) {
  const proto = ctor.prototype;
  for (const name of Object.getOwnPropertyNames(proto)) {
    if (name === "constructor") continue;
    if (ROOT_SPINE_NAMES.has(name)) continue;
    if (QUERY_NAMES.has(name)) continue;
    if (TOPO_NAMES.has(name)) continue;
    if (NAV_NAMES.has(name)) continue;
    if (PRESENT_NAMES.has(name)) continue;
    if (CHROME_NAMES.has(name)) continue;
    if (INVENT_NAMES.has(name)) continue;
    if (NODE_ONLY_NAMES.has(name)) continue;
    if (DUAL_WRITE_MOVE_NAMES.has(name)) continue;
    const exists = Object.prototype.hasOwnProperty.call(target, name);
    if (LIVE_OWNED.has(name) && exists) continue;
    if (exists && !LIVE_OVERWRITE.has(name)) continue;
    const desc = Object.getOwnPropertyDescriptor(proto, name);
    if (!desc) continue;
    Object.defineProperty(target, name, desc);
  }
}

/**
 * Production ROOT: LiveHandle + Tree API. Not `class Tree` / GObject Node.
 * @param {any} extWm
 */
export function createLiveTree(extWm) {
  const rootBin = new St.Bin();
  const settings = extWm?.ext?.settings ?? null;
  const live = makeLiveHandle(NODE_TYPES.ROOT, rootBin, {
    wm: extWm,
    settings,
    layout: LAYOUT_TYPES.ROOT,
  });
  ensureLiveListMutators(live);
  live._extWm = extWm;
  live.settings = settings;
  live.layout = LAYOUT_TYPES.ROOT;
  live.focusUnit = null;
  live.attachNode = undefined;

  bindClassApi(live, Node);
  bindClassApi(live, Tree);
  attachRootMoveApi(live);
  attachRootSpineApi(live);
  attachRootQueryApi(live);
  attachRootTopoApi(live);
  attachRootNavApi(live);
  attachRootPresentApi(live);
  attachRootInventApi(live, Node);

  try {
    if (global.window_group && !global.window_group.contains(rootBin)) {
      global.window_group.add_child(rootBin);
    }
  } catch (_e) {
    /* fixtures / disposed */
  }

  attachRootManagers(live, extWm);

  if (extWm) {
    if (!(extWm.liveById instanceof Map)) extWm.liveById = new Map();
    extWm.liveById.set("ROOT", live);
    if (!extWm._tree) extWm._tree = live;
  }

  live._initWorkspaces();
  return live;
}
