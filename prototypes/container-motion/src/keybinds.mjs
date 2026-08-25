/**
 * Vim kit with Super stripped. Chords that already used Alt keep Alt.
 * @typedef {{ chord: string, action: string, label: string }} Keybind
 */

/** @returns {Keybind[]} */
export function defaultVimMinusSuper() {
  return [
    { chord: "h", action: "focus:left", label: "Focus left" },
    { chord: "j", action: "focus:down", label: "Focus down" },
    { chord: "k", action: "focus:up", label: "Focus up" },
    { chord: "l", action: "focus:right", label: "Focus right" },
    { chord: "ArrowLeft", action: "focus:left", label: "Focus left" },
    { chord: "ArrowDown", action: "focus:down", label: "Focus down" },
    { chord: "ArrowUp", action: "focus:up", label: "Focus up" },
    { chord: "ArrowRight", action: "focus:right", label: "Focus right" },

    { chord: "Shift+h", action: "move:left", label: "Move left" },
    { chord: "Shift+j", action: "move:down", label: "Move down" },
    { chord: "Shift+k", action: "move:up", label: "Move up" },
    { chord: "Shift+l", action: "move:right", label: "Move right" },

    { chord: "Ctrl+h", action: "swap:left", label: "Swap left" },
    { chord: "Ctrl+j", action: "swap:down", label: "Swap down" },
    { chord: "Ctrl+k", action: "swap:up", label: "Swap up" },
    { chord: "Ctrl+l", action: "swap:right", label: "Swap right" },

    { chord: "a", action: "focusParent", label: "Focus parent" },
    { chord: "Shift+a", action: "focusChild", label: "Focus child" },

    { chord: "Shift+,", action: "moveIn", label: "Move in" },
    { chord: "Ctrl+Shift+,", action: "moveOut", label: "Move out" },

    { chord: "Shift+m", action: "group", label: "Group (tabbed)" },
    { chord: "Ctrl+Shift+m", action: "ungroup", label: "Ungroup" },

    { chord: "z", action: "setLayout:HSPLIT", label: "Layout HSPLIT" },
    { chord: "v", action: "setLayout:VSPLIT", label: "Layout VSPLIT" },
    { chord: "Shift+t", action: "setLayout:TABBED", label: "Layout TABBED" },
    { chord: "Shift+s", action: "setLayout:STACKED", label: "Layout STACKED" },
    { chord: "Shift+n", action: "cycleGroupChrome", label: "TABBED ↔ STACKED" },

    { chord: "f", action: "flatten", label: "Flatten 1-child CONs" },
    { chord: "x", action: "close", label: "Close window" },
    { chord: "t", action: "toggleTag", label: "Toggle merge tag" },
    { chord: "Escape", action: "clearTags", label: "Clear merge tags" },
  ];
}

/**
 * @param {KeyboardEvent} e
 * @returns {string}
 */
export function eventToChord(e) {
  const parts = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  let key = e.key;
  if (key === " ") key = "Space";
  if (key.length === 1) key = key.toLowerCase();
  // Normalize Arrow* already fine; Shift+H arrives as "H" with shiftKey
  if (e.shiftKey && key.length === 1) {
    // chord uses Shift+h form
  }
  if (key.startsWith("Arrow")) {
    parts.push(key);
  } else if (key === ",") {
    parts.push(",");
  } else if (key.length === 1) {
    parts.push(key.toLowerCase());
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
