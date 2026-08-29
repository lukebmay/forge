/**
 * Proto chords = stripSuper(Mark 2 table) ∪ proto overlay.
 * @typedef {{ chord: string, action: string, label: string }} Keybind
 */

import { ACTION_LABELS } from "../../../lib/keybinds/actions.js";
import { MARK2_TABLE } from "../../../lib/keybinds/mark2.js";
import { PROTO_OVERLAY } from "../../../lib/keybinds/proto-overlay.js";
import { asAccels, stripSuper } from "../../../lib/keybinds/strip-super.js";

/** @returns {Keybind[]} */
export function defaultVimMinusSuper() {
  /** @type {Keybind[]} */
  const fromTable = [];
  const seen = new Set();
  for (const [id, accels] of Object.entries(MARK2_TABLE)) {
    const label = ACTION_LABELS[id] || id;
    for (const accel of asAccels(accels)) {
      const chord = stripSuper(accel);
      const key = chord.toLowerCase();
      if (!chord || seen.has(key)) continue;
      seen.add(key);
      fromTable.push({ chord, action: id, label });
    }
  }
  const overlay = [];
  for (const b of PROTO_OVERLAY) {
    const key = b.chord.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    overlay.push({ ...b });
  }
  return [...fromTable, ...overlay];
}

/**
 * @param {KeyboardEvent} e
 * @returns {string}
 */
export function eventToChord(e) {
  const parts = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  let key = e.key;
  if (key === " ") key = "Space";

  const isLetter = key.length === 1 && /[a-zA-Z]/.test(key);
  if (e.shiftKey && (key === "[" || key === "]")) {
    key = key === "[" ? "{" : "}";
  }
  if (e.shiftKey && key === ";") {
    key = ":";
  }
  if (e.shiftKey && (isLetter || key.startsWith("Arrow"))) {
    parts.push("Shift");
  }

  if (key.startsWith("Arrow")) {
    parts.push(key);
  } else if (key === "," || key === "." || key === "/") {
    parts.push(key);
  } else if (isLetter) {
    parts.push(key.toLowerCase());
  } else if (key.length === 1) {
    parts.push(key);
  } else {
    parts.push(key);
  }
  return parts.join("+");
}

/**
 * @param {Keybind[]} binds
 * @param {string} chord
 * @returns {Keybind|undefined}
 */
export function matchBind(binds, chord) {
  return binds.find((b) => b.chord.toLowerCase() === chord.toLowerCase());
}

/** @param {KeyboardEvent} e */
export function isTypingTarget(e) {
  const t = /** @type {HTMLElement|null} */ (e.target);
  if (!t) return false;
  const tag = t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (t.isContentEditable) return true;
  return false;
}
