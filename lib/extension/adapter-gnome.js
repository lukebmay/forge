/*
 * Thin ForgeAdapterGnome barrel — re-exports only; no policy.
 */

export { mapAdmitWindow, onLateIdentity } from "./adapter-map-admit.js";
export { presentSeededForest } from "./adapter-present.js";
export {
  requestLayout,
  freezeRender,
  unfreezeRender,
  renderWithFreezeState,
  renderTree,
  runPresentIdle,
} from "./adapter-present-idle.js";
export { moveMetaWindow, moveMetaWindowImpl } from "./adapter-meta-move.js";
export {
  openPlaceTrack,
  planOpenAppPlacement,
  placeNext,
  slotSplitForInsert,
  tryAdoptLatePlaceHint,
  scheduleOpenCommit,
  releaseDeferredOpens,
} from "./adapter-open-place.js";
export { WINDOW_MODES, GRAB_TYPES } from "./window-modes.js";
export {
  processFloats,
  applyProcessFloatDecision,
  ensureTiledForSlotPlace,
  toggleFloatingMode,
  addFloatOverride,
  removeFloatOverride,
  isFloatingExempt,
  isWindowIgnored,
  floatExemptReason,
  reconcileFullscreenFloatDemotion,
  handleUserAboveChange,
} from "./adapter-float.js";
export {
  forgetHostWindow,
  windowDestroy,
  captureFocusRestore,
  metaWindowId,
  findMetaWindowById,
  restoreFocusAfterWindowClosed,
  dropAllIgnoredWindows,
  dropIfIgnored,
} from "./adapter-destroy.js";
export { bindWindowSignals, paintTitleChromeLabel } from "./adapter-window-signals.js";
export {
  resize,
  expand,
  shrink,
  applyOwningSplit,
  adjustOwningSplitPercents,
  expandNodeAgainstPair,
  effectivePercent,
  applyGoldenRatio,
  goldenRatioAgainstPair,
  normalizeSiblingPercents,
  pairInitRect,
  applyOwningSplitFromGrab,
  handleResizing,
  repositionDuringResize,
} from "./adapter-grab-resize.js";
export {
  onSettingsChanged,
  handleLayoutModeToggle,
  syncLayoutVerifyInterval,
} from "./adapter-settings.js";
export {
  queueEvent,
  bindSignals,
  removeSignals,
  trackCurrentMonWs,
  bindWorkspaceSignals,
  disable,
  enable,
  reloadTree,
  trackCurrentWindows,
} from "./adapter-lifecycle.js";
export { ForgeAdapterGnome } from "./forge-adapter-gnome.js";
