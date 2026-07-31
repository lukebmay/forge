/*
 * Owning-split resize resolver (R1 / invariant I3).
 * Pure: no GObject / Mutter. Tree nodes are plain objects with parent/layout.
 *
 * resize(edge):
 *   unit = focused layout unit (window, or tab/stack bag if inside)
 *   axis = axis of edge
 *   target = lowest ancestor of unit that sits in an H/V split on `axis`
 *            with a tiled pair
 *   if no target: no-op
 *   else: adjust target percent vs pair
 */

/** Side-by-side split axes (match tree ORIENTATION_TYPES). */
export const RESIZE_AXIS = Object.freeze({
  HORIZONTAL: "HORIZONTAL",
  VERTICAL: "VERTICAL",
});

const SPLIT_AXIS = Object.freeze({
  HSPLIT: RESIZE_AXIS.HORIZONTAL,
  VSPLIT: RESIZE_AXIS.VERTICAL,
});

/**
 * @param {string|undefined|null} layout
 * @returns {boolean}
 */
export function isSplitLayout(layout) {
  return layout === "HSPLIT" || layout === "VSPLIT";
}

/**
 * @param {string|undefined|null} layout
 * @returns {boolean}
 */
export function isTabOrStackLayout(layout) {
  return layout === "TABBED" || layout === "STACKED";
}

/**
 * Axis of a side-by-side split parent, or null if not H/V split.
 * TABBED/STACKED are not resize splits (children overlap).
 *
 * @param {string|undefined|null} layout
 * @returns {"HORIZONTAL"|"VERTICAL"|null}
 */
export function splitAxis(layout) {
  return SPLIT_AXIS[layout] ?? null;
}

/**
 * Focused layout unit for resize: bag CON if inside TABBED/STACKED, else node.
 * Walks through nested tab/stack bags so the unit is the outermost bag.
 *
 * @param {{ parentNode?: { layout?: string }|null }|null|undefined} node
 * @returns {typeof node}
 */
export function layoutUnit(node) {
  if (!node) return null;
  let unit = node;
  while (unit.parentNode && isTabOrStackLayout(unit.parentNode.layout)) {
    unit = unit.parentNode;
  }
  return unit;
}

/**
 * Pair among tiled siblings: next, or previous when `target` is last.
 * Mirrors WindowManager._expandNodeAgainstPair pair selection.
 *
 * @param {object} target
 * @param {object[]} tiled
 * @returns {object|null}
 */
export function pickSplitPair(target, tiled) {
  if (!target || !Array.isArray(tiled) || tiled.length <= 1) return null;
  const index = tiled.indexOf(target);
  if (index < 0) return null;
  return index + 1 < tiled.length ? tiled[index + 1] : tiled[index - 1];
}

/**
 * Resolve the owning split for one axis.
 *
 * @param {object|null|undefined} focusNode - focused window (or any node); unit is derived
 * @param {"HORIZONTAL"|"VERTICAL"} axis
 * @param {{ getTiledChildren: (childNodes: object[]) => object[] }} accessors
 * @returns {{ target: object, pair: object, parent: object, axis: string }|null}
 */
export function resolveOwningSplit(focusNode, axis, accessors) {
  if (!focusNode || !axis || !accessors || typeof accessors.getTiledChildren !== "function") {
    return null;
  }
  if (axis !== RESIZE_AXIS.HORIZONTAL && axis !== RESIZE_AXIS.VERTICAL) {
    return null;
  }

  let n = layoutUnit(focusNode);
  while (n && n.parentNode) {
    const parent = n.parentNode;
    if (splitAxis(parent.layout) === axis) {
      const childNodes = parent.childNodes || [];
      const tiled = accessors.getTiledChildren(childNodes);
      if (tiled.length > 1 && tiled.includes(n)) {
        const pair = pickSplitPair(n, tiled);
        if (pair) {
          return { target: n, pair, parent, axis };
        }
      }
    }
    n = parent;
  }
  return null;
}

/**
 * Resolve owning splits for both axes (expand/shrink dual application).
 * Order: horizontal then vertical. Missing axes are omitted.
 *
 * @param {object|null|undefined} focusNode
 * @param {{ getTiledChildren: (childNodes: object[]) => object[] }} accessors
 * @returns {Array<{ target: object, pair: object, parent: object, axis: string }>}
 */
export function resolveOwningSplitsBothAxes(focusNode, accessors) {
  const out = [];
  for (const axis of [RESIZE_AXIS.HORIZONTAL, RESIZE_AXIS.VERTICAL]) {
    const res = resolveOwningSplit(focusNode, axis, accessors);
    if (res) out.push(res);
  }
  return out;
}
