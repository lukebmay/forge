// @ts-check
import { defaultVimMinusSuper } from "../src/keybinds.mjs";
import { MARK2_TABLE } from "../../../lib/keybinds/mark2.js";
import { asAccels, stripSuper } from "../../../lib/keybinds/strip-super.js";

/** @typedef {import('./harness.mjs').Case} Case */

function findChord(binds, chord) {
  const want = chord.toLowerCase();
  return binds.find((b) => b.chord.toLowerCase() === want);
}

/** @type {Case[]} */
export const KEYBIND_CASES = [
  {
    id: "kb-shift-h-move-left",
    layer: "keybinds",
    run() {
      const b = findChord(defaultVimMinusSuper(), "Shift+h");
      if (!b || b.action !== "move.left") return `Shift+h → ${b?.action || "missing"}`;
    },
  },
  {
    id: "kb-ctrl-h-join-left",
    layer: "keybinds",
    run() {
      const b = findChord(defaultVimMinusSuper(), "Ctrl+h");
      if (!b || b.action !== "join.left") return `Ctrl+h → ${b?.action || "missing"}`;
    },
  },
  {
    id: "kb-p-focus-parent",
    layer: "keybinds",
    run() {
      const b = findChord(defaultVimMinusSuper(), "p");
      if (!b || b.action !== "focus.parent") return `p → ${b?.action || "missing"}`;
    },
  },
  {
    id: "kb-shift-p-focus-child",
    layer: "keybinds",
    run() {
      const b = findChord(defaultVimMinusSuper(), "Shift+p");
      if (!b || b.action !== "focus.child") return `Shift+p → ${b?.action || "missing"}`;
    },
  },
  {
    id: "kb-m-n-toggles",
    layer: "keybinds",
    run() {
      const binds = defaultVimMinusSuper();
      const m = findChord(binds, "m");
      const n = findChord(binds, "n");
      if (!m || m.action !== "toggleSplit") return `m → ${m?.action || "missing"}`;
      if (!n || n.action !== "toggleTabStack") return `n → ${n?.action || "missing"}`;
    },
  },
  {
    id: "kb-brackets-cycle",
    layer: "keybinds",
    run() {
      const binds = defaultVimMinusSuper();
      const left = findChord(binds, "[");
      const right = findChord(binds, "]");
      if (!left || left.action !== "layout.cycle-") return `[ → ${left?.action || "missing"}`;
      if (!right || right.action !== "layout.cycle+") return `] → ${right?.action || "missing"}`;
    },
  },
  {
    id: "kb-no-yuio-extra-focus",
    layer: "keybinds",
    run() {
      const y = findChord(defaultVimMinusSuper(), "y");
      if (y && (y.action === "focus:left" || y.action === "focus.left")) {
        return "bare y must not be extra focus (Alt+y is size.share)";
      }
    },
  },
  {
    id: "kb-overlay-a-q",
    layer: "keybinds",
    run() {
      const binds = defaultVimMinusSuper();
      const a = findChord(binds, "a");
      const q = findChord(binds, "q");
      if (!a || a.action !== "launch") return `a → ${a?.action || "missing"}`;
      if (!q || q.action !== "remove") return `q → ${q?.action || "missing"}`;
    },
  },
  {
    id: "kb-overlay-not-in-core",
    layer: "keybinds",
    run() {
      const core = new Set(
        Object.values(MARK2_TABLE)
          .flatMap((v) => asAccels(v))
          .map((accel) => stripSuper(accel).toLowerCase())
      );
      if (core.has("a") || core.has("q")) return "a/q must stay off the core table";
    },
  },
];
