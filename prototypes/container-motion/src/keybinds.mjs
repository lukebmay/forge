/**
 * Vim kit with Super stripped. Chords that already used Alt keep Alt.
 * @typedef {{ chord: string, action: string, label: string }} Keybind
 */

/** @returns {Keybind[]} */
export function defaultVimMinusSuper() {
  return [
    { chord: "y", action: "focus:left", label: "Focus left" },
    { chord: "u", action: "focus:down", label: "Focus down" },
    { chord: "i", action: "focus:up", label: "Focus up" },
    { chord: "o", action: "focus:right", label: "Focus right" },
    { chord: "ArrowLeft", action: "focus:left", label: "Focus left" },
    { chord: "ArrowDown", action: "focus:down", label: "Focus down" },
    { chord: "ArrowUp", action: "focus:up", label: "Focus up" },
    { chord: "ArrowRight", action: "focus:right", label: "Focus right" },

    { chord: "Shift+y", action: "move:left", label: "TreeOp swap left" },
    { chord: "Shift+u", action: "move:down", label: "TreeOp swap down" },
    { chord: "Shift+i", action: "move:up", label: "TreeOp swap up" },
    { chord: "Shift+o", action: "move:right", label: "TreeOp swap right" },

    { chord: "Ctrl+y", action: "swap:left", label: "Swap left" },
    { chord: "Ctrl+u", action: "swap:down", label: "Swap down" },
    { chord: "Ctrl+i", action: "swap:up", label: "Swap up" },
    { chord: "Ctrl+o", action: "swap:right", label: "Swap right" },

    { chord: "h", action: "focus:left", label: "Select left" },
    { chord: "j", action: "focus:down", label: "Select down" },
    { chord: "k", action: "focus:up", label: "Select up" },
    { chord: "l", action: "focus:right", label: "Select right" },

    { chord: "Shift+h", action: "opset:move:left", label: "OpSet move left" },
    { chord: "Shift+j", action: "opset:move:down", label: "OpSet move down" },
    { chord: "Shift+k", action: "opset:move:up", label: "OpSet move up" },
    { chord: "Shift+l", action: "opset:move:right", label: "OpSet move right" },

    { chord: "Ctrl+h", action: "opset:join:left", label: "OpSet join left" },
    { chord: "Ctrl+j", action: "opset:join:down", label: "OpSet join down" },
    { chord: "Ctrl+k", action: "opset:join:up", label: "OpSet join up" },
    { chord: "Ctrl+l", action: "opset:join:right", label: "OpSet join right" },

    { chord: "p", action: "focusParent", label: "Focus parent" },
    { chord: "Shift+p", action: "focusChild", label: "Focus child" },

    { chord: "Shift+,", action: "moveIn", label: "Move in" },
    { chord: "Ctrl+Shift+,", action: "moveOut", label: "Move out" },

    { chord: "Shift+m", action: "group", label: "Group (tabbed)" },
    { chord: "Ctrl+Shift+m", action: "ungroup", label: "Ungroup" },

    { chord: "z", action: "setLayout:HSPLIT", label: "Layout HSPLIT" },
    { chord: "v", action: "setLayout:VSPLIT", label: "Layout VSPLIT" },
    { chord: "Shift+t", action: "setLayout:TABBED", label: "Layout TABBED" },
    { chord: "Shift+s", action: "setLayout:STACKED", label: "Layout STACKED" },

    { chord: "[", action: "cycleLayout:-1", label: "Cycle layout ←" },
    { chord: "]", action: "cycleLayout:+1", label: "Cycle layout →" },
    { chord: "m", action: "opset:toggleSplit", label: "Mark 2 toggle split" },
    { chord: "n", action: "opset:toggleTabStack", label: "Mark 2 toggle tab/stack" },
    { chord: "{", action: "opset:promote", label: "Mark 2 promote children" },
    { chord: "}", action: "opset:promoteRecursive", label: "Mark 2 promote recursive" },
    { chord: "Shift+[", action: "opset:promote", label: "Mark 2 promote children" },
    { chord: "Shift+]", action: "opset:promoteRecursive", label: "Mark 2 promote recursive" },

    { chord: "e", action: "equalizeChildren", label: "Equalize children" },
    { chord: ";", action: "unsetSizeInAxis", label: "Unset size in-axis" },
    { chord: ":", action: "unsetSizeCrossAxis", label: "Unset size cross-axis" },
    { chord: "Shift+;", action: "unsetSizeCrossAxis", label: "Unset size cross-axis" },

    { chord: "Alt+h", action: "size:x:-", label: "Decrease x share" },
    { chord: "Alt+j", action: "size:y:-", label: "Decrease y share" },
    { chord: "Alt+k", action: "size:y:+", label: "Increase y share" },
    { chord: "Alt+l", action: "size:x:+", label: "Increase x share" },
    { chord: "Alt+y", action: "size:float", label: "Float this share" },
    { chord: "Alt+u", action: "size:floatSiblings", label: "Float this and siblings" },
    { chord: "Alt+i", action: "size:floatSiblingsOnly", label: "Float siblings only" },
    {
      chord: "Alt+o",
      action: "size:floatSelfSiblingsParent",
      label: "Float this, siblings, parent",
    },
    { chord: "Alt+n", action: "size:floatParent", label: "Float parent (cross-axis)" },
    { chord: "Alt+m", action: "size:floatParentGroup", label: "Float parent and its siblings" },
    { chord: "Alt+,", action: "size:floatParentSiblingsOnly", label: "Float parent siblings only" },
    { chord: "Alt+.", action: "size:floatBothGroups", label: "Float this group and parent group" },
    { chord: "Alt+/", action: "size:floatAll", label: "Float all shares" },
    { chord: "Alt+7", action: "size:preset:7", label: "In-axis 75%" },
    { chord: "Alt+8", action: "size:preset:8", label: "In-axis 66.7%" },
    { chord: "Alt+9", action: "size:preset:9", label: "In-axis 50%" },
    { chord: "Alt+0", action: "size:preset:0", label: "In-axis 33.3%" },

    { chord: "a", action: "launch", label: "Launch (selected)" },
    { chord: "f", action: "flatten", label: "Flatten 1-child CONs" },
    { chord: "x", action: "close", label: "Close window" },
    { chord: "q", action: "opset:remove", label: "OpSet remove (with settle)" },
    { chord: "Delete", action: "deleteNode", label: "TreeOp destroy node" },
    { chord: "Backspace", action: "opset:remove", label: "OpSet remove (with settle)" },
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
