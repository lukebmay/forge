// @ts-check
/**
 * Monitors as sibling containers: axis + order from OS display geometry.
 */

/** @typedef {import('./tom/kernel.mjs').Forest} Forest */
/** @typedef {import('./tom/kernel.mjs').Node} Node */
/** @typedef {import('./tom/kernel.mjs').Dir} Dir */
/** @typedef {import('./tree.mjs').TreeApi} TreeApi */
/** @typedef {import('./tom/kernel.mjs').Layout} Layout */

/**
 * Implicit sibling layout of the monitor row/column from geometry.
 * Side-by-side (larger horizontal spread of centers) → HSPLIT;
 * stacked (larger vertical spread) → VSPLIT; tie → aspectTieBreak / HSPLIT.
 * @param {Forest} f
 * @returns {'HSPLIT'|'VSPLIT'}
 */
export function monitorsSiblingAxis(f) {
  const mons = f.monitors.filter((m) => m.geom);
  if (mons.length < 2) {
    return f.decisions?.aspectTieBreak === "VSPLIT" ? "VSPLIT" : "HSPLIT";
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const m of mons) {
    const g = m.geom;
    const cx = g.x + g.width / 2;
    const cy = g.y + g.height / 2;
    minX = Math.min(minX, cx);
    maxX = Math.max(maxX, cx);
    minY = Math.min(minY, cy);
    maxY = Math.max(maxY, cy);
  }
  const dx = maxX - minX;
  const dy = maxY - minY;
  if (dx > dy) return "HSPLIT";
  if (dy > dx) return "VSPLIT";
  return f.decisions?.aspectTieBreak === "VSPLIT" ? "VSPLIT" : "HSPLIT";
}

/**
 * Monitors sorted along the sibling axis (then the other axis as tiebreak).
 * @param {Forest} f
 * @returns {Node[]}
 */
export function orderedMonitors(f) {
  const axis = monitorsSiblingAxis(f);
  const mons = [...f.monitors];
  mons.sort((a, b) => {
    const ga = a.geom || { x: 0, y: 0, width: 0, height: 0 };
    const gb = b.geom || { x: 0, y: 0, width: 0, height: 0 };
    const cax = ga.x + ga.width / 2;
    const cay = ga.y + ga.height / 2;
    const cbx = gb.x + gb.width / 2;
    const cby = gb.y + gb.height / 2;
    if (axis === "HSPLIT") return cax - cbx || cay - cby;
    return cay - cby || cax - cbx;
  });
  return mons;
}

/**
 * Neighbor monitor in `dir` when that dir is in-axis for the sibling layout
 * (or always try geometric neighbor for that dir).
 * @param {Forest} f
 * @param {Node} mon
 * @param {Dir} dir
 * @returns {Node|null}
 */
export function neighborMonitor(f, mon, dir) {
  const axis = monitorsSiblingAxis(f);
  const inAxis =
    (axis === "HSPLIT" && (dir === "left" || dir === "right")) ||
    (axis === "VSPLIT" && (dir === "up" || dir === "down"));
  if (!inAxis) {
    // Still allow geometric neighbor for off-axis (e.g. vertical neighbor in an H row)
    return geometricNeighborMonitor(f, mon, dir);
  }
  const ordered = orderedMonitors(f);
  const i = ordered.findIndex((m) => m.id === mon.id);
  if (i < 0) return null;
  const delta = dir === "left" || dir === "up" ? -1 : 1;
  return ordered[i + delta] ?? null;
}

/**
 * @param {Forest} f
 * @param {Node} mon
 * @param {Dir} dir
 * @returns {Node|null}
 */
function geometricNeighborMonitor(f, mon, dir) {
  const g = mon.geom;
  if (!g) return null;
  const cx = g.x + g.width / 2;
  const cy = g.y + g.height / 2;
  /** @type {Node|null} */
  let best = null;
  let bestDist = Infinity;
  for (const o of f.monitors) {
    if (o.id === mon.id || !o.geom) continue;
    const og = o.geom;
    const ocx = og.x + og.width / 2;
    const ocy = og.y + og.height / 2;
    let ok = false;
    let dist = Infinity;
    if (dir === "left" && ocx < cx) {
      ok = rangesOverlap(g.y, g.y + g.height, og.y, og.y + og.height);
      dist = cx - ocx;
    } else if (dir === "right" && ocx > cx) {
      ok = rangesOverlap(g.y, g.y + g.height, og.y, og.y + og.height);
      dist = ocx - cx;
    } else if (dir === "up" && ocy < cy) {
      ok = rangesOverlap(g.x, g.x + g.width, og.x, og.x + og.width);
      dist = cy - ocy;
    } else if (dir === "down" && ocy > cy) {
      ok = rangesOverlap(g.x, g.x + g.width, og.x, og.x + og.width);
      dist = ocy - cy;
    }
    if (ok && dist < bestDist) {
      bestDist = dist;
      best = o;
    }
  }
  return best;
}

/** @param {number} a0 @param {number} a1 @param {number} b0 @param {number} b1 */
function rangesOverlap(a0, a1, b0, b1) {
  return a0 < b1 && b0 < a1;
}

/**
 * Whether `dir` is in-axis for this parent's layout (MONITOR chrome = H row).
 * @param {Node} parent
 * @param {Dir} dir
 */
export function dirInParentAxis(parent, dir) {
  if (parent.layout === "TABBED" || parent.layout === "STACKED") {
    return dir === "left" || dir === "right";
  }
  if (parent.layout === "VSPLIT") {
    return dir === "up" || dir === "down";
  }
  // HSPLIT, MONITOR, unknown → horizontal
  return dir === "left" || dir === "right";
}

/**
 * True when `node` is at the extreme of its monitor tree in `dir`
 * (every ancestor step is first/last child **in-axis** that way).
 * Cross-axis steps do not count as reaching the monitor edge.
 * @param {Forest} f
 * @param {TreeApi} api
 * @param {Node} node
 * @param {Dir} dir
 */
export function isAtMonitorEdge(f, api, node, dir) {
  let cur = node;
  const delta = dir === "left" || dir === "up" ? -1 : 1;
  while (cur && cur.kind !== "MONITOR") {
    const p = api.parent(f, cur);
    if (!p) return false;
    if (!dirInParentAxis(p, dir)) return false;
    const idx = p.childIds.indexOf(cur.id);
    if (idx < 0) return false;
    if (delta < 0 && idx !== 0) return false;
    if (delta > 0 && idx !== p.childIds.length - 1) return false;
    cur = p;
  }
  return cur?.kind === "MONITOR";
}

/**
 * Detach leaf and place on destination monitor at the near edge for `dir`
 * (arriving from the left → leftmost / start; from the right → end).
 * Respects monitor max-1 child (wrap or enter existing CON).
 * @param {Forest} f
 * @param {TreeApi} api
 * @param {Node} leaf
 * @param {Node} destMon
 * @param {Dir} dir
 * @param {{ join?: boolean }} [opts] — join: enter CON / wrap with window like join-into-sibling-container
 */
export function transferLeafToMonitor(f, api, leaf, destMon, dir, opts = {}) {
  const join = !!opts.join;
  const oldParent = api.parent(f, leaf);
  const oldMon = ancestorMonitor(f, api, leaf);
  if (!oldParent || destMon.kind !== "MONITOR") {
    return { ok: false, reason: "bad transfer" };
  }
  if (oldMon?.id === destMon.id) {
    return { ok: false, reason: "same monitor" };
  }

  const gone = api.removeChild(f, oldParent, leaf);
  if (!gone.ok) return gone;

  // Arrive from left/up → near = start; from right/down → near = end
  const atStart = dir === "right" || dir === "down";

  const kids = api.children(f, destMon);
  if (kids.length === 0) {
    api.appendChild(f, destMon, leaf);
  } else if (kids.length === 1 && kids[0].kind === "CON") {
    const con = kids[0];
    if (atStart) {
      const first = api.children(f, con)[0] ?? null;
      api.insertBefore(f, con, leaf, first);
    } else {
      api.appendChild(f, con, leaf);
    }
  } else if (kids.length === 1 && kids[0].kind === "WINDOW") {
    const other = kids[0];
    let layout = /** @type {Layout} */ (monitorsSiblingAxis(f) === "HSPLIT" ? "VSPLIT" : "HSPLIT");
    const wrap = api.makeCon(layout, []);
    api._registerTree(f, wrap);
    api.replaceChild(f, destMon, other, wrap);
    if (atStart) {
      api.appendChild(f, wrap, leaf);
      api.appendChild(f, wrap, other);
    } else {
      api.appendChild(f, wrap, other);
      api.appendChild(f, wrap, leaf);
    }
    wrap.percent = 1;
  } else if (atStart) {
    api.insertBefore(f, destMon, leaf, kids[0]);
  } else {
    api.appendChild(f, destMon, leaf);
  }

  void join; // join vs move currently same placement into mon; enter-CON path above covers join-into-container
  return {
    ok: true,
    op: join ? "transferJoinMonitor" : "transferMoveMonitor",
    from: oldMon?.id,
    to: destMon.id,
  };
}

/**
 * First leaf on the near edge of a monitor for focus arrival.
 * @param {Forest} f
 * @param {TreeApi} api
 * @param {Node} mon
 * @param {Dir} dir — direction we were moving (arrival side)
 */
export function nearLeafOnMonitor(f, api, mon, dir) {
  const atStart = dir === "right" || dir === "down";
  let cur = mon;
  let guard = 0;
  while (guard++ < 64) {
    const kids = api.children(f, cur);
    if (!kids.length) return cur.kind === "WINDOW" ? cur : null;
    cur = atStart ? kids[0] : kids[kids.length - 1];
    if (cur.kind === "WINDOW") return cur;
  }
  return null;
}

/** @param {Forest} f @param {TreeApi} api @param {Node} n */
function ancestorMonitor(f, api, n) {
  let cur = n;
  while (cur && cur.kind !== "MONITOR") {
    cur = api.parent(f, cur);
  }
  return cur?.kind === "MONITOR" ? cur : null;
}
