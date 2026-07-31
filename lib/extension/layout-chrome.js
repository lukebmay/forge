/*
 * Split-chrome target resolver (C3 / invariant I5).
 * Pure: no GObject / Mutter. Tree nodes are plain objects with parent/layout.
 *
 * Modes:
 *   ancestry (default) — H/V split CONs on the focused unit's parent chain
 *   all — every H/V split under the focused unit's MONITOR with a tiled pair
 */

import { layoutUnit, isSplitLayout } from "./layout-resize.js";

/**
 * @param {string|undefined|null} layout
 * @returns {"H"|"V"|null}
 */
export function splitChromeAxis(layout) {
  if (layout === "HSPLIT") return "H";
  if (layout === "VSPLIT") return "V";
  return null;
}

/**
 * @param {{ nodeType?: string, isCon?: () => boolean }|null|undefined} node
 * @returns {boolean}
 */
function isCon(node) {
  if (!node) return false;
  if (typeof node.isCon === "function") return !!node.isCon();
  return node.nodeType === "CON";
}

/**
 * @param {{ nodeType?: string, isMonitor?: () => boolean }|null|undefined} node
 * @returns {boolean}
 */
function isMonitor(node) {
  if (!node) return false;
  if (typeof node.isMonitor === "function") return !!node.isMonitor();
  return node.nodeType === "MONITOR";
}

/**
 * @param {{ nodeType?: string, isWorkspace?: () => boolean, isRoot?: () => boolean }|null|undefined} node
 * @returns {boolean}
 */
function isStructuralStop(node) {
  if (!node) return true;
  if (typeof node.isWorkspace === "function" && node.isWorkspace()) return true;
  if (typeof node.isRoot === "function" && node.isRoot()) return true;
  const t = node.nodeType;
  return t === "WORKSPACE" || t === "ROOT";
}

/**
 * Whether `node` is an H/V split with ≥2 tiled children (chrome-worthy).
 *
 * @param {object|null|undefined} node
 * @param {(items: object[]) => object[]} getTiledChildren
 * @returns {boolean}
 */
export function isChromeSplit(node, getTiledChildren) {
  if (!node || typeof getTiledChildren !== "function") return false;
  if (!isSplitLayout(node.layout)) return false;
  // Prefer real CONs; MONITOR H/V with a tiled pair also counts.
  if (!isCon(node) && !isMonitor(node)) return false;
  const tiled = getTiledChildren(node.childNodes || []);
  return tiled.length > 1;
}

/**
 * MONITOR ancestor of `node`, or null.
 * @param {{ parentNode?: unknown }|null|undefined} node
 * @returns {object|null}
 */
export function findAncestorMonitor(node) {
  let n = node;
  while (n) {
    if (isMonitor(n)) return n;
    n = n.parentNode;
  }
  return null;
}

/**
 * Collect H/V split chrome targets for the focused layout unit.
 *
 * @param {object|null|undefined} focusNode - focused window (or any node); unit is derived
 * @param {{
 *   mode?: "ancestry"|"all",
 *   getTiledChildren: (items: object[]) => object[],
 * }} opts
 * @returns {Array<{ con: object, axis: "H"|"V" }>} nearest-first for ancestry
 */
export function collectSplitChromeTargets(focusNode, opts = {}) {
  const getTiledChildren = opts.getTiledChildren;
  if (!focusNode || typeof getTiledChildren !== "function") return [];

  const mode = opts.mode === "all" ? "all" : "ancestry";
  const unit = layoutUnit(focusNode);
  if (!unit) return [];

  if (mode === "all") {
    const mon = findAncestorMonitor(unit);
    const root = mon || unit;
    return collectAllSplits(root, getTiledChildren);
  }

  return collectAncestrySplits(unit, getTiledChildren);
}

/**
 * Walk parents from unit up through MONITOR (inclusive if chrome-worthy).
 * @param {object} unit
 * @param {(items: object[]) => object[]} getTiledChildren
 * @returns {Array<{ con: object, axis: "H"|"V" }>}
 */
function collectAncestrySplits(unit, getTiledChildren) {
  const out = [];
  let n = unit;
  while (n && n.parentNode) {
    const parent = n.parentNode;
    if (isChromeSplit(parent, getTiledChildren)) {
      const axis = splitChromeAxis(parent.layout);
      if (axis) out.push({ con: parent, axis });
    }
    if (isMonitor(parent)) break;
    if (isStructuralStop(parent)) break;
    n = parent;
  }
  return out;
}

/**
 * Every chrome-worthy H/V split under `root` (depth-first, preorder).
 * @param {object} root
 * @param {(items: object[]) => object[]} getTiledChildren
 * @returns {Array<{ con: object, axis: "H"|"V" }>}
 */
function collectAllSplits(root, getTiledChildren) {
  const out = [];
  const visit = (node) => {
    if (!node) return;
    if (isChromeSplit(node, getTiledChildren)) {
      const axis = splitChromeAxis(node.layout);
      if (axis) out.push({ con: node, axis });
    }
    const kids = node.childNodes || [];
    for (const c of kids) {
      // Skip pure window leaves; recurse CONs / nested structure.
      if (c && (isCon(c) || isMonitor(c) || (c.childNodes && c.childNodes.length))) {
        visit(c);
      }
    }
  };
  visit(root);
  return out;
}
