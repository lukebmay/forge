/*
 * This file is part of the Forge extension for GNOME
 *
 * FCC I5 split chrome — pure mode + ancestry helpers (no GObject).
 */

export const SPLIT_CHROME_MODE = {
  ANCESTRY: "ancestry",
  ALL: "all",
};

/**
 * @param {{ showAll?: boolean, forceShowAll?: boolean }} [opts]
 * @returns {"ancestry"|"all"}
 */
export function resolveSplitChromeMode({ showAll = false, forceShowAll = false } = {}) {
  if (forceShowAll || showAll) return SPLIT_CHROME_MODE.ALL;
  return SPLIT_CHROME_MODE.ANCESTRY;
}

/**
 * @param {object|null|undefined} node
 * @returns {boolean}
 */
export function isSplitChromeCeiling(node) {
  if (!node) return true;
  if (typeof node.isWorkspace === "function" && node.isWorkspace()) return true;
  if (typeof node.isRoot === "function" && node.isRoot()) return true;
  const t = node.nodeType;
  return t === "WORKSPACE" || t === "ROOT";
}

/**
 * @param {object|null|undefined} node
 * @returns {boolean}
 */
export function isHvSplitNode(node) {
  if (!node || isSplitChromeCeiling(node)) return false;
  if (typeof node.isHSplit === "function" && node.isHSplit()) return true;
  if (typeof node.isVSplit === "function" && node.isVSplit()) return true;
  const layout = node.layout;
  return layout === "HSPLIT" || layout === "VSPLIT";
}

/**
 * H/V parents of `unit` up to (excluding) workspace/root. Includes MONITOR if H/V.
 * @param {object|null|undefined} unit layout unit (window or tab/stack bag)
 * @returns {object[]}
 */
export function collectSplitAncestry(unit) {
  const out = [];
  if (!unit) return out;
  let n = unit.parentNode;
  while (n && !isSplitChromeCeiling(n)) {
    if (isHvSplitNode(n)) out.push(n);
    n = n.parentNode;
  }
  return out;
}

/**
 * Nearest H/V ancestor of `node` (parent walk).
 * @param {object|null|undefined} node
 * @returns {object|null}
 */
export function nearestHvAncestor(node) {
  let n = node?.parentNode;
  while (n && !isSplitChromeCeiling(n)) {
    if (isHvSplitNode(n)) return n;
    n = n.parentNode;
  }
  return null;
}

/**
 * Which split border to paint on a WINDOW leaf for the active chrome mode.
 * Ancestry: lowest H/V ancestor that is in `ancestry`. All: nearest H/V parent.
 *
 * @param {object|null|undefined} windowNode
 * @param {{ mode?: string, ancestry?: Iterable<object>|Set<object>|null }} [opts]
 * @returns {{ splitCon: object, isVertical: boolean } | null}
 */
export function splitChromeForWindow(
  windowNode,
  { mode = SPLIT_CHROME_MODE.ANCESTRY, ancestry = null } = {}
) {
  if (!windowNode) return null;

  if (mode === SPLIT_CHROME_MODE.ALL) {
    const splitCon = nearestHvAncestor(windowNode);
    if (!splitCon) return null;
    return { splitCon, isVertical: _isVerticalSplit(splitCon) };
  }

  const set =
    ancestry instanceof Set
      ? ancestry
      : new Set(ancestry && typeof ancestry[Symbol.iterator] === "function" ? ancestry : []);
  if (set.size === 0) return null;

  let n = windowNode.parentNode;
  while (n && !isSplitChromeCeiling(n)) {
    if (isHvSplitNode(n) && set.has(n)) {
      return { splitCon: n, isVertical: _isVerticalSplit(n) };
    }
    n = n.parentNode;
  }
  return null;
}

function _isVerticalSplit(node) {
  if (typeof node.isVSplit === "function") return !!node.isVSplit();
  return node.layout === "VSPLIT";
}
