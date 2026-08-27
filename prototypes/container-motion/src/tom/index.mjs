// @ts-check
/**
 * Tiling Object Model — dual-use kernel (proto + future Forge).
 * Import this, not presenters, from OpSets and tests.
 */

export {
  applyForestSnapshot,
  children,
  clearMergeTags,
  cloneForest,
  createForest,
  defaultDecisions,
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
  toggleMergeTag,
  walk,
} from "./kernel.mjs";

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
} from "./queries.mjs";

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
} from "./atomics.mjs";

export {
  breakout,
  cleanupStructure,
  collapseUnary,
  equalizeChildren,
  promoteChildren,
  pruneEmptyCons,
  rotateChild,
  setLayoutTiling,
  swapSiblings,
  wrapNodes,
} from "./composed.mjs";

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
  paneRect,
  redistributeFloaters,
  repairSharesAfterChildChange,
  setChildShare,
  setInAxisShare,
  splitAxis,
  splitForAxis,
  wrapWouldViolateMin,
} from "./sizing.mjs";

export { createTomApi } from "./api.mjs";

export {
  buildGiven,
  normalizeTreeStr,
  parseAction,
  parseActions,
  parseGiven,
  parseLayoutToken,
  serializeForest,
} from "./shorthand.mjs";
