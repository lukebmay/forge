/*
 * Layout unit helpers — first-class container spine (I1).
 * Pure: no GObject / Mutter. Tree nodes are plain objects with .layout.
 */

/** Modes a CON may hold (not ROOT/PRESET). */
export const LAYOUT_MODES = Object.freeze(["HSPLIT", "VSPLIT", "TABBED", "STACKED"]);

/**
 * @param {string} layout
 * @returns {boolean}
 */
export function isLayoutMode(layout) {
  return LAYOUT_MODES.includes(layout);
}

/**
 * Change container layout mode only (invariant I1).
 *
 * Does **not** reparent, flatten nested CONs, or reset sibling percents.
 * Callers that need structure change must use explicit group/ungroup (C2).
 *
 * @param {{ layout?: string, lastTabFocus?: unknown }} con
 * @param {string} layout - HSPLIT | VSPLIT | TABBED | STACKED
 * @param {{ lastTabFocus?: unknown, clearLastTabFocus?: boolean }} [opts]
 * @returns {boolean} true if applied
 */
export function setLayout(con, layout, opts = {}) {
  if (!con || !isLayoutMode(layout)) return false;
  con.layout = layout;
  if (opts.clearLastTabFocus) {
    con.lastTabFocus = null;
  } else if (Object.prototype.hasOwnProperty.call(opts, "lastTabFocus")) {
    con.lastTabFocus = opts.lastTabFocus;
  }
  return true;
}

/** Parents that must never be dissolved by ungroup. */
const STRUCTURAL_PARENTS = new Set(["MONITOR", "WORKSPACE", "ROOT"]);

/**
 * Whether `node` is a dissolve-able CON (not MONITOR/WORKSPACE/ROOT).
 * @param {{ nodeType?: string, isCon?: () => boolean }|null|undefined} node
 * @returns {boolean}
 */
export function isUngroupCon(node) {
  if (!node) return false;
  if (typeof node.isCon === "function") return !!node.isCon();
  return node.nodeType === "CON";
}

/**
 * Nearest CON ancestor of `node` that ungroup may dissolve (I2).
 * Walks parents only — `node` itself is never the target.
 * Returns null when the only structural parents are MONITOR/WORKSPACE/ROOT.
 *
 * @param {{ parentNode?: unknown }|null|undefined} node
 * @returns {object|null}
 */
export function resolveUngroupTarget(node) {
  if (!node) return null;
  let p = node.parentNode;
  while (p) {
    const type = p.nodeType;
    if (isUngroupCon(p)) return p;
    if (STRUCTURAL_PARENTS.has(type)) return null;
    if (typeof p.isMonitor === "function" && p.isMonitor()) return null;
    if (typeof p.isWorkspace === "function" && p.isWorkspace()) return null;
    if (typeof p.isRoot === "function" && p.isRoot()) return null;
    p = p.parentNode;
  }
  return null;
}

/**
 * Whether `node` is a structural root we never select as focus-parent target.
 * @param {{ nodeType?: string, isMonitor?: () => boolean, isWorkspace?: () => boolean, isRoot?: () => boolean }|null|undefined} node
 * @returns {boolean}
 */
export function isStructuralTreeParent(node) {
  if (!node) return false;
  if (STRUCTURAL_PARENTS.has(node.nodeType)) return true;
  if (typeof node.isMonitor === "function" && node.isMonitor()) return true;
  if (typeof node.isWorkspace === "function" && node.isWorkspace()) return true;
  if (typeof node.isRoot === "function" && node.isRoot()) return true;
  return false;
}

/**
 * Nearest parent CON for focus-parent (i3 `$mod+a` class).
 * Walks parents of `node` (if `node` is a CON, starts at its parent).
 * No-op at MONITOR/WORKSPACE/ROOT — never selects those as the attach target.
 *
 * @param {{ parentNode?: unknown, nodeType?: string }|null|undefined} node
 * @returns {object|null}
 */
export function resolveFocusParent(node) {
  if (!node) return null;
  let p = node.parentNode;
  while (p) {
    if (isUngroupCon(p)) return p;
    if (isStructuralTreeParent(p)) return null;
    p = p.parentNode;
  }
  return null;
}

/**
 * Preferred direct child of `con` for focus-child.
 * Preference: lastChildHint (node or meta match) → lastTabFocus match → first child.
 * Returns WINDOW or nested CON; not MONITOR.
 *
 * @param {{ childNodes?: object[], lastTabFocus?: unknown, nodeType?: string }|null|undefined} con
 * @param {object|unknown} [lastChildHint] - child node, or meta/window value matched via nodeValue
 * @returns {object|null}
 */
export function resolveFocusChild(con, lastChildHint) {
  if (!con || !isUngroupCon(con)) return null;
  const kids = con.childNodes || [];
  if (kids.length === 0) return null;

  const matchHint = (hint) => {
    if (hint == null) return null;
    if (kids.includes(hint)) return hint;
    for (const c of kids) {
      if (c === hint) return c;
      if (c?.nodeValue != null && c.nodeValue === hint) return c;
    }
    return null;
  };

  const fromHint = matchHint(lastChildHint);
  if (fromHint) return fromHint;

  if (con.lastTabFocus != null) {
    const fromTab = matchHint(con.lastTabFocus);
    if (fromTab) return fromTab;
    for (const c of kids) {
      if (c?.nodeType === "CON" || (typeof c?.isCon === "function" && c.isCon())) {
        // lastTabFocus may live under a nested child CON
        if (c.lastTabFocus === con.lastTabFocus) return c;
        const nested = c.childNodes || [];
        for (const n of nested) {
          if (n?.nodeValue === con.lastTabFocus) return c;
        }
      }
    }
  }

  return kids[0] || null;
}

/**
 * WINDOW under `con` that should represent container focus (for activate).
 * Prefer currentFocus if still under con; else lastTabFocus; else first WINDOW descendant.
 *
 * @param {object|null|undefined} con
 * @param {object|null|undefined} [currentFocus] - focused WINDOW node
 * @param {{ findNode?: (meta: unknown) => object|null }} [accessors]
 * @returns {object|null} WINDOW node
 */
export function resolveRepresentativeWindow(con, currentFocus, accessors = {}) {
  if (!con) return null;

  const under = (n) => {
    if (!n) return false;
    if (n === con) return true;
    if (typeof con.contains === "function") return !!con.contains(n);
    let p = n.parentNode;
    while (p) {
      if (p === con) return true;
      p = p.parentNode;
    }
    return false;
  };

  if (
    currentFocus &&
    (currentFocus.nodeType === "WINDOW" || currentFocus.isWindow?.()) &&
    under(currentFocus)
  ) {
    return currentFocus;
  }

  if (con.lastTabFocus != null) {
    let n = null;
    if (typeof accessors.findNode === "function") {
      n = accessors.findNode(con.lastTabFocus);
    }
    if (!n && Array.isArray(con.childNodes)) {
      for (const c of con.childNodes) {
        if (c?.nodeValue === con.lastTabFocus) {
          n = c;
          break;
        }
      }
    }
    if (n && (n.nodeType === "WINDOW" || n.isWindow?.()) && under(n)) return n;
  }

  // First WINDOW leaf under con (BFS on childNodes)
  const queue = [con];
  while (queue.length) {
    const cur = queue.shift();
    if (!cur) continue;
    if (cur !== con && (cur.nodeType === "WINDOW" || cur.isWindow?.())) return cur;
    const kids = cur.childNodes || [];
    for (const k of kids) queue.push(k);
  }
  return null;
}

/**
 * Unit for move-in/out: attach CON when focus-parent selected it; else the
 * focused WINDOW. Does **not** auto-promote to tab/stack bag via layoutUnit —
 * that would no-op bags under MONITOR and contradict “lift window from group.”
 *
 * @param {object|null|undefined} attachNode
 * @param {object|null|undefined} focusNode
 * @returns {object|null}
 */
export function resolveMoveUnit(attachNode, focusNode) {
  if (!focusNode) return null;
  if (
    attachNode &&
    attachNode !== focusNode &&
    isUngroupCon(attachNode) &&
    (typeof attachNode.contains === "function" ? attachNode.contains(focusNode) : false)
  ) {
    return attachNode;
  }
  return focusNode;
}

/**
 * Resolve move-out targets: unit lifts one level (not ungroup dissolve).
 *
 * @param {object|null|undefined} unit - from resolveMoveUnit
 * @returns {{ unit: object, parent: object, grandparent: object }|null}
 */
export function resolveMoveOut(unit) {
  if (!unit) return null;
  const parent = unit.parentNode;
  if (!parent) return null;
  // Must leave a CON parent (or any non-structural parent with a grandparent).
  // No-op when parent is MONITOR/WORKSPACE/ROOT.
  if (isStructuralTreeParent(parent)) return null;
  const grandparent = parent.parentNode;
  if (!grandparent) return null;
  return { unit, parent, grandparent };
}

/**
 * Prefer next sibling CON, else previous sibling CON (move-in policy).
 * Does not invent CONs.
 *
 * @param {object|null|undefined} unit - already layoutUnit(focus)
 * @returns {{ unit: object, targetCon: object }|null}
 */
export function resolveMoveInSibling(unit) {
  if (!unit || !unit.parentNode) return null;
  const parent = unit.parentNode;
  const siblings = parent.childNodes || [];
  const idx = siblings.indexOf(unit);
  if (idx < 0) return null;

  const isConSibling = (n) => n && n !== unit && isUngroupCon(n);

  for (let i = idx + 1; i < siblings.length; i++) {
    if (isConSibling(siblings[i])) return { unit, targetCon: siblings[i] };
  }
  for (let i = idx - 1; i >= 0; i--) {
    if (isConSibling(siblings[i])) return { unit, targetCon: siblings[i] };
  }
  return null;
}
