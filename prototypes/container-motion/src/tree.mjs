// @ts-check
/**
 * Presenter TreeApi — TOM + navigation/launch/legacy peel helpers.
 * Motion policy lives in OpSets, not here.
 */

import { neighborMonitor, nearLeafOnMonitor } from "./monitors.mjs";
import { clearMergeTags, mergeTagsOf, sessionOf } from "./session.mjs";
import { createTomApi } from "./tom/api.mjs";
import { geomOf } from "./world.mjs";
import {
  children,
  fail,
  ok,
  parent,
  registerTree,
  rightmostLeaf,
  selectionNode,
} from "./tom/index.mjs";

export { defaultDecisions } from "./session.mjs";
export { applyForestSnapshot, cloneForest, dumpForest, nextAppLabel } from "./tom/index.mjs";

/** @typedef {import('./tom/kernel.mjs').NodeKind} NodeKind */
/** @typedef {import('./tom/kernel.mjs').Layout} Layout */
/** @typedef {import('./tom/kernel.mjs').Dir} Dir */
/** @typedef {import('./world.mjs').MonitorGeom} MonitorGeom */
/** @typedef {import('./tom/kernel.mjs').Node} Node */
/** @typedef {import('./session.mjs').Decisions} Decisions */
/** @typedef {import('./tom/kernel.mjs').Forest} Forest */

/**
 * @returns {TomApi & ReturnType<typeof presenterOps>}
 */
export function createTreeApi() {
  const tom = createTomApi();
  const extra = presenterOps(tom);
  return /** @type {any} */ ({ ...tom, ...extra });
}

/**
 * @typedef {import('./tom/api.mjs').TomApi} TomApi
 */

/**
 * @param {TomApi} tom
 */
function presenterOps(tom) {
  return {
    /**
     * @param {Forest} f
     * @param {string} label
     * @param {number} monIndex
     * @param {string} [wmClass]
     */
    launch(f, label, monIndex, wmClass = "app") {
      const mon = f.monitors[monIndex];
      if (!mon) return fail("no monitor");
      const win = tom.makeWindow(label, wmClass);
      registerTree(f, win);

      const kids = children(f, mon);
      if (kids.length === 0) {
        win.parentId = mon.id;
        mon.childIds = [win.id];
        tom.setFocus(f, win.id);
        return ok("launch", { id: win.id, mon: mon.id });
      }

      const last = rightmostLeaf(f, mon);
      if (!last || last.kind === "MONITOR") {
        tom.appendChild(f, mon, win);
        tom.setFocus(f, win.id);
        return ok("launch", { id: win.id, mon: mon.id, where: "mon-end" });
      }

      const p = parent(f, last);
      if (!p) return fail("slot has no parent");
      if (p.kind === "MONITOR") {
        const tie = sessionOf(f).decisions.aspectTieBreak || "HSPLIT";
        const geom = geomOf(f, mon);
        const w = geom?.width ?? 2;
        const h = geom?.height ?? 1;
        /** @type {Layout} */
        const axis = h > w ? "VSPLIT" : w > h ? "HSPLIT" : tie;
        const wrap = tom.makeCon(axis, []);
        registerTree(f, wrap);
        tom.replaceChild(f, p, last, wrap);
        tom.appendChild(f, wrap, last);
        tom.appendChild(f, wrap, win);
        wrap.percent = 1;
        last.percent = 0.5;
        win.percent = 0.5;
        last.userSized = false;
        tom.setFocus(f, win.id);
        return ok("launch", { id: win.id, wrap: wrap.id, axis, where: "mon-wrap" });
      }

      tom.insertAfter(f, p, win, last);
      tom.equalizeChildren(f, p.id, false);
      tom.setFocus(f, win.id);
      return ok("launch", { id: win.id, where: "end" });
    },

    /** @param {Forest} f @param {Dir} dir */
    focusDir(f, dir) {
      const cur = selectionNode(f);
      if (!cur) return fail("no selection");
      const target = neighbor(f, tom, cur, dir, "focus");
      if (!target) return fail("no neighbor");
      const leaf = tom.preferredLeaf(f, target);
      tom.setFocus(f, leaf.id);
      return ok("focusDir", { dir, to: leaf.id });
    },

    /**
     * In-axis sibling swap only. No wrap, no cross-mon, no breakout.
     * @param {Forest} f
     * @param {Dir} dir
     */
    moveDir(f, dir) {
      const cur = selectionNode(f);
      if (!cur || cur.kind === "MONITOR") return fail("bad selection");
      const p = parent(f, cur);
      if (!p) return fail("no parent");
      const axis = parentAxis(p);
      const bag = p.layout === "TABBED" || p.layout === "STACKED";
      const inAxis = bag || dirMatchesAxis(dir, axis);
      if (!inAxis) return fail("dir off-axis");
      const idx = p.childIds.indexOf(cur.id);
      const delta = dir === "left" || dir === "up" ? -1 : 1;
      const j = idx + delta;
      if (j < 0 || j >= p.childIds.length) return fail("edge (TreeOp: no wrap)");
      const other = f.nodes[p.childIds[j]];
      if (!other) return fail("no sibling");
      return tom.swapSiblings(f, cur, other);
    },

    /** @param {Forest} f @param {Dir} dir */
    swapDir(f, dir) {
      const cur = selectionNode(f);
      if (!cur) return fail("no selection");
      const other = neighbor(f, tom, cur, dir, "swap");
      if (!other) return fail("no neighbor");
      const p = parent(f, cur);
      const p2 = parent(f, other);
      if (!p || p !== p2) return fail("not siblings");
      return tom.swapSiblings(f, cur, other);
    },

    /** @param {Forest} f */
    focusParent(f) {
      const cur = selectionNode(f);
      if (!cur) return fail("no selection");
      const p = parent(f, cur);
      if (!p || p.kind === "MONITOR") return fail("no parent");
      f.selectionId = p.id;
      return ok("focusParent", { id: p.id });
    },

    /** @param {Forest} f */
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
      if (next.kind === "WINDOW") tom.setFocus(f, next.id);
      else f.selectionId = next.id;
      return ok("focusChild", { id: next.id });
    },

    /** @param {Forest} f */
    moveOut(f) {
      const cur = selectionNode(f);
      if (!cur || cur.kind === "MONITOR") return fail("bad selection");
      const p = parent(f, cur);
      if (!p || p.kind === "MONITOR") return fail("already at mon");
      const grand = parent(f, p);
      if (!grand) return fail("no grandparent");

      if (
        sessionOf(f).decisions.peelModel === "B" &&
        (p.layout === "TABBED" || p.layout === "STACKED")
      ) {
        const wrap = tom.makeCon(pickPeelAxis(p), []);
        registerTree(f, wrap);
        tom.replaceChild(f, grand, p, wrap);
        wrap.percent = p.percent;
        tom.appendChild(f, wrap, p);
        tom.appendChild(f, wrap, cur);
        p.percent = 0.5;
        cur.percent = 0.5;
        f.selectionId = cur.id;
        if (cur.kind === "WINDOW") f.focusId = cur.id;
        return ok("moveOut", { model: "B", wrap: wrap.id });
      }

      const pidx = grand.childIds.indexOf(p.id);
      tom.removeChild(f, p, cur);
      const ref = pidx + 1 < grand.childIds.length ? f.nodes[grand.childIds[pidx + 1]] : null;
      if (ref) tom.insertBefore(f, grand, cur, ref);
      else tom.appendChild(f, grand, cur);
      tom.equalizeChildren(f, grand.id, false);
      f.selectionId = cur.id;
      if (cur.kind === "WINDOW") f.focusId = cur.id;
      return ok("moveOut", { model: "A" });
    },

    /** @param {Forest} f */
    moveIn(f) {
      const cur = selectionNode(f);
      if (!cur) return fail("no selection");
      const p = parent(f, cur);
      if (!p) return fail("no parent");
      const idx = p.childIds.indexOf(cur.id);
      /** @type {Node|null} */
      let target = null;
      for (const j of [idx + 1, idx - 1]) {
        if (j < 0 || j >= p.childIds.length) continue;
        const sib = f.nodes[p.childIds[j]];
        if (sib && sib.kind === "CON") {
          target = sib;
          break;
        }
      }
      if (!target) return fail("no sibling CON");
      tom.removeChild(f, p, cur);
      tom.appendChild(f, target, cur);
      tom.equalizeChildren(f, target.id, false);
      tom.equalizeChildren(f, p.id, false);
      f.selectionId = cur.id;
      return ok("moveIn", { into: target.id });
    },

    /**
     * @param {Forest} f
     * @param {boolean} [withTagged]
     */
    group(f, withTagged = true) {
      const cur = selectionNode(f);
      if (!cur) return fail("no selection");
      const p = parent(f, cur);
      if (!p) return fail("no parent");
      /** @type {Node[]} */
      const members = [cur];
      if (withTagged) {
        for (const tid of mergeTagsOf(f)) {
          const t = f.nodes[tid];
          if (t && t.id !== cur.id && parent(f, t) === p) members.push(t);
        }
      }
      if (members.length === 1) {
        const idx = p.childIds.indexOf(cur.id);
        const sib = f.nodes[p.childIds[idx + 1]];
        if (sib) members.push(sib);
      }
      const wrap = tom.makeCon("TABBED", []);
      registerTree(f, wrap);
      const r = tom.wrapNodes(f, p, members, wrap);
      if (!r.ok) return r;
      if (members[0]) wrap.lastTabFocusId = members[0].id;
      f.selectionId = wrap.id;
      clearMergeTags(f);
      return ok("group", { id: wrap.id, n: members.length });
    },

    /**
     * @param {Forest} f
     * @param {Layout} [mode]
     * @param {number} [monIndex]
     */
    createGroup(f, mode = "TABBED", monIndex) {
      const empty = tom.makeCon(mode, []);
      registerTree(f, empty);
      const sel = selectionNode(f);
      let p = sel ? parent(f, sel) : null;
      if (monIndex != null && f.monitors[monIndex]) {
        p = f.monitors[monIndex];
      } else if (!p) {
        p = f.monitors[0];
      }
      if (!p) return fail("no parent");
      if (sel && sel.kind === "CON" && monIndex == null) {
        tom.appendChild(f, sel, empty);
        tom.equalizeChildren(f, sel.id, false);
      } else if (sel && sel.parentId === p.id) {
        const i = p.childIds.indexOf(sel.id);
        const ref = i + 1 < p.childIds.length ? f.nodes[p.childIds[i + 1]] : null;
        if (ref) tom.insertBefore(f, p, empty, ref);
        else tom.appendChild(f, p, empty);
        tom.equalizeChildren(f, p.id, false);
      } else {
        tom.appendChild(f, p, empty);
        tom.equalizeChildren(f, p.id, false);
      }
      f.selectionId = empty.id;
      return ok("createGroup", { id: empty.id, mode });
    },

    /** @param {Forest} f @param {number} [delta] */
    cycleLayout(f, delta = 1) {
      const cur = selectionNode(f);
      if (!cur) return fail("no selection");
      const con = cur.kind === "CON" ? cur : parent(f, cur);
      if (!con || con.kind !== "CON") return fail("no CON");
      const order = ["HSPLIT", "VSPLIT", "TABBED", "STACKED"];
      const i = Math.max(0, order.indexOf(con.layout || "HSPLIT"));
      const next = order[(i + delta + order.length * 8) % order.length];
      return tom.setLayout(f, /** @type {Layout} */ (next));
    },

    /** @param {Forest} f */
    unsetSizeInAxis(f) {
      return tom.shareSize(f);
    },

    /** @param {Forest} f */
    unsetSizeCrossAxis(f) {
      return tom.shareCombo(f, { parent: true });
    },

    /** @param {Forest} f @param {Dir} dir */
    breakoutDir(f, dir) {
      const cur = selectionNode(f);
      if (!cur || cur.kind === "MONITOR") return fail("bad selection");
      const side = dir === "left" || dir === "up" ? "before" : "after";
      return tom.breakout(f, cur, side);
    },
  };
}

/**
 * @typedef {ReturnType<typeof createTreeApi>} TreeApi
 */

/** @param {Node} p */
function parentAxis(p) {
  if (p.layout === "VSPLIT" || p.layout === "STACKED") return "v";
  return "h";
}

/** @param {Dir} dir @param {string} axis */
function dirMatchesAxis(dir, axis) {
  if (axis === "h") return dir === "left" || dir === "right";
  return dir === "up" || dir === "down";
}

/** @param {Node} parentNode */
function pickPeelAxis(parentNode) {
  if (parentNode.layout === "TABBED" || parentNode.layout === "STACKED") return "VSPLIT";
  return parentNode.layout === "HSPLIT" ? "VSPLIT" : "HSPLIT";
}

/**
 * @param {Forest} f
 * @param {TomApi} api
 * @param {Node} cur
 * @param {Dir} dir
 * @param {'focus'|'swap'|'move'} mode
 */
function neighbor(f, api, cur, dir, mode) {
  let node = cur;
  while (node) {
    const p = api.parent(f, node);
    if (!p || p.kind === "WORKSPACE" || p.kind === "ROOT") {
      if (mode === "focus") {
        const mon = node.kind === "MONITOR" ? node : api.ancestorMonitor(f, node);
        if (!mon) return null;
        const dest = neighborMonitor(f, mon, dir);
        if (!dest) return null;
        return nearLeafOnMonitor(f, api, dest, dir);
      }
      return null;
    }
    const axis = parentAxis(p);
    const bag = p.layout === "TABBED" || p.layout === "STACKED";
    if (bag || dirMatchesAxis(dir, axis)) {
      const idx = p.childIds.indexOf(node.id);
      const delta = dir === "left" || dir === "up" ? -1 : 1;
      const j = idx + delta;
      if (j >= 0 && j < p.childIds.length) return f.nodes[p.childIds[j]] ?? null;
      if (mode !== "focus") return null;
      node = p;
      continue;
    }
    node = p;
  }
  return null;
}
