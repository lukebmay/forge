// @ts-check
/**
 * Dual-use TOM API — atomics + composed TreeOps. Presenters add navigation
 * and launch on top (tree.mjs). OpSets compose these; they do not splice
 * child lists by hand.
 */

import {
  appendChild,
  destroyNode,
  insertAfter,
  insertBefore,
  removeChild,
  replaceChild,
  replaceChildren,
  setChildren,
  setLastTabFocus,
  setLayout,
  setPercent,
  setUserSized,
} from "./atomics.mjs";
import {
  breakout,
  cleanupStructure,
  collapseUnary,
  equalizeChildren,
  promoteChildren,
  pruneEmptyCons,
  rotateChild,
  setLayoutTiling,
  swapSiblings,
  wrapNodes,
} from "./composed.mjs";
import {
  containingSplit,
  floatAllSizes,
  floatCombo,
  floatSiblingSizes,
  floatSize,
  isBagLayout,
  nudgeSize,
  setInAxisShare,
  SIZE_PRESETS,
  SIZE_STEP,
} from "./sizing.mjs";
import {
  children,
  clearMergeTags,
  createForest,
  ensureSpine,
  fail,
  focusNode,
  get,
  makeCon,
  makeIdFactory,
  makeWindow,
  ok,
  parent,
  registerTree,
  selectionNode,
  setFocus,
  setSelection,
  toggleMergeTag,
} from "./kernel.mjs";
import { ancestorMonitor, findConTarget, preferredLeaf } from "./queries.mjs";

/** @typedef {import('./kernel.mjs').Forest} Forest */
/** @typedef {import('./kernel.mjs').Node} Node */
/** @typedef {import('./kernel.mjs').Layout} Layout */
/** @typedef {import('./kernel.mjs').Dir} Dir */

export function createTomApi() {
  const ids = makeIdFactory(1);
  const nid = () => ids.nid();

  const api = {
    createForest(geoms) {
      const forest = createForest(geoms, nid);
      forest._seq = ids.seq;
      return forest;
    },

    makeWindow(label, wmClass = "app") {
      return makeWindow(nid, label, wmClass);
    },

    makeCon(layout, childrenIn = []) {
      return makeCon(nid, layout, childrenIn);
    },

    setChildren(forest, parentNode, kids) {
      return setChildren(forest, parentNode, kids);
    },

    _registerTree(forest, node) {
      registerTree(forest, node);
    },

    get,
    parent,
    children,
    focusNode,
    selectionNode,
    setFocus,
    setSelection,
    toggleMergeTag,
    clearMergeTags,

    appendChild(f, parentNode, child) {
      return appendChild(f, parentNode, child);
    },
    insertBefore(f, parentNode, child, ref) {
      return insertBefore(f, parentNode, child, ref ?? null);
    },
    insertAfter(f, parentNode, child, ref) {
      return insertAfter(f, parentNode, child, ref ?? null);
    },
    removeChild(f, parentNode, child) {
      return removeChild(f, parentNode, child);
    },
    replaceChildren(f, parentNode, kids) {
      return replaceChildren(f, parentNode, kids);
    },
    replaceChild(f, parentNode, oldNode, newNode) {
      return replaceChild(f, parentNode, oldNode, newNode);
    },
    setLayoutField(con, layout) {
      return setLayout(con, layout);
    },
    setPercent,
    setUserSized,
    setLastTabFocus,

    swapSiblings(f, a, b) {
      return swapSiblings(f, a, b);
    },
    rotateChild(f, parentNode, child, to) {
      return rotateChild(f, parentNode, child, to);
    },
    breakout(f, node, side) {
      return breakout(f, node, side);
    },
    wrapNodes(f, host, members, wrap) {
      return wrapNodes(f, host, members, wrap);
    },
    promoteChildren(f, con) {
      return promoteChildren(f, con);
    },
    pruneEmptyCons(f, root) {
      return pruneEmptyCons(f, root);
    },
    collapseUnary(f, root) {
      return collapseUnary(f, root);
    },
    cleanupStructure(f, root) {
      return cleanupStructure(f, root);
    },

    floatSize(f, node) {
      return floatSize(f, node);
    },
    floatSiblingSizes(f, node) {
      return floatSiblingSizes(f, node);
    },
    floatCombo(f, spec, node) {
      return floatCombo(f, spec, node);
    },
    floatAllSizes(f) {
      return floatAllSizes(f);
    },
    nudgeSize(f, axis, step, node) {
      return nudgeSize(f, axis, step, node);
    },
    setInAxisShare(f, share, node) {
      return setInAxisShare(f, node, share);
    },
    sizePreset(f, key) {
      const share = SIZE_PRESETS[key];
      if (share == null) return fail("unknown size preset");
      return setInAxisShare(f, selectionNode(f), share);
    },
    sizeStep() {
      return SIZE_STEP;
    },

    equalizeChildren(f, parentId, force = true) {
      const forceEq = force !== false;
      if (parentId) {
        const parentNode = f.nodes[parentId];
        if (!parentNode) return fail("no parent");
        return equalizeChildren(f, parentNode, { force: forceEq });
      }
      const cur = selectionNode(f);
      if (!cur) return fail("no parent");
      const p = parent(f, cur);
      if (isBagLayout(cur) || isBagLayout(p)) {
        const found = containingSplit(f, cur);
        if (!found) return fail("no H/V split");
        return equalizeChildren(f, found.parent, { force: forceEq });
      }
      if (cur.kind === "CON" || cur.kind === "MONITOR") {
        return equalizeChildren(f, cur, { force: forceEq });
      }
      if (!p) return fail("no parent");
      return equalizeChildren(f, p, { force: forceEq });
    },

    setLayout(f, mode) {
      const cur = selectionNode(f);
      if (!cur) return fail("no selection");
      const con = findConTarget(f, cur);
      if (!con) return fail("no CON");
      return setLayoutTiling(con, mode, f);
    },

    wrap(f, mode, withTagged = false) {
      const cur = selectionNode(f);
      if (!cur || cur.kind === "MONITOR") return fail("bad selection");
      const host = parent(f, cur);
      if (!host) return fail("no parent");
      /** @type {Node[]} */
      const members = [cur];
      if (withTagged) {
        for (const tid of f.mergeTags) {
          const t = f.nodes[tid];
          if (t && t.id !== cur.id && t.parentId === host.id) members.push(t);
        }
      }
      const wrap = makeCon(nid, mode, []);
      registerTree(f, wrap);
      const r = wrapNodes(f, host, members, wrap);
      if (!r.ok) return r;
      f.selectionId = wrap.id;
      clearMergeTags(f);
      return ok("wrap", { id: wrap.id, mode, n: members.length });
    },

    ungroup(f) {
      const cur = selectionNode(f);
      if (!cur) return fail("no selection");
      const bag = cur.kind === "CON" ? cur : parent(f, cur);
      if (!bag || bag.kind !== "CON") return fail("no CON");
      const kids = children(f, bag);
      const r = promoteChildren(f, bag);
      if (!r.ok) return r;
      if (kids[0]) {
        f.selectionId = kids[0].id;
        if (kids[0].kind === "WINDOW") f.focusId = kids[0].id;
      }
      return ok("ungroup", { dissolved: bag.id, n: kids.length });
    },

    flatten(f, wholeForest = false) {
      const starts = wholeForest ? f.monitors : [selectionNode(f)].filter(Boolean);
      if (!starts.length) return fail("nothing");
      let collapsed = 0;
      for (const root of starts) {
        if (!root) continue;
        collapsed += collapseUnary(f, root);
      }
      return ok("flatten", { collapsed });
    },

    deleteNode(f, nodeId) {
      return destroyNode(f, nodeId);
    },

    close(f) {
      const cur = focusNode(f) || selectionNode(f);
      if (!cur || cur.kind !== "WINDOW") return fail("focus a window");
      return destroyNode(f, cur.id);
    },

    focusParent(f) {
      const cur = selectionNode(f);
      if (!cur) return fail("no selection");
      const p = parent(f, cur);
      if (!p || p.kind === "MONITOR") return fail("no parent");
      f.selectionId = p.id;
      return ok("focusParent", { id: p.id });
    },

    focusChild(f) {
      const cur = selectionNode(f);
      if (!cur) return fail("no selection");
      const kids = children(f, cur);
      if (!kids.length) return fail("no child");
      let next = kids[0];
      if (cur.lastTabFocusId) {
        const t = f.nodes[cur.lastTabFocusId];
        if (t && t.parentId === cur.id) next = t;
      }
      if (next.kind === "WINDOW") setFocus(f, next.id);
      else f.selectionId = next.id;
      return ok("focusChild", { id: next.id });
    },

    hydrateSeq(f) {
      ids.hydrate(f);
      ensureSpine(f, nid);
    },

    ancestorMonitor(f, n) {
      return ancestorMonitor(f, n);
    },
    preferredLeaf(f, n) {
      return preferredLeaf(f, n);
    },
  };

  return api;
}

/**
 * @typedef {ReturnType<typeof createTomApi>} TomApi
 */
