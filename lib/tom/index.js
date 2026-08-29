// @ts-check
/**
 * Tiling Object Model — dual-use kernel (proto + future Forge).
 * Import this, not presenters, from OpSets and tests.
 */

export {
  applyForestSnapshot,
  children,
  cloneForest,
  createForest,
  ensureSpine,
  depth,
  dumpForest,
  fail,
  focusNode,
  get,
  isUnder,
  makeCon,
  makeIdFactory,
  makeNode,
  makeWindow,
  markOpenLeaf,
  nextAppLabel,
  ok,
  parent,
  registerTree,
  selectionNode,
  setFocus,
  setSelection,
  walk,
} from "./kernel.js";

export {
  ancestorMonitor,
  dirDelta,
  dirSide,
  findConTarget,
  isInAxis,
  parentAxis,
  preferredLeaf,
  rightmostLeaf,
  siblingInDir,
} from "./queries.js";

export {
  appendChild,
  destroyNode,
  detach,
  insertAfter,
  insertBefore,
  removeChild,
  replaceChild,
  replaceChildren,
  setChildren,
  setLastTabFocus,
  setLayout,
  setPercent,
  setUserSized,
} from "./atomics.js";

export {
  breakout,
  equalizeChildren,
  promoteChildren,
  rotateChild,
  setLayoutTiling,
  swapSiblings,
  wrapNodes,
} from "./composed.js";

export {
  SIZE_MIN,
  SIZE_MAX,
  SIZE_STEP,
  SIZE_PRESETS,
  containingSplit,
  crossAxisSplit,
  extraFloaterWouldViolate,
  clearShareOnLeave,
  floatAllSizes,
  floatCombo,
  floatSiblingSizes,
  floatSize,
  isBagLayout,
  nudgeSize,
  redistributeFloaters,
  repairSharesAfterChildChange,
  setChildShare,
  setInAxisShare,
  splitAxis,
  splitForAxis,
} from "./sizing.js";

export { createTomApi } from "./api.js";

export {
  buildGiven,
  normalizeTreeStr,
  parseAction,
  parseActions,
  parseGiven,
  parseLayoutToken,
  serializeForest,
} from "./shorthand.js";
