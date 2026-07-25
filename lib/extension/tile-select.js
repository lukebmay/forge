/*
 * This file is part of the Forge extension for GNOME
 *
 * Pure tile selectors for FC1 (parse + match). Live adapters via ctx.
 *
 * Grammar:
 *   focus | lft
 *   title:Exact
 *   title~=substr
 *   title~=/regex/flags?
 *   class:WmClass
 *   class:WmClass@mon          mon = index | moN | moNwsW | stableKey | role
 *   path:SEG/SEG/...           first SEG = mon; rest = child indices (N|cN|wN)
 *   id:WINDOW_ID
 *
 * Options: plain string, or { selector, first } / JSON of same.
 * first: take first match when N>1 (else ambiguous + candidates).
 */

import * as MonitorIdentity from "./monitor-identity.js";
import { windowMetaFields } from "./tree-query.js";

/** Session DBus / Ping apiVersion once Focus/Swap/Move ship. */
export const TILE_SELECT_API_VERSION = 2;

/**
 * @typedef {{
 *   kind: 'focus'|'lft'|'title'|'class'|'path'|'id',
 *   match?: 'exact'|'substr'|'regex',
 *   value?: string,
 *   flags?: string,
 *   mon?: string,
 *   segments?: string[],
 *   first?: boolean,
 * }} SelectorDescriptor
 */

/**
 * @typedef {{
 *   node: any,
 *   nodeType: string|null,
 *   windowId: number|string|null,
 *   title: string|null,
 *   wmClass: string|null,
 *   path: string,
 * }} MatchCandidate
 */

/**
 * Parse a selector string or options object into a descriptor.
 * @param {string|object} input
 * @returns {SelectorDescriptor}
 */
export function parseSelector(input) {
  if (input == null) {
    throw new Error("empty selector");
  }

  let first = false;
  let raw = input;

  if (typeof input === "object" && !Array.isArray(input)) {
    first = !!input.first;
    if (input.kind) {
      return { ...input, first: first || !!input.first };
    }
    raw = input.selector != null ? input.selector : input.s != null ? input.s : null;
    if (raw == null || raw === "") {
      throw new Error("empty selector");
    }
  }

  if (typeof raw !== "string") {
    throw new Error("selector must be a string");
  }

  let s = raw.trim();
  if (!s) throw new Error("empty selector");

  // JSON wrapper: {"selector":"…","first":true}
  if (s.startsWith("{")) {
    let obj;
    try {
      obj = JSON.parse(s);
    } catch (e) {
      throw new Error(`invalid selector JSON: ${e.message || e}`);
    }
    if (!obj || typeof obj !== "object") throw new Error("invalid selector JSON");
    return parseSelector(obj);
  }

  if (s === "focus") return { kind: "focus", first };
  if (s === "lft") return { kind: "lft", first };

  if (s.startsWith("id:")) {
    const value = s.slice(3);
    if (!value) throw new Error("id: requires a value");
    return { kind: "id", value, first };
  }

  if (s.startsWith("path:")) {
    const body = s.slice(5).trim();
    if (!body) throw new Error("path: requires a path");
    const segments = body.split("/").filter((p) => p.length > 0);
    if (segments.length === 0) throw new Error("path: requires a path");
    return { kind: "path", segments, value: body, first };
  }

  if (s.startsWith("class:")) {
    let body = s.slice(6);
    if (!body) throw new Error("class: requires a value");
    let mon = null;
    const at = body.lastIndexOf("@");
    if (at >= 0) {
      mon = body.slice(at + 1);
      body = body.slice(0, at);
      if (!body) throw new Error("class: requires a value before @mon");
      if (!mon) throw new Error("class:@ requires a monitor");
    }
    return { kind: "class", value: body, mon: mon || undefined, first };
  }

  if (s.startsWith("title:")) {
    const value = s.slice(6);
    if (value === "") throw new Error("title: requires a value");
    return { kind: "title", match: "exact", value, first };
  }

  if (s.startsWith("title~=")) {
    const body = s.slice(7);
    if (body === "") throw new Error("title~= requires a value");
    if (body.startsWith("/")) {
      const parsed = parseRegexLiteral(body);
      return {
        kind: "title",
        match: "regex",
        value: parsed.source,
        flags: parsed.flags,
        first,
      };
    }
    return { kind: "title", match: "substr", value: body, first };
  }

  throw new Error(`unknown selector: ${s}`);
}

/**
 * @param {string} body e.g. /foo/i
 * @returns {{ source: string, flags: string }}
 */
export function parseRegexLiteral(body) {
  if (!body.startsWith("/")) throw new Error("regex must start with /");
  let i = 1;
  let source = "";
  let escaped = false;
  for (; i < body.length; i++) {
    const ch = body[i];
    if (escaped) {
      source += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      source += ch;
      escaped = true;
      continue;
    }
    if (ch === "/") break;
    source += ch;
  }
  if (i >= body.length || body[i] !== "/") {
    throw new Error("unterminated regex");
  }
  const flags = body.slice(i + 1);
  if (flags && !/^[gimsuy]*$/.test(flags)) {
    throw new Error(`invalid regex flags: ${flags}`);
  }
  // Validate compile early
  try {
    // eslint-disable-next-line no-new
    new RegExp(source, flags);
  } catch (e) {
    throw new Error(`invalid regex: ${e.message || e}`);
  }
  return { source, flags };
}

/**
 * Normalize roots: Tree root, monitor array, or { monitors }.
 * @param {any} rootOrForest
 * @returns {any[]}
 */
export function listRoots(rootOrForest) {
  if (!rootOrForest) return [];
  if (Array.isArray(rootOrForest)) return rootOrForest.filter(Boolean);
  if (Array.isArray(rootOrForest.monitors)) return rootOrForest.monitors.filter(Boolean);
  if (rootOrForest.childNodes || rootOrForest.nodeType) return [rootOrForest];
  return [];
}

/**
 * @param {any} node
 * @returns {any[]}
 */
function childrenOf(node) {
  if (!node) return [];
  if (Array.isArray(node.childNodes)) return node.childNodes;
  if (Array.isArray(node.children)) return node.children;
  return [];
}

/**
 * @param {any} node
 * @returns {string|null}
 */
function nodeTypeOf(node) {
  if (!node) return null;
  if (node.nodeType != null) return String(node.nodeType);
  if (typeof node.isWindow === "function" && node.isWindow()) return "WINDOW";
  if (typeof node.isMonitor === "function" && node.isMonitor()) return "MONITOR";
  if (typeof node.isCon === "function" && node.isCon()) return "CON";
  return null;
}

/**
 * @param {any} node
 */
function isWindowNode(node) {
  const t = nodeTypeOf(node);
  return t === "WINDOW";
}

/**
 * @param {any} node
 */
function isMonitorNode(node) {
  const t = nodeTypeOf(node);
  return t === "MONITOR";
}

/**
 * Window meta from live node or projected plain object.
 * @param {any} node
 */
export function candidateMeta(node) {
  if (!node) {
    return { windowId: null, title: null, wmClass: null, nodeType: null };
  }
  const nodeType = nodeTypeOf(node);
  if (isWindowNode(node)) {
    // Projected JSON shape
    if (node.wmClass != null || node.title != null || node.windowId != null) {
      return {
        windowId: node.windowId ?? null,
        title: node.title ?? null,
        wmClass: node.wmClass ?? null,
        nodeType,
      };
    }
    const meta = windowMetaFields(node.nodeValue);
    return {
      windowId: meta.id,
      title: meta.title,
      wmClass: meta.wmClass,
      nodeType,
    };
  }
  return { windowId: null, title: null, wmClass: null, nodeType };
}

/**
 * Monitor id string from a MONITOR node.
 * @param {any} monNode
 * @returns {string|null}
 */
export function monitorIdOf(monNode) {
  if (!monNode) return null;
  if (typeof monNode.nodeValue === "string") return monNode.nodeValue;
  if (typeof monNode.id === "string") return monNode.id;
  return null;
}

/**
 * Collect all WINDOW nodes under roots with path strings.
 * Path = monId/idx/idx… (indices into childNodes).
 * @param {any} rootOrForest
 * @returns {MatchCandidate[]}
 */
export function collectWindows(rootOrForest) {
  const out = [];
  for (const root of listRoots(rootOrForest)) {
    const monId = isMonitorNode(root) ? monitorIdOf(root) : null;
    walkCollect(root, monId || "root", out);
  }
  return out;
}

/**
 * @param {any} node
 * @param {string} path
 * @param {MatchCandidate[]} out
 */
function walkCollect(node, path, out) {
  if (!node) return;
  if (isWindowNode(node)) {
    const meta = candidateMeta(node);
    out.push({
      node,
      nodeType: meta.nodeType,
      windowId: meta.windowId,
      title: meta.title,
      wmClass: meta.wmClass,
      path,
    });
    return;
  }
  const kids = childrenOf(node);
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i];
    const childPath = path ? `${path}/${i}` : String(i);
    walkCollect(child, childPath, out);
  }
}

/**
 * JSON-safe candidate fields for error payloads.
 * @param {MatchCandidate} c
 */
export function candidatePublic(c) {
  return {
    windowId: c.windowId ?? null,
    title: c.title ?? null,
    wmClass: c.wmClass ?? null,
    path: c.path ?? null,
    nodeType: c.nodeType ?? null,
  };
}

/**
 * Match selector against a forest / root.
 * Path may return non-WINDOW; other kinds return WINDOW only.
 *
 * ctx (optional live adapters):
 *   getFocusWindow() → Meta.Window | null
 *   getLftNode() → node | null
 *   findNode(val) → node | null
 *   monRoleToId?(role) → mon id | null
 *   liveMap? → T7 LiveMap
 *   getActiveWorkspace?() → number
 *
 * @param {any} rootOrForest
 * @param {SelectorDescriptor|string|object} descriptorOrInput
 * @param {object} [ctx]
 * @returns {{ matches: MatchCandidate[], descriptor: SelectorDescriptor }}
 */
export function matchNodes(rootOrForest, descriptorOrInput, ctx = {}) {
  const descriptor =
    typeof descriptorOrInput === "object" && descriptorOrInput?.kind
      ? descriptorOrInput
      : parseSelector(descriptorOrInput);

  switch (descriptor.kind) {
    case "focus":
      return { matches: matchFocus(rootOrForest, ctx), descriptor };
    case "lft":
      return { matches: matchLft(rootOrForest, ctx), descriptor };
    case "title":
      return { matches: matchTitle(rootOrForest, descriptor), descriptor };
    case "class":
      return { matches: matchClass(rootOrForest, descriptor, ctx), descriptor };
    case "id":
      return { matches: matchId(rootOrForest, descriptor), descriptor };
    case "path":
      return { matches: matchPath(rootOrForest, descriptor, ctx), descriptor };
    default:
      throw new Error(`unknown selector kind: ${descriptor.kind}`);
  }
}

/**
 * WINDOW-only match (filters path non-windows).
 * @param {any} rootOrForest
 * @param {SelectorDescriptor|string|object} descriptorOrInput
 * @param {object} [ctx]
 */
export function matchWindows(rootOrForest, descriptorOrInput, ctx = {}) {
  const { matches, descriptor } = matchNodes(rootOrForest, descriptorOrInput, ctx);
  return {
    matches: matches.filter((m) => m.nodeType === "WINDOW" || isWindowNode(m.node)),
    descriptor,
  };
}

/**
 * Pick 0/1 match or ambiguous error shape.
 * @param {MatchCandidate[]} matches
 * @param {{ first?: boolean }} [opts]
 * @returns {{ ok: true, match: MatchCandidate } | { ok: false, error: string, candidates: object[] }}
 */
export function pickMatch(matches, opts = {}) {
  const list = matches || [];
  if (list.length === 0) {
    return { ok: false, error: "not found", candidates: [] };
  }
  if (list.length > 1 && !opts.first) {
    return {
      ok: false,
      error: "ambiguous",
      candidates: list.map(candidatePublic),
    };
  }
  return { ok: true, match: list[0] };
}

// --- matchers ---

function matchFocus(rootOrForest, ctx) {
  const win = typeof ctx.getFocusWindow === "function" ? ctx.getFocusWindow() : null;
  if (!win) return [];
  const node =
    typeof ctx.findNode === "function" ? ctx.findNode(win) : findWindowByMeta(rootOrForest, win);
  if (!node) return [];
  return [toCandidate(node, rootOrForest)];
}

function matchLft(rootOrForest, ctx) {
  let node = typeof ctx.getLftNode === "function" ? ctx.getLftNode() : null;
  if (!node) return [];
  // Re-resolve live node if value-based
  if (node.nodeValue && typeof ctx.findNode === "function") {
    const live = ctx.findNode(node.nodeValue);
    if (live) node = live;
  }
  if (!isWindowNode(node)) return [];
  return [toCandidate(node, rootOrForest)];
}

function matchTitle(rootOrForest, descriptor) {
  const all = collectWindows(rootOrForest);
  const mode = descriptor.match || "exact";
  let re = null;
  if (mode === "regex") {
    re = new RegExp(descriptor.value, descriptor.flags || "");
  }
  return all.filter((c) => {
    const t = c.title ?? "";
    if (mode === "exact") return t === descriptor.value;
    if (mode === "substr") return t.includes(descriptor.value);
    if (mode === "regex") return re.test(t);
    return false;
  });
}

function matchClass(rootOrForest, descriptor, ctx) {
  const all = collectWindows(rootOrForest);
  let filtered = all.filter((c) => (c.wmClass ?? "") === descriptor.value);
  if (descriptor.mon != null && descriptor.mon !== "") {
    filtered = filtered.filter((c) => windowOnMonitor(c, descriptor.mon, rootOrForest, ctx));
  }
  return filtered;
}

function matchId(rootOrForest, descriptor) {
  const want = descriptor.value;
  const all = collectWindows(rootOrForest);
  return all.filter((c) => {
    if (c.windowId == null) return false;
    return String(c.windowId) === String(want);
  });
}

/**
 * Resolve path segments to a single node (0 or 1 match).
 */
function matchPath(rootOrForest, descriptor, ctx) {
  const segs = descriptor.segments || [];
  if (segs.length === 0) return [];

  const mon = resolveMonitorSegment(segs[0], rootOrForest, ctx);
  if (!mon) return [];

  let node = mon;
  let path = monitorIdOf(mon) || segs[0];
  for (let i = 1; i < segs.length; i++) {
    const idx = parseChildIndex(segs[i]);
    if (idx == null || idx < 0) return [];
    const kids = childrenOf(node);
    if (idx >= kids.length) return [];
    node = kids[idx];
    path = `${path}/${idx}`;
  }

  const meta = candidateMeta(node);
  return [
    {
      node,
      nodeType: meta.nodeType,
      windowId: meta.windowId,
      title: meta.title,
      wmClass: meta.wmClass,
      path,
    },
  ];
}

/**
 * @param {string} seg
 * @returns {number|null}
 */
export function parseChildIndex(seg) {
  if (seg == null || seg === "") return null;
  const m = /^(?:[cw])?(\d+)$/i.exec(String(seg).trim());
  if (!m) return null;
  return parseInt(m[1], 10);
}

/**
 * @param {string} seg
 * @param {any} rootOrForest
 * @param {object} ctx
 */
function resolveMonitorSegment(seg, rootOrForest, ctx) {
  const roots = listRoots(rootOrForest);
  const monitors = roots.filter(isMonitorNode);
  const pool = monitors.length ? monitors : roots;

  // Exact moNwsW id
  if (/^mo\d+ws\d+$/.test(seg)) {
    return pool.find((m) => monitorIdOf(m) === seg) || null;
  }

  // moN → prefer active workspace, else first mon index N
  const moOnly = /^mo(\d+)$/.exec(seg);
  if (moOnly) {
    const monIdx = parseInt(moOnly[1], 10);
    return pickMonitorByIndex(pool, monIdx, ctx);
  }

  // Bare index
  if (/^\d+$/.test(seg)) {
    return pickMonitorByIndex(pool, parseInt(seg, 10), ctx);
  }

  // monRoleToId → mon id
  if (typeof ctx.monRoleToId === "function") {
    try {
      const id = ctx.monRoleToId(seg);
      if (id) {
        const hit = pool.find((m) => monitorIdOf(m) === id);
        if (hit) return hit;
      }
    } catch (_e) {
      /* ignore */
    }
  }

  // stableKey on node or via liveMap
  for (const m of pool) {
    if (m.stableKey && m.stableKey === seg) return m;
  }

  const liveMap = ctx.liveMap;
  if (liveMap?.byKey?.has(seg)) {
    const idx = liveMap.byKey.get(seg);
    return pickMonitorByIndex(pool, idx, ctx);
  }

  // conn:… / name:… tokens already covered by byKey when liveMap present
  return null;
}

function pickMonitorByIndex(pool, monIdx, ctx) {
  const hits = pool.filter((m) => {
    const id = monitorIdOf(m);
    if (!id) return false;
    return MonitorIdentity.monIndexFromId(id) === monIdx;
  });
  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0];
  let ws = null;
  if (typeof ctx.getActiveWorkspace === "function") {
    try {
      ws = ctx.getActiveWorkspace();
    } catch (_e) {
      ws = null;
    }
  }
  if (ws != null && Number.isFinite(Number(ws))) {
    const want = Number(ws);
    const prefer = hits.find((m) => MonitorIdentity.workspaceFromId(monitorIdOf(m)) === want);
    if (prefer) return prefer;
  }
  return hits[0];
}

function windowOnMonitor(candidate, monSpec, rootOrForest, ctx) {
  const path = candidate.path || "";
  const monPart = path.split("/")[0] || "";
  // monSpec as full mon id
  if (/^mo\d+ws\d+$/.test(monSpec)) {
    return monPart === monSpec;
  }
  // moN or index
  const moOnly = /^mo(\d+)$/.exec(monSpec);
  if (moOnly || /^\d+$/.test(monSpec)) {
    const idx = moOnly ? parseInt(moOnly[1], 10) : parseInt(monSpec, 10);
    return MonitorIdentity.monIndexFromId(monPart) === idx;
  }
  // role / stableKey → resolve mon then compare prefix
  const mon = resolveMonitorSegment(monSpec, rootOrForest, ctx);
  if (!mon) return false;
  const id = monitorIdOf(mon);
  return id != null && monPart === id;
}

function findWindowByMeta(rootOrForest, win) {
  const all = collectWindows(rootOrForest);
  for (const c of all) {
    if (c.node?.nodeValue === win) return c.node;
    const id = c.windowId;
    try {
      const wid = typeof win.get_id === "function" ? win.get_id() : win?.id;
      if (wid != null && id != null && String(wid) === String(id)) return c.node;
    } catch (_e) {
      /* ignore */
    }
  }
  return null;
}

function toCandidate(node, rootOrForest) {
  const meta = candidateMeta(node);
  return {
    node,
    nodeType: meta.nodeType,
    windowId: meta.windowId,
    title: meta.title,
    wmClass: meta.wmClass,
    path: pathForNode(node, rootOrForest) || "",
  };
}

/**
 * Best-effort path for a live/mock node under the forest.
 * @param {any} node
 * @param {any} rootOrForest
 * @returns {string|null}
 */
export function pathForNode(node, rootOrForest) {
  if (!node) return null;
  // Walk up via parentNode if available
  if (node.parentNode) {
    const parts = [];
    let cur = node;
    while (cur && !isMonitorNode(cur)) {
      const parent = cur.parentNode;
      if (!parent) break;
      const kids = childrenOf(parent);
      const idx = kids.indexOf(cur);
      if (idx < 0) break;
      parts.unshift(String(idx));
      cur = parent;
    }
    if (cur && isMonitorNode(cur)) {
      const id = monitorIdOf(cur);
      return id ? `${id}/${parts.join("/")}` : parts.join("/");
    }
  }
  // Fallback: scan collectWindows
  const all = collectWindows(rootOrForest);
  const hit = all.find((c) => c.node === node);
  return hit?.path ?? null;
}
