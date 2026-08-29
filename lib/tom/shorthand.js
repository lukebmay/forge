// @ts-check
/**
 * TOM shorthand — the lingua franca for chat + tests.
 *
 * Tree:  Mon1(H(V(A,B),V(C,D))) Mon2(H(E,F))
 *        H(A,B)                  — implicit Mon1
 *        Mon1(A,B)               — two mon children (atomics allow this)
 * Layout aliases: H V TAB STACK (also HSPLIT VSPLIT TABBED STACKED)
 *
 * Actions: Select(A); Move(left); Join(right); SetLayout(TAB); …
 * Not a product DSL — a compact notation. See prototype README.
 */

import { sessionOf } from "../session/index.js";
import { createTomApi } from "./api.js";

/** @typedef {import('./kernel.js').Forest} Forest */
/** @typedef {import('./kernel.js').Layout} Layout */
/** @typedef {import('./kernel.js').Node} Node */
/** @typedef {import('./kernel.js').Dir} Dir */
/** @typedef {import('./api.js').TomApi} TomApi */

/** @typedef {{ kind: 'win', label: string }} WinAst */
/** @typedef {{ kind: 'con', layout: Layout, kids: Ast[] }} ConAst */
/** @typedef {WinAst | ConAst} Ast */

const LAYOUT_ALIAS = {
  H: "HSPLIT",
  V: "VSPLIT",
  TAB: "TABBED",
  STACK: "STACKED",
  HSPLIT: "HSPLIT",
  VSPLIT: "VSPLIT",
  TABBED: "TABBED",
  STACKED: "STACKED",
};

const LAYOUT_SHORT = {
  HSPLIT: "H",
  VSPLIT: "V",
  TABBED: "TAB",
  STACKED: "STACK",
};

/** @param {string} src @returns {Ast} */
function parseNode(src) {
  const s = src.trim();
  const m = /^([A-Za-z][A-Za-z0-9]*)\((.*)\)$/s.exec(s);
  if (!m) {
    if (!/^[A-Z][A-Z0-9]*$/.test(s)) {
      throw new Error(`bad leaf/label: ${s}`);
    }
    return { kind: "win", label: s };
  }
  const name = m[1];
  const layout = LAYOUT_ALIAS[name.toUpperCase()];
  if (!layout) {
    throw new Error(`unknown layout ${name} in ${s}`);
  }
  return { kind: "con", layout, kids: splitTopArgs(m[2]).map(parseNode) };
}

/** @param {string} s */
function splitTopArgs(s) {
  /** @type {string[]} */
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/** @param {string} s @param {number} openIdx */
function matchingParen(s, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error(`unbalanced paren in ${s}`);
}

/**
 * @param {string} given
 * @returns {{ monName: string, kids: Ast[] }[]}
 */
export function parseGiven(given) {
  const s = given.trim().replace(/\s+/g, " ");
  if (!s) throw new Error("empty Given");

  if (/^Mon\d+\(/i.test(s)) {
    /** @type {{ monName: string, kids: Ast[] }[]} */
    const mons = [];
    let i = 0;
    while (i < s.length) {
      while (s[i] === " ") i++;
      if (i >= s.length) break;
      const mm = /^Mon(\d+)\(/i.exec(s.slice(i));
      if (!mm) throw new Error(`expected MonN( at "${s.slice(i)}"`);
      const monName = `Mon${mm[1]}`;
      const open = i + mm[0].length - 1;
      const close = matchingParen(s, open);
      const body = s.slice(open + 1, close);
      mons.push({ monName, kids: splitTopArgs(body).map(parseNode) });
      i = close + 1;
    }
    return mons;
  }

  return [{ monName: "Mon1", kids: [parseNode(s)] }];
}

/**
 * @typedef {{
 *   op: string,
 *   arg?: string,
 *   dir?: Dir,
 *   layout?: Layout,
 *   side?: 'before'|'after',
 *   delta?: number,
 *   monIndex?: number,
 * }} Action
 */

/**
 * @param {string} name
 * @returns {Layout}
 */
export function parseLayoutToken(name) {
  const layout = LAYOUT_ALIAS[name.toUpperCase()];
  if (!layout) throw new Error(`unknown layout ${name}`);
  return layout;
}

/**
 * @param {string} action
 * @returns {Action}
 */
export function parseAction(action) {
  const s = action.trim().replace(/;+\s*$/, "");
  let m = /^Select\s*\(\s*([A-Z][A-Z0-9]*)\s*\)$/i.exec(s);
  if (m) return { op: "Select", arg: m[1].toUpperCase() };

  m = /^SelectParent\s*\(\s*\)$/i.exec(s);
  if (m) return { op: "SelectParent" };

  m = /^SelectChild\s*\(\s*\)$/i.exec(s);
  if (m) return { op: "SelectChild" };

  m = /^(Move|Join|JoinMove|Swap|Focus|Breakout)\s*\(\s*(left|right|up|down)\s*\)$/i.exec(s);
  if (m) {
    const raw = m[1];
    const op = /^Move$/i.test(raw)
      ? "Move"
      : /^(Join|JoinMove)$/i.test(raw)
      ? "Join"
      : /^Swap$/i.test(raw)
      ? "Swap"
      : /^Focus$/i.test(raw)
      ? "Focus"
      : "Breakout";
    return { op, dir: /** @type {Dir} */ (m[2].toLowerCase()) };
  }

  m = /^(Move|Join|JoinMove)\s*\(\s*([A-Z][A-Z0-9]*)\s*,\s*(left|right|up|down)\s*\)$/i.exec(s);
  if (m) {
    const op = /^Move$/i.test(m[1]) ? "Move" : "Join";
    return {
      op,
      arg: m[2].toUpperCase(),
      dir: /** @type {Dir} */ (m[3].toLowerCase()),
    };
  }

  m = /^Breakout\s*\(\s*(before|after)\s*\)$/i.exec(s);
  if (m) return { op: "Breakout", side: /** @type {'before'|'after'} */ (m[1].toLowerCase()) };

  m = /^(SetLayout|Wrap|CreateGroup)\s*\(\s*([A-Za-z]+)\s*\)$/i.exec(s);
  if (m) {
    const op = /^SetLayout$/i.test(m[1])
      ? "SetLayout"
      : /^Wrap$/i.test(m[1])
      ? "Wrap"
      : "CreateGroup";
    return { op, layout: parseLayoutToken(m[2]) };
  }

  m = /^CycleLayout\s*\(\s*([+-]?\d+)\s*\)$/i.exec(s);
  if (m) return { op: "CycleLayout", delta: Number(m[1]) };

  m = /^Launch\s*\(\s*\)$/i.exec(s);
  if (m) return { op: "Launch" };

  m = /^Launch\s*\(\s*Mon(\d+)\s*\)$/i.exec(s);
  if (m) return { op: "Launch", monIndex: Number(m[1]) - 1 };

  m =
    /^(Ungroup|Group|Promote|PromoteRecursive|ToggleSplit|ToggleTabStack|Remove|Delete|Flatten|FlattenAll|Equalize|Close|MoveIn|MoveOut)\s*\(\s*\)$/i.exec(
      s
    );
  if (m) {
    const raw = m[1];
    const map = {
      ungroup: "Ungroup",
      group: "Group",
      promote: "Promote",
      promoterecursive: "PromoteRecursive",
      togglesplit: "ToggleSplit",
      toggletabstack: "ToggleTabStack",
      remove: "Remove",
      delete: "Delete",
      flatten: "Flatten",
      flattenall: "FlattenAll",
      equalize: "Equalize",
      close: "Close",
      movein: "MoveIn",
      moveout: "MoveOut",
    };
    return { op: map[raw.toLowerCase()] };
  }

  throw new Error(`bad Action: ${action}`);
}

/**
 * @param {string | string[]} actions
 * @returns {Action[]}
 */
export function parseActions(actions) {
  const parts = Array.isArray(actions)
    ? actions
    : actions
        .split(";")
        .map((x) => x.trim())
        .filter(Boolean);
  return parts.map(parseAction);
}

/**
 * @param {string} given
 * @param {{ edgeMove?: string, policyEnabled?: boolean, opsetId?: string }} [prefs]
 * @returns {{ f: Forest, api: TomApi, byLabel: Record<string, Node> }}
 */
export function buildGiven(given, prefs = {}) {
  const parts = parseGiven(given);
  const api = createTomApi();
  const geoms = parts.map((p, i) => ({
    id: p.monName,
    x: i * 1920,
    y: 0,
    width: 1920,
    height: 1080,
    primary: i === 0,
  }));
  const f = api.createForest(geoms);
  const d = sessionOf(f).decisions;
  d.edgeMove = /** @type {any} */ (prefs.edgeMove || "wrap");
  d._edgeNoopMigrated = true;
  if (prefs.policyEnabled != null) d.policyEnabled = prefs.policyEnabled;
  if (prefs.opsetId) d.opsetId = prefs.opsetId;

  /** @type {Record<string, Node>} */
  const byLabel = {};

  /** @param {Ast} node @returns {Node} */
  function materialize(node) {
    if (node.kind === "win") {
      const w = api.makeWindow(node.label);
      api._registerTree(f, w);
      byLabel[node.label] = w;
      return w;
    }
    const kids = node.kids.map(materialize);
    const c = api.makeCon(node.layout, []);
    api._registerTree(f, c);
    c.childIds = kids.map((k) => k.id);
    for (const k of kids) k.parentId = c.id;
    const n = kids.length || 1;
    for (const k of kids) k.percent = 1 / n;
    return c;
  }

  for (let i = 0; i < parts.length; i++) {
    const mon = f.monitors[i];
    const roots = parts[i].kids.map(materialize);
    mon.childIds = roots.map((r) => r.id);
    for (const r of roots) {
      r.parentId = mon.id;
      r.percent = 1 / roots.length;
    }
  }

  return { f, api, byLabel };
}

/**
 * @param {Forest} f
 * @param {{ children: (f: Forest, n: Node) => Node[] }} api
 */
export function serializeForest(f, api) {
  /** @param {Node} n */
  function ser(n) {
    if (n.kind === "WINDOW") return n.label || "?";
    if (n.kind === "MONITOR") {
      const kids = api.children(f, n);
      if (!kids.length) return `${n.id}()`;
      return `${n.id}(${kids.map(ser).join(",")})`;
    }
    const short = LAYOUT_SHORT[n.layout || ""] || n.layout || "CON";
    const kids = api.children(f, n);
    return `${short}(${kids.map(ser).join(",")})`;
  }
  return f.monitors.map((m) => ser(m)).join(" ");
}

/** @param {string} s */
export function normalizeTreeStr(s) {
  let t = s.replace(/\s+/g, " ").trim();
  if (!/^Mon\d+\(/i.test(t)) t = `Mon1(${t})`;
  return t;
}
