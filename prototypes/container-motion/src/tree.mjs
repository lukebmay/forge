// @ts-check

/**
 * @typedef {'MONITOR'|'CON'|'WINDOW'} NodeKind
 * @typedef {'HSPLIT'|'VSPLIT'|'TABBED'|'STACKED'} Layout
 * @typedef {'left'|'right'|'up'|'down'} Dir
 *
 * @typedef {Object} MonitorGeom
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {boolean} [primary]
 *
 * @typedef {Object} Node
 * @property {string} id
 * @property {NodeKind} kind
 * @property {Layout} [layout]
 * @property {string} [label]
 * @property {string} [wmClass]
 * @property {number} [percent]
 * @property {string|null} parentId
 * @property {string[]} childIds
 * @property {string} [lastTabFocusId]
 * @property {MonitorGeom} [geom]
 *
 * @typedef {Object} Decisions
 * @property {'B'|'A'} peelModel
 * @property {'noop'|'wrap'|'pop'} edgeMove
 *
 * @typedef {Object} Forest
 * @property {Node[]} monitors
 * @property {Record<string, Node>} nodes
 * @property {string|null} focusId
 * @property {string|null} selectionId
 * @property {string[]} mergeTags
 * @property {Decisions} decisions
 * @property {number} _seq
 */

/** @returns {Decisions} */
export function defaultDecisions() {
  return { peelModel: "B", edgeMove: "noop" };
}

/**
 * @returns {import('./tree.mjs').TreeApi}
 */
export function createTreeApi() {
  let seq = 1;
  const nid = () => `n${seq++}`;

  /** @param {Partial<Node> & { kind: NodeKind }} partial */
  function base(partial) {
    return {
      id: partial.id ?? nid(),
      kind: partial.kind,
      layout: partial.layout,
      label: partial.label,
      wmClass: partial.wmClass,
      percent: partial.percent ?? 1,
      parentId: partial.parentId ?? null,
      childIds: partial.childIds ? [...partial.childIds] : [],
      lastTabFocusId: partial.lastTabFocusId,
      geom: partial.geom ? { ...partial.geom } : undefined,
    };
  }

  /** @type {import('./tree.mjs').TreeApi} */
  const api = {
    createForest(geoms) {
      /** @type {Forest} */
      const forest = {
        monitors: [],
        nodes: {},
        focusId: null,
        selectionId: null,
        mergeTags: [],
        decisions: defaultDecisions(),
        _seq: seq,
      };
      for (const g of geoms) {
        const mon = base({
          kind: "MONITOR",
          id: g.id || nid(),
          label: g.id || "mon",
          geom: { ...g, id: g.id || undefined },
          layout: "HSPLIT",
        });
        // @ts-ignore geom id
        if (mon.geom) mon.geom.id = mon.id;
        forest.nodes[mon.id] = mon;
        forest.monitors.push(mon);
      }
      return forest;
    },

    makeWindow(label, wmClass = "app") {
      return base({ kind: "WINDOW", label, wmClass });
    },

    makeCon(layout, children = []) {
      const con = base({ kind: "CON", layout, childIds: [] });
      /** @type {Node[]} */
      const pending = [];
      for (const ch of children) {
        ch.parentId = con.id;
        con.childIds.push(ch.id);
        pending.push(ch);
      }
      con._pendingChildren = pending;
      return con;
    },

    /**
     * @param {Forest} forest
     * @param {Node} parent
     * @param {Node[]} children — already constructed; will be registered
     */
    setChildren(forest, parent, children) {
      const reg = (n) => {
        forest.nodes[n.id] = n;
        const pending = n._pendingChildren;
        if (pending) {
          for (const ch of pending) reg(ch);
          delete n._pendingChildren;
        }
      };
      for (const ch of children) {
        reg(ch);
        ch.parentId = parent.id;
      }
      parent.childIds = children.map((c) => c.id);
      forest.nodes[parent.id] = parent;
      equalizePercents(forest, parent);
      return parent;
    },

    /** @param {Forest} forest @param {Node} node */
    _registerTree(forest, node) {
      forest.nodes[node.id] = node;
      const pending = node._pendingChildren;
      if (pending) {
        for (const ch of pending) this._registerTree(forest, ch);
        delete node._pendingChildren;
      }
    },

    /** @param {Forest} f @param {string} id */
    get(f, id) {
      return f.nodes[id] ?? null;
    },

    /** @param {Forest} f @param {Node} n */
    parent(f, n) {
      return n.parentId ? f.nodes[n.parentId] ?? null : null;
    },

    /** @param {Forest} f @param {Node} n */
    children(f, n) {
      return n.childIds.map((id) => f.nodes[id]).filter(Boolean);
    },

    /** @param {Forest} f */
    focusNode(f) {
      return f.focusId ? f.nodes[f.focusId] ?? null : null;
    },

    /** @param {Forest} f */
    selectionNode(f) {
      return f.selectionId ? f.nodes[f.selectionId] ?? null : this.focusNode(f);
    },

    /** @param {Forest} f @param {string|null} id */
    setFocus(f, id) {
      f.focusId = id;
      if (id) f.selectionId = id;
      const n = id ? f.nodes[id] : null;
      if (n) markOpenLeaf(f, n);
    },

    /** @param {Forest} f @param {string|null} id */
    setSelection(f, id) {
      f.selectionId = id;
    },

    /** @param {Forest} f @param {string} id */
    toggleMergeTag(f, id) {
      const i = f.mergeTags.indexOf(id);
      if (i >= 0) f.mergeTags.splice(i, 1);
      else f.mergeTags.push(id);
    },

    clearMergeTags(f) {
      f.mergeTags = [];
    },

    // —— atomics ——

    /**
     * @param {Forest} f
     * @param {string} label
     * @param {number} monIndex
     * @param {string} [wmClass]
     */
    launch(f, label, monIndex, wmClass = "app") {
      const mon = f.monitors[monIndex];
      if (!mon) return fail("no monitor");
      const win = this.makeWindow(label, wmClass);
      this._registerTree(f, win);

      const kids = this.children(f, mon);
      if (kids.length === 0) {
        win.parentId = mon.id;
        mon.childIds = [win.id];
        this.setFocus(f, win.id);
        return ok("launch", { id: win.id, mon: mon.id });
      }

      const slot = slotForInsert(f, this);
      if (!slot) {
        win.parentId = mon.id;
        mon.childIds.push(win.id);
        equalizePercents(f, mon);
        this.setFocus(f, win.id);
        return ok("launch", { id: win.id, mon: mon.id });
      }

      // Aspect-split the slot (D032-ish): wrap slot+new in H/V under slot's parent
      const parent = this.parent(f, slot);
      if (!parent) return fail("slot has no parent");
      const axis = aspectAxis(slotRectHint(f, slot));
      const wrap = this.makeCon(axis, []);
      this._registerTree(f, wrap);
      replaceChild(f, parent, slot.id, wrap.id);
      slot.parentId = wrap.id;
      win.parentId = wrap.id;
      wrap.childIds = [slot.id, win.id];
      wrap.percent = slot.percent;
      slot.percent = 0.5;
      win.percent = 0.5;
      this.setFocus(f, win.id);
      return ok("launch", { id: win.id, wrap: wrap.id, axis });
    },

    /** @param {Forest} f @param {Dir} dir */
    focusDir(f, dir) {
      const cur = this.selectionNode(f);
      if (!cur) return fail("no selection");
      const target = neighbor(f, this, cur, dir, "focus");
      if (!target) return fail("no neighbor");
      const leaf = preferredLeaf(f, this, target);
      this.setFocus(f, leaf.id);
      return ok("focusDir", { dir, to: leaf.id });
    },

    /** @param {Forest} f @param {Dir} dir */
    moveDir(f, dir) {
      const cur = this.selectionNode(f);
      if (!cur || cur.kind === "MONITOR") return fail("bad selection");
      const parent = this.parent(f, cur);
      if (!parent || parent.kind === "MONITOR") {
        // among monitor children
      }
      const p = this.parent(f, cur);
      if (!p) return fail("no parent");

      const axis = parentAxis(p);
      if (!dirMatchesAxis(dir, axis) && p.layout !== "TABBED" && p.layout !== "STACKED") {
        return fail("dir off-axis");
      }

      const idx = p.childIds.indexOf(cur.id);
      const delta = dirDelta(dir, axis, p.layout);
      const j = idx + delta;
      if (j < 0 || j >= p.childIds.length) {
        if (f.decisions.edgeMove === "noop") return fail("edge noop");
        if (f.decisions.edgeMove === "wrap") {
          const k = (j + p.childIds.length) % p.childIds.length;
          swapIds(p.childIds, idx, k);
          return ok("moveDir", { wrap: true });
        }
        // pop — treat as moveOut then move among grandparent (rough)
        const r = this.moveOut(f);
        if (!r.ok) return r;
        return this.moveDir(f, dir);
      }
      swapIds(p.childIds, idx, j);
      return ok("moveDir", { dir, from: idx, to: j });
    },

    /** @param {Forest} f @param {Dir} dir */
    swapDir(f, dir) {
      const cur = this.selectionNode(f);
      if (!cur) return fail("no selection");
      const other = neighbor(f, this, cur, dir, "swap");
      if (!other) return fail("no neighbor");
      const p = this.parent(f, cur);
      const p2 = this.parent(f, other);
      if (!p || p !== p2) return fail("not siblings");
      const i = p.childIds.indexOf(cur.id);
      const j = p.childIds.indexOf(other.id);
      swapIds(p.childIds, i, j);
      return ok("swapDir", { dir, a: cur.id, b: other.id });
    },

    /** @param {Forest} f */
    focusParent(f) {
      const cur = this.selectionNode(f);
      if (!cur) return fail("no selection");
      const p = this.parent(f, cur);
      if (!p || p.kind === "MONITOR") return fail("no parent");
      f.selectionId = p.id;
      // keep focus leaf if climbing from window
      return ok("focusParent", { id: p.id });
    },

    /** @param {Forest} f */
    focusChild(f) {
      const cur = this.selectionNode(f);
      if (!cur) return fail("no selection");
      const kids = this.children(f, cur);
      if (!kids.length) return fail("no child");
      let next = kids[0];
      if (cur.lastTabFocusId) {
        const t = f.nodes[cur.lastTabFocusId];
        if (t && t.parentId === cur.id) next = t;
      }
      if (next.kind === "WINDOW") this.setFocus(f, next.id);
      else f.selectionId = next.id;
      return ok("focusChild", { id: next.id });
    },

    /** @param {Forest} f */
    moveOut(f) {
      const cur = this.selectionNode(f);
      if (!cur || cur.kind === "MONITOR") return fail("bad selection");
      const parent = this.parent(f, cur);
      if (!parent || parent.kind === "MONITOR") return fail("already at mon");
      const grand = this.parent(f, parent);
      if (!grand) return fail("no grandparent");

      const idx = parent.childIds.indexOf(cur.id);
      parent.childIds.splice(idx, 1);

      if (
        f.decisions.peelModel === "B" &&
        (parent.layout === "TABBED" || parent.layout === "STACKED")
      ) {
        // Model B: replace parent's slot with wrap(parent', cur)
        const axis = aspectAxis({ w: 1, h: 1 }); // refined below via dir-less aspect
        const wrap = this.makeCon(pickPeelAxis(parent, cur), []);
        this._registerTree(f, wrap);
        replaceChild(f, grand, parent.id, wrap.id);
        wrap.percent = parent.percent;
        parent.parentId = wrap.id;
        cur.parentId = wrap.id;
        wrap.childIds = [parent.id, cur.id];
        parent.percent = 0.5;
        cur.percent = 0.5;
        if (parent.childIds.length === 0) {
          // empty bag stays (spacer)
        }
        f.selectionId = cur.id;
        if (cur.kind === "WINDOW") f.focusId = cur.id;
        return ok("moveOut", { model: "B", wrap: wrap.id });
      }

      // Model A / plain reparent: insert cur as sibling of parent under grand
      const pidx = grand.childIds.indexOf(parent.id);
      cur.parentId = grand.id;
      grand.childIds.splice(pidx + 1, 0, cur.id);
      equalizePercents(f, grand);
      f.selectionId = cur.id;
      if (cur.kind === "WINDOW") f.focusId = cur.id;
      return ok("moveOut", { model: "A" });
    },

    /** @param {Forest} f */
    moveIn(f) {
      const cur = this.selectionNode(f);
      if (!cur) return fail("no selection");
      const parent = this.parent(f, cur);
      if (!parent) return fail("no parent");
      const idx = parent.childIds.indexOf(cur.id);
      // Prefer next sibling CON, else prev
      /** @type {Node|null} */
      let target = null;
      for (const j of [idx + 1, idx - 1]) {
        if (j < 0 || j >= parent.childIds.length) continue;
        const sib = f.nodes[parent.childIds[j]];
        if (sib && sib.kind === "CON") {
          target = sib;
          break;
        }
      }
      if (!target) return fail("no sibling CON");
      parent.childIds.splice(idx, 1);
      cur.parentId = target.id;
      target.childIds.push(cur.id);
      equalizePercents(f, target);
      equalizePercents(f, parent);
      f.selectionId = cur.id;
      return ok("moveIn", { into: target.id });
    },

    /**
     * @param {Forest} f
     * @param {Layout} mode
     * @param {boolean} [withTagged]
     */
    wrap(f, mode, withTagged = false) {
      const cur = this.selectionNode(f);
      if (!cur || cur.kind === "MONITOR") return fail("bad selection");
      const parent = this.parent(f, cur);
      if (!parent) return fail("no parent");

      /** @type {Node[]} */
      const members = [cur];
      if (withTagged) {
        for (const tid of f.mergeTags) {
          const t = f.nodes[tid];
          if (t && t.id !== cur.id && t.parentId === parent.id) members.push(t);
        }
      }

      const wrap = this.makeCon(mode, []);
      this._registerTree(f, wrap);
      const firstIdx = Math.min(...members.map((m) => parent.childIds.indexOf(m.id)));
      for (const m of members) {
        const i = parent.childIds.indexOf(m.id);
        if (i >= 0) parent.childIds.splice(i, 1);
        m.parentId = wrap.id;
        wrap.childIds.push(m.id);
      }
      wrap.parentId = parent.id;
      parent.childIds.splice(Math.min(firstIdx, parent.childIds.length), 0, wrap.id);
      equalizePercents(f, wrap);
      equalizePercents(f, parent);
      f.selectionId = wrap.id;
      this.clearMergeTags(f);
      return ok("wrap", { id: wrap.id, mode, n: members.length });
    },

    /** @param {Forest} f */
    group(f) {
      const cur = this.selectionNode(f);
      if (!cur) return fail("no selection");
      const parent = this.parent(f, cur);
      if (!parent) return fail("no parent");
      /** @type {Node[]} */
      const members = [cur];
      for (const tid of f.mergeTags) {
        const t = f.nodes[tid];
        if (t && t.id !== cur.id && this.parent(f, t) === parent) members.push(t);
      }
      if (members.length === 1) {
        // also try next sibling
        const idx = parent.childIds.indexOf(cur.id);
        const sib = f.nodes[parent.childIds[idx + 1]];
        if (sib) members.push(sib);
      }
      if (members.length < 1) return fail("nothing to group");
      // Allow single → empty-ish tab group of one (weird OK)
      const wrap = this.makeCon("TABBED", []);
      this._registerTree(f, wrap);
      const firstIdx = Math.min(...members.map((m) => parent.childIds.indexOf(m.id)));
      for (const m of members) {
        const i = parent.childIds.indexOf(m.id);
        if (i >= 0) parent.childIds.splice(i, 1);
        m.parentId = wrap.id;
        wrap.childIds.push(m.id);
      }
      if (members[0]) wrap.lastTabFocusId = members[0].id;
      wrap.parentId = parent.id;
      parent.childIds.splice(Math.min(firstIdx, parent.childIds.length), 0, wrap.id);
      equalizePercents(f, parent);
      f.selectionId = wrap.id;
      this.clearMergeTags(f);
      return ok("group", { id: wrap.id, n: members.length });
    },

    /** @param {Forest} f */
    ungroup(f) {
      const cur = this.selectionNode(f);
      if (!cur) return fail("no selection");
      let bag = cur.kind === "CON" ? cur : this.parent(f, cur);
      if (!bag || bag.kind !== "CON") return fail("no CON");
      const grand = this.parent(f, bag);
      if (!grand) return fail("no parent");
      const idx = grand.childIds.indexOf(bag.id);
      const kids = this.children(f, bag);
      grand.childIds.splice(idx, 1, ...kids.map((k) => k.id));
      for (const k of kids) k.parentId = grand.id;
      delete f.nodes[bag.id];
      equalizePercents(f, grand);
      if (kids[0]) {
        f.selectionId = kids[0].id;
        if (kids[0].kind === "WINDOW") f.focusId = kids[0].id;
      }
      return ok("ungroup", { dissolved: bag.id, n: kids.length });
    },

    /** @param {Forest} f @param {Layout} mode */
    setLayout(f, mode) {
      const cur = this.selectionNode(f);
      if (!cur) return fail("no selection");
      const con = cur.kind === "CON" ? cur : this.parent(f, cur);
      if (!con || con.kind !== "CON") return fail("no CON");
      con.layout = mode;
      return ok("setLayout", { id: con.id, mode });
    },

    /**
     * Empty group spacer.
     * @param {Forest} f
     * @param {Layout} [mode]
     * @param {number} [monIndex]
     */
    createGroup(f, mode = "TABBED", monIndex) {
      const empty = this.makeCon(mode, []);
      this._registerTree(f, empty);
      const sel = this.selectionNode(f);
      let parent = sel ? this.parent(f, sel) : null;
      if (monIndex != null && f.monitors[monIndex]) {
        parent = f.monitors[monIndex];
      } else if (!parent) {
        parent = f.monitors[0];
      }
      if (!parent) return fail("no parent");
      // If selection is CON, append into it; else sibling after selection under parent
      if (sel && sel.kind === "CON" && monIndex == null) {
        empty.parentId = sel.id;
        sel.childIds.push(empty.id);
        equalizePercents(f, sel);
      } else {
        empty.parentId = parent.id;
        if (sel && sel.parentId === parent.id) {
          const i = parent.childIds.indexOf(sel.id);
          parent.childIds.splice(i + 1, 0, empty.id);
        } else {
          parent.childIds.push(empty.id);
        }
        equalizePercents(f, parent);
      }
      f.selectionId = empty.id;
      return ok("createGroup", { id: empty.id, mode });
    },

    /**
     * Collapse every 1-child CON under start (selection or all monitors).
     * @param {Forest} f
     * @param {boolean} [wholeForest]
     */
    flatten(f, wholeForest = false) {
      const starts = wholeForest ? f.monitors : [this.selectionNode(f)].filter(Boolean);
      if (!starts.length) return fail("nothing");
      let collapsed = 0;
      let guard = 0;
      while (guard++ < 100) {
        /** @type {Node[]} */
        const ones = [];
        for (const root of starts) {
          if (!root) continue;
          walk(f, root, (n) => {
            if (n.kind === "CON" && n.childIds.length === 1) ones.push(n);
          });
        }
        if (!ones.length) break;
        for (const con of ones) {
          const child = f.nodes[con.childIds[0]];
          const parent = this.parent(f, con);
          if (!child || !parent) continue;
          const idx = parent.childIds.indexOf(con.id);
          if (idx < 0) continue;
          child.parentId = parent.id;
          child.percent = con.percent;
          parent.childIds[idx] = child.id;
          delete f.nodes[con.id];
          if (f.selectionId === con.id) f.selectionId = child.id;
          collapsed++;
        }
      }
      return ok("flatten", { collapsed });
    },

    /** @param {Forest} f */
    close(f) {
      const cur = this.focusNode(f) || this.selectionNode(f);
      if (!cur || cur.kind !== "WINDOW") return fail("focus a window");
      const parent = this.parent(f, cur);
      if (!parent) return fail("no parent");
      const idx = parent.childIds.indexOf(cur.id);
      parent.childIds.splice(idx, 1);
      delete f.nodes[cur.id];
      // pick new focus
      const sib = parent.childIds[Math.min(idx, parent.childIds.length - 1)];
      if (sib) {
        const leaf = preferredLeaf(f, this, f.nodes[sib]);
        this.setFocus(f, leaf.id);
      } else {
        f.focusId = null;
        f.selectionId = parent.kind === "MONITOR" ? null : parent.id;
      }
      return ok("close", { id: cur.id });
    },

    /** Sync seq counter after hydrate */
    hydrateSeq(f) {
      let max = 0;
      for (const id of Object.keys(f.nodes)) {
        const m = /^n(\d+)$/.exec(id);
        if (m) max = Math.max(max, Number(m[1]));
      }
      seq = Math.max(seq, max + 1);
      f._seq = seq;
    },
  };

  return api;
}

/**
 * @typedef {ReturnType<typeof createTreeApi>} TreeApi
 */

// —— helpers ——

/** @param {string} op @param {object} [detail] */
function ok(op, detail = {}) {
  return { ok: true, op, ...detail };
}
/** @param {string} reason */
function fail(reason) {
  return { ok: false, reason };
}

/** @param {string[]} arr @param {number} i @param {number} j */
function swapIds(arr, i, j) {
  const t = arr[i];
  arr[i] = arr[j];
  arr[j] = t;
}

/** @param {Forest} f @param {Node} parent @param {string} oldId @param {string} newId */
function replaceChild(f, parent, oldId, newId) {
  const i = parent.childIds.indexOf(oldId);
  if (i >= 0) parent.childIds[i] = newId;
  const n = f.nodes[newId];
  if (n) n.parentId = parent.id;
}

/** @param {Forest} f @param {Node} parent */
function equalizePercents(f, parent) {
  const n = parent.childIds.length || 1;
  for (const cid of parent.childIds) {
    const ch = f.nodes[cid];
    if (ch) ch.percent = 1 / n;
  }
}

/** @param {Forest} f @param {Node} n */
function markOpenLeaf(f, n) {
  let cur = n;
  while (cur && cur.parentId) {
    const p = f.nodes[cur.parentId];
    if (!p) break;
    if (p.layout === "TABBED" || p.layout === "STACKED") p.lastTabFocusId = cur.id;
    cur = p;
  }
}

/** @param {{w:number,h:number}} rect */
function aspectAxis(rect) {
  return rect.h >= rect.w ? "VSPLIT" : "HSPLIT";
}

/** @param {Forest} f @param {Node} slot */
function slotRectHint(f, slot) {
  // Approximate from ancestor mon geom + depth — coarse is fine for proto
  let mon = slot;
  while (mon && mon.kind !== "MONITOR") mon = f.nodes[mon.parentId ?? ""] ?? null;
  if (mon?.geom) {
    const deep = depthFromMon(f, slot);
    const factor = Math.pow(0.5, Math.max(0, deep - 1));
    return { w: mon.geom.width * factor, h: mon.geom.height * factor };
  }
  return { w: 2, h: 1 };
}

/** @param {Forest} f @param {Node} n */
function depthFromMon(f, n) {
  let d = 0;
  let cur = n;
  while (cur && cur.kind !== "MONITOR") {
    d++;
    cur = f.nodes[cur.parentId ?? ""] ?? null;
  }
  return d;
}

/** @param {Node} parent @param {Node} _cur */
function pickPeelAxis(parent, _cur) {
  // Tall tab bags → VSPLIT bands (Model B lean)
  if (parent.layout === "TABBED" || parent.layout === "STACKED") return "VSPLIT";
  return parent.layout === "HSPLIT" ? "VSPLIT" : "HSPLIT";
}

/** @param {Node} p */
function parentAxis(p) {
  if (p.layout === "VSPLIT" || p.layout === "STACKED") return "v";
  return "h"; // HSPLIT, TABBED, MONITOR
}

/** @param {Dir} dir @param {string} axis @param {Layout|undefined} layout */
function dirMatchesAxis(dir, axis, layout) {
  if (layout === "TABBED" || layout === "STACKED") return true; // strip order M4
  if (axis === "h") return dir === "left" || dir === "right";
  return dir === "up" || dir === "down";
}

/** @param {Dir} dir @param {string} axis @param {Layout|undefined} layout */
function dirDelta(dir, axis, layout) {
  if (layout === "TABBED" || layout === "STACKED") {
    if (dir === "left" || dir === "up") return -1;
    return 1;
  }
  if (dir === "left" || dir === "up") return -1;
  return 1;
}

/**
 * @param {Forest} f
 * @param {TreeApi} api
 * @param {Node} cur
 * @param {Dir} dir
 * @param {'focus'|'swap'|'move'} mode
 */
function neighbor(f, api, cur, dir, mode) {
  // Walk up until parent axis matches (or bag), then sibling.
  // focus: climb past edge (cross into uncle). move/swap: stay local (caller handles edge).
  let node = cur;
  while (node) {
    const p = api.parent(f, node);
    if (!p) return null;
    const axis = parentAxis(p);
    const bag = p.layout === "TABBED" || p.layout === "STACKED";
    if (bag || dirMatchesAxis(dir, axis, p.layout)) {
      const idx = p.childIds.indexOf(node.id);
      const j = idx + dirDelta(dir, axis, p.layout);
      if (j >= 0 && j < p.childIds.length) return f.nodes[p.childIds[j]] ?? null;
      if (mode !== "focus") return null;
      // focus climbs: treat bag/unit as the node under grandparent
      node = p;
      continue;
    }
    node = p;
  }
  return null;
}

/**
 * @param {Forest} f
 * @param {TreeApi} api
 * @param {Node} n
 */
function preferredLeaf(f, api, n) {
  if (n.kind === "WINDOW") return n;
  if (n.kind === "CON" && (n.layout === "TABBED" || n.layout === "STACKED")) {
    if (n.lastTabFocusId && f.nodes[n.lastTabFocusId])
      return preferredLeaf(f, api, f.nodes[n.lastTabFocusId]);
  }
  const kids = api.children(f, n);
  if (!kids.length) return n;
  return preferredLeaf(f, api, kids[0]);
}

/**
 * @param {Forest} f
 * @param {Node} root
 * @param {(n: Node) => void} fn
 */
function walk(f, root, fn) {
  fn(root);
  for (const cid of root.childIds) {
    const ch = f.nodes[cid];
    if (ch) walk(f, ch, fn);
  }
}

/** @param {Forest} f @param {TreeApi} api */
function slotForInsert(f, api) {
  const sel = api.selectionNode(f);
  if (sel && sel.kind !== "MONITOR") return sel;
  const focus = api.focusNode(f);
  if (focus) return focus;
  return null;
}

export function nextAppLabel(forest) {
  const used = new Set();
  for (const n of Object.values(forest.nodes)) {
    if (n.kind === "WINDOW" && n.label) used.add(n.label);
  }
  for (let i = 0; i < 26; i++) {
    const L = String.fromCharCode(65 + i);
    if (!used.has(L)) return L;
  }
  return `W${Object.keys(forest.nodes).length}`;
}

/**
 * Serialize forest for dump / storage.
 * @param {Forest} f
 */
export function dumpForest(f) {
  return JSON.parse(JSON.stringify(f));
}
