// @ts-check
/**
 * Super-bearing Mark 2 kit. Proto = stripSuper(this) ∪ proto overlay.
 */

/** @typedef {string|string[]} Accel */

/** @type {Readonly<Record<string, Accel>>} */
export const MARK2_TABLE = Object.freeze({
  "focus.left": Object.freeze(["<Super>h", "<Super>Left"]),
  "focus.down": Object.freeze(["<Super>j", "<Super>Down"]),
  "focus.up": Object.freeze(["<Super>k", "<Super>Up"]),
  "focus.right": Object.freeze(["<Super>l", "<Super>Right"]),
  "focus.parent": "<Super>p",
  "focus.child": "<Shift><Super>p",

  "move.left": "<Shift><Super>h",
  "move.down": "<Shift><Super>j",
  "move.up": "<Shift><Super>k",
  "move.right": "<Shift><Super>l",

  "join.left": "<Ctrl><Super>h",
  "join.down": "<Ctrl><Super>j",
  "join.up": "<Ctrl><Super>k",
  "join.right": "<Ctrl><Super>l",

  toggleSplit: "<Super>m",
  toggleTabStack: "<Super>n",
  "layout.cycle-": "<Super>bracketleft",
  "layout.cycle+": "<Super>bracketright",
  promote: Object.freeze(["<Super>braceleft", "<Shift><Super>bracketleft"]),
  promoteRecursive: Object.freeze(["<Super>braceright", "<Shift><Super>bracketright"]),

  "size.nudge.x-": "<Alt><Super>h",
  "size.nudge.y-": "<Alt><Super>j",
  "size.nudge.y+": "<Alt><Super>k",
  "size.nudge.x+": "<Alt><Super>l",
  "size.float": "<Alt><Super>y",
  "size.floatSiblings": "<Alt><Super>u",
  "size.floatSiblingsOnly": "<Alt><Super>i",
  "size.floatSelfSiblingsParent": "<Alt><Super>o",
  "size.floatParent": "<Alt><Super>n",
  "size.floatParentGroup": "<Alt><Super>m",
  "size.floatParentSiblingsOnly": "<Alt><Super>comma",
  "size.floatBothGroups": "<Alt><Super>period",
  "size.floatAll": "<Alt><Super>slash",
  "size.preset.7": "<Alt><Super>7",
  "size.preset.8": "<Alt><Super>8",
  "size.preset.9": "<Alt><Super>9",
  "size.preset.0": "<Alt><Super>0",
});
