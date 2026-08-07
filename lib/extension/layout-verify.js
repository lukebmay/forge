/*
 * This file is part of the Forge extension for GNOME
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * Pure Meta↔slot verify helpers (CL1). No GObject imports so unit tests stay light.
 */

/** Frame↔slot tolerance (px) on each of x/y/width/height. */
export const LAYOUT_VERIFY_EPSILON_PX = 4;

/**
 * Historical: consecutive ok verifies before SETTLED under the old pixel-war
 * contract. Apply-contract AC1 settles on first ok; controller keeps the export
 * for diagnostics / tests.
 */
export const LAYOUT_VERIFY_AGREEMENT_NEEDED = 1;

/**
 * @param {unknown} n
 * @returns {boolean}
 */
function isFiniteNumber(n) {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * Normalize a rect-like object; null if missing or non-finite fields.
 * @param {{ x?: number, y?: number, width?: number, height?: number }|null|undefined} r
 * @returns {{ x: number, y: number, width: number, height: number }|null}
 */
export function normalizeRect(r) {
  if (!r || typeof r !== "object") return null;
  const x = r.x;
  const y = r.y;
  const width = r.width;
  const height = r.height;
  if (
    !isFiniteNumber(x) ||
    !isFiniteNumber(y) ||
    !isFiniteNumber(width) ||
    !isFiniteNumber(height)
  ) {
    return null;
  }
  return { x, y, width, height };
}

/**
 * Whether frame and slot agree within ε on all four edges.
 * Null/invalid rects never agree.
 *
 * @param {{ x?: number, y?: number, width?: number, height?: number }|null|undefined} frame
 * @param {{ x?: number, y?: number, width?: number, height?: number }|null|undefined} slot
 * @param {number} [epsilon=LAYOUT_VERIFY_EPSILON_PX]
 * @returns {boolean}
 */
export function rectsAgree(frame, slot, epsilon = LAYOUT_VERIFY_EPSILON_PX) {
  const f = normalizeRect(frame);
  const s = normalizeRect(slot);
  if (!f || !s) return false;
  const e =
    typeof epsilon === "number" && Number.isFinite(epsilon)
      ? Math.abs(epsilon)
      : LAYOUT_VERIFY_EPSILON_PX;
  return (
    Math.abs(f.x - s.x) <= e &&
    Math.abs(f.y - s.y) <= e &&
    Math.abs(f.width - s.width) <= e &&
    Math.abs(f.height - s.height) <= e
  );
}

/**
 * Single-window agreement: rect within ε and monitors match when both known.
 *
 * @param {object} input
 * @param {{ x?: number, y?: number, width?: number, height?: number }|null|undefined} input.frame
 * @param {{ x?: number, y?: number, width?: number, height?: number }|null|undefined} input.slot
 * @param {number|null|undefined} input.metaMon Meta get_monitor()
 * @param {number|null|undefined} input.treeMon Tree MONITOR home index
 * @param {number} [epsilon=LAYOUT_VERIFY_EPSILON_PX]
 * @returns {{ ok: boolean, reasons: string[] }}
 */
export function windowAgrees(input, epsilon = LAYOUT_VERIFY_EPSILON_PX) {
  const reasons = [];
  const frame = input?.frame;
  const slot = input?.slot;
  if (!normalizeRect(frame)) reasons.push("bad-frame");
  if (!normalizeRect(slot)) reasons.push("bad-slot");
  if (reasons.length === 0 && !rectsAgree(frame, slot, epsilon)) {
    reasons.push("rect-mismatch");
  }

  const metaMon = input?.metaMon;
  const treeMon = input?.treeMon;
  const metaKnown = typeof metaMon === "number" && metaMon >= 0;
  const treeKnown = typeof treeMon === "number" && treeMon >= 0;
  if (metaKnown && treeKnown && metaMon !== treeMon) {
    reasons.push("mon-mismatch");
  } else if (metaKnown && !treeKnown) {
    reasons.push("tree-mon-unknown");
  } else if (!metaKnown && treeKnown) {
    reasons.push("meta-mon-unknown");
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * Forest-level scan over pre-built window inputs (no Meta).
 *
 * @param {Array<{
 *   id?: string|number|null,
 *   frame?: object|null,
 *   slot?: object|null,
 *   metaMon?: number|null,
 *   treeMon?: number|null,
 * }>} windows
 * @param {number} [epsilon=LAYOUT_VERIFY_EPSILON_PX]
 * @returns {{
 *   ok: boolean,
 *   checked: number,
 *   mismatches: Array<{ id: string|number|null, reasons: string[] }>,
 *   results: Array<{ id: string|number|null, ok: boolean, reasons: string[] }>,
 * }}
 */
export function scanForest(windows, epsilon = LAYOUT_VERIFY_EPSILON_PX) {
  const list = Array.isArray(windows) ? windows : [];
  const results = [];
  const mismatches = [];

  for (const w of list) {
    const id = w?.id ?? null;
    const { ok, reasons } = windowAgrees(
      {
        frame: w?.frame,
        slot: w?.slot,
        metaMon: w?.metaMon,
        treeMon: w?.treeMon,
      },
      epsilon
    );
    results.push({ id, ok, reasons });
    if (!ok) mismatches.push({ id, reasons: reasons.slice() });
  }

  return {
    ok: mismatches.length === 0,
    checked: results.length,
    mismatches,
    results,
  };
}

/**
 * Parse mo{N}ws{M} id → monitor index, or -1.
 * @param {unknown} monitorValue
 * @returns {number}
 */
export function monitorIndexFromValue(monitorValue) {
  if (typeof monitorValue !== "string" || !monitorValue) return -1;
  const wsIndex = monitorValue.indexOf("ws");
  if (wsIndex <= 0) return -1;
  const indexVal = monitorValue.slice(0, wsIndex).replace("mo", "");
  const n = parseInt(indexVal, 10);
  return Number.isFinite(n) ? n : -1;
}

/**
 * Nearest MONITOR ancestor index for a WINDOW-like node.
 * @param {{ parentNode?: any, _parent?: any }|null|undefined} node
 * @returns {number}
 */
export function treeMonitorIndexOfNode(node) {
  let p = node?.parentNode ?? node?._parent ?? null;
  while (p) {
    const type = p.nodeType ?? p._type ?? null;
    const isMon = type === "MONITOR" || (typeof p.isMonitor === "function" && p.isMonitor());
    if (isMon) {
      const v = p.nodeValue ?? p._data;
      return monitorIndexFromValue(v);
    }
    p = p.parentNode ?? p._parent ?? null;
  }
  return -1;
}

/**
 * Prefer renderRect (post processGap) else rect.
 * @param {{ renderRect?: object|null, rect?: object|null }|null|undefined} node
 * @returns {{ x: number, y: number, width: number, height: number }|null}
 */
export function slotRectOfNode(node) {
  if (!node) return null;
  return normalizeRect(node.renderRect) ?? normalizeRect(node.rect);
}

/**
 * Safe Meta frame rect read.
 * @param {any} metaWindow
 * @returns {{ x: number, y: number, width: number, height: number }|null}
 */
export function readFrameRect(metaWindow) {
  if (!metaWindow || typeof metaWindow.get_frame_rect !== "function") return null;
  try {
    return normalizeRect(metaWindow.get_frame_rect());
  } catch (_e) {
    return null;
  }
}

/**
 * Safe Meta get_monitor().
 * @param {any} metaWindow
 * @returns {number}
 */
export function readMetaMonitor(metaWindow) {
  if (!metaWindow || typeof metaWindow.get_monitor !== "function") return -1;
  try {
    const m = metaWindow.get_monitor();
    return typeof m === "number" && m >= 0 ? m : -1;
  } catch (_e) {
    return -1;
  }
}

/**
 * Whether a Meta.Window wrapper still responds (get_id probe).
 * @param {any} metaWindow
 * @returns {boolean}
 */
export function isMetaAlive(metaWindow) {
  if (!metaWindow) return false;
  try {
    if (typeof metaWindow.get_id === "function") {
      metaWindow.get_id();
      return true;
    }
    // Plain test doubles without get_id are treated as alive.
    return true;
  } catch (_e) {
    return false;
  }
}

/**
 * Mode string for a node (TILE / FLOAT / GRAB_TILE / DEFAULT).
 * @param {any} node
 * @returns {string|null}
 */
export function nodeMode(node) {
  if (!node) return null;
  if (typeof node.mode === "string") return node.mode;
  if (typeof node.isTile === "function" && node.isTile()) return "TILE";
  if (typeof node.isFloat === "function" && node.isFloat()) return "FLOAT";
  if (typeof node.isGrabTile === "function" && node.isGrabTile()) return "GRAB_TILE";
  return null;
}

/**
 * Build scan inputs from WINDOW nodes. Skips floats, GRAB_TILE, dead, minimized,
 * fullscreen; TILE only.
 *
 * @param {any[]} nodes
 * @param {object} [opts]
 * @param {(node: any) => number} [opts.treeMonOf] override tree mon lookup
 * @param {number} [opts.epsilon]
 * @returns {Array<{ id: string|number|null, frame: object|null, slot: object|null, metaMon: number, treeMon: number }>}
 */
export function collectTileVerifyInputs(nodes, opts = {}) {
  const list = Array.isArray(nodes) ? nodes : [];
  const treeMonOf = typeof opts.treeMonOf === "function" ? opts.treeMonOf : treeMonitorIndexOfNode;
  /** @type {Array<{ id: string|number|null, frame: object|null, slot: object|null, metaMon: number, treeMon: number }>} */
  const out = [];

  for (const node of list) {
    if (!node) continue;
    const type = node.nodeType ?? node._type ?? null;
    const isWin = type === "WINDOW" || (typeof node.isWindow === "function" && node.isWindow());
    // Typed non-WINDOW nodes are never scanned; untyped plain objects allowed for tests.
    if (type != null && !isWin) continue;

    const mode = nodeMode(node);
    const tile =
      mode === "TILE" || (mode == null && typeof node.isTile === "function" && node.isTile());
    if (!tile) continue;

    const meta = node.nodeValue ?? node._data ?? null;
    if (!isMetaAlive(meta)) continue;

    try {
      if (typeof meta.is_minimized === "function" ? meta.is_minimized() : meta.minimized) {
        continue;
      }
    } catch (_e) {
      continue;
    }

    try {
      if (typeof meta.is_fullscreen === "function" && meta.is_fullscreen()) continue;
    } catch (_e) {
      continue;
    }

    let id = null;
    try {
      if (typeof meta.get_id === "function") id = meta.get_id();
      else if (meta.id != null) id = meta.id;
    } catch (_e) {
      id = null;
    }

    const treeMon = treeMonOf(node);
    out.push({
      id,
      frame: readFrameRect(meta),
      slot: slotRectOfNode(node),
      metaMon: readMetaMonitor(meta),
      treeMon: typeof treeMon === "number" ? treeMon : -1,
    });
  }

  return out;
}

/**
 * Scan managed TILE leaves under a WindowManager-like object.
 *
 * @param {{ allNodeWindows?: any[], tree?: { getNodeByType?: (t: string) => any[] }, _monitorIndexOfNode?: (n: any) => number }|null|undefined} wm
 * @param {number} [epsilon=LAYOUT_VERIFY_EPSILON_PX]
 * @returns {ReturnType<typeof scanForest>}
 */
export function scanWmTiles(wm, epsilon = LAYOUT_VERIFY_EPSILON_PX) {
  if (!wm) {
    return scanForest([], epsilon);
  }
  let nodes = [];
  if (Array.isArray(wm.allNodeWindows)) {
    nodes = wm.allNodeWindows;
  } else if (wm.tree && typeof wm.tree.getNodeByType === "function") {
    try {
      nodes = wm.tree.getNodeByType("WINDOW") ?? [];
    } catch (_e) {
      nodes = [];
    }
  }

  const treeMonOf =
    typeof wm._monitorIndexOfNode === "function"
      ? (n) => {
          try {
            const m = wm._monitorIndexOfNode(n);
            return typeof m === "number" ? m : -1;
          } catch (_e) {
            return treeMonitorIndexOfNode(n);
          }
        }
      : treeMonitorIndexOfNode;

  const inputs = collectTileVerifyInputs(nodes, { treeMonOf });
  return scanForest(inputs, epsilon);
}
