// @ts-check
/**
 * Drop Super/Meta from a GNOME accel; keep Ctrl/Shift/Alt/key as a proto chord.
 */

const KEEP_MOD = {
  ctrl: "Ctrl",
  control: "Ctrl",
  shift: "Shift",
  alt: "Alt",
};

const DROP_MOD = new Set(["super", "meta"]);

const KEY_MAP = {
  left: "ArrowLeft",
  right: "ArrowRight",
  up: "ArrowUp",
  down: "ArrowDown",
  return: "Return",
  bracketleft: "[",
  bracketright: "]",
  braceleft: "{",
  braceright: "}",
  semicolon: ";",
  comma: ",",
  period: ".",
  slash: "/",
  space: "Space",
};

/** Shift+key as proto eventToChord emits it (no extra Shift+). */
const SHIFT_FOLD = {
  "[": "{",
  "]": "}",
  ";": ":",
};

const MOD_ORDER = ["Ctrl", "Alt", "Shift"];

/**
 * @param {string} raw
 * @returns {string}
 */
function mapKey(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  if (KEY_MAP[lower]) return KEY_MAP[lower];
  if (trimmed.length === 1) return trimmed.toLowerCase();
  const arrow = /^arrow(left|right|up|down)$/i.exec(trimmed);
  if (arrow) {
    const dir = arrow[1].toLowerCase();
    return "Arrow" + dir.charAt(0).toUpperCase() + dir.slice(1);
  }
  return trimmed;
}

/**
 * @param {string} accel
 * @returns {string}
 */
export function stripSuper(accel) {
  if (accel == null || typeof accel !== "string") return "";
  const mods = [];
  const modRe = /<([^>]+)>/g;
  let match;
  while ((match = modRe.exec(accel)) !== null) {
    const name = match[1].toLowerCase();
    if (DROP_MOD.has(name)) continue;
    const keep = KEEP_MOD[name];
    if (keep && !mods.includes(keep)) mods.push(keep);
  }
  let key = mapKey(accel.replace(/<[^>]+>/g, ""));
  let ordered = MOD_ORDER.filter((m) => mods.includes(m));
  if (ordered.includes("Shift") && SHIFT_FOLD[key]) {
    key = SHIFT_FOLD[key];
    ordered = ordered.filter((m) => m !== "Shift");
  }
  return [...ordered, key].filter(Boolean).join("+");
}

/**
 * @param {string|string[]|null|undefined} value
 * @returns {string[]}
 */
export function asAccels(value) {
  if (value == null || value === "") return [];
  return Array.isArray(value)
    ? value.filter((a) => typeof a === "string" && a.length > 0)
    : [value];
}

/**
 * @param {Record<string, string|string[]>} table
 * @returns {Record<string, string[]>}
 */
export function stripSuperTable(table) {
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const [id, value] of Object.entries(table || {})) {
    out[id] = asAccels(value).map(stripSuper);
  }
  return out;
}
