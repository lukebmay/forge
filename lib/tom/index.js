// @ts-check
/**
 * Tiling Object Model — dual-use kernel (proto + future Forge).
 * Import this, not presenters, from OpSets and tests.
 */

export {
  applyForestSnapshot,
  children,
  cloneForest,
  createEnvelope,
  createForest,
  ensureSpine,
  depth,
  dumpForest,
  fail,
  FLOATS_ID,
  floatsOf,
  focusNode,
  get,
  isEnvelopeKind,
  isUnder,
  isUnderFloats,
  isUnderTiles,
  makeCon,
  makeIdFactory,
  makeNode,
  makeWindow,
  markOpenLeaf,
  META_ID,
  metaOf,
  nextAppLabel,
  ok,
  parent,
  registerTree,
  selectionNode,
  setFocus,
  setSelection,
  TILES_ID,
  tilesOf,
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
  extraShareWouldViolate,
  clearShareOnLeave,
  shareAllSizes,
  shareCombo,
  shareSiblingSizes,
  shareSize,
  isBagLayout,
  nudgeSize,
  redistributeShare,
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
