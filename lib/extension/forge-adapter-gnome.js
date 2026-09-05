/*
 * This file is part of the Forge extension for GNOME
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

// Gnome imports
import GLib from "gi://GLib";
import Gio from "gi://Gio";
import GObject from "gi://GObject";
import Meta from "gi://Meta";
import Shell from "gi://Shell";

// Gnome Shell imports
import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

// Shared state
import { Logger } from "../shared/logger.js";
import { assert, assertionFailed } from "../shared/assert.js";

// App imports
import { createHostBag } from "../host/index.js";
import {
  ancestorMonitor,
  createEnvelope,
  equalizeChildren,
  makeIdFactory,
  parent as tomParent,
  promoteChildren,
  repairSharesAfterChildChange,
} from "../tom/index.js";
import * as Utils from "./utils.js";
import { createLiveTree } from "./create-live-tree.js";
import { Queue } from "./queue.js";
import { LAYOUT_TYPES, ORIENTATION_TYPES, NODE_TYPES } from "./tree-types.js";
import { WINDOW_MODES, GRAB_TYPES } from "./window-modes.js";
import { production } from "../shared/settings.js";
import { hasDevMode } from "../shared/dev-modes.js";
import { forgeConfigDir } from "../shared/forge-config-home.js";
import {
  ensureLiveForest,
  forestBindWindow,
  forestEnsureSpineNode,
  forestIdFromLive,
  forestInsertWindow,
  forestMergeWindowsIntoGroup,
  forestReparent,
  forestSetLayout,
  forestSetWindowFloating,
  forestSlotPaintRect,
  forestSlotSplit,
  forestSplit,
  forestWrapForTabStack,
  forestWrapNode,
  liveChildrenForPresent,
  liveParentForPresent,
  liveStackedOrTabbedConsForPresent,
  liveTilesParented,
  liveWindowFromMeta,
  paintWmForest,
} from "./tom-live.js";
import { mark2CleanupUnder } from "../rulesets/mark2.js";
import { resyncWmAndPaint } from "./observe-reality.js";
import { CommandHandler } from "./command.js";
import { DecorationManager } from "./decoration.js";
import { DragDropManager, collectDragDropTargetMetaWindows } from "./drag-drop.js";
import { FocusManager } from "./focus.js";
import {
  afterFocus as afterFocusPipeline,
  commitLayout as commitLayoutPipeline,
  settleTabFocus as settleTabFocusPipeline,
  revealGroupChild as revealGroupChildPipeline,
} from "./action-pipeline.js";
import { SessionLayoutRestoreManager } from "./session-layout-restore.js";
import { MonitorRecoveryManager, safeMoveToMonitor } from "./monitor-recovery.js";
import { LayoutController, glibSchedule, glibCancel } from "./layout-controller.js";
import { SourceBag, glibIdleSchedule } from "./sources.js";
import { WindowAttach } from "./window-attach.js";
import { SignalBag, disconnectSignals } from "./signals.js";
import { SuppressFlag } from "./suppress.js";
import { LayoutBatchDepth } from "./layout-batch-depth.js";
import { OpenCommitManager } from "./open-commit-manager.js";
import {
  AppThrashCatalog,
  extractWmClass,
  parseSettleHeuristicsJson,
} from "./app-thrash-catalog.js";
import {
  LAYOUT_OPEN_LEAF_PIN_MS,
  layoutOpenLeafPinActive,
  makeLayoutOpenLeafPin,
  shouldRestoreLayoutOpenLeaf,
} from "./layout-open-leaf-pin.js";
import {
  isForgeCausedGeometrySignal,
  shouldChromeOnlyGeometry,
  shouldRestoreTileSlot,
  LAYOUT_VERIFY_EPSILON_PX,
} from "./layout-sensors.js";
import { COMMAND_ECHO_RESIDUAL_MS, LayoutCommandEpoch } from "./layout-epoch.js";
import {
  ApplyEpoch,
  isApplyEpochLive,
  policyOnDisplaysChangedDuringApply,
  shouldAllowIdleTileRestore,
} from "./layout-apply-epoch.js";
import {
  executeIsolateThrash,
  executeRemovePlaceholder,
  findLiveLayoutPlaceholder,
  findSiblingLayoutPlaceholder,
  isPlaceholderNode,
  isPlaceholderValue,
  layoutPlaceholderMatchesWant,
  pickLayoutPlaceholder,
  PLACEHOLDER_ISOLATE_LAYOUT_REASON,
  PLACEHOLDER_REMOVE_LAYOUT_REASON,
  shouldSkipThrashIsolate,
} from "./layout-placeholder.js";
import { computeOpenMinQuietMs, isFirstOpenOfClass } from "./layout-open.js";
import {
  createDeferredOpenStore,
  hideDeferredActor,
  isDeferredOpen,
  markDeferredOpen,
  rehideDeferredIfNeeded,
  shouldDeferHiddenOpen,
  showDeferredActor,
  takeAllDeferredOpens,
} from "./layout-deferred-open.js";
import {
  fallbackMonitorNode,
  resolveTrackDestId,
  summarizeCensus,
  summarizeCensusEntry,
  untrackedSkipReason,
} from "./window-census.js";
import { windowMetaFields } from "./tree-query.js";
import { sessionLayoutTrace } from "./session-layout-restore.js";
import { LayoutDebugOverlay } from "./layout-debug-overlay.js";
import { LayoutApplyChrome } from "./layout-apply-chrome.js";
import {
  MIN_CLAMP_LEARN_DELAY_MS,
  MIN_CLAMP_LEARN_WAYLAND_EXTRA_MS,
  noteWindowMinFromClamp,
  noteWindowMinFromOversizedFrame,
  frameOverflowsSlotForLearn,
  readWindowMinSize,
  loadClassMinFloor,
  exportClassMinFloor,
  parseWindowMinsJson,
  setClassMinFloorPersist,
  acceptWindowSizeBelowFloor,
} from "./tree-layout.js";
import * as Compat from "./compat.js";
import {
  LftMru,
  aspectOrientationFromRect,
  isTabOrStackParent,
  shouldTabInsteadOfSplit,
  resolveOpenAppPlacement,
  matchPendingDockLaunch,
  monitorIndexFromPoint,
  DOCK_LAUNCH_TTL_MS,
  DOCK_STICKY_GRACE_MS,
} from "./lft-mru.js";
import {
  consumePlaceHint,
  consumeProvisionalPlaceHint,
  enqueuePlaceHint,
  findMatchingPlaceHintIndex,
  formatPlaceHint,
  matchesPlaceHint,
  metaHasPlaceIdentity,
  metaTitle,
  normalizePlaceHint,
  placeHintIdentityReady,
  pruneExpiredPlaceHints,
  resolvePlaceMonitorIndex,
} from "./place-hint.js";
import { parseSelector, matchNodes, matchWindows, pickMatch } from "./tile-select.js";
import * as MonitorIdentity from "./monitor-identity.js";
import { applyOneZoomPerMonitor, isZoomMode, resolveZoomToggle } from "./zoom.js";
import {
  bfsOpenMinTabCandidates,
  resolveOpenMinPlacement,
  resolveTileOverflowPlacement,
  slotOverflowsMins,
  tabJoinUnit,
} from "./open-min-place.js";
import { tryAdjustShareForMins } from "./reconcile.js";

import { logMetricsSession, recordD100Observe, recordFallback } from "./metrics.js";
import {
  buildGeomEpsilonFields,
  createClassEpsilonStore,
  decideNearMissForgiveness,
  edgeDeltas,
  faultInjectObserved,
  frameUndersizedVsCommand,
  getEffectiveClassEpsilon,
  logGeomEpsilonSample,
  commandFingerprint,
} from "./geom-epsilon.js";
import { observeHealAfterSettle } from "./heal-ladder.js";
import { cloneRect } from "./layout-verify.js";
import { mapAdmitWindow } from "./adapter-map-admit.js";
import { moveMetaWindow, moveMetaWindowImpl } from "./adapter-meta-move.js";
import {
  bindWindowSignals as signalsBindWindowSignals,
  paintTitleChromeLabel as signalsPaintTitleChromeLabel,
} from "./adapter-window-signals.js";
import {
  requestLayout as presentIdleRequestLayout,
  freezeRender as presentIdleFreezeRender,
  unfreezeRender as presentIdleUnfreezeRender,
  renderWithFreezeState,
  renderTree as presentIdleRenderTree,
} from "./adapter-present-idle.js";
import {
  openPlaceTrack,
  isDeferredOpen as openPlaceIsDeferredOpen,
  markDeferredOpen as openPlaceMarkDeferredOpen,
  rehideDeferredIfNeeded as openPlaceRehideDeferredIfNeeded,
  releaseDeferredOpen,
  noteDeferredReleaseForSettle,
  releaseAllDeferredOpens,
  releaseDeferredOpens,
  scheduleOpenCommit,
  cancelOpenCommit,
  cancelAllOpenCommits,
  touchOpenCommitExternalGeometry,
  refreshOpenCommitIdentity,
  armOpenCommitTimer,
  fireOpenCommit,
  planOpenAppPlacement,
  placeNext as openPlaceNext,
  clearExpiredPlaceHints,
  tryPlanFromPlaceHint,
  placePlanFromConsumedHint,
  resolvePlaceSlotAttachFromHint,
  ensureMetaOnWorkspace,
  tryAdoptLatePlaceHint,
  consumeLeftoverLayoutPlaceholder,
  applyPlacePlanToExistingWindow,
  scheduleLatePlaceHintMeta,
  resolvePlaceAttachSelector,
  placeSelectCtx,
  decideOpenMinPlacement,
  ensureTabbedForOpen,
  maybeAspectSplitForOpen,
  unknownOpenIdentity,
  resolveInsertUnit,
  hvSlotToJoin,
  slotSplitForInsert as openPlaceSlotSplitForInsert,
  adoptOpenIntoTileSlot,
  applyOpenStickyHome,
  applyDockStickyHome,
  windowsUnderLive,
  lastTileOnMonitor,
  detectDockLaunchMonitor as openPlaceDetectDockLaunchMonitor,
  pointerMonitorIndex,
  emptyTileMonitorIndices,
  resolveAttachTarget,
} from "./adapter-open-place.js";
import {
  updateWindowOverrides as floatUpdateWindowOverrides,
  addModeOverride as floatAddModeOverride,
  removeModeOverride as floatRemoveModeOverride,
  addFloatOverride as floatAddFloatOverride,
  removeFloatOverride as floatRemoveFloatOverride,
  addTileOverride as floatAddTileOverride,
  removeTileOverride as floatRemoveTileOverride,
  toggleFloatingMode as floatToggleFloatingMode,
  forEachFloatNode as floatForEachFloatNode,
  cleanupAlwaysFloat as floatCleanupAlwaysFloat,
  restoreAlwaysFloat as floatRestoreAlwaysFloat,
  reconcileFullscreenFloatDemotion as floatReconcileFullscreenFloatDemotion,
  restoreAllDemotedFloats as floatRestoreAllDemotedFloats,
  withSuppressedAboveHandler as floatWithSuppressedAboveHandler,
  isDialogLike as floatIsDialogLike,
  processFloats as floatProcessFloats,
  applyProcessFloatDecision as floatApplyProcessFloatDecision,
  ensureTiledForSlotPlace as floatEnsureTiledForSlotPlace,
  collectProcessFloatFlags as floatCollectProcessFloatFlags,
  processFloatDecision as floatProcessFloatDecision,
  logFloatDecision as floatLogFloatDecision,
  repositionOccludedDialog as floatRepositionOccludedDialog,
  handleUserAboveChange as floatHandleUserAboveChange,
  wmClassMatches as floatWmClassMatches,
  classifyTileOverrides as floatClassifyTileOverrides,
  matchesFloatRule as floatMatchesFloatRule,
  matchesFloatOverride as floatMatchesFloatOverride,
  matchesSpecificFloatOverride as floatMatchesSpecificFloatOverride,
  isWindowIgnored as floatIsWindowIgnored,
  isFloatingExempt as floatIsFloatingExempt,
  floatExemptReason as floatFloatExemptReason,
} from "./adapter-float.js";
import {
  forgetHostWindow as destroyForgetHostWindow,
  windowDestroy as destroyWindowDestroy,
  captureFocusRestore as destroyCaptureFocusRestore,
  metaWindowId as destroyMetaWindowId,
  findMetaWindowById as destroyFindMetaWindowById,
  restoreFocusAfterWindowClosed as destroyRestoreFocusAfterWindowClosed,
  dropAllIgnoredWindows as destroyDropAllIgnoredWindows,
  dropIfIgnored as destroyDropIfIgnored,
} from "./adapter-destroy.js";
import {
  resize as grabResize,
  expand as grabExpand,
  shrink as grabShrink,
  applyOwningSplit as grabApplyOwningSplit,
  adjustOwningSplitPercents as grabAdjustOwningSplitPercents,
  expandNodeAgainstPair as grabExpandNodeAgainstPair,
  effectivePercent as grabEffectivePercent,
  applyGoldenRatio as grabApplyGoldenRatio,
  goldenRatioAgainstPair as grabGoldenRatioAgainstPair,
  normalizeSiblingPercents as grabNormalizeSiblingPercents,
  pairInitRect as grabPairInitRect,
  applyOwningSplitFromGrab as grabApplyOwningSplitFromGrab,
  handleResizing as grabHandleResizing,
  repositionDuringResize as grabRepositionDuringResize,
} from "./adapter-grab-resize.js";
import {
  onSettingsChanged as settingsOnSettingsChanged,
  handleLayoutModeToggle as settingsHandleLayoutModeToggle,
  syncLayoutVerifyInterval as settingsSyncLayoutVerifyInterval,
} from "./adapter-settings.js";
import {
  queueEvent as lifeQueueEvent,
  bindSignals as lifeBindSignals,
  removeSignals as lifeRemoveSignals,
  trackCurrentMonWs as lifeTrackCurrentMonWs,
  bindWorkspaceSignals as lifeBindWorkspaceSignals,
  disable as lifeDisable,
  enable as lifeEnable,
  reloadTree as lifeReloadTree,
  trackCurrentWindows as lifeTrackCurrentWindows,
} from "./adapter-lifecycle.js";

/** @typedef {import('../../extension.js').default} ForgeExtension */

// Bug #351 fix: Window types that shouldn't be tiled (browser popups, tooltips, etc.)
const INVALID_WINDOW_TYPES = new Set([
  Meta.WindowType.UTILITY,
  Meta.WindowType.POPUP_MENU,
  Meta.WindowType.DROPDOWN_MENU,
  Meta.WindowType.TOOLTIP,
]);

const VALID_WINDOW_TYPES = new Set([
  Meta.WindowType.NORMAL,
  Meta.WindowType.MODAL_DIALOG,
  Meta.WindowType.DIALOG,
]);

export class ForgeAdapterGnome extends GObject.Object {
  static {
    GObject.registerClass(this);
  }

  /** @type {ForgeExtension} */
  ext;

  /** @param {ForgeExtension} ext */
  constructor(ext) {
    super();
    this.ext = ext;
    this.prefsTitle = `Forge ${_("Settings")} - ${
      !production ? "DEV" : ext.metadata["version-name"] ?? "unknown"
    }`;
    this.reloadWindowOverrides();
    // Forest+bag before live ROOT so _initWorkspaces Forest-admit lands on this map.
    this.hostBag = createHostBag();
    this.forest = createEnvelope(() => makeIdFactory().nid());
    this.liveById = new Map();
    this._liveForestSeeded = false;
    this._tree = createLiveTree(this);
    // D095 S6: session per-wm-class ε (near-miss forgiveness).
    this._classGeomEpsilon = createClassEpsilonStore();
    // Owns decoration/border rendering. Decoration methods are signal/render-driven
    // (never invoked during this constructor), so building it here is safe.
    this.decorationManager = new DecorationManager(this._tree, this);
    // Owns the focus/pointer-follow cluster. Constructed BEFORE the pointerLoopInit()
    // call below (which delegates to it when focus-on-hover is enabled), so it must
    // exist by then.
    this.focusManager = new FocusManager(this._tree, this);
    // Owns session-layout save/restore/rehome/shield. Flags stay on this instance
    // for live thrash checks (entered-monitor / monitor-recovery consult them).
    this.sessionLayoutRestore = new SessionLayoutRestoreManager(this._tree, this);
    // Owns workareas settle + monitor-recovery (H1). Thrash/last-good flags stay on WM.
    this.monitorRecovery = new MonitorRecoveryManager(this._tree, this);
    // CL3/SE6: thrash catalog; seed geom minQuiet once from settle-heuristics.
    this.appThrashCatalog = new AppThrashCatalog();
    this._seedThrashCatalogFromSettleHeuristics();
    // Durable class mins load/save on enable (not construct).
    // CL0–CL6: debounced layout/verify (sensor-only) + optional debug interval.
    this.layoutController = new LayoutController(this, {
      catalog: this.appThrashCatalog,
    });
    // AC2: per-window command echo epochs (post-apply residual attribution).
    this.layoutEpoch = new LayoutCommandEpoch();
    this._syncLayoutVerifyInterval();
    // CL4 / L8: per-window open quiet → one layout commit (open = batch N=1).
    /** Injectable for unit tests (installOpenFakeClock). */
    this._openCommitSchedule = glibSchedule;
    this._openCommitCancel = glibCancel;
    this._openCommit = new OpenCommitManager({
      schedule: (delayMs, cb) => this._openCommitSchedule(delayMs, cb),
      cancel: (id) => this._openCommitCancel(id),
      onFire: (mw) => this._fireOpenCommit(mw),
    });
    // L1 W1: WM-global timers (queue, renderTree, settle, …). cancelAll on disable;
    // do not dispose (bag lives across enable cycles like open-commit).
    /** Injectable for unit tests. */
    this._wmSchedule = glibSchedule;
    this._wmCancel = glibCancel;
    this._wmScheduleIdle = glibIdleSchedule;
    this._wmSources = new SourceBag({
      label: "wm",
      schedule: (delayMs, cb) => this._wmSchedule(delayMs, cb),
      cancel: (id) => this._wmCancel(id),
      scheduleIdle: (cb) => this._wmScheduleIdle(cb),
    });
    // W5: WM-global GObject signals (display/wm/wsm/settings/overview).
    // disconnectAll on disable; do not dispose (re-bind on enable).
    this._wmSignals = new SignalBag({ label: "wm" });
    // L4 W2: per-window Lifetime bags (Wayland stack-pin slot "stack", …).
    // dispose(mw) on unmanaged; disposeAll on disable. Reuses WM inject.
    this._windowAttach = new WindowAttach({
      label: "wm-window",
      schedule: (delayMs, cb) => this._wmSchedule(delayMs, cb),
      cancel: (id) => this._wmCancel(id),
      scheduleIdle: (cb) => this._wmScheduleIdle(cb),
    });
    // CL5 / L11: multi-open layout batch depth + deferred-commit latch.
    this._layoutBatch = new LayoutBatchDepth();
    // Layout focus pins: CON → { meta, until } open leaf (Chrome late activate).
    /** @type {WeakMap<object, { meta: object, until: number }>} */
    this._layoutOpenLeafPins = new WeakMap();
    // CL8: will-tile maps during LayoutBatch stay FLOAT+hidden until release.
    this._deferredOpenStore = createDeferredOpenStore();
    // Owns grab-tile / drag-drop. grabOp, _draggedNodeWindow, freeze stay on WM.
    this.dragDrop = new DragDropManager(this._tree, this);
    this.layoutDebugOverlay = new LayoutDebugOverlay(this);
    // CL10: optional LayoutBatch dim scrim (default off; hard-clears ≤8s).
    this.layoutApplyChrome = new LayoutApplyChrome(this);
    this.eventQueue = new Queue();
    this.theme = this.ext.theme;
    this.lastFocusedWindow = null;
    // FC2: after explicit unfocus, skip hover-refocus of this Meta until pointer leaves.
    this._unfocusHoverSuppressMeta = null;
    // OP1: global + per-monitor last-focused-tile MRU (floats never enter).
    this.lftMru = new LftMru();
    /** @type {Array<{ monitor: number, appId?: string|null, ts: number }>} */
    this._pendingDockLaunches = [];
    /** @type {import('./place-hint.js').PlaceHint[]} FC2 PlaceNext one-shots */
    this._pendingPlaceHints = [];
    this._dockLaunchHooked = false;
    this.shouldFocusOnHover = this.ext.settings.get_boolean("focus-on-hover-enabled");

    this._commandHandler = new CommandHandler(this);

    // Last quiet placement per Meta.Window (monitor index + frame) for monitor-recovery.
    this._lastGoodHomes = new WeakMap();
    // R016: last quiet workareas fingerprint (no-op short-circuit).
    this._lastQuietWorkareasFp = null;
    this._workareasThrashPending = false;
    /** @type {number} monotonic µs — suppress entered-monitor after display settle */
    this._displayReconfigGraceUntilUs = 0;
    // unlock-dialog: tree stays loaded; Meta/DPMS thrash must not monitor-recovery.
    this._sessionLocked = false;
    // Lock + post-unlock until first workareas settle: freeze present/chrome/ε.
    this._hostPresentHold = false;
    // After unlock, use longer workareas settle (colord / dual-head probe).
    this._unlockWorkareasSettleBoost = false;
    // Session restore: suppress entered-monitor rehome; monitor-recovery defers until clear.
    this._sessionLayoutRestoring = false;
    // L5: nestable suppress (throw-safe). Readers must use `.active` (object is always truthy).
    this._suppressRehome = new SuppressFlag({ label: "rehome" });
    this._suppressGeom = new SuppressFlag({ label: "geom" });
    this._suppressAbove = new SuppressFlag({ label: "above" });
    // CT1: skeleton→bind wave; suppress entered-monitor rehome until binds settle.
    this._layoutBindPending = false;
    // ApplyEpoch (D039): desired forest owns mon/TILE home while ApplyLayout is live.
    this._applyEpoch = new ApplyEpoch();
    /** @type {((code: string) => void)|null} cancel hook from session-api */
    this._applyEpochCancelHook = null;
    // After restore: hold liveForest so thrash monitor-recovery cannot snapshot a broken tree.
    this._sessionLayoutShield = null;
    // T7: stableKey ↔ index map (refreshed on settle / monitors-changed).
    this._monitorLiveMap = null;
    this._monitorLiveMapPrevFingerprints = null;
    this._layoutMonitorsChangedId = 0;

    Logger.info("forge initialized");

    if (this.shouldFocusOnHover) {
      // Start the pointer loop to observe the pointer position
      // and change the focus window accordingly
      this.pointerLoopInit();
    }
  }

  pointerLoopInit() {
    return this.focusManager.pointerLoopInit();
  }

  /**
   * Load window overrides, apply an update function, then save.
   * @param {Function} updateFn - Receives (overrides, wmClass, wmId), returns updated overrides
   * @param {Meta.Window} metaWindow
   * @param {boolean} withWmId
   */
  _updateWindowOverrides(updateFn, metaWindow, withWmId) {
    return floatUpdateWindowOverrides(this, updateFn, metaWindow, withWmId);
  }

  // Add a {wmClass, [wmId], mode} override for this window, de-duping against an
  // existing same-mode rule. Per-window (withWmId) and class-wide (!withWmId)
  // rules are kept distinct (Bug #172/#453).
  _addModeOverride(metaWindow, withWmId, mode) {
    return floatAddModeOverride(this, metaWindow, withWmId, mode);
  }

  // Remove the {wmClass, [wmId], mode} overrides Forge writes for this window.
  // Title-bearing rules are user-authored and persistent, so they are left
  // alone; a per-window remove (withWmId) leaves class-wide rules intact (#172).
  _removeModeOverride(metaWindow, withWmId, mode) {
    return floatRemoveModeOverride(this, metaWindow, withWmId, mode);
  }

  addFloatOverride(metaWindow, withWmId) {
    return floatAddFloatOverride(this, metaWindow, withWmId);
  }

  removeFloatOverride(metaWindow, withWmId) {
    return floatRemoveFloatOverride(this, metaWindow, withWmId);
  }

  addTileOverride(metaWindow, withWmId) {
    return floatAddTileOverride(this, metaWindow, withWmId);
  }

  removeTileOverride(metaWindow, withWmId) {
    return floatRemoveTileOverride(this, metaWindow, withWmId);
  }

  toggleFloatingMode(action, metaWindow) {
    return floatToggleFloatingMode(this, action, metaWindow);
  }

  queueEvent(eventObj, interval = 220) {
    return lifeQueueEvent(this, eventObj, interval);
  }

  /**
   * This is the central place to bind all the non-window signals.
   */
  _bindSignals() {
    return lifeBindSignals(this);
  }

  /**
   * ApplyLayout start: home authority = desired forest (D039).
   * Drops deferred entered-monitor rehomes (no flush).
   * @param {object|null|undefined} [run]
   */
  beginApplyEpoch(run) {
    Logger.debug(
      `ApplyEpoch begin applyId=${run?.applyId || "?"} ws=${run?.workspace ?? "?"} name=${
        run?.name || "-"
      }`
    );
    this._applyEpoch.begin(run);
    this._dropPendingEnteredMonitorRehomes();
    return this._applyEpoch;
  }

  /**
   * ApplyLayout Done/cancel: release home authority; drop deferred rehomes.
   * @param {object|null|undefined} [run]
   */
  endApplyEpoch(run) {
    Logger.debug(`ApplyEpoch end applyId=${run?.applyId || "?"}`);
    this._applyEpoch.end(run);
    this._dropPendingEnteredMonitorRehomes();
    return this._applyEpoch;
  }

  /** @returns {boolean} */
  isApplyEpochLive() {
    return isApplyEpochLive(this._applyEpoch);
  }

  /**
   * Session-api wires bag.cancel with displays-changed code.
   * @param {((code: string) => void)|null|undefined} fn
   */
  setApplyEpochCancelHook(fn) {
    this._applyEpochCancelHook = typeof fn === "function" ? fn : null;
  }

  /**
   * Workareas / monitors-changed while ApplyEpoch live → cancel apply; skip H1.
   * @returns {{ cancelApply: boolean, code: string|null, skipH1: boolean }}
   */
  notifyDisplaysChangedDuringApply() {
    const policy = policyOnDisplaysChangedDuringApply(this._applyEpoch);
    if (policy.cancelApply && policy.code) {
      try {
        this._applyEpochCancelHook?.(policy.code);
      } catch (e) {
        Logger.warn(`ApplyEpoch displays-changed cancel: ${e}`);
      }
    }
    return policy;
  }

  /** Cancel coalesced entered-monitor rehomes without applying them. */
  _dropPendingEnteredMonitorRehomes() {
    this._pendingEnteredMons = null;
    try {
      this._wmSources?.cancel?.("enteredMonRehome");
    } catch (_e) {
      /* */
    }
  }

  /**
   * D100: observe only. Idle entered-monitor must not rehome (dual-tree paper).
   */
  _onWindowEnteredMonitor(_display, monitor, metaWindow) {
    let id = "-";
    try {
      id =
        metaWindow && typeof metaWindow.get_id === "function" ? String(metaWindow.get_id()) : "-";
    } catch (_e) {
      id = "-";
    }
    recordD100Observe("entered-monitor", { dest: monitor, id });
  }

  /**
   * Apply deferred entered-monitor rehomes unless thrash / display reconfig armed.
   * @private
   */
  _flushDeferredEnteredMonitorRehomes() {
    const pending = this._pendingEnteredMons;
    this._pendingEnteredMons = null;
    if (!pending || pending.size === 0) return;
    if (
      this._sessionLocked ||
      this._workareasThrashPending ||
      this._sessionLayoutRestoring ||
      this._suppressRehome.active ||
      this._layoutBindPending ||
      this.isApplyEpochLive() ||
      this._openLayoutBatchDepth > 0 ||
      this._sessionLayoutShieldActive() ||
      this.monitorRecovery.inDisplayReconfigGrace()
    ) {
      return;
    }
    if (this.monitorRecovery.displayGeometryChangedFromQuiet()) {
      Logger.trace("entered-monitor flush skip reason=geom-changed");
      this._queueMonitorRecoveryOnWorkareas();
      return;
    }
    Logger.debug(`entered-monitor flush n=${pending.size}`);
    for (const [metaWindow, monitor] of pending) {
      if (!metaWindow) continue;
      if (this._isGrabTileDragWindow(metaWindow)) continue;
      try {
        Logger.trace(`entered-monitor rehome dest=${monitor}`);
        this.updateMetaWorkspaceMonitor("window-entered-monitor", monitor, metaWindow);
      } catch (e) {
        Logger.debug(`entered-monitor deferred rehome: ${e}`);
      }
    }
    this.trackCurrentMonWs();
  }

  /** @param {Meta.Window|null|undefined} metaWindow */
  _isGrabTileDragWindow(metaWindow) {
    if (!metaWindow) return false;
    if (this._draggedNodeWindow?.nodeValue === metaWindow) return true;
    const node = this.findNodeWindow(metaWindow);
    if (!node) return false;
    if (typeof node.isGrabTile === "function" && node.isGrabTile()) return true;
    return node.mode === WINDOW_MODES.GRAB_TILE;
  }

  /** @returns {boolean} */
  _sessionLayoutShieldActive() {
    return this.sessionLayoutRestore.sessionLayoutShieldActive();
  }

  /**
   * Re-apply the post-install restored forest (Meta mon + tree + last-good seed).
   * Used while the shield is active so monitor-recovery cannot freeze a thrash snapshot.
   * @returns {boolean}
   */
  _reapplySessionLayoutShield(from = "session-layout-shield") {
    return this.sessionLayoutRestore.reapplySessionLayoutShield(from);
  }

  /** unlock-dialog entered — arm lock forest shield. */
  onSessionLocked() {
    return this.sessionLayoutRestore.onSessionLocked();
  }

  /** user session after lock — short shield + settle. */
  onSessionUnlocked() {
    return this.sessionLayoutRestore.onSessionUnlocked();
  }

  /** @param {{ monitors?: any[] }} liveForest @param {string} tag */
  _traceSessionLayoutHomes(liveForest, tag) {
    return this.sessionLayoutRestore.traceSessionLayoutHomes(liveForest, tag);
  }

  /**
   * Handle the display's "workareas-changed" signal. The monitor-count guard keeps
   * windows attached to the tree during transient monitor loss (KVM switch, lock).
   * Geometry thrash (blank/wake) is debounced into monitor-recovery so windows are not
   * permanently piled onto the primary when both heads return.
   */
  _onWorkareasChanged(_display) {
    if (global.display.get_n_monitors() == 0) {
      Logger.debug(`workareas-changed: no monitors, ignoring signal`);
      return;
    }
    // Consume the flags unconditionally: a workspace change on an EMPTY tree
    // must not leave them set, or the next unrelated workareas-changed (dock
    // autohide, strut change) takes the expensive re-track branch instead of
    // a plain re-render.
    const needsRetrack = this.workspaceAdded || this.workspaceRemoved;
    this.workspaceAdded = false;
    this.workspaceRemoved = false;
    if (this.tree.getNodeByType("WINDOW").length > 0) {
      if (needsRetrack) {
        this.trackCurrentWindows();
      } else {
        this._queueMonitorRecoveryOnWorkareas();
      }
    }
  }

  /** Debounce workareas thrash, then monitor-recovery once geometries settle. */
  _queueMonitorRecoveryOnWorkareas() {
    return this.monitorRecovery.queueMonitorRecoveryOnWorkareas();
  }

  /**
   * Restore windows to last-good monitors after workareas settle (H1).
   * Body lives on MonitorRecoveryManager; thin wrapper keeps spies/tests on WM.
   */
  _recoverAfterWorkareas() {
    return this.monitorRecovery.recoverAfterWorkareas();
  }

  /**
   * Align monitor-recovery targets for outermost STACKED/TABBED groups (majority mon).
   * @param {Map<object, number>} targets
   * @param {number} nMonitors
   */
  _alignMonitorRecoveryGroupTargets(targets, nMonitors) {
    return this.monitorRecovery.alignMonitorRecoveryGroupTargets(targets, nMonitors);
  }

  /**
   * Pick monitor index for a window during monitor-recovery.
   * @param {object} wNode
   * @param {object[]} geometries
   * @param {number} nMonitors
   */
  _resolveMonitorRecoveryMonitor(wNode, geometries, nMonitors) {
    return this.monitorRecovery.resolveMonitorRecoveryMonitor(wNode, geometries, nMonitors);
  }

  /** Record last quiet monitor + frame for each live window (used after thrash). */
  _snapshotLastGoodHomes() {
    return this.monitorRecovery.snapshotLastGoodHomes();
  }

  /**
   * Iterate the live FLOAT windows in the tree. Centralizes the mode filter and
   * the Utils.isWindowAlive() probe (forge-h7ba) so the always-on-top pin/unpin
   * paths can't throw on a finalized Meta.Window wrapper mid-forEach and leave
   * the remaining floats mis-pinned.
   */
  _forEachFloatNode(fn) {
    return floatForEachFloatNode(this, fn);
  }

  cleanupAlwaysFloat() {
    return floatCleanupAlwaysFloat(this);
  }

  restoreAlwaysFloat() {
    return floatRestoreAlwaysFloat(this);
  }

  /**
   * forge-zo4 (#460): when a window goes fullscreen, Forge-pinned always-on-top
   * floats on the SAME monitor must drop below it instead of rendering over the
   * fullscreen surface. Recomputed from scratch on every (arg-less, infrequent)
   * in-fullscreen-changed, so no persistent per-monitor count is kept — the
   * per-node `_aboveDemotedForFullscreen` flag carries the "restore me once my
   * monitor has no fullscreen window" intent. Mirrors cleanupAlwaysFloat's
   * dialog/transient exclusion and only ever touches floats Forge itself pinned.
   */
  _reconcileFullscreenFloatDemotion() {
    return floatReconcileFullscreenFloatDemotion(this);
  }

  /** forge-zo4: re-pin every float Forge demoted for a fullscreen window. */
  _restoreAllDemotedFloats() {
    return floatRestoreAllDemotedFloats(this);
  }

  /**
   * forge-zo4: run `fn` while suppressing _handleUserAboveChange so Forge's own
   * make_above/unmake_above (which emit notify::above) are not mistaken for the
   * user toggling "Always on Top".
   */
  _withSuppressedAboveHandler(fn) {
    return floatWithSuppressedAboveHandler(this, fn);
  }

  /** forge-zo4: dialogs/transients are always-above by design — never demote them. */
  _isDialogLike(metaWindow) {
    return floatIsDialogLike(this, metaWindow);
  }

  /**
   * Snapshot sortedWindows for drag-target resolution.
   * All TILE windows on the **active workspace** (every monitor) are eligible
   * drop targets so cross-monitor DnD can hit + paint. Dragged / GRAB_TILE /
   * FLOAT excluded. Call again from _handleMoving so targets stay live when
   * the pointer crosses heads (do not gate on get_current_monitor()).
   * @param {any} [forWindow] Prefer this Meta.Window when focus lags (tab grab).
   */
  trackCurrentMonWs(forWindow = null) {
    return lifeTrackCurrentMonWs(this, forWindow);
  }

  /**
   * Bind signals to a workspace for window tracking.
   * Delegates to WorkspaceManager.
   * @param {Meta.Workspace} metaWorkspace - The workspace to bind signals to
   */
  bindWorkspaceSignals(metaWorkspace) {
    return lifeBindWorkspaceSignals(this, metaWorkspace);
  }

  /**
   * Execute a command action.
   * Delegates to CommandHandler.
   * @param {Object} action - The action to execute
   */
  command(action) {
    this._commandHandler.execute(action);
  }

  resize(grabOp, amount) {
    return grabResize(this, grabOp, amount);
  }

  /**
   * Grow/shrink the focused tile on both axes (REG-expand-dual-axis).
   * Two owning-split steps — H then V. Missing axis is a no-op.
   *
   * @param {number} amount - pixels to grow each affected edge by (negative shrinks).
   */
  expand(amount) {
    return grabExpand(this, amount);
  }

  /** forge-gm0z: WindowShrink is WindowExpand with a negative amount. */
  shrink(amount) {
    return grabShrink(this, amount);
  }

  /**
   * I3: resolve owning split for `(unit, axis|edge)` and debit pair percents.
   * @param {object} unit
   * @param {string|number} axisOrEdge
   * @param {number} deltaPx
   * @param {{ direction?: string|number }} [opts]
   * @returns {boolean}
   */
  applyOwningSplit(unit, axisOrEdge, deltaPx, opts = {}) {
    return grabApplyOwningSplit(this, unit, axisOrEdge, deltaPx, opts);
  }

  _adjustOwningSplitPercents(resolved, deltaPx) {
    return grabAdjustOwningSplitPercents(this, resolved, deltaPx);
  }

  /**
   * Grow `node`'s layout unit on its parent axis via applyOwningSplit.
   * @returns {boolean}
   */
  _expandNodeAgainstPair(node, deltaPx) {
    return grabExpandNodeAgainstPair(this, node, deltaPx);
  }

  /**
   * forge-gm0z: a node's share of its parent split. Prefer the stored percent;
   * fall back to its current rect proportion (as _normalizeSiblingPercents does)
   * so expand works even before any manual resize has set an explicit percent.
   */
  _effectivePercent(node, orientation, parentSize) {
    return grabEffectivePercent(node, orientation, parentSize);
  }

  /**
   * forge-zlg: resize the focused tiled window to the golden-ratio share of its
   * split, on demand. Unlike expand()/shrink() (a pixel delta applied on both
   * axes), this sets an ABSOLUTE ratio on a SINGLE axis — golden ratio is a
   * statement about one split, and a two-axis pass would compound to ~0.382 in
   * nested layouts. No-op (no render) when there is no focused tiled window.
   */
  applyGoldenRatio() {
    return grabApplyGoldenRatio(this);
  }

  /**
   * forge-zlg: give `node` the golden share of the space it shares with its split
   * pair, debiting the pair — mirroring _expandNodeAgainstPair() (same guards and
   * pair-selection) but absolute instead of incremental.
   */
  _goldenRatioAgainstPair(node) {
    return grabGoldenRatioAgainstPair(this, node);
  }

  disable() {
    return lifeDisable(this);
  }

  enable() {
    return lifeEnable(this);
  }

  /**
   * SE6: load settle-heuristics.json once into thrash catalog (geom minQuiet).
   * No write path here — CLI flushes after top-level layout apply.
   */
  _seedThrashCatalogFromSettleHeuristics() {
    try {
      const path = GLib.build_filenamev([forgeConfigDir(), "settle-heuristics.json"]);
      const file = Gio.File.new_for_path(path);
      if (!file.query_exists(null)) return;
      const [, bytes] = file.load_contents(null);
      const text = new TextDecoder().decode(bytes);
      const store = parseSettleHeuristicsJson(text);
      if (!store) return;
      const n = this.appThrashCatalog?.applySettleHeuristicsStore?.(store) ?? 0;
      if (n > 0) {
        Logger.debug(`app-thrash-catalog: seeded ${n} geom entries from settle-heuristics`);
      }
    } catch (e) {
      Logger.debug(`app-thrash-catalog: settle-heuristics seed skipped: ${e}`);
    }
  }

  /** Load window-mins.json into class floor (Wayland open-min / DnD red zones). */
  _seedClassMinFloorFromDisk() {
    try {
      const path = GLib.build_filenamev([forgeConfigDir(), "window-mins.json"]);
      const file = Gio.File.new_for_path(path);
      if (!file.query_exists(null)) return;
      const [, bytes] = file.load_contents(null);
      const text = new TextDecoder().decode(bytes);
      const classes = parseWindowMinsJson(text);
      if (classes) loadClassMinFloor(classes);
    } catch (e) {
      Logger.debug(`window-mins: load skipped: ${e}`);
    }
  }

  /**
   * @param {Record<string, { width: number, height: number }>} map
   */
  _persistClassMinFloor(map) {
    try {
      const dir = forgeConfigDir();
      GLib.mkdir_with_parents(dir, 0o755);
      const path = GLib.build_filenamev([dir, "window-mins.json"]);
      const body = JSON.stringify({ v: 1, classes: map || exportClassMinFloor() }, null, 2);
      Gio.File.new_for_path(path).replace_contents(
        new TextEncoder().encode(body),
        null,
        false,
        Gio.FileCreateFlags.REPLACE_DESTINATION,
        null
      );
    } catch (e) {
      Logger.debug(`window-mins: save skipped: ${e}`);
    }
  }

  /**
   * CL6: apply `layout-verify-interval-ms` (0 = off) to LayoutController.
   */
  _syncLayoutVerifyInterval() {
    return settingsSyncLayoutVerifyInterval(this);
  }

  /**
   * Current stableKey ↔ monitor index map (T7). May be null before first refresh.
   * @returns {import('./monitor-identity.js').LiveMap|null}
   */
  getMonitorLiveMap() {
    return this._monitorLiveMap;
  }

  /**
   * Rebuild monitor identity map from live Mutter/Shell fields.
   * Keeps previous fingerprints for remapIndex across thrash.
   */
  _refreshMonitorIdentityMap() {
    let layoutMonitors = null;
    try {
      layoutMonitors = Main.layoutManager?.monitors ?? null;
    } catch (_e) {
      layoutMonitors = null;
    }
    const infos = this.tree?.monitorManager?.collectLiveMonitorsInfo?.(layoutMonitors) ?? [];
    if (this._monitorLiveMap?.fingerprints?.length) {
      this._monitorLiveMapPrevFingerprints = this._monitorLiveMap.fingerprints;
    }
    this._monitorLiveMap = MonitorIdentity.buildLiveMap(infos);
    const remaps = MonitorIdentity.listIndexRemaps(
      this._monitorLiveMapPrevFingerprints,
      this._monitorLiveMap
    );
    if (remaps.length) {
      const summary = remaps.map((r) => `${r.from}→${r.to}:${r.stableKey}`).join(",");
      Logger.trace(`monitor-identity remap n=${remaps.length} ${summary}`, {
        fields: { remaps },
      });
    } else {
      Logger.trace(`monitor-identity refresh n=${this._monitorLiveMap?.fingerprints?.length ?? 0}`);
    }
  }

  /**
   * layoutManager::monitors-changed → refresh identity + arm workareas settle.
   * R017: arms thrash-pending early so deferred entered-monitor rehomes abort.
   */
  _bindLayoutMonitorsChanged() {
    if (this._layoutMonitorsChangedId) return;
    try {
      if (!Main.layoutManager?.connect) return;
      this._layoutMonitorsChangedId = Main.layoutManager.connect("monitors-changed", () => {
        this._refreshMonitorIdentityMap();
        // Always queue: shouldSkipWorkareasAsNoop short-circuits true no-ops.
        // Early arm suppresses entered-monitor during scale/mode reconfig.
        try {
          this._queueMonitorRecoveryOnWorkareas();
        } catch (_e) {
          /* ignore */
        }
      });
    } catch (_e) {
      this._layoutMonitorsChangedId = 0;
    }
  }

  _unbindLayoutMonitorsChanged() {
    if (!this._layoutMonitorsChangedId) return;
    try {
      Main.layoutManager?.disconnect?.(this._layoutMonitorsChangedId);
    } catch (_e) {
      /* ignore */
    }
    this._layoutMonitorsChangedId = 0;
  }

  findNodeWindow(metaWindow) {
    if (!metaWindow) return null;
    const fromBag = liveWindowFromMeta(this, metaWindow);
    if (fromBag) return fromBag;
    return this.tree.findNode(metaWindow);
  }

  get focusMetaWindow() {
    return global.display.get_focus_window();
  }

  get tree() {
    if (!this._tree) {
      // Forest+bag before live ROOT so _initWorkspaces can Forest-admit spine (G3).
      if (!this.hostBag) this.hostBag = createHostBag();
      if (!this.forest) {
        this.forest = createEnvelope(() => makeIdFactory().nid());
        this.liveById = new Map();
        this._liveForestSeeded = false;
      }
      this._tree = createLiveTree(this);
    }
    return this._tree;
  }

  get kbd() {
    // forge-3jx9: resolve live. The extension constructs ForgeAdapterGnome before
    // Keybindings, so snapshotting this.ext.keybindings in the constructor froze
    // an undefined value forever, making allowDragDropTile() throw on every drag.
    return this.ext.keybindings;
  }

  get windowsActiveWorkspace() {
    let wsManager = global.workspace_manager;
    return global.display.get_tab_list(Meta.TabList.NORMAL_ALL, wsManager.get_active_workspace());
  }

  get windowsAllWorkspaces() {
    let wsManager = global.workspace_manager;
    let windowsAll = [];

    for (let i = 0; i < wsManager.get_n_workspaces(); i++) {
      windowsAll.push(
        ...global.display.get_tab_list(Meta.TabList.NORMAL_ALL, wsManager.get_workspace_by_index(i))
      );
    }
    windowsAll.sort((w1, w2) => {
      return w1.get_stable_sequence() - w2.get_stable_sequence();
    });
    return windowsAll;
  }

  getWindowsOnWorkspace(workspaceIndex) {
    const workspaceNode = this.tree.findNode(`ws${workspaceIndex}`);
    const workspaceWindows = workspaceNode.getNodeByType(NODE_TYPES.WINDOW);
    return workspaceWindows;
  }

  _handleLayoutModeToggle(settingName, layoutType) {
    return settingsHandleLayoutModeToggle(this, settingName, layoutType);
  }

  determineSplitLayout() {
    // if the monitor width is less than height, the monitor could be vertical orientation;
    let monitorRect = global.display.get_monitor_geometry(global.display.get_current_monitor());
    if (monitorRect.width < monitorRect.height) {
      return LAYOUT_TYPES.VSPLIT;
    }
    return LAYOUT_TYPES.HSPLIT;
  }

  /**
   * Bug #311 fix: Determine split layout based on a given rect's dimensions
   * For nested splits, use the container's available space instead of monitor dimensions.
   * @param {Object} rect - Rectangle with width and height properties
   * @returns {string} LAYOUT_TYPES.VSPLIT or LAYOUT_TYPES.HSPLIT
   */
  determineSplitLayoutForRect(rect) {
    if (!rect) return this.determineSplitLayout();
    if (rect.width < rect.height) {
      return LAYOUT_TYPES.VSPLIT;
    }
    return LAYOUT_TYPES.HSPLIT;
  }

  /**
   * Apply default layout to a container after creation
   * Called after tree.split() to set tabbed/stacked if configured
   */
  applyDefaultLayoutToContainer(container) {
    if (!container) return;
    const defaultLayout = this.ext.settings.get_string("default-window-layout");
    if (defaultLayout === "tabbed" && this.ext.settings.get_boolean("tabbed-tiling-mode-enabled")) {
      this.tree.setLayout(container, LAYOUT_TYPES.TABBED);
    } else if (
      defaultLayout === "stacked" &&
      this.ext.settings.get_boolean("stacked-tiling-mode-enabled")
    ) {
      this.tree.setLayout(container, LAYOUT_TYPES.STACKED);
    }
  }

  floatWorkspace(workspaceIndex) {
    const workspaceWindows = this.getWindowsOnWorkspace(workspaceIndex);
    if (!workspaceWindows) return;
    workspaceWindows.forEach((w) => {
      w.float = true;
    });
  }

  unfloatWorkspace(workspaceIndex) {
    const workspaceWindows = this.getWindowsOnWorkspace(workspaceIndex);
    if (!workspaceWindows) return;
    workspaceWindows.forEach((w) => {
      w.tile = true;
    });
  }

  /**
   * Presentation zoom (D030). Any current zoomMode + any chord clears.
   * @param {"full"|"horizontal"|"vertical"} mode
   */
  toggleZoom(mode) {
    const node = this.findNodeWindow(this.focusMetaWindow);
    if (!node || node.mode !== WINDOW_MODES.TILE) return;
    const next = resolveZoomToggle(node.zoomMode, mode);
    if (next) {
      const mon = this.tree.findAncestorMonitor(node);
      const peers = this._tiledWindowsOnMonitor(mon);
      if (!peers.includes(node)) peers.push(node);
      applyOneZoomPerMonitor(peers, node, next);
    } else {
      node.zoomMode = null;
    }
    this.commitLayout("zoom", { force: true });
  }

  hideActorBorder(...a) {
    return this.decorationManager.hideActorBorder(...a);
  }

  hideWindowBorders(...a) {
    return this.decorationManager.hideWindowBorders(...a);
  }

  // Window movement API
  // Bug #224 fix: Align dimension to buffer scale (for Wayland HiDPI)
  _alignToBufferScale(value, scale = 2) {
    return Math.round(value / scale) * scale;
  }

  // Bug #1: getWorkAreaSafe() returns the window's CURRENT monitor's work area,
  // so clamping a cross-monitor destination rect against it snaps the window back
  // onto the source monitor. Resolve the work area from the TARGET rect's monitor
  // instead. Falls back to the current-monitor work area when the per-rect APIs
  // are unavailable (keeps single-monitor behavior unchanged).
  _resolveTargetWorkArea(metaWindow, rect, workArea) {
    if (workArea) return workArea;
    try {
      const monitorIdx = this._monitorIndexForRect(rect);
      if (monitorIdx >= 0) {
        const ws = global.workspace_manager?.get_active_workspace?.();
        const wa = ws?.get_work_area_for_monitor?.(monitorIdx);
        if (wa) return wa;
      }
    } catch (e) {
      // fall through to the current-monitor work area
    }
    return Utils.getWorkAreaSafe(metaWindow);
  }

  /**
   * Monitor that owns most of `rect` (center sample). -1 if unknown.
   * @param {{ x: number, y: number, width: number, height: number }|null|undefined} rect
   * @returns {number}
   */
  _monitorIndexForRect(rect) {
    if (!rect) return -1;
    try {
      const idx = global.display?.get_monitor_index_for_rect?.(rect);
      if (typeof idx === "number" && idx >= 0) return idx;
    } catch (_e) {
      /* fall through */
    }
    try {
      const n = global.display?.get_n_monitors?.() ?? 0;
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      for (let i = 0; i < n; i++) {
        const g = global.display.get_monitor_geometry(i);
        if (!g) continue;
        if (cx >= g.x && cx < g.x + g.width && cy >= g.y && cy < g.y + g.height) {
          return i;
        }
      }
    } catch (_e) {
      /* ignore */
    }
    return -1;
  }

  move(metaWindow, rect, workArea = null, { skipOffscreenClamp = false, force = false } = {}) {
    moveMetaWindow(this, metaWindow, rect, workArea, { skipOffscreenClamp, force });
  }

  /**
   * Geometry commit body for move(); callers use move() for suppress wrap.
   * @returns {boolean} true when move_resize_frame was issued
   */
  _moveImpl(metaWindow, rect, workArea = null, { skipOffscreenClamp = false, force = false } = {}) {
    return moveMetaWindowImpl(this, metaWindow, rect, workArea, {
      skipOffscreenClamp,
      force,
    });
  }

  /**
   * Update host-bag window model (D095 S2). Replace whole rect objects.
   * @param {string|undefined} bagId
   * @param {{ desiredRect?: object|null, observed?: object|null, commanded?: object|null, desiredChanged?: boolean }} patch
   */
  _settleHostBagGeometry(bagId, patch) {
    if (!bagId || !this.hostBag?.has?.(bagId)) return;
    const prev = this.hostBag.get(bagId);
    /** @type {Partial<import("../host/bag.js").HostBagEntry>} */
    const next = {};
    if (patch?.desiredRect) {
      next.desiredRect = cloneRect(patch.desiredRect);
    }
    if (patch?.observed) {
      next.observed = cloneRect(patch.observed);
    }
    if (patch?.commanded) {
      next.commanded = cloneRect(patch.commanded);
    }
    if (patch?.desiredChanged) {
      const prevGen = typeof prev?.slotGen === "number" ? prev.slotGen : 0;
      next.slotGen = prevGen + 1;
    } else if (prev?.slotGen == null && patch?.desiredRect) {
      next.slotGen = 0;
    }
    if (Object.keys(next).length === 0) return;
    this.hostBag.set(bagId, next);
  }

  /**
   * @param {any} metaWindow
   * @returns {{ windowId: string, wmClass: string }}
   */
  _geomEpsilonIdentity(metaWindow) {
    let windowId = "-";
    let wmClass = "-";
    try {
      if (typeof metaWindow?.get_id === "function") windowId = String(metaWindow.get_id());
    } catch (_e) {
      /* ignore */
    }
    try {
      if (typeof metaWindow?.get_wm_class === "function") {
        wmClass = metaWindow.get_wm_class() || "-";
      }
    } catch (_e) {
      /* ignore */
    }
    return { windowId, wmClass };
  }

  /** @returns {boolean} */
  _faultInjectGeometryEnabled() {
    try {
      return hasDevMode(this.ext?.settings, "fault-inject-geometry");
    } catch (_e) {
      return false;
    }
  }

  /**
   * D095: log sent vs observed (S1) using effective class ε (S6).
   * @param {any} metaWindow
   * @param {{ phase: string, sent: object, observed?: object|null, knownMin?: object|null, wrote?: boolean, level?: string, epsilon?: number }} opts
   */
  _logGeomEpsilon(metaWindow, opts) {
    try {
      const { windowId, wmClass } = this._geomEpsilonIdentity(metaWindow);
      const eps =
        typeof opts?.epsilon === "number" && Number.isFinite(opts.epsilon)
          ? opts.epsilon
          : getEffectiveClassEpsilon(this._classGeomEpsilon, wmClass, windowId);
      const fields = buildGeomEpsilonFields({
        phase: opts?.phase,
        sent: opts?.sent,
        observed: opts?.observed,
        knownMin: opts?.knownMin,
        wrote: opts?.wrote,
        windowId,
        wmClass,
        epsilon: eps,
      });
      if (opts?.level === "trace") {
        Logger.trace(
          `geom-epsilon phase=${fields.phase} tag=${fields.tag} dMax=${fields.dMax ?? "-"}`,
          { fields }
        );
        return;
      }
      logGeomEpsilonSample(fields);
    } catch (_e) {
      /* ignore */
    }
  }

  /**
   * Delayed observe after move_resize (Mutter often clamps async).
   * S6: near-miss → adjusted retry / class ε bump; fault-inject lies near.
   * @param {any} metaWindow
   * @param {{ x:number, y:number, width:number, height:number }} sent
   * @param {{ width?: number, height?: number }|null|undefined} knownMin
   * @param {string|undefined} [bagId]
   * @param {{ expectRect?: object, workArea?: object|null, skipOffscreenClamp?: boolean }} [ctx]
   */
  _scheduleGeomEpsilonObserve(metaWindow, sent, knownMin, bagId, ctx = {}) {
    if (!metaWindow || !this._wmSources) return;
    let id = "unknown";
    try {
      id = typeof metaWindow.get_id === "function" ? metaWindow.get_id() : String(id);
    } catch (_e) {
      /* ignore */
    }
    const slot = `geomEpsilon:${id}`;
    let delay = MIN_CLAMP_LEARN_DELAY_MS + 20;
    try {
      if (Meta.is_wayland_compositor?.()) delay += MIN_CLAMP_LEARN_WAYLAND_EXTRA_MS;
    } catch (_e) {
      /* ignore */
    }
    this._wmSources.set(slot, delay, () => {
      try {
        if (!Utils.isWindowAlive(metaWindow)) return;
        const { windowId, wmClass } = this._geomEpsilonIdentity(metaWindow);
        const classEps = getEffectiveClassEpsilon(this._classGeomEpsilon, wmClass, windowId);
        let fr = metaWindow.get_frame_rect?.() ?? null;
        const injectOn = this._faultInjectGeometryEnabled();
        const observedForPolicy = faultInjectObserved(sent, fr, {
          enabled: injectOn,
          epsilon: classEps,
        });
        this._logGeomEpsilon(metaWindow, {
          phase: injectOn ? "post-write-settle-inject" : "post-write-settle",
          sent,
          observed: observedForPolicy,
          knownMin,
          wrote: true,
          epsilon: classEps,
        });
        if (bagId && fr) {
          this._settleHostBagGeometry(bagId, {
            observed: fr,
            desiredChanged: false,
          });
        }
        const deltas = edgeDeltas(sent, observedForPolicy);
        const fields = buildGeomEpsilonFields({
          phase: "post-write-settle",
          sent,
          observed: observedForPolicy,
          knownMin,
          wrote: true,
          windowId,
          wmClass,
          epsilon: classEps,
        });
        const decision = decideNearMissForgiveness({
          store: this._classGeomEpsilon,
          wmClass,
          windowId,
          tag: fields.tag,
          dMax: deltas?.dMax,
          sent,
          observed: observedForPolicy,
          commandKey: commandFingerprint(sent),
        });
        if (fields.tag === "agree" || fields.tag === "near") {
          metaWindow._forgeTileDestRetry = 0;
        }
        if (decision.action === "bumped" && decision.bump) {
          Logger.info(
            `geom-epsilon phase=class-eps-bump tag=near wmClass=${wmClass} from=${decision.bump.from} to=${decision.bump.to} reason=${decision.bump.reason}`,
            {
              fields: {
                phase: "class-eps-bump",
                tag: "near",
                wmClass,
                windowId,
                from: decision.bump.from,
                to: decision.bump.to,
                dMax: decision.bump.dMax,
                reason: decision.bump.reason,
              },
            }
          );
        } else if (decision.action === "retry" && decision.adjusted) {
          const target = ctx?.expectRect || sent;
          const adj = decision.adjusted;
          // Compensate Meta write; keep slot desired = target (never force).
          this._wmSources.set(`geomEpsilonRetry:${id}`, 30, () => {
            try {
              if (!Utils.isWindowAlive(metaWindow)) return;
              this._suppressGeom.run(() => {
                try {
                  metaWindow.move_frame?.(true, adj.x, adj.y);
                  metaWindow.move_resize_frame(true, adj.x, adj.y, adj.width, adj.height);
                } catch (_e) {
                  /* ignore */
                }
                if (bagId) {
                  this._settleHostBagGeometry(bagId, {
                    desiredRect: target,
                    commanded: adj,
                    observed: metaWindow.get_frame_rect?.() ?? null,
                    desiredChanged: false,
                  });
                }
              });
              this._scheduleGeomEpsilonObserve(metaWindow, adj, knownMin, bagId, ctx);
              Logger.debug(
                `geom-epsilon phase=near-retry tag=near wmClass=${wmClass} dMax=${
                  deltas?.dMax ?? "-"
                }`,
                {
                  fields: {
                    phase: "near-retry",
                    tag: "near",
                    wmClass,
                    windowId,
                    dMax: deltas?.dMax,
                    target,
                    adjusted: adj,
                  },
                }
              );
            } catch (_e) {
              /* ignore */
            }
          });
        } else {
          observeHealAfterSettle(this, metaWindow, {
            sent: ctx?.expectRect || sent,
            expectRect: ctx?.expectRect || sent,
            observed: observedForPolicy,
            tag: fields.tag,
            knownMin,
            bagId,
            wmClass,
            windowId,
            dMax: deltas?.dMax,
            epsilon: classEps,
          });
        }
      } catch (_e) {
        /* ignore */
      }
    });
  }

  /**
   * After move_resize, learn mins once the frame has settled past the race delay.
   * @param {any} metaWindow
   */
  _scheduleMinClampLearn(metaWindow) {
    if (!metaWindow || !this._wmSources) return;
    if (this.isApplyEpochLive?.()) {
      Logger.trace("min-clamp-learn skip reason=apply-epoch");
      return;
    }
    let id = "unknown";
    try {
      id = typeof metaWindow.get_id === "function" ? metaWindow.get_id() : String(id);
    } catch (_e) {
      /* ignore */
    }
    const slot = `minClampLearn:${id}`;
    let delay = MIN_CLAMP_LEARN_DELAY_MS + 20;
    try {
      if (Meta.is_wayland_compositor?.()) delay += MIN_CLAMP_LEARN_WAYLAND_EXTRA_MS;
    } catch (_e) {
      /* ignore */
    }
    this._wmSources.set(slot, delay, () => {
      try {
        if (!Utils.isWindowAlive(metaWindow)) return;
        if (this.isApplyEpochLive?.()) {
          Logger.trace(`min-clamp-learn skip id=${id} reason=apply-epoch-late`);
          return;
        }
        const node = this.findNodeWindow?.(metaWindow);
        if (node?.mode === WINDOW_MODES.GRAB_TILE) return;
        if (this._openCommitPending?.has?.(metaWindow)) {
          Logger.trace(`min-clamp-learn skip id=${id} reason=open-commit-pending`);
          return;
        }
        const req = metaWindow._forgeLastResizeRequest;
        const fr = metaWindow.get_frame_rect?.();
        const slotDest =
          (this._liveForestSeeded && node && forestSlotPaintRect(this, node)) ||
          (node ? this._slotRectForUnit(node) : null);
        if (frameUndersizedVsCommand(req || slotDest, fr)) {
          Logger.trace(`min-clamp-learn skip id=${id} reason=undersize-vs-command`);
          return;
        }
        if (req && fr) noteWindowMinFromClamp(metaWindow, req, fr);
        if (node && fr && slotDest) {
          noteWindowMinFromOversizedFrame(metaWindow, fr, slotDest, LAYOUT_VERIFY_EPSILON_PX);
        }
        if (node && this._needsOverflowRehome(node, metaWindow)) {
          this._scheduleOverflowRehome(node);
        }
      } catch (_e) {
        /* ignore */
      }
    });
  }

  moveCenter(metaWindow) {
    if (!metaWindow) return;
    let frameRect = metaWindow.get_frame_rect();
    const rectRequest = {
      x: "center",
      y: "center",
      width: frameRect.width,
      height: frameRect.height,
    };

    this.move(metaWindow, Utils.resolveRect(rectRequest, metaWindow));
  }

  rectForMonitor(node, targetMonitor) {
    if (!node || (node && node.nodeType !== NODE_TYPES.WINDOW)) return null;
    if (targetMonitor < 0) return null;
    let currentWorkArea = Utils.getWorkAreaSafe(node.nodeValue);
    let nextWorkArea = null;
    try {
      nextWorkArea = node.nodeValue.get_work_area_for_monitor(targetMonitor);
    } catch (_e) {
      return null;
    }

    if (currentWorkArea && nextWorkArea) {
      // Prefer tree slot; fall back to live frame for TILE with unset rect
      // (pre-render peel) so cross-mon move does not throw on null.rect.
      let src = node.rect;
      if (!src || src.width == null || src.height == null) {
        try {
          src = node.nodeValue.get_frame_rect?.();
        } catch (_e) {
          return null;
        }
      }
      if (!src || !(src.width > 0) || !(src.height > 0)) return null;

      const hRatio = nextWorkArea.height / currentWorkArea.height;
      const wRatio = nextWorkArea.width / currentWorkArea.width;

      // Clone — do not mutate node.rect before reparent commits (e3k1 throw path).
      const rect = {
        x: src.x,
        y: src.y,
        width: src.width * wRatio,
        height: src.height * hRatio,
      };

      // forge-cm69: rect.{x,y} are ABSOLUTE stage coordinates, so the remap must
      // offset relative to the source work area before scaling and re-add the
      // destination origin. Using absolute coords directly placed the window
      // off-screen whenever the source monitor was not at the origin (3+ monitor
      // rows). One affine helper keeps both axes consistent (DRY).
      const remapAxis = (coord, curOrigin, curSize, nextOrigin, nextSize) =>
        ((coord - curOrigin) / curSize) * nextSize + nextOrigin;

      rect.y = remapAxis(
        rect.y,
        currentWorkArea.y,
        currentWorkArea.height,
        nextWorkArea.y,
        nextWorkArea.height
      );
      rect.x = remapAxis(
        rect.x,
        currentWorkArea.x,
        currentWorkArea.width,
        nextWorkArea.x,
        nextWorkArea.width
      );
      return rect;
    }
    return null;
  }

  _removeSignals() {
    return lifeRemoveSignals(this);
  }

  /**
   * Debounced layout commit (CL0). Prefer over raw renderTree for sensor storms.
   * CL5: while open-layout batch is active, latch need-commit only (no mid-batch fire).
   * @param {string} [reason]
   */
  requestLayout(reason) {
    return presentIdleRequestLayout(this, reason);
  }

  /** @returns {number} CL5 batch nest depth (compat + session-api). */
  get _openLayoutBatchDepth() {
    return this._layoutBatch?.depth ?? 0;
  }

  /** @param {number} v */
  set _openLayoutBatchDepth(v) {
    if (!this._layoutBatch) return;
    const n = Math.max(0, Math.floor(Number(v) || 0));
    this._layoutBatch.reset();
    for (let i = 0; i < n; i++) this._layoutBatch.begin();
  }

  /** @returns {boolean} deferred commit latched while batch active. */
  get _openLayoutBatchNeedsCommit() {
    return !!this._layoutBatch?.needsCommit;
  }

  /** @param {boolean} v */
  set _openLayoutBatchNeedsCommit(v) {
    this._layoutBatch?.setNeedsCommit(!!v);
  }

  /**
   * AC4: thrash / fail-open isolation — float mapped client, insert PLACEHOLDER
   * in reserved slot, one layout commit. Never reassert/mismatch war.
   *
   * @param {object|null|undefined} metaOrNode Meta.Window or WINDOW node
   * @param {{ reason?: string|null, parentNode?: object|null, hasMappedClient?: boolean }} [opts]
   * @returns {{
   *   ok: boolean,
   *   reason: string,
   *   placeholder: object|null,
   *   clientNode: object|null,
   *   floated: boolean,
   *   layoutReason: string|null,
   * }}
   */
  isolateThrashWindow(metaOrNode, opts = {}) {
    let clientNode = null;
    let parentNode = opts.parentNode ?? null;

    if (metaOrNode && typeof metaOrNode === "object") {
      if (metaOrNode.nodeType === NODE_TYPES.WINDOW || typeof metaOrNode.isWindow === "function") {
        clientNode = metaOrNode;
      } else {
        clientNode = this.findNodeWindow(metaOrNode);
      }
    }

    if (clientNode && shouldSkipThrashIsolate(clientNode)) {
      Logger.debug("isolateThrashWindow: skip placeholder (no thrash loop)");
      return {
        ok: false,
        reason: "is-placeholder",
        placeholder: null,
        clientNode,
        floated: false,
        layoutReason: null,
      };
    }

    if (!parentNode && clientNode) parentNode = clientNode.parentNode ?? null;

    const result = executeIsolateThrash(
      {
        clientNode,
        parentNode,
        reason: opts.reason ?? "thrash",
        hasMappedClient: opts.hasMappedClient,
        floatMode: WINDOW_MODES.FLOAT,
      },
      {
        floatClient: (node) => {
          // Mode FLOAT keeps membership; frees slot among tiled siblings.
          try {
            node.float = true;
          } catch (_e) {
            node.mode = WINDOW_MODES.FLOAT;
          }
          // Stop fighting residual for this client.
          try {
            this.layoutEpoch?.clearEpoch?.(node.nodeValue);
          } catch (_e2) {
            // ignore
          }
        },
        createPlaceholder: ({ parentNode: p, beforeNode, percent, userSized, reason }) => {
          if (!this.tree?.createPlaceholderLeaf || !p) return null;
          // Host is the container (CON/MONITOR), never a WINDOW.
          const host = p.isWindow?.() ? p.parentNode : p;
          if (!host) return null;
          return this.tree.createPlaceholderLeaf(host, {
            beforeNode: beforeNode ?? null,
            percent,
            userSized,
            reason,
          });
        },
        requestLayout: (reason) => {
          this.requestLayout(reason || PLACEHOLDER_ISOLATE_LAYOUT_REASON);
        },
        clearEpoch: (meta) => {
          this.layoutEpoch?.clearEpoch?.(meta);
        },
      }
    );

    if (result.ok) {
      Logger.info(
        `isolateThrashWindow: ${result.reason} floated=${result.floated} ph=${!!result.placeholder}`
      );
    } else {
      Logger.debug(`isolateThrashWindow: failed ${result.reason}`);
    }
    return result;
  }

  /**
   * AC4: close/remove placeholder → drop leaf + one reflow (product close path).
   *
   * @param {object|null|undefined} nodeOrStub WINDOW node, stub value, or id
   * @returns {{ ok: boolean, reason: string, layoutReason: string|null }}
   */
  removePlaceholder(nodeOrStub) {
    let node = null;
    if (nodeOrStub && typeof nodeOrStub === "object") {
      if (isPlaceholderNode(nodeOrStub) || nodeOrStub.nodeType === NODE_TYPES.WINDOW) {
        node = nodeOrStub.nodeType != null ? nodeOrStub : null;
      }
      if (!node && this.tree) {
        node = this.tree.findNode?.(nodeOrStub) ?? null;
      }
    }
    if (!node && this.tree && nodeOrStub != null) {
      const windows = this.tree.getNodeByType?.(NODE_TYPES.WINDOW) ?? [];
      node =
        windows.find(
          (w) =>
            isPlaceholderNode(w) &&
            (w.nodeValue === nodeOrStub ||
              w.nodeValue?.id === nodeOrStub ||
              (typeof nodeOrStub === "object" && w.nodeValue?.id === nodeOrStub?.id))
        ) ?? null;
    }

    if (!node || !isPlaceholderNode(node)) {
      return { ok: false, reason: node ? "not-placeholder" : "no-node", layoutReason: null };
    }

    const result = executeRemovePlaceholder(
      { node },
      {
        removeNode: (n) => {
          this.tree?.removeNode?.(n);
        },
        requestLayout: (reason) => {
          this.requestLayout(reason || PLACEHOLDER_REMOVE_LAYOUT_REASON);
        },
      }
    );

    if (result.ok) {
      Logger.info("removePlaceholder: leaf dropped + reflow");
    }
    return result;
  }

  /**
   * CL5: start multi-open / layout-CLI batch — no per-app layout commit until end.
   * Nestable depth counter. Pair with endOpenLayoutBatch.
   * @param {string|null|undefined} [layoutName] optional profile name for apply chrome
   */
  beginOpenLayoutBatch(layoutName) {
    const { depth } = this._layoutBatch.begin();
    // AC2: each batch begin advances layout wave id for command epochs.
    this.layoutEpoch?.beginWave();
    // CL10: show apply chrome on begin when setting on (depth ≥ 1).
    this.layoutApplyChrome?.syncFromBatch(depth, {
      layoutName: layoutName ?? null,
    });
    return {
      ok: true,
      depth,
      layoutName:
        layoutName != null && String(layoutName).trim() ? String(layoutName).trim() : null,
      waveId: this.layoutEpoch?.waveId ?? 0,
    };
  }

  /**
   * CL5: end multi-open batch. When depth hits 0 and a deferred commit is latched
   * (and residual RunSteps has not already scheduled C), one Cq (or Cf if no LC).
   *
   * Apply chrome stays until clearLayoutApplyChrome() — CLI clears after
   * focus/soft (finally). end() itself does not clear chrome.
   * @param {string} [reason]
   */
  endOpenLayoutBatch(reason) {
    const r = reason == null || reason === "" ? "open-batch" : String(reason);
    const step = this._layoutBatch.end();
    if (!step.wasActive) {
      return { ok: true, depth: 0, committed: false, wasActive: false };
    }
    if (step.depth > 0) {
      this.layoutApplyChrome?.syncFromBatch(step.depth);
      return {
        ok: true,
        depth: step.depth,
        committed: false,
        wasActive: true,
      };
    }
    // Depth 0: do not clear apply chrome here (CLI chrome-clear after residual).
    // CL8: unhide deferred maps before residual / batch commit layout.
    this._releaseAllDeferredOpens();
    try {
      this.processFloats();
    } catch (_e) {
      // best-effort — commit still needed
    }
    // CT1: never leave sticky entered-monitor suppress across a completed batch.
    this._layoutBindPending = false;
    // Always force-paint after release. Mid-batch RunSteps renderTree clears
    // the latch so shouldCommit can be false while just-released maps are
    // still at FLOAT geometry (R024 / green first apply).
    this.commitLayout(r, { force: true });
    return {
      ok: true,
      depth: 0,
      committed: true,
      wasActive: true,
    };
  }

  /**
   * Show layout-apply chrome without beginning a LayoutBatch (no-open apply).
   * @param {string|null|undefined} [layoutName]
   * @returns {{ ok: boolean, shown?: boolean, reason?: string, error?: string }}
   */
  showLayoutApplyChrome(layoutName) {
    if (layoutName !== undefined) {
      try {
        this.layoutApplyChrome?.setLayoutName?.(layoutName);
      } catch (_e) {
        /* ignore */
      }
    }
    let enabled = false;
    try {
      enabled = !!this.ext?.settings?.get_boolean?.("layout-apply-chrome-enabled");
    } catch (_e) {
      enabled = false;
    }
    if (!enabled) {
      return { ok: true, shown: false, reason: "disabled" };
    }
    try {
      this.layoutApplyChrome?.show?.();
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
    return { ok: true, shown: !!this.layoutApplyChrome?.visible };
  }

  /**
   * Clear layout-apply chrome (after focus/soft / error/finally).
   * Hard timeout and disable() also clear.
   * @returns {{ ok: true, cleared: boolean }}
   */
  clearLayoutApplyChrome() {
    const was = !!this.layoutApplyChrome?.visible;
    try {
      this.layoutApplyChrome?.setLayoutName?.(null);
      this.layoutApplyChrome?.clear?.();
    } catch (_e) {
      // chrome may already be gone
    }
    if (was) {
      try {
        Logger.info("clearLayoutApplyChrome: was visible → hidden");
      } catch (_e) {
        /* ignore */
      }
    }
    return { ok: true, cleared: was };
  }

  get openLayoutBatchActive() {
    return !!this._layoutBatch?.active;
  }

  /**
   * Pin TABBED/STACKED open leaf for soft-focus wall residual (D018/SE5).
   * Meta late-activate (Chrome PWA) must not rewrite lastTabFocus while pinned.
   * @param {import('./tree.js').Node|null|undefined} parentCon
   * @param {object|null|undefined} meta
   * @param {number} [residualMs]
   */
  pinLayoutOpenLeaf(parentCon, meta, residualMs = LAYOUT_OPEN_LEAF_PIN_MS) {
    if (!parentCon || !meta) return;
    if (typeof parentCon.isStackedOrTabbed === "function" && !parentCon.isStackedOrTabbed()) {
      return;
    }
    const pin = makeLayoutOpenLeafPin(meta, residualMs, Date.now());
    if (!pin) return;
    const node = this.tree?.findNode?.(meta);
    if (node) {
      this.setOpenLeaf?.(node);
    } else {
      parentCon.lastTabFocus = meta;
    }
    this._layoutOpenLeafPins.set(parentCon, pin);
  }

  /**
   * @param {import('./tree.js').Node|null|undefined} parentCon
   * @returns {{ meta: object, until: number }|null}
   */
  getLayoutOpenLeafPin(parentCon) {
    if (!parentCon || !this._layoutOpenLeafPins) return null;
    const pin = this._layoutOpenLeafPins.get(parentCon);
    if (!layoutOpenLeafPinActive(pin, Date.now())) {
      if (pin) this._layoutOpenLeafPins.delete(parentCon);
      return null;
    }
    return pin;
  }

  /**
   * If meta-focus landed on a non-pinned tab sibling, restore pinned open leaf.
   * @param {import('./tree.js').Node|null|undefined} focusNode
   * @returns {boolean} true when steal was corrected (skip adopting stealer)
   */
  restoreLayoutOpenLeafIfStolen(focusNode) {
    if (!focusNode) return false;
    const parent = liveParentForPresent(this, focusNode) || focusNode.parentNode;
    if (!parent) return false;
    if (typeof parent.isStackedOrTabbed === "function" && !parent.isStackedOrTabbed()) {
      return false;
    }
    const pin = this.getLayoutOpenLeafPin(parent);
    if (!shouldRestoreLayoutOpenLeaf(pin, focusNode.nodeValue, Date.now())) {
      return false;
    }

    const pinNode = this.tree?.findNode?.(pin.meta);
    if (pinNode) {
      try {
        if (typeof this.revealGroupChild === "function") {
          this.revealGroupChild(pinNode);
        } else {
          this.setOpenLeaf?.(pinNode);
          pin.meta.raise?.();
          this.settleTabFocus?.(pinNode);
        }
      } catch (_e) {
        /* best-effort */
      }
    } else {
      parent.lastTabFocus = pin.meta;
      try {
        pin.meta.raise?.();
      } catch (_e) {
        /* finalized */
      }
    }
    return true;
  }

  /**
   * Meta focus on a non-open tab sibling during workspace switch — keep lastTabFocus.
   * @param {import('./tree.js').Node|null|undefined} focusNode
   * @returns {boolean} true when open leaf was re-revealed (skip adopting stealer)
   */
  restoreOpenLeafIfWorkspaceFocusSteal(focusNode) {
    const label = (meta) => {
      if (!meta) return "-";
      try {
        const t = meta.get_title?.() || "?";
        const id = typeof meta.get_id === "function" ? meta.get_id() : "?";
        return `${id}:${t}`;
      } catch (_e) {
        return "?";
      }
    };
    const parent = focusNode ? liveParentForPresent(this, focusNode) || focusNode.parentNode : null;
    if (!parent) {
      Logger.trace("ws-change preserve miss reason=no-parent");
      return false;
    }
    if (typeof parent.isStackedOrTabbed === "function" && !parent.isStackedOrTabbed()) {
      Logger.trace(
        `ws-change preserve miss reason=not-tab-stack focus=${label(focusNode.nodeValue)}`
      );
      return false;
    }
    const openMeta = parent.lastTabFocus;
    if (!openMeta) {
      Logger.trace(
        `ws-change preserve miss reason=no-open-leaf focus=${label(focusNode.nodeValue)}`
      );
      return false;
    }
    if (openMeta === focusNode.nodeValue) {
      Logger.trace(
        `ws-change preserve miss reason=already-open focus=${label(focusNode.nodeValue)}`
      );
      return false;
    }

    Logger.trace(
      `ws-change preserve hit open=${label(openMeta)} stealer=${label(focusNode.nodeValue)}`
    );
    const openNode = this.tree?.findNode?.(openMeta);
    if (openNode) {
      try {
        if (typeof this.revealGroupChild === "function") {
          this.revealGroupChild(openNode, { source: "ws-change" });
        } else {
          openMeta.raise?.();
          this.settleTabFocus?.(openNode);
        }
      } catch (_e) {
        /* best-effort */
      }
    } else {
      try {
        openMeta.raise?.();
      } catch (_e) {
        /* finalized */
      }
    }
    return true;
  }

  /**
   * Re-raise each TABBED/STACKED open leaf on the active workspace.
   * @param {string} [reason]
   */
  reassertOpenLeavesOnActiveWs(reason = "workspace-settle") {
    const root = this.currentWsNode;
    if (!root || typeof root.getNodeByType !== "function") return;
    let cons;
    try {
      cons = root.getNodeByType(NODE_TYPES.CON) || [];
    } catch (_e) {
      return;
    }
    for (const con of cons) {
      if (!con?.isStackedOrTabbed?.()) continue;
      const openMeta = con.lastTabFocus;
      if (!openMeta) continue;
      const openNode = this.tree?.findNode?.(openMeta);
      if (!openNode) continue;
      try {
        if (typeof this.revealGroupChild === "function") {
          this.revealGroupChild(openNode, { source: reason });
        } else {
          openMeta.raise?.();
          this.settleTabFocus?.(openNode);
        }
      } catch (_e) {
        /* best-effort per group */
      }
    }
  }

  /**
   * Debounced Meta↔slot verify (CL1 scanner + agreement).
   * @param {string} [reason]
   */
  requestVerify(reason) {
    this.layoutController?.requestVerify(reason);
  }

  renderTree(from, force = false) {
    return presentIdleRenderTree(this, from, force);
  }

  /**
   * @param {{ fromPresent?: boolean }} [opts]
   */
  processFloats(opts = null) {
    return floatProcessFloats(this, opts);
  }

  /**
   * One-window processFloats body (canonical float↔tile mode update).
   * @param {object} nodeWindow
   * @param {Meta.Window} metaWindow
   * @param {{ adoptSlot?: boolean, fromPresent?: boolean }} [opts] — adoptSlot false = mode only
   *   (late place / ensureMetaInSlot own attach; default true for processFloats).
   *   fromPresent skips GObject invent (Forest membership + paint only).
   * @returns {{ action: string, reason: string, flags?: object }|null}
   */
  _applyProcessFloatDecision(nodeWindow, metaWindow, opts = null) {
    return floatApplyProcessFloatDecision(this, nodeWindow, metaWindow, opts);
  }

  /**
   * Apply-time / late-identity: TILE mode + drop Meta max so slot place can paint.
   * Does not adopt into LFT — caller owns attach/reparent (D026 idle-only in epoch).
   * @param {Meta.Window} metaWindow
   * @param {object|null|undefined} [node]
   * @returns {{ action: string, reason: string }|null}
   */
  _ensureTiledForSlotPlace(metaWindow, node = null) {
    return floatEnsureTiledForSlotPlace(this, metaWindow, node);
  }

  /**
   * Meta → pure float flags (gi-free classifier in float-reason.js).
   * @param {Meta.Window} metaWindow
   * @returns {import('../shared/float-reason.js').ProcessFloatFlags}
   */
  _collectProcessFloatFlags(metaWindow) {
    return floatCollectProcessFloatFlags(this, metaWindow);
  }

  /**
   * @param {object} nodeWindow
   * @param {Meta.Window} metaWindow
   * @returns {{ action: "skip"|"float"|"tile", reason: string, flags: object }}
   */
  _processFloatDecision(nodeWindow, metaWindow) {
    return floatProcessFloatDecision(this, nodeWindow, metaWindow);
  }

  /**
   * @param {object} nodeWindow
   * @param {Meta.Window} metaWindow
   * @param {{ action: string, reason: string, flags?: object }} decision
   * @param {boolean} wasFloat
   */
  _logFloatDecision(nodeWindow, metaWindow, decision, wasFloat) {
    return floatLogFloatDecision(this, nodeWindow, metaWindow, decision, wasFloat);
  }

  /**
   * forge-2ew: A transient dialog can inherit Mutter placement that lands it
   * behind a tiled neighbor of its parent. When a dialog overlaps a tiled window
   * other than its own parent, recenter it over its parent (clamped to the work
   * area) so it is not occluded. Non-transient floats are left where the user
   * put them.
   */
  _repositionOccludedDialog(metaWindow) {
    return floatRepositionOccludedDialog(this, metaWindow);
  }

  /**
   * forge-w7e (#469): React to a window's "Always on Top" state changing.
   *
   * "Always on Top" is GNOME's Z-axis stacking pin (make_above). isFloatingExempt
   * treats an above window as floating, so a re-render is all that's needed to
   * move a newly-pinned window out of the tree (and retile it when unpinned).
   * Forge only ever pins windows it is already floating, so this stays a no-op
   * for normal tiled windows until the user toggles always-on-top.
   */
  _handleUserAboveChange(_metaWindow) {
    return floatHandleUserAboveChange(this, _metaWindow);
  }

  get allNodeWindows() {
    const seen = new Set();
    const out = [];
    const add = (n) => {
      if (!n || seen.has(n)) return;
      if (!(n.isWindow?.() || n.nodeType === NODE_TYPES.WINDOW)) return;
      seen.add(n);
      out.push(n);
    };
    for (const n of this.tree?.getNodeByType?.(NODE_TYPES.WINDOW) || []) add(n);
    if (this.liveById instanceof Map) {
      for (const live of this.liveById.values()) add(live);
    }
    return out;
  }

  /**
   * Reloads the tree. This is an expensive operation.
   * Useful when using dynamic workspaces in GNOME-shell.
   * Delegates tree operations to tree.reload().
   *
   * @param {string} from - Debug identifier for where reload was triggered
   */
  reloadTree(from) {
    return lifeReloadTree(this, from);
  }

  /** Debounced last-good topology write (Shell HUP may skip disable). */
  _queueSessionLayoutSave() {
    return this.sessionLayoutRestore.queueSessionLayoutSave();
  }

  /** @param {number} [holdUs] */
  _holdSessionLayoutSave(holdUs = 12_000_000) {
    return this.sessionLayoutRestore.holdSessionLayoutSave(holdUs);
  }

  /**
   * @param {{ immediate?: boolean, force?: boolean }} [opts]
   * @returns {boolean}
   */
  _saveSessionLayoutForReload(opts = {}) {
    return this.sessionLayoutRestore.saveSessionLayoutForReload(opts);
  }

  /** Cancel debounce and write now (install flush). */
  flushSessionLayout() {
    return this.sessionLayoutRestore.flushSessionLayout();
  }

  /** After flat track on enable: rehome + restore portable last-good. */
  _restoreSessionLayoutAfterTrack() {
    return this.sessionLayoutRestore.restoreSessionLayoutAfterTrack();
  }

  /**
   * Seed WeakMap last-good from portable frames after session restore (HUP empties it).
   * @param {{ monitors?: any[] }} liveForest
   * @param {{ monitors?: any[] }|null} [portableForest]
   */
  _seedLastGoodHomesFromSession(liveForest, portableForest = null) {
    return this.sessionLayoutRestore.seedLastGoodHomesFromSession(liveForest, portableForest);
  }

  /** @param {{ monitors: any[] }} liveForest */
  _rehomeWindowsForSessionForest(liveForest) {
    return this.sessionLayoutRestore.rehomeWindowsForSessionForest(liveForest);
  }

  /** Snapshot mon id/stableKey only (no majority pile remap). */
  _restoreSessionForestStrict(liveForest) {
    return this.sessionLayoutRestore.restoreSessionForestStrict(liveForest);
  }

  /** Raise tiles after restore so none stay buried under a sibling. */
  _raiseAfterSessionRestore(liveForest, opts = {}) {
    return this.sessionLayoutRestore.raiseAfterSessionRestore(liveForest, opts);
  }

  /**
   * After snapshot restore, re-touch the focused tiled window so LFT MRU stays
   * coherent with live focus (optional T6). Prefer session-restored focus —
   * Mutter may not have applied activate yet right after HUP.
   */
  _lftTouchFocusAfterRestore() {
    try {
      const focusWin =
        this._sessionRestoredFocusMeta ||
        this._sessionLayoutShield?.focusMeta ||
        this.focusMetaWindow;
      if (!focusWin) return;
      const node = this.findNodeWindow(focusWin);
      this._lftTouchIfTile(node);
    } catch (_e) {
      // focus path best-effort only
    }
  }

  sameParentMonitor(firstNode, secondNode) {
    if (!firstNode || !secondNode) return false;
    if (!firstNode.nodeValue || !secondNode.nodeValue) return false;
    if (!firstNode.nodeValue.get_workspace()) return false;
    if (!secondNode.nodeValue.get_workspace()) return false;
    let firstMonWs = Utils.createMonitorWorkspaceId(
      firstNode.nodeValue.get_monitor(),
      firstNode.nodeValue.get_workspace().index()
    );
    let secondMonWs = Utils.createMonitorWorkspaceId(
      secondNode.nodeValue.get_monitor(),
      secondNode.nodeValue.get_workspace().index()
    );
    return firstMonWs === secondMonWs;
  }

  /**
   * D044: rehome Meta windows of a TABBED/STACKED CON onto the CON's tree
   * MONITOR ancestor. Keep the group (no peel). Home is tree, not Meta.
   * @param {import('./tree.js').Node|null|undefined} con
   * @returns {boolean} true if any Meta move issued
   */
  normalizeGroupToHomeMonitor(con) {
    if (!con || typeof con.isStackedOrTabbed !== "function" || !con.isStackedOrTabbed()) {
      return false;
    }
    if (con.nodeType !== NODE_TYPES.CON && con.nodeType !== "CON") return false;
    // Nested group under another tab/stack: outer owns home.
    if (this.tree?._hasStackedOrTabbedAncestor?.(con)) return false;

    const home =
      typeof this.tree?.groupHomeMonitor === "function"
        ? this.tree.groupHomeMonitor(con)
        : this._monitorIndexOfNode(con);
    if (home < 0) return false;

    let changed = false;
    const members =
      typeof con.getNodeByType === "function" ? con.getNodeByType(NODE_TYPES.WINDOW) : [];
    for (const wNode of members) {
      const meta = wNode?.nodeValue;
      if (!meta || !Utils.isWindowAlive(meta)) continue;
      // Tree must already be mon-local under this CON; only Meta can lag.
      if (safeMoveToMonitor(meta, home, "normalize-group-home")) {
        changed = true;
      }
    }
    return changed;
  }

  /**
   * D044: all top-level TABBED/STACKED groups → home mon Meta align.
   * Skip during ApplyLayout epoch and active grab.
   * @returns {number} groups that needed Meta work
   */
  normalizeTabGroupsToHomeMonitors() {
    if (!this.tree) return 0;
    if (isApplyEpochLive(this)) return 0;
    if (this.grabOp) return 0;
    let n = 0;
    for (const layout of [LAYOUT_TYPES.TABBED, LAYOUT_TYPES.STACKED]) {
      const groups =
        typeof this.tree.getNodeByLayout === "function" ? this.tree.getNodeByLayout(layout) : [];
      for (const con of groups) {
        if (!con || (con.childNodes?.length ?? 0) < 1) continue;
        if (this.normalizeGroupToHomeMonitor(con)) n += 1;
      }
    }
    return n;
  }

  showWindowBorders(...a) {
    return this.decorationManager.showWindowBorders(...a);
  }

  restackBorderForMeta(...a) {
    return this.decorationManager.restackBorderForMeta(...a);
  }

  restackAllWindowBorders(...a) {
    return this.decorationManager.restackAllWindowBorders(...a);
  }

  updateBorderLayout(...a) {
    return this.decorationManager.updateBorderLayout(...a);
  }

  calculateGaps(...a) {
    return this.decorationManager.calculateGaps(...a);
  }

  /** Seeded: Forest equalize + paint; unseeded: TreeLayout. Fail-closed on id miss. */
  _resetSiblingPercent(parentNode) {
    if (!parentNode) return;
    if (this._liveForestSeeded && this.forest) {
      const fid = forestIdFromLive(this, parentNode);
      const tom = fid ? this.forest.nodes[fid] : null;
      if (!tom) {
        recordFallback("resetSiblingPercent", "ids-miss");
        return;
      }
      equalizeChildren(this.forest, tom, { force: true });
      paintWmForest(this);
      return;
    }
    this.tree.resetSiblingPercent(parentNode);
  }

  /** Seeded: Forest carve/equalize + paint; unseeded: TreeLayout. */
  _insertChildPercent(parentNode, newChild) {
    if (!newChild) return;
    const parent = parentNode || this._membershipParentLive(newChild);
    if (!parent) return;
    if (this._liveForestSeeded && this.forest) {
      const cid = forestIdFromLive(this, newChild);
      const childTom = cid ? this.forest.nodes[cid] : null;
      if (!childTom) {
        recordFallback("insertChildPercent", "ids-miss");
        return;
      }
      const direct = tomParent(this.forest, childTom);
      const pid = forestIdFromLive(this, parent);
      const hinted = pid ? this.forest.nodes[pid] : null;
      // Direct Forest parent only (D032 wrap). Never n+1-carve an ancestor.
      const parentTom =
        direct && (direct.kind === "CON" || direct.kind === "MONITOR") ? direct : hinted;
      if (!parentTom) {
        recordFallback("insertChildPercent", "ids-miss");
        return;
      }
      if (!(parentTom.childIds || []).includes(childTom.id)) return;
      if (parentTom.kind === "FLOATS" || parentTom.kind === "META") return;
      const lay = parentTom.layout;
      if (lay !== "HSPLIT" && lay !== "VSPLIT") return;
      const kids = (parentTom.childIds || [])
        .map((id) => this.forest.nodes[id])
        .filter((n) => n && n.id !== childTom.id);
      let policy = "preserve";
      try {
        const raw = this.ext?.settings?.get_string?.("new-window-size-policy");
        if (raw === "equalize" || raw === "preserve") policy = raw;
      } catch (_e) {
        /* settings unavailable in some unit fixtures */
      }
      const anyUserSized = kids.some((n) => n.userSized);
      if (!anyUserSized || policy === "equalize") {
        equalizeChildren(this.forest, parentTom, { force: true });
      } else {
        let existingTotal = kids.reduce((sum, n) => sum + (n.percent || 0), 0);
        if (existingTotal <= 0) {
          const each = kids.length > 0 ? 1.0 / kids.length : 1.0;
          kids.forEach((n) => {
            n.percent = each;
          });
          existingTotal = 1.0;
        }
        const share = 1.0 / (kids.length + 1);
        childTom.percent = share;
        childTom.userSized = false;
        const scale = (1.0 - share) / existingTotal;
        kids.forEach((n) => {
          n.percent = (n.percent || 0) * scale;
        });
        repairSharesAfterChildChange(this.forest, parentTom);
      }
      paintWmForest(this);
      return;
    }
    this.tree.insertChildPercent(parent, newChild);
  }

  /** Seeded: Forest repairShares + paint; unseeded: TreeLayout. */
  _redistributeSiblingPercent(parentNode) {
    if (!parentNode) return;
    if (this._liveForestSeeded && this.forest) {
      const fid = forestIdFromLive(this, parentNode);
      const tom = fid ? this.forest.nodes[fid] : null;
      if (!tom) {
        recordFallback("redistributeSiblingPercent", "ids-miss");
        return;
      }
      repairSharesAfterChildChange(this.forest, tom);
      paintWmForest(this);
      return;
    }
    this.tree.redistributeSiblingPercent(parentNode);
  }

  /**
   * Bug #305 fix: Normalize sibling percentages to ensure they sum to 1.0
   * This prevents resize drift when resizing windows with 3+ siblings.
   * @param {Node} parentNode - The parent node containing children to normalize
   */
  _normalizeSiblingPercents(parentNode) {
    return grabNormalizeSiblingPercents(this, parentNode);
  }

  /**
   * Feature #315: Maximize single window when only one tiled window on monitor
   */
  /**
   * Tiled, non-minimized window nodes directly hosted on a monitor. Shared by
   * handleMaximizeOnSingle (the maximize-on-single feature) and the
   * external-maximize rejection in updateMetaPositionSize so the "sole tiled
   * window" predicate cannot drift between the two (drift would loop:
   * unmaximize -> render -> handleMaximizeOnSingle -> maximize -> ...).
   */
  _tiledWindowsOnMonitor(monitorNode) {
    if (!monitorNode) return [];
    return monitorNode
      .getNodeByMode(WINDOW_MODES.TILE)
      .filter((t) => t.isWindow() && !t.nodeValue.minimized);
  }

  handleMaximizeOnSingle() {
    let settings = this.ext.settings;
    if (!settings.get_boolean("window-maximize-on-single")) return;

    let activeWsNode = this.currentWsNode;
    if (!activeWsNode) return;

    let monitors = activeWsNode.getNodeByType(NODE_TYPES.MONITOR);
    monitors.forEach((monitor) => {
      let tiled = this._tiledWindowsOnMonitor(monitor);
      if (tiled.length === 1) {
        let metaWindow = tiled[0].nodeValue;
        // forge-fw8: a lone fullscreen window is "not maximized" — don't
        // force-maximize it, that fights the fullscreen surface.
        if (metaWindow.is_fullscreen && metaWindow.is_fullscreen()) return;
        if (Compat.isNotMaximized(metaWindow)) {
          Compat.maximize(metaWindow);
        }
      }
    });
  }

  /**
   * Feature #462: Unmaximize other windows when a new window is tiled alongside
   */
  handleUnmaximizeForTiling(newNodeWindow) {
    if (!this.ext.settings.get_boolean("auto-unmaximize-for-tiling")) return;
    if (!newNodeWindow || newNodeWindow.isFloat()) return;

    // Find the monitor node for this window
    const monitorNode = this.tree.findParent(newNodeWindow, NODE_TYPES.MONITOR);
    if (!monitorNode) return;

    // Get all windows on this monitor
    const windows = monitorNode.getNodeByType(NODE_TYPES.WINDOW);

    windows.forEach((nodeWindow) => {
      if (nodeWindow === newNodeWindow) return;
      if (nodeWindow.isFloat()) return;

      const metaWindow = nodeWindow.nodeValue;
      if (!metaWindow || metaWindow.minimized) return;

      if (Compat.isMaximized(metaWindow)) {
        Compat.unmaximize(metaWindow);
      }
    });
  }

  /**
   * Track meta/mutter windows and append them to the tree.
   * Validate/ignore here; place+admit in adapter-open-place.
   */
  trackWindow(_display, metaWindow) {
    if (assertionFailed()) return;
    if (!this._validWindow(metaWindow)) {
      sessionLayoutTrace(
        `layout-track: skip invalid-type class=${metaWindow?.get_wm_class?.()} title=${JSON.stringify(
          metaWindow?.get_title?.()
        )} type=${metaWindow?.get_window_type?.()}`
      );
      return;
    }
    if (this.isWindowIgnored(metaWindow)) {
      Logger.debug(
        `Ignore override: skip track for ${metaWindow.get_title()} (${metaWindow.get_wm_class()})`
      );
      sessionLayoutTrace(
        `layout-track: skip ignored class=${metaWindow.get_wm_class()} title=${JSON.stringify(
          metaWindow.get_title()
        )}`
      );
      return;
    }
    openPlaceTrack(this, metaWindow);
  }

  _isDeferredOpen(metaWindow) {
    return openPlaceIsDeferredOpen(this, metaWindow);
  }

  _markDeferredOpen(metaWindow, windowActor) {
    return openPlaceMarkDeferredOpen(this, metaWindow, windowActor);
  }

  _rehideDeferredIfNeeded(metaWindow) {
    return openPlaceRehideDeferredIfNeeded(this, metaWindow);
  }

  _releaseDeferredOpen(metaWindow) {
    return releaseDeferredOpen(this, metaWindow);
  }

  _noteDeferredReleaseForSettle(metaWindow, state) {
    return noteDeferredReleaseForSettle(this, metaWindow, state);
  }

  _releaseAllDeferredOpens() {
    return releaseAllDeferredOpens(this);
  }

  releaseDeferredOpens() {
    return releaseDeferredOpens(this);
  }

  /** @returns {Map<object, object>|undefined} pending open-commit map (tests + debug). */
  get _openCommitPending() {
    return this._openCommit?._pending;
  }

  /** @returns {import("./sources.js").SourceBag|undefined} */
  get _openCommitSources() {
    return this._openCommit?.sources;
  }

  _scheduleOpenCommit(metaWindow, openPlan) {
    return scheduleOpenCommit(this, metaWindow, openPlan);
  }

  _cancelOpenCommit(metaWindow) {
    return cancelOpenCommit(this, metaWindow);
  }

  _cancelAllOpenCommits() {
    return cancelAllOpenCommits(this);
  }

  _touchOpenCommitExternalGeometry(metaWindow) {
    return touchOpenCommitExternalGeometry(this, metaWindow);
  }

  _refreshOpenCommitIdentity(metaWindow, state) {
    return refreshOpenCommitIdentity(this, metaWindow, state);
  }

  _armOpenCommitTimer(metaWindow) {
    return armOpenCommitTimer(this, metaWindow);
  }

  _fireOpenCommit(metaWindow) {
    return fireOpenCommit(this, metaWindow);
  }

  _planOpenAppPlacement(metaWindow) {
    return planOpenAppPlacement(this, metaWindow);
  }

  placeNext(options) {
    return openPlaceNext(this, options);
  }

  clearExpiredPlaceHints() {
    return clearExpiredPlaceHints(this);
  }

  _tryPlanFromPlaceHint(metaWindow) {
    return tryPlanFromPlaceHint(this, metaWindow);
  }

  _placePlanFromConsumedHint(hint) {
    return placePlanFromConsumedHint(this, hint);
  }

  _resolvePlaceSlotAttachFromHint(hint, homeMonitor = -1) {
    return resolvePlaceSlotAttachFromHint(this, hint, homeMonitor);
  }

  _ensureMetaOnWorkspace(metaWindow, wantWs) {
    return ensureMetaOnWorkspace(this, metaWindow, wantWs);
  }

  _tryAdoptLatePlaceHint(metaWindow) {
    return tryAdoptLatePlaceHint(this, metaWindow);
  }

  _consumeLeftoverLayoutPlaceholder(winNode, plan = {}) {
    return consumeLeftoverLayoutPlaceholder(this, winNode, plan);
  }

  _applyPlacePlanToExistingWindow(metaWindow, plan) {
    return applyPlacePlanToExistingWindow(this, metaWindow, plan);
  }

  _scheduleLatePlaceHintMeta(metaWindow, homeMonitor, winId, attempt = 0) {
    return scheduleLatePlaceHintMeta(this, metaWindow, homeMonitor, winId, attempt);
  }

  _resolvePlaceAttachSelector(selector, first) {
    return resolvePlaceAttachSelector(this, selector, first);
  }

  _placeSelectCtx() {
    return placeSelectCtx(this);
  }

  /** @returns {number} */
  _primaryMonitorIndex() {
    try {
      const n = global.display?.get_primary_monitor?.();
      if (n != null && n >= 0) return n;
    } catch (_e) {
      /* ignore */
    }
    return 0;
  }

  /**
   * Slot rect for open-app aspect (renderRect || rect || frame). Prefer slot
   * over Meta frame so a stale wide frame cannot force HSPLIT (R028/R033).
   * @param {import('./tree.js').Node|null|undefined} unit
   * @returns {{ width?: number, height?: number }|null}
   */
  _slotRectForUnit(unit) {
    if (!unit) return null;
    const painted =
      typeof this.tree?.paintRectForWindow === "function"
        ? this.tree.paintRectForWindow(unit)
        : null;
    if (painted && painted.width > 0 && painted.height > 0) return painted;
    const slot = unit.renderRect || unit.rect;
    if (slot && slot.width > 0 && slot.height > 0) return slot;
    const meta = unit.nodeValue;
    if (typeof meta?.get_frame_rect === "function") {
      try {
        return meta.get_frame_rect();
      } catch (_e) {
        return null;
      }
    }
    return null;
  }

  _decideOpenMinPlacement(metaWindow, lftNode) {
    return decideOpenMinPlacement(this, metaWindow, lftNode);
  }

  /**
   * TILE eligible for mid-session overflow (not max/fs/zoom/grab — D026 owns those).
   * @param {import('./tree.js').Node|null|undefined} node
   * @param {Meta.Window|null|undefined} metaWindow
   * @returns {boolean}
   */
  _overflowEligibleTile(node, metaWindow) {
    if (!node || !metaWindow) return false;
    if (node.mode !== WINDOW_MODES.TILE && node.mode !== "TILE") return false;
    if (node.isGrabTile?.() || node.mode === WINDOW_MODES.GRAB_TILE) return false;
    if (node.zoomMode) return false;
    if (metaWindow.is_fullscreen?.()) return false;
    if (Compat.getMaximizeFlags(metaWindow) !== 0) return false;
    return true;
  }

  /**
   * TILE slot cannot host this window's mins (not max/fs — D026 owns those).
   * @param {import('./tree.js').Node|null|undefined} node
   * @param {Meta.Window|null|undefined} metaWindow
   * @returns {boolean}
   */
  _slotTooSmallForTile(node, metaWindow) {
    if (!this._overflowEligibleTile(node, metaWindow)) return false;
    return slotOverflowsMins(
      this._slotRectForUnit(node),
      readWindowMinSize(metaWindow),
      LAYOUT_VERIFY_EPSILON_PX
    );
  }

  /**
   * Settled TILE frame larger than slot on a learnable axis (mins may still be floor).
   * @param {import('./tree.js').Node|null|undefined} node
   * @param {Meta.Window|null|undefined} metaWindow
   * @returns {boolean}
   */
  _frameOverflowsTileSlot(node, metaWindow) {
    if (!this._overflowEligibleTile(node, metaWindow)) return false;
    let fr = null;
    try {
      fr = metaWindow.get_frame_rect?.();
    } catch (_e) {
      fr = null;
    }
    return frameOverflowsSlotForLearn(fr, this._slotRectForUnit(node), LAYOUT_VERIFY_EPSILON_PX);
  }

  /**
   * Mins overflow or learnable frame>slot — schedule rehome (not D026 restore).
   * @param {import('./tree.js').Node|null|undefined} node
   * @param {Meta.Window|null|undefined} metaWindow
   * @returns {boolean}
   */
  _needsOverflowRehome(node, metaWindow) {
    return (
      this._slotTooSmallForTile(node, metaWindow) || this._frameOverflowsTileSlot(node, metaWindow)
    );
  }

  /**
   * Debounce mid-session overflow rehome (size-changed storms).
   * @param {import('./tree.js').Node|null|undefined} node
   */
  _scheduleOverflowRehome(node) {
    if (!node || this.isApplyEpochLive()) return;
    if (node.isGrabTile?.() || node.mode === WINDOW_MODES.GRAB_TILE) return;
    const meta = node.nodeValue;
    if (!meta || !Utils.isWindowAlive(meta)) return;
    let id = "unknown";
    try {
      id = typeof meta.get_id === "function" ? meta.get_id() : String(id);
    } catch (_e) {
      /* ignore */
    }
    const slot = `overflowRehome:${id}`;
    let delay = MIN_CLAMP_LEARN_DELAY_MS + 40;
    try {
      if (Meta.is_wayland_compositor?.()) delay += MIN_CLAMP_LEARN_WAYLAND_EXTRA_MS;
    } catch (_e) {
      /* ignore */
    }
    this._wmSources?.set?.(slot, delay, () => {
      try {
        if (!Utils.isWindowAlive(meta)) return;
        const live = this.findNodeWindow?.(meta) || node;
        this.rehomeIfSlotTooSmall(live);
      } catch (_e) {
        /* ignore */
      }
    });
  }

  /**
   * Mid-session: TILE mins/frame exceed slot → learn → same-mon tab or float; remove gap.
   * Skips ApplyEpoch / GRAB_TILE / max-fs (D026). Learn first; never restore to the illegal slot.
   * @param {import('./tree.js').Node|null|undefined} node
   * @returns {boolean} true when the window was tabbed or floated
   */
  rehomeIfSlotTooSmall(node) {
    if (!node || this.isApplyEpochLive()) return false;
    if (node.nodeType !== NODE_TYPES.WINDOW && !node.isWindow?.()) return false;
    const meta = node.nodeValue;
    if (!meta || !Utils.isWindowAlive(meta)) return false;
    if (!this._overflowEligibleTile(node, meta)) return false;

    let fr = null;
    let slot = null;
    try {
      fr = meta.get_frame_rect?.();
      slot = this._slotRectForUnit(node);
    } catch (_e) {
      /* ignore */
    }

    try {
      const req = meta._forgeLastResizeRequest;
      if (req && fr) noteWindowMinFromClamp(meta, req, fr);
    } catch (_e) {
      /* ignore */
    }

    // Settled frame larger than slot → raise known/class on those axes (L3).
    try {
      if (fr && slot) noteWindowMinFromOversizedFrame(meta, fr, slot, LAYOUT_VERIFY_EPSILON_PX);
    } catch (_e) {
      /* ignore */
    }

    // Frame already fits the slot → mins are poisoned; ratchet down, do not float.
    try {
      if (
        slot &&
        fr &&
        Number(fr.width) > 0 &&
        Number(fr.height) > 0 &&
        Number(fr.width) <= Number(slot.width) + LAYOUT_VERIFY_EPSILON_PX &&
        Number(fr.height) <= Number(slot.height) + LAYOUT_VERIFY_EPSILON_PX
      ) {
        let rid = "?";
        try {
          rid = typeof meta.get_id === "function" ? meta.get_id() : String(rid);
        } catch (_e) {
          /* ignore */
        }
        Logger.debug(
          `overflow-ratchet id=${rid} frame=${Number(fr.width)}x${Number(fr.height)} ` +
            `slot=${Number(slot.width)}x${Number(slot.height)}`
        );
        acceptWindowSizeBelowFloor(meta, fr);
        if (!this._slotTooSmallForTile(node, meta)) return false;
      }
    } catch (_e) {
      /* ignore */
    }
    if (!this._slotTooSmallForTile(node, meta)) return false;

    const newMins = readWindowMinSize(meta);

    // C5.2: Forest share redistribute before tab/float when live Forest is SoT.
    if (this.forest && this._liveForestSeeded && this.hostBag) {
      const wid = this.hostBag.idFromMeta?.(meta);
      if (wid && this.forest.nodes[wid]) {
        const shareKind = tryAdjustShareForMins(
          this.forest,
          wid,
          newMins,
          LAYOUT_VERIFY_EPSILON_PX
        );
        if (shareKind) {
          Logger.debug(`overflow-share kind=${shareKind}`);
          paintWmForest(this);
          this.commitLayout("overflow-share");
          if (!this._slotTooSmallForTile(node, meta)) return true;
        }
      }
    }

    const startUnit = tabJoinUnit(node, LAYOUT_TYPES, this) || node;
    const mon =
      this._monitorLiveOfNode(startUnit) ||
      (typeof this.tree.findParent === "function"
        ? this.tree.findParent(startUnit, NODE_TYPES.MONITOR)
        : null);
    const decision = resolveTileOverflowPlacement({
      selfUnit: startUnit,
      lftUnit: startUnit,
      newMins,
      slotRectFor: (u) => this._slotRectForUnit(u),
      candidates: bfsOpenMinTabCandidates(startUnit, mon, LAYOUT_TYPES, this),
    });
    if (decision.kind === "tab" && decision.targetUnit) {
      Logger.debug(`overflow-tab kind=tab`);
      return this._rehomeOverflowToTab(node, decision.targetUnit);
    }
    Logger.debug(`overflow-float kind=${decision?.kind || "float"}`);
    return this._rehomeOverflowToFloat(node);
  }

  /**
   * Peel overflowing TILE onto a same-mon tab unit; collapse the vacated slot.
   * @param {import('./tree.js').Node} node
   * @param {import('./tree.js').Node} targetUnit
   * @returns {boolean}
   */
  _rehomeOverflowToTab(node, targetUnit) {
    if (!node || !targetUnit || targetUnit === node) return false;
    const oldParent = node.parentNode;
    const tabCon = this._ensureTabbedForOpen(targetUnit);
    if (tabCon?.isStackedOrTabbed?.()) {
      if (node.parentNode === tabCon) return false;
      if (!forestReparent(this, node, tabCon)) {
        if (this._liveForestSeeded) recordFallback("overflow-tab", "ids-miss");
        else this.tree.insertWindowIntoGroup(tabCon, node);
      }
    } else if (targetUnit.isWindow?.() && targetUnit !== node) {
      if (!forestMergeWindowsIntoGroup(this, targetUnit, node, LAYOUT_TYPES.TABBED)) {
        if (this._liveForestSeeded) recordFallback("overflow-tab", "ids-miss");
        else this.tree.group(targetUnit, node, LAYOUT_TYPES.TABBED);
      }
    } else {
      return false;
    }
    this._collapseVacatedOverflowSlot(oldParent);
    this.commitLayout("overflow-tab");
    this.settleTabFocus(node);
    return true;
  }

  /**
   * Float last resort: Forest FLOATS (C5.3/C5.4) + mode bridge; collapse vacated slot.
   * @param {import('./tree.js').Node} node
   * @returns {boolean}
   */
  _rehomeOverflowToFloat(node) {
    if (!node) return false;
    const meta = node.nodeValue;
    const oldParent = node.parentNode;
    try {
      if (meta) this.addFloatOverride(meta, true);
    } catch (_e) {
      /* best-effort */
    }
    node.float = true;
    this.lftMru?.remove?.(node);
    if (this.forest && this._liveForestSeeded) {
      forestSetWindowFloating(this, node, true);
    } else {
      const mon =
        typeof this.tree.findParent === "function"
          ? this.tree.findParent(node, NODE_TYPES.MONITOR)
          : null;
      if (mon && node.parentNode !== mon) {
        mon.appendChild(node);
      }
    }
    this._collapseVacatedOverflowSlot(oldParent);
    this.commitLayout("overflow-float");
    return true;
  }

  /**
   * After peel/float: Forest settle + paint when seeded; else GObject join.
   * @param {import('./tree.js').Node|null|undefined} oldParent
   */
  _collapseVacatedOverflowSlot(oldParent) {
    if (this.forest && this._liveForestSeeded) {
      const fid = forestIdFromLive(this, oldParent);
      const tom = fid ? this.forest.nodes[fid] : null;
      const mon = tom ? ancestorMonitor(this.forest, tom) : this.forest.monitors?.[0];
      if (mon) mark2CleanupUnder(this.forest, mon);
      paintWmForest(this);
      return;
    }
    if (!this.tree) return;
    let parent = oldParent;
    for (let i = 0; i < 8 && parent && this._isHvCon(parent); i++) {
      const grand = parent.parentNode;
      if (!grand) break;
      const tiled = this.tree.getTiledChildren(liveChildrenForPresent(this, parent));
      if (tiled.length > 1) {
        this._resetSiblingPercent(parent);
        break;
      }
      if (tiled.length === 1) {
        const keep = tiled[0];
        keep.percent = parent.percent;
        keep.userSized = !!parent.userSized;
        grand.insertBefore(keep, parent);
      }
      for (const leftover of [...parent.childNodes]) {
        grand.insertBefore(leftover, parent);
      }
      grand.removeChild(parent);
      parent = grand;
    }
    if (parent?.isCon?.() && !this._isHvCon(parent)) {
      this._resetSiblingPercent(parent);
      parent.resetLayoutSingleChild?.();
    } else if (parent && (parent.isMonitor?.() || parent.nodeType === NODE_TYPES.MONITOR)) {
      this._redistributeSiblingPercent(parent);
    }
    this.tree.cleanTree();
  }

  _ensureTabbedForOpen(unit) {
    return ensureTabbedForOpen(this, unit);
  }

  _maybeAspectSplitForOpen(lftNode) {
    return maybeAspectSplitForOpen(this, lftNode);
  }

  _unknownOpenIdentity(metaWindow) {
    return unknownOpenIdentity(this, metaWindow);
  }

  _resolveInsertUnit(node) {
    return resolveInsertUnit(this, node);
  }

  _hvSlotToJoin(unit) {
    return hvSlotToJoin(this, unit);
  }

  _isHvCon(node) {
    return !!(node?.isCon?.() && (node.isHSplit?.() || node.isVSplit?.()));
  }

  _layoutFromOrientation(orientation) {
    return orientation === ORIENTATION_TYPES.VERTICAL ? LAYOUT_TYPES.VSPLIT : LAYOUT_TYPES.HSPLIT;
  }

  /**
   * Aspect of the unit's slot rect (renderRect || rect || frame).
   * @param {import('./tree.js').Node|null|undefined} unit
   * @returns {string}
   */
  _orientationFromUnit(unit) {
    if (!unit) return ORIENTATION_TYPES.HORIZONTAL;
    return aspectOrientationFromRect(this._slotRectForUnit(unit)) === "vertical"
      ? ORIENTATION_TYPES.VERTICAL
      : ORIENTATION_TYPES.HORIZONTAL;
  }

  slotSplitForInsert(unit) {
    return openPlaceSlotSplitForInsert(this, unit);
  }

  _adoptOpenIntoTileSlot(nodeWindow) {
    return adoptOpenIntoTileSlot(this, nodeWindow);
  }

  /**
   * FLOAT in a 2-child H/V wrap with one TILE — drop the reserved slot (R031).
   * @param {import('./tree.js').Node|null|undefined} nodeWindow
   */
  _unwindOpenSlotWrap(nodeWindow) {
    const wrap = nodeWindow?.parentNode;
    if (!wrap || !this._isHvCon(wrap) || !wrap.parentNode) return;
    const wrapKids = liveChildrenForPresent(this, wrap);
    const tiled = this.tree.getTiledChildren(wrapKids).filter((n) => n !== nodeWindow);
    if (tiled.length !== 1 || wrapKids.length !== 2) return;
    const keep = tiled[0];
    if (this._liveForestSeeded && this.forest) {
      const wid = forestIdFromLive(this, wrap);
      const wrapTom = wid ? this.forest.nodes[wid] : null;
      if (!wrapTom) {
        recordFallback("unwindOpenSlotWrap", "ids-miss");
        return;
      }
      const keepId = forestIdFromLive(this, keep);
      const keepTom = keepId ? this.forest.nodes[keepId] : null;
      if (keepTom) {
        keepTom.percent = wrapTom.percent;
        keepTom.userSized = !!wrapTom.userSized;
      }
      promoteChildren(this.forest, wrapTom);
      paintWmForest(this);
      return;
    }
    const grand = wrap.parentNode;
    grand.insertBefore(nodeWindow, wrap.nextSibling);
    if (keep.parentNode !== wrap) return;
    keep.percent = wrap.percent;
    keep.userSized = !!wrap.userSized;
    grand.insertBefore(keep, wrap);
    this.tree.removeNode(wrap);
  }

  /**
   * min(workarea.w, workarea.h) for LFT's monitor; 0 if unknown.
   * @param {import('./tree.js').Node|null|undefined} node
   * @returns {number}
   */
  _workareaMinEdgeForNode(node) {
    if (!node) return 0;
    try {
      const meta = node.nodeValue;
      const wa = Utils.getWorkAreaSafe(meta);
      if (wa && wa.width > 0 && wa.height > 0) {
        return Math.min(wa.width, wa.height);
      }
    } catch (_e) {
      /* ignore */
    }
    try {
      const monIdx = this._monitorIndexOfNode(node);
      if (monIdx >= 0 && global.display?.get_monitor_geometry) {
        const g = global.display.get_monitor_geometry(monIdx);
        if (g && g.width > 0 && g.height > 0) return Math.min(g.width, g.height);
      }
    } catch (_e) {
      /* ignore */
    }
    return 0;
  }

  _applyOpenStickyHome(metaWindow, monitorIndex, opts = {}) {
    return applyOpenStickyHome(this, metaWindow, monitorIndex, opts);
  }

  _applyDockStickyHome(metaWindow, monitorIndex) {
    return applyDockStickyHome(this, metaWindow, monitorIndex);
  }

  /**
   * Forest-first membership parent (G8/R048). GObject parentNode is stale.
   * @param {object|null|undefined} live
   * @returns {object|null}
   */
  _membershipParentLive(live) {
    if (!live) return null;
    const fromForest = liveParentForPresent(this, live);
    if (fromForest) return fromForest;
    if (live.parentNode) return live.parentNode;
    const id = forestIdFromLive(this, live);
    let tom = id ? this.forest?.nodes?.[id] : null;
    if (!tom || !this.forest) return null;
    const seen = new Set();
    let p = tomParent(this.forest, tom);
    while (p && !seen.has(p.id)) {
      seen.add(p.id);
      if (p.kind === "CON" || p.kind === "MONITOR") {
        const liveP = this.liveById?.get?.(p.id);
        if (liveP) return liveP;
      }
      p = tomParent(this.forest, p);
    }
    return null;
  }

  /**
   * MONITOR live ancestor via Forest membership, then GObject.
   * @param {object|null|undefined} node
   * @returns {object|null}
   */
  _monitorLiveOfNode(node) {
    if (!node) return null;
    let n = node;
    const seen = new Set();
    while (n && !seen.has(n)) {
      seen.add(n);
      const ntype = n.nodeType;
      const isMon =
        ntype === NODE_TYPES.MONITOR ||
        ntype === "MONITOR" ||
        (typeof n.isMonitor === "function" && n.isMonitor());
      if (isMon) return n;
      const next = this._membershipParentLive(n) || n.parentNode;
      if (!next || next === n) break;
      n = next;
    }
    const id = forestIdFromLive(this, node);
    const tom = id ? this.forest?.nodes?.[id] : null;
    if (this.forest && tom) {
      const mon = ancestorMonitor(this.forest, tom);
      if (mon) return this.liveById?.get?.(mon.id) ?? null;
    }
    return this.tree?.findAncestor?.(node, NODE_TYPES.MONITOR) ?? null;
  }

  /**
   * @param {import('./tree.js').Node|null|undefined} node
   * @returns {number}
   */
  _monitorIndexOfNode(node) {
    if (!node) return -1;
    const mon = this._monitorLiveOfNode(node);
    if (mon?.nodeValue) {
      const idx = Utils.monitorIndex(mon.nodeValue);
      if (Number.isFinite(idx) && idx >= 0) return idx;
    }
    const id = forestIdFromLive(this, node);
    const tom = id ? this.forest?.nodes?.[id] : null;
    if (this.forest && tom) {
      const tomMon = ancestorMonitor(this.forest, tom);
      if (tomMon) {
        const liveMon = this.liveById?.get?.(tomMon.id);
        const idx = Utils.monitorIndex(liveMon?.nodeValue ?? tomMon.id);
        if (Number.isFinite(idx) && idx >= 0) return idx;
      }
    }
    const gMon = this.tree?.findAncestor?.(node, NODE_TYPES.MONITOR);
    if (gMon?.nodeValue) {
      const idx = Utils.monitorIndex(gMon.nodeValue);
      if (idx >= 0) return idx;
    }
    const meta = node.nodeValue;
    if (meta && typeof meta.get_monitor === "function") {
      const m = meta.get_monitor();
      return m >= 0 ? m : -1;
    }
    return -1;
  }

  _windowsUnderLive(root) {
    return windowsUnderLive(this, root);
  }

  /** Forest-aware under-attach (GObject contains misses empty CON childNodes). */
  _liveIsUnderAttach(attach, node) {
    if (!attach || !node) return false;
    if (attach === node) return true;
    if (typeof attach.contains === "function" && attach.contains(node)) return true;
    let cur = node;
    const seen = new Set();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      if (cur === attach) return true;
      const p = liveParentForPresent(this, cur);
      if (!p || p === cur) break;
      cur = p;
    }
    return false;
  }

  _lastTileOnMonitor(monIndex) {
    return lastTileOnMonitor(this, monIndex);
  }

  /**
   * Touch LFT MRU when the node is a tiled window.
   * @param {import('./tree.js').Node|null|undefined} nodeWindow
   */
  _lftTouchIfTile(nodeWindow) {
    if (!nodeWindow || !this.lftMru) return;
    if (!nodeWindow.isWindow?.() || !nodeWindow.isTile?.()) return;
    const mon = this._monitorIndexOfNode(nodeWindow);
    this.lftMru.touch(nodeWindow, mon);
    // Keep attachNode aligned with the global LFT when practical.
    this.tree.attachNode = nodeWindow;
  }

  /**
   * Record a dock/favorites-style launch for sticky-mon matching.
   * @param {number} monitorIndex
   * @param {{ appId?: string|null }} [opts]
   */
  noteDockLaunch(monitorIndex, opts = {}) {
    if (monitorIndex == null || monitorIndex < 0) return;
    const now = Date.now();
    this._pendingDockLaunches = (this._pendingDockLaunches || []).filter(
      (e) => now - e.ts <= DOCK_LAUNCH_TTL_MS
    );
    this._pendingDockLaunches.push({
      monitor: monitorIndex,
      appId: opts.appId ?? null,
      ts: now,
    });
  }

  detectDockLaunchMonitor(metaWindow) {
    return openPlaceDetectDockLaunchMonitor(this, metaWindow);
  }

  _pointerMonitorIndex() {
    return pointerMonitorIndex(this);
  }

  _emptyTileMonitorIndices() {
    return emptyTileMonitorIndices(this);
  }

  /**
   * Monitor for dock sticky notes: pointer geometry first, else current mon.
   * Focus mon is wrong here — left-dock click while focus is on the right must
   * still note the left mon under the cursor.
   * @returns {number}
   */
  _resolveDockLaunchMonitor() {
    const ptrMon = this._pointerMonitorIndex();
    if (ptrMon >= 0) return ptrMon;
    try {
      const cur = global.display?.get_current_monitor?.();
      if (typeof cur === "number" && cur >= 0) return cur;
    } catch (_e) {
      /* fall through */
    }
    return 0;
  }

  /**
   * Best-effort: wrap Shell.App activate / open_new_window / activate_full so
   * dock/favorites launches record sticky mon (pointer mon; overview skipped).
   * Active WM is refreshed on each enable so disable/re-enable does not orphan
   * the shared prototype hook. Explicit: noteDockLaunch / _forgeDockMonitor.
   */
  _tryInstallDockLaunchHook() {
    try {
      const App = Shell.App;
      if (!App?.prototype) return;
      // Shared hook → live WM (new ForgeAdapterGnome each extension enable).
      App.prototype._forgeDockWm = this;
      this._dockLaunchHooked = true;
      if (App.prototype._forgeDockLaunchHooked) return;
      const wrap = (methodName) => {
        const orig = App.prototype[methodName];
        if (typeof orig !== "function") return;
        App.prototype[methodName] = function (...args) {
          try {
            const wmRef = App.prototype._forgeDockWm;
            if (!Main.overview?.visible && wmRef && !wmRef.disabled) {
              const mon =
                typeof wmRef._resolveDockLaunchMonitor === "function"
                  ? wmRef._resolveDockLaunchMonitor()
                  : global.display.get_current_monitor();
              const appId = typeof this.get_id === "function" ? this.get_id() : null;
              wmRef.noteDockLaunch(mon, { appId });
            }
          } catch (_e) {
            // never break app launch
          }
          return orig.apply(this, args);
        };
      };
      wrap("activate");
      wrap("open_new_window");
      wrap("activate_full");
      App.prototype._forgeDockLaunchHooked = true;
    } catch (_e) {
      // Shell.App missing (unit mock) — noteDockLaunch remains the API.
    }
  }

  _resolveAttachTarget(metaMonWsNode, windowNodes, hasWindows, attachLft = null) {
    return resolveAttachTarget(this, metaMonWsNode, windowNodes, hasWindows, attachLft);
  }

  /** D099: instant tab/stack label only. No chrome size, no renderTree. */
  _paintTitleChromeLabel(node) {
    return signalsPaintTitleChromeLabel(node);
  }

  /**
   * Bind the per-window and per-actor signals for a newly tracked window, once.
   * Handlers close over windowActor / wm; stored on metaWindow.windowSignals /
   * windowActor.actorSignals for disable().
   */
  _bindWindowSignals(metaWindow, windowActor) {
    return signalsBindWindowSignals(this, metaWindow, windowActor);
  }

  postProcessWindow(nodeWindow) {
    let metaWindow = nodeWindow.nodeValue;
    if (metaWindow) {
      if (metaWindow.get_title() === this.prefsTitle) {
        metaWindow
          .get_workspace()
          .activate_with_focus(metaWindow, global.display.get_current_time());
        this.moveCenter(metaWindow);
      }
      // forge-f081: the old else-branch called movePointerWith(metaWindow), but
      // movePointerWith expects a tree Node (it guards on ._data) so the raw
      // Meta.Window made it a no-op since 2023. Pointer-follow for a new focus-
      // stealing window is already handled by the queued focus handler with a
      // proper Node — the dead call is removed rather than "fixed" into a warp
      // that would yank the pointer to non-focus-stealing new windows.
    }
  }

  setOpenLeaf(focusNodeWindow) {
    return this.focusManager.setOpenLeaf(focusNodeWindow);
  }

  updateStackedFocus(focusNodeWindow) {
    return this.focusManager.updateStackedFocus(focusNodeWindow);
  }

  updateTabbedFocus(focusNodeWindow) {
    return this.focusManager.updateTabbedFocus(focusNodeWindow);
  }

  /**
   * Explicit/debug: size every TABBED/STACKED TILE peer to the shared group slot.
   * Not on the happy-path render wave (D095 S5); tab click stays raise-only.
   * @param {{ force?: boolean }} [opts]
   * @returns {number}
   */
  reassertAllTabStackSlots(opts = {}) {
    return this.focusManager.reassertAllTabStackSlots(opts);
  }

  /**
   * FocusChanged pipeline: F → Dfocus → B → P → A.
   * Only body for ordinary focus entries (Meta / cmd / tab / DBus / overview).
   * @param {import('./tree.js').Node|null|undefined} node
   * @param {{ source?: string, forcePointer?: boolean }} [opts]
   */
  afterFocus(node, opts = {}) {
    return afterFocusPipeline(this, node, opts);
  }

  /**
   * Exit a transient Forge mode (selection / grab UI). Stable API for FC2 Esc.
   * @returns {boolean} true if a mode was active and exited (skip unfocus)
   */
  exitForgeMode() {
    // No selection/grab modes yet — always no-op.
    return false;
  }

  /** Clear TILE keyboard focus (best-effort). See FocusManager.unfocusTiles. */
  unfocusTiles() {
    return this.focusManager.unfocusTiles();
  }

  /**
   * StructureChanged / SizeOnly: one C (Cq or Cf). See docs/dev/actions.md.
   * @param {string} [reason]
   * @param {{ force?: boolean }} [opts]
   */
  commitLayout(reason, opts = {}) {
    return commitLayoutPipeline(this, reason, opts);
  }

  /**
   * Post-structure tab/stack open leaf without a second full commit.
   * @param {import('./tree.js').Node|null|undefined} node
   */
  settleTabFocus(node) {
    return settleTabFocusPipeline(this, node);
  }

  /**
   * Show this child as the TABBED/STACKED open leaf. See docs/dev/contracts.md.
   * @param {import('./tree.js').Node|null|undefined} node
   * @param {{ keyboard?: boolean, pin?: boolean, source?: string }} [opts]
   */
  revealGroupChild(node, opts = {}) {
    return revealGroupChildPipeline(this, node, opts);
  }

  _isInSkipList(settingKey, value) {
    let skipStr = this.ext.settings.get_string(settingKey);
    if (!skipStr || skipStr.trim() === "") return false;
    return skipStr.split(",").some((item) => item.trim() === `${value}`);
  }

  /**
   * Check if a given workspace index is skipped for tiling.
   * @param {number} wsIndex - Workspace index to check
   * @returns {boolean} True if workspace is skipped (not tiled)
   */
  _isWorkspaceSkipped(wsIndex) {
    const skip = this._isInSkipList("workspace-skip-tile", wsIndex);
    if (skip) Logger.debug(`workspace skip-tile idx=${wsIndex}`);
    return skip;
  }

  /**
   * Check if a Meta Window's workspace is skipped for tiling.
   */
  isActiveWindowWorkspaceTiled(metaWindow) {
    if (!metaWindow) return true;
    let activeWorkspaceForWin = metaWindow.get_workspace();
    if (!activeWorkspaceForWin) return true;
    return !this._isWorkspaceSkipped(activeWorkspaceForWin.index());
  }

  /**
   * Check the current active workspace's tiling mode
   */
  isCurrentWorkspaceTiled() {
    let wsMgr = global.workspace_manager;
    let wsIndex = wsMgr.get_active_workspace_index();
    return !this._isWorkspaceSkipped(wsIndex);
  }

  /**
   * Feature #295: Check if a window's monitor should be tiled
   */
  isActiveWindowMonitorTiled(metaWindow) {
    if (!metaWindow) return true;
    return !this._isInSkipList("monitor-skip-tile", metaWindow.get_monitor());
  }

  trackCurrentWindows() {
    return lifeTrackCurrentWindows(this);
  }

  /**
   * Live Meta windows vs tree membership (map-pin / second-apply reuse).
   * @returns {object[]}
   */
  censusMetaWindows() {
    const seen = new Set();
    const entries = [];
    const push = (metaWindow) => {
      if (!metaWindow || seen.has(metaWindow)) return;
      seen.add(metaWindow);
      const node = this.tree?.findNode?.(metaWindow);
      const tracked = !!(node && node.isWindow?.());
      const valid = this._validWindow(metaWindow);
      const ignored = this.isWindowIgnored(metaWindow);
      const skip = untrackedSkipReason({ tracked, valid, ignored });
      let wmClassInstance = null;
      try {
        wmClassInstance = metaWindow.get_wm_class_instance?.() || null;
      } catch (_e) {
        wmClassInstance = null;
      }
      const meta = windowMetaFields(metaWindow);
      const parent = node?.parentNode;
      let parentId = null;
      if (parent?.nodeValue != null && typeof parent.nodeValue !== "object") {
        parentId = String(parent.nodeValue);
      } else if (parent?.isWindow?.()) {
        parentId = windowMetaFields(parent.nodeValue).id ?? "WINDOW";
      } else if (parent?.nodeType) {
        parentId = parent.nodeType;
      }
      entries.push(
        summarizeCensusEntry({
          ...meta,
          windowId: meta.id,
          wmClassInstance,
          tracked,
          mode: node?.mode ?? null,
          floatExempt: tracked ? this.isFloatingExempt(metaWindow) : null,
          parentType: parent?.nodeType ?? null,
          parentId,
          skip,
        })
      );
    };
    for (const meta of this.windowsAllWorkspaces || []) push(meta);
    for (const node of this.tree?.getNodeByType?.(NODE_TYPES.WINDOW) || []) {
      if (node?.placeholder || node?.isPlaceholder?.()) continue;
      push(node.nodeValue);
    }
    return entries;
  }

  /**
   * Track valid Meta windows that missed window-created / dest attach.
   * @returns {{ ok: true, admitted: number, skipped: number, total: number }}
   */
  admitUntrackedWindows() {
    const before = this.allNodeWindows.length;
    const census = this.censusMetaWindows();
    let skipped = 0;
    for (const row of census) {
      if (row.tracked) continue;
      if (row.skip) {
        skipped += 1;
        continue;
      }
    }
    for (const meta of this.windowsAllWorkspaces || []) {
      if (this.findNodeWindow(meta)) continue;
      if (!this._validWindow(meta) || this.isWindowIgnored(meta)) continue;
      Logger.trace(
        `layout-track: admit class=${meta.get_wm_class?.()} title=${JSON.stringify(
          meta.get_title?.()
        )}`
      );
      this.trackWindow(global.display, meta);
    }
    const after = this.allNodeWindows.length;
    const admitted = Math.max(0, after - before);
    const summary = summarizeCensus(this.censusMetaWindows());
    sessionLayoutTrace(`layout-track: admit done admitted=${admitted} ${JSON.stringify(summary)}`);
    return {
      ok: true,
      admitted,
      skipped,
      total: census.length,
    };
  }

  _validWindow(metaWindow) {
    // Bug #309, #322 fix: Filter out XWayland Video Bridge and ddterm windows
    const wmClass = metaWindow.get_wm_class();
    if (wmClass && wmClass.toLowerCase().includes("xwaylandvideobridge")) {
      return false;
    }
    if (wmClass && wmClass.toLowerCase().includes("ddterm")) {
      return false;
    }

    const windowType = metaWindow.get_window_type();
    if (INVALID_WINDOW_TYPES.has(windowType)) return false;
    return VALID_WINDOW_TYPES.has(windowType);
  }

  _destroyActorBorder(...a) {
    return this.decorationManager._destroyActorBorder(...a);
  }

  forgetHostWindow(liveOrMeta, reason) {
    return destroyForgetHostWindow(this, liveOrMeta, reason);
  }

  windowDestroy(actor) {
    return destroyWindowDestroy(this, actor);
  }

  _captureFocusRestore(closedNodeWindow) {
    return destroyCaptureFocusRestore(this, closedNodeWindow);
  }

  _metaWindowId(metaWindow) {
    return destroyMetaWindowId(metaWindow);
  }

  _findMetaWindowById(id) {
    return destroyFindMetaWindowById(this, id);
  }

  _restoreFocusAfterWindowClosed(restore) {
    return destroyRestoreFocusAfterWindowClosed(this, restore);
  }

  /**
   * Handles any workspace/monitor update for the Meta.Window.
   */
  updateMetaWorkspaceMonitor(from, _monitor, metaWindow) {
    if (this._validWindow(metaWindow)) {
      if (metaWindow.get_workspace() === null) return;

      // OP1 dock sticky: force Meta back to dock mon during grace; skip re-home.
      if (this._enforceDockStickyIfNeeded(metaWindow)) {
        try {
          resyncWmAndPaint(this, "entered-monitor", {
            skipSingletonSettle: this.isApplyEpochLive?.(),
          });
        } catch (_e) {
          /* best-effort */
        }
        this.renderTree(from);
        return;
      }

      let existNodeWindow = this.findNodeWindow(metaWindow);
      // R012: drop owns mon while GRAB_TILE (workspace/track paths too).
      if (
        existNodeWindow &&
        (existNodeWindow.isGrabTile?.() ||
          existNodeWindow.mode === WINDOW_MODES.GRAB_TILE ||
          this._draggedNodeWindow === existNodeWindow)
      ) {
        return;
      }
      let metaMonWs = Utils.createMonitorWorkspaceId(
        metaWindow.get_monitor(),
        metaWindow.get_workspace().index()
      );
      let metaMonWsNode = this.tree.findNode(metaMonWs);
      if (existNodeWindow) {
        if (existNodeWindow.parentNode && metaMonWsNode) {
          // Uses the existing workspace, monitor that the metaWindow
          // belongs to.
          let containsWindow = metaMonWsNode.contains(existNodeWindow);
          if (!containsWindow) {
            this.lftMru?.dropMonRings?.(existNodeWindow);
            this._rehomeWindowPreservingContainer(existNodeWindow, metaWindow, metaMonWsNode);

            // Ensure that the workspace tiling is honored
            if (this.isActiveWindowWorkspaceTiled(metaWindow)) {
              if (this.grabOp !== Meta.GrabOp.WINDOW_BASE) this.updateTabbedFocus(existNodeWindow);
              this.updateStackedFocus(existNodeWindow);
            } else {
              // forge-5l9b: skip floats demoted under a fullscreen window —
              // raise() would silently undo _reconcileFullscreenFloatDemotion.
              if (
                this.floatingWindow(existNodeWindow) &&
                !existNodeWindow._aboveDemotedForFullscreen &&
                !this._isDeferredOpen(metaWindow)
              ) {
                existNodeWindow.nodeValue.raise();
              }
            }
          } else if (this._liveForestSeeded && this.forest && this.hostBag) {
            const nid = this.hostBag.idFromMeta?.(metaWindow);
            if (!nid || !this.forest.nodes[nid]) {
              const bagFloat = nid ? this.hostBag.get(nid)?.floating : undefined;
              forestInsertWindow(this, existNodeWindow, {
                underFloats:
                  typeof bagFloat === "boolean"
                    ? bagFloat
                    : liveTilesParented(existNodeWindow, this)
                    ? false
                    : !!existNodeWindow.isFloat?.(),
              });
            }
          }
        }
        try {
          resyncWmAndPaint(this, "entered-monitor", {
            skipSingletonSettle: this.isApplyEpochLive?.(),
          });
        } catch (_e) {
          /* best-effort */
        }
      }
      this.renderTree(from);
    }
  }

  /**
   * During dock sticky grace, keep Meta on the dock monitor and refuse re-home.
   * @param {Meta.Window} metaWindow
   * @returns {boolean} true if sticky policy handled the event (caller should stop)
   */
  _enforceDockStickyIfNeeded(metaWindow) {
    const stickyMon = metaWindow?._forgeDockStickyMon;
    const until = metaWindow?._forgeDockStickyUntil ?? 0;
    if (typeof stickyMon !== "number" || stickyMon < 0) return false;
    if (Date.now() > until) {
      metaWindow._forgeDockStickyMon = undefined;
      metaWindow._forgeDockStickyUntil = undefined;
      return false;
    }
    safeMoveToMonitor(metaWindow, stickyMon, "dock sticky re-force");
    // Tree should already be on sticky mon from trackWindow; do not re-home away.
    const existNodeWindow = this.findNodeWindow(metaWindow);
    if (!existNodeWindow) return true;
    const ws = metaWindow.get_workspace()?.index?.() ?? 0;
    const stickyId = Utils.createMonitorWorkspaceId(stickyMon, ws);
    const stickyNode = this.tree.findNode(stickyId);
    if (stickyNode && !stickyNode.contains(existNodeWindow)) {
      this._rehomeWindowPreservingContainer(existNodeWindow, metaWindow, stickyNode);
    }
    return true;
  }

  /**
   * forge-6pe: Re-home a window onto `destNode`, preserving an intact sub-tree.
   *
   * If the window's enclosing container is migrating in full to the same
   * destination, the whole container is moved (walking up to the highest such
   * ancestor) so nested sub-splits / proportions survive; otherwise just the
   * window moves. Lone-window rehomes prefer after dest-mon LFT (not mon root)
   * so open-under-focus / dock map thrash does not flatten to mon-root end.
   *
   * @param {Node} existNodeWindow - The tracked window node to re-home.
   * @param {Meta.Window} metaWindow - Its Meta.Window (defines the destination).
   * @param {Node} destNode - The destination monitor node.
   */
  _rehomeWindowPreservingContainer(existNodeWindow, metaWindow, destNode) {
    let nodeToMove = existNodeWindow;
    let ancestor = existNodeWindow.parentNode;
    while (
      ancestor &&
      ancestor.nodeType === NODE_TYPES.CON &&
      this._containerFullyMigrates(ancestor, metaWindow)
    ) {
      nodeToMove = ancestor;
      ancestor = ancestor.parentNode;
    }

    let sourceParent = nodeToMove.parentNode;
    let sourceFullyMigrates = this._containerFullyMigrates(sourceParent, metaWindow);

    // Lone window: attach after dest mon LFT when present (keeps open-under-focus).
    if (
      nodeToMove === existNodeWindow &&
      this._rehomeAttachAfterMonLft(existNodeWindow, destNode)
    ) {
      if (!sourceFullyMigrates && sourceParent) {
        this._redistributeSiblingPercent(sourceParent);
      }
      return;
    }

    if (this._liveForestSeeded) forestEnsureSpineNode(this, destNode);
    if (!forestReparent(this, nodeToMove, destNode)) {
      if (this._liveForestSeeded) recordFallback("rehome", "ids-miss");
      else destNode.appendChild(nodeToMove);
    }
    // Only rebalance the source if it keeps windows. A fully-migrating source is
    // emptying, and rescaling it would corrupt the proportions the departing
    // windows carry to the destination.
    if (!sourceFullyMigrates) {
      this._redistributeSiblingPercent(sourceParent);
    }
  }

  /**
   * Insert a rehomed window after dest-mon LFT (or focused tile on that mon).
   * @param {Node} existNodeWindow
   * @param {Node} destMonNode
   * @returns {boolean} true if reparented after LFT
   */
  _rehomeAttachAfterMonLft(existNodeWindow, destMonNode) {
    if (assertionFailed()) return false;
    if (!existNodeWindow || !destMonNode || !destMonNode.contains) return false;
    if (destMonNode.contains(existNodeWindow)) return false;

    const monIdx = this._monitorIndexOfNode(destMonNode);
    let attachLft = monIdx >= 0 ? this.lftMru?.monHead?.(monIdx) ?? null : null;
    if (attachLft?.nodeValue) {
      const live = this.findNodeWindow(attachLft.nodeValue);
      if (live) attachLft = live;
    }
    // Focused tile on dest mon beats stale mon LFT.
    const focusMeta = this.focusMetaWindow;
    if (focusMeta) {
      const focusNode = this.findNodeWindow(focusMeta);
      if (
        focusNode?.isWindow?.() &&
        focusNode.isTile?.() &&
        !focusNode.isFloat?.() &&
        focusNode !== existNodeWindow &&
        destMonNode.contains(focusNode)
      ) {
        attachLft = focusNode;
      }
    }
    if (!attachLft || attachLft === existNodeWindow) return false;
    if (!destMonNode.contains(attachLft)) return false;

    // Same insert-A helper as trackWindow (residual / rehome admit).
    const unit = this._resolveInsertUnit(attachLft) || attachLft;
    const meta = existNodeWindow.nodeValue;
    const minDecision = meta ? this._decideOpenMinPlacement(meta, attachLft) : null;
    if (minDecision?.kind === "float") {
      try {
        if (meta) this.addFloatOverride(meta, true);
      } catch (_e) {
        /* best-effort */
      }
      existNodeWindow.float = true;
      this.lftMru?.remove?.(existNodeWindow);
      if (this.forest && this._liveForestSeeded) {
        forestSetWindowFloating(this, existNodeWindow, true);
      } else {
        destMonNode.appendChild(existNodeWindow);
      }
      return true;
    }
    if (minDecision?.kind === "tab" && minDecision.targetUnit) {
      const tabCon = this._ensureTabbedForOpen(minDecision.targetUnit);
      if (tabCon) {
        if (!forestReparent(this, existNodeWindow, tabCon)) {
          if (this._liveForestSeeded) recordFallback("rehome-lft", "ids-miss");
          else tabCon.appendChild(existNodeWindow);
        }
        try {
          this._insertChildPercent(
            this._membershipParentLive(existNodeWindow) || existNodeWindow.parentNode,
            existNodeWindow
          );
        } catch (_e) {
          /* best-effort share */
        }
        return true;
      }
    }

    const leftoverSlot = this._hvSlotToJoin(unit);
    if (leftoverSlot) {
      const leftoverLay = this._layoutFromOrientation(this._orientationFromUnit(leftoverSlot));
      if (!forestSetLayout(this, leftoverSlot, leftoverLay)) {
        if (this._liveForestSeeded) recordFallback("setLayout", "ids-miss");
        else leftoverSlot.layout = leftoverLay;
      }
      if (!forestReparent(this, existNodeWindow, leftoverSlot)) {
        if (this._liveForestSeeded) recordFallback("rehome-lft", "ids-miss");
        else leftoverSlot.appendChild(existNodeWindow);
      }
    } else {
      this._maybeAspectSplitForOpen(attachLft);
      this.slotSplitForInsert(unit);
      if (!unit?.parentNode) return false;
      if (!forestReparent(this, existNodeWindow, unit, { destIsWindow: true })) {
        if (this._liveForestSeeded) recordFallback("rehome-lft", "ids-miss");
        else unit.parentNode.insertBefore(existNodeWindow, unit.nextSibling);
      }
    }
    try {
      this._insertChildPercent(
        this._membershipParentLive(existNodeWindow) || existNodeWindow.parentNode,
        existNodeWindow
      );
    } catch (_e) {
      /* best-effort share */
    }
    return true;
  }

  /**
   * forge-6pe: GNOME's WindowManager.insertWorkspace moves many windows in one
   * synchronous burst (change_workspace_by_index per window), and Mutter emits
   * each window's workspace-changed synchronously mid-loop. Re-homing eagerly on
   * each event therefore sees a half-migrated tree and flattens nested layouts.
   * Coalesce the burst into a single idle pass that runs once the batch settles,
   * so whole sub-trees can be moved intact.
   */
  _queueWindowHomeReconcile() {
    if (this._wmSources.has("windowHomeReconcile")) return;
    this._wmSources.setIdle("windowHomeReconcile", () => {
      this._reconcileWindowHomes();
      this.trackCurrentMonWs();
      this.renderTree("workspace-changed-reconcile");
    });
  }

  /**
   * forge-6pe: Move every tracked window whose live (monitor, workspace) no longer
   * matches its tree position to the correct monitor node, preserving intact
   * sub-trees. Runs after a workspace-change burst has settled so the
   * "is the whole container migrating?" test reflects the final state.
   */
  _reconcileWindowHomes() {
    const windowNodes = this.tree.getNodeByType(NODE_TYPES.WINDOW);
    for (const wNode of windowNodes) {
      this._rehomeWindowToLiveLocation(wNode);
    }
  }

  /**
   * forge-6pe / forge-ojew: Re-home a single window node to the monitor node that
   * matches its Meta.Window's live (monitor, workspace), preserving an intact
   * sub-tree. No-op when the window is invalid, has no workspace, the destination
   * node doesn't exist, or it already lives there. Shared by the settled idle
   * reconcile and the synchronous workspace-removed rehome.
   *
   * @param {Node} wNode - The tracked window node to re-home.
   */
  _rehomeWindowToLiveLocation(wNode) {
    const metaWindow = wNode.nodeValue;
    // forge-c2yp: a finalized wrapper (missed-actor-destroy race) throws on the
    // first property read; _validWindow's get_wm_class() would abort the whole
    // workspace-removed handler. Skip dead nodes — the render prune collects them.
    if (!Utils.isWindowAlive(metaWindow)) return;
    if (isPlaceholderNode(wNode) || isPlaceholderValue(metaWindow)) return;
    if (!this._validWindow(metaWindow)) return;
    if (typeof metaWindow.get_workspace !== "function") return;
    const ws = metaWindow.get_workspace();
    if (!ws) return;
    const destNode = this.tree.findNode(
      Utils.createMonitorWorkspaceId(metaWindow.get_monitor(), ws.index())
    );
    if (!destNode || destNode.contains(wNode)) return;
    this._rehomeWindowPreservingContainer(wNode, metaWindow, destNode);
  }

  /**
   * forge-ojew: Before a workspace subtree is spliced out (workspace-removed),
   * synchronously re-home its still-tracked window descendants to the surviving
   * workspace their Meta.Window now reports. Mutter emits each window's
   * 'workspace-changed' (queued for idle reconcile) BEFORE the synchronous
   * 'workspace-removed', so removeChild would otherwise detach those WINDOW nodes
   * and strand them — the idle reconcile, running later, can no longer find them.
   * Rehoming here keeps them tiled; the subsequent removeWorkspace then splices a
   * window-free subtree. Windows without a valid surviving destination are left for
   * the existing idle reconcile / workareas fallback.
   *
   * @param {number} wsIndex - Index of the workspace about to be removed.
   */
  _rehomeWorkspaceWindowsBeforeRemoval(wsIndex) {
    const wsNode = this.tree.findNode(`ws${wsIndex}`);
    if (!wsNode) return;
    // Snapshot: rehoming mutates the tree (moves nodes out of this subtree).
    const windowNodes = [...wsNode.getNodeByType(NODE_TYPES.WINDOW)];
    for (const wNode of windowNodes) {
      // forge-c2yp: never let one node abort the caller — removeWorkspace and the
      // index renumber MUST still run, or the ws-index scaffold desyncs for good.
      try {
        this._rehomeWindowToLiveLocation(wNode);
      } catch (e) {
        Logger.warn(`_rehomeWorkspaceWindowsBeforeRemoval: skipping node: ${e}`);
      }
    }
  }

  /**
   * forge-6pe: True when every *live* window beneath `node` now lives on the same
   * monitor + workspace as `metaWindow` — i.e. the whole sub-tree is migrating
   * together (as happens when GNOME shifts an entire workspace). Dead/finalized
   * siblings are ignored so they cannot unwrap a group. Used to move an intact
   * container instead of flattening windows one by one.
   *
   * @param {Node} node - A container (CON or MONITOR) node to test.
   * @param {Meta.Window} metaWindow - The migrating window defining the destination.
   * @returns {boolean}
   */
  _containerFullyMigrates(node, metaWindow) {
    if (!node) return false;
    // The _queueWindowHomeReconcile idle that reaches here has no try/catch; a
    // window closing during a multi-workspace shift can finalize the wrapper, so
    // probe liveness before get_workspace() (forge-7bry — consistent with the
    // per-node guard in the .every() below).
    if (!Utils.isWindowAlive(metaWindow)) return false;
    const destWs = metaWindow.get_workspace();
    if (!destWs) return false;
    const destWsIndex = destWs.index();
    const destMon = metaWindow.get_monitor();
    const windowNodes = node.getNodeByType(NODE_TYPES.WINDOW);
    if (!windowNodes || windowNodes.length === 0) return false;
    // Dead/finalized siblings must not block intact migration (one closing tab
    // should not unwrap the rest of a STACKED/TABBED or H/V group).
    const live = windowNodes.filter((wn) => Utils.isWindowAlive(wn.nodeValue));
    if (live.length === 0) return false;
    return live.every((wn) => {
      const mw = wn.nodeValue;
      // forge-c2yp: a finalized sibling throws when get_workspace() is CALLED, so
      // the method-exists truthiness check isn't enough — probe real liveness.
      const ws = mw.get_workspace();
      return ws && ws.index() === destWsIndex && mw.get_monitor() === destMon;
    });
  }

  /**
   * Handle any updates to the current focused window's position.
   * Useful for updating the active window border, etc.
   *
   * CL2 / D026 attribution:
   *  - Stack suppress OR active command echo epoch → chrome only
   *  - TILE already in slot → chrome only
   *  - TILE mins exceed slot → rehome/float (not restore)
   *  - Unsolicited TILE max / Meta-fs / size → slot restore
   *  - Other external drift → markUnsettled + diagnostic requestVerify
   */
  updateMetaPositionSize(_metaWindow, from) {
    // Passive learn only after scheduled settle (_scheduleMinClampLearn). Live
    // size-changed jitter must not raise class floors (false overflow-float).

    // Pending-open quiet before echo skip (first-slot map write).
    if (_metaWindow && this._openCommitPending?.has(_metaWindow) && !this._suppressGeom?.active) {
      this._touchOpenCommitExternalGeometry(_metaWindow);
      const cls = extractWmClass(_metaWindow);
      if (cls && this.appThrashCatalog && /size/i.test(from || "")) {
        this.appThrashCatalog.recordPostMapSizeChange(cls);
      }
      this.updateBorderLayout();
      return;
    }

    // Our move/apply re-fires size/position; chrome only.
    if (isForgeCausedGeometrySignal(this, _metaWindow)) {
      this.updateBorderLayout();
      return;
    }

    let focusMetaWindow = this.focusMetaWindow;
    let focusNodeWindow = focusMetaWindow ? this.findNodeWindow(focusMetaWindow) : null;
    let tilingModeEnabled = this.ext.settings.get_boolean("tiling-mode-enabled");
    // Wayland focus can lag the Mutter grab window (same as grab-begin). Prefer
    // the snapshotted drag node so titlebar position-changed still paints zones.
    const grabNode = this._draggedNodeWindow?.grabMode ? this._draggedNodeWindow : focusNodeWindow;
    const grabMeta = grabNode?.nodeValue || focusMetaWindow;

    if (grabNode?.grabMode && tilingModeEnabled) {
      // forge-v4wh: max/fs inside the keyboard-resize debounce must not feed
      // _handleResizing (that bakes the full-monitor frame into split percents).
      if (this._shouldRejectExternalMaximize(grabNode, grabMeta)) {
        this._wmSources.cancel("manualResizeEnd");
        this._manualResizeEndWindow = null;
        this._grabCleanup(grabNode);
        this._restoreTileToSlot(grabNode, grabMeta);
      } else if (
        grabNode.grabMode === GRAB_TYPES.RESIZING &&
        Compat.getMaximizeFlags(grabMeta) === 0 &&
        !(grabMeta.is_fullscreen && grabMeta.is_fullscreen())
      ) {
        this._handleResizing(grabNode);
      } else if (grabNode.grabMode === GRAB_TYPES.MOVING) {
        this._handleMoving(grabNode);
      }
    } else {
      recordD100Observe(from || "geom");
    }
    this.updateBorderLayout();
    // Full decoration hide/show is expensive (all mons). Skip when:
    //  - grab path needs live strip (below), or covering max/fs/zoom needs hide;
    //  - otherwise renderTree owns strip restack after layout, and in-slot
    //    external geom must not flash the other monitor's TABBED group.
    const grabLive = !!(grabNode?.grabMode && tilingModeEnabled);
    const coveringNode = grabMeta ? this.findNodeWindow(grabMeta) : null;
    const covering =
      !!grabMeta &&
      (Compat.isMaximized(grabMeta) ||
        !!(grabMeta.is_fullscreen && grabMeta.is_fullscreen()) ||
        isZoomMode(coveringNode?.zoomMode));
    if (grabLive || covering) {
      this.updateDecorationLayout();
    }
  }

  /**
   * True when a TILE node frame already matches its tree slot (renderRect/rect)
   * within LAYOUT_VERIFY_EPSILON_PX. Full re-layout is unnecessary then.
   */
  _tiledWindowAtTreeSlot(node, metaWindow) {
    const targetRect =
      (typeof this.tree?.paintRectForWindow === "function"
        ? this.tree.paintRectForWindow(node)
        : null) ||
      node?.renderRect ||
      node?.rect ||
      null;
    return shouldChromeOnlyGeometry(node, metaWindow, LAYOUT_VERIFY_EPSILON_PX, {
      isMaximized: (mw) => Compat.getMaximizeFlags(mw) !== 0,
      targetRect,
    });
  }

  /**
   * Reassert one TILE node to its tree slot via move(). No processNode.
   * @param {import('./tree.js').Node|null|undefined} node
   * @param {{ force?: boolean }} [opts]
   * @returns {boolean} true when move was attempted
   */
  reassertNodeToSlot(node, opts = {}) {
    if (!node) return false;
    const mode = node.mode;
    if (mode != null && mode !== WINDOW_MODES.TILE && mode !== "TILE") return false;
    const meta = node.nodeValue;
    if (!meta) return false;
    // Seeded dest = Forest paneRect + gap/zoom (same as presentWmSlots).
    let slot = this._liveForestSeeded && this.forest ? forestSlotPaintRect(this, node) : null;
    if (!slot || !(slot.width > 0) || !(slot.height > 0)) {
      slot =
        (typeof this.tree?.paintRectForWindow === "function"
          ? this.tree.paintRectForWindow(node)
          : null) ||
        node.renderRect ||
        node.rect;
    }
    if (!slot || !(slot.width > 0) || !(slot.height > 0)) return false;
    const force = !!opts.force;
    if (!force && this._tiledWindowAtTreeSlot(node, meta)) return false;
    this.move(meta, slot, null, { force });
    return true;
  }

  /**
   * Targeted Meta↔slot reassert by Meta window id (verify recovery).
   * @param {Array<string|number|null|undefined>} ids
   * @param {{ force?: boolean }} [opts]
   * @returns {number} how many nodes were reasserted
   */
  reassertTilesByIds(ids, opts = {}) {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    const want = new Set(ids.filter((id) => id != null).map((id) => String(id)));
    if (want.size === 0) return 0;
    let nodes = [];
    if (Array.isArray(this.allNodeWindows)) {
      nodes = this.allNodeWindows;
    } else if (this.tree && typeof this.tree.getNodeByType === "function") {
      try {
        nodes = this.tree.getNodeByType(NODE_TYPES.WINDOW) ?? [];
      } catch (_e) {
        nodes = [];
      }
    }
    let n = 0;
    for (const node of nodes) {
      if (!node) continue;
      const meta = node.nodeValue;
      if (!meta) continue;
      let id = null;
      try {
        if (typeof meta.get_id === "function") id = meta.get_id();
        else if (meta.id != null) id = meta.id;
      } catch (_e) {
        id = null;
      }
      if (id == null || !want.has(String(id))) continue;
      if (this.reassertNodeToSlot(node, opts)) n += 1;
    }
    return n;
  }

  /**
   * Grab-time max/fs: restore instead of feeding _handleResizing.
   * Lone-tile maximize-on-single is left alone.
   */
  _shouldRejectExternalMaximize(node, metaWindow) {
    return this._shouldRestoreTileSlot(node, metaWindow, { forGrab: true });
  }

  _shouldRestoreTileSlot(node, metaWindow, extra = null) {
    const forGrab = !!(extra && extra.forGrab);
    // D026 idle-only: skip unsolicited restore while ApplyEpoch or grab.
    if (
      !forGrab &&
      !shouldAllowIdleTileRestore({
        applyEpochLive: this.isApplyEpochLive(),
        grabActive: this._isGrabTileDragWindow(metaWindow),
      })
    ) {
      return false;
    }
    const targetRect =
      (typeof this.tree?.paintRectForWindow === "function"
        ? this.tree.paintRectForWindow(node)
        : null) ||
      node?.renderRect ||
      node?.rect ||
      null;
    return shouldRestoreTileSlot(node, metaWindow, LAYOUT_VERIFY_EPSILON_PX, {
      isMaximized: (mw) => Compat.getMaximizeFlags(mw) !== 0,
      isLoneMaximized: (n) => this._isLoneMaximizedTile(n),
      tilingEnabled: this.ext.settings.get_boolean("tiling-mode-enabled"),
      targetRect,
      ...(extra || {}),
    });
  }

  _restoreTileToSlot(node, metaWindow) {
    if (!node || !metaWindow) return;
    // Machines own place during ApplyEpoch (D039); idle D026 only.
    if (this.isApplyEpochLive()) return;
    // Overflow owns this settle — do not restore into an illegal / visually oversized slot.
    if (this._needsOverflowRehome(node, metaWindow)) {
      this._scheduleOverflowRehome(node);
      return;
    }
    const slot =
      (typeof this.tree?.paintRectForWindow === "function"
        ? this.tree.paintRectForWindow(node)
        : null) ||
      node.renderRect ||
      node.rect;
    let id = "?";
    let cls = "?";
    try {
      id = typeof metaWindow.get_id === "function" ? metaWindow.get_id() : id;
      cls = extractWmClass(metaWindow) || cls;
    } catch (_e) {
      /* ignore */
    }
    Logger.trace(`d026-restore id=${id} class=${cls} slot=${slot?.width}x${slot?.height}`);
    this._suppressGeom.run(() => {
      if (typeof metaWindow.unmake_fullscreen === "function" && metaWindow.is_fullscreen?.()) {
        metaWindow.unmake_fullscreen();
      }
      if (Compat.getMaximizeFlags(metaWindow) !== 0) {
        Compat.unmaximize(metaWindow);
      }
      this.reassertNodeToSlot(node, { force: true });
    });
    // Wayland may apply unmaximize restore-size after move_resize during echo;
    // that size-changed is chrome-only, then silence — heal once post-echo.
    this._schedulePostEchoSlotReassert(metaWindow, slot);
  }

  /**
   * After D026 restore: if Meta still mismatches the slot once echo ends, reassert once.
   * @param {any} metaWindow
   * @param {{ x?: number, y?: number, width?: number, height?: number }|null|undefined} targetRect
   */
  _schedulePostEchoSlotReassert(metaWindow, targetRect) {
    if (!metaWindow || !this._wmSources) return;
    let id = "unknown";
    try {
      id = typeof metaWindow.get_id === "function" ? metaWindow.get_id() : String(id);
    } catch (_e) {
      /* ignore */
    }
    const residual =
      this.layoutEpoch && Number.isFinite(this.layoutEpoch.residualMs)
        ? this.layoutEpoch.residualMs
        : COMMAND_ECHO_RESIDUAL_MS;
    const delay = Math.max(0, residual) + 40;
    this._wmSources.set(`postEchoSlot:${id}`, delay, () => {
      try {
        if (!Utils.isWindowAlive(metaWindow)) return;
        if (this.isApplyEpochLive?.()) return;
        if (this._suppressGeom?.active) return;
        const node = this.findNodeWindow?.(metaWindow);
        if (!node) return;
        const mode = node.mode;
        if (mode != null && mode !== WINDOW_MODES.TILE && mode !== "TILE") return;
        if (this._tiledWindowAtTreeSlot(node, metaWindow)) {
          Logger.trace(`post-echo-slot ok id=${id}`);
          return;
        }
        Logger.trace(`post-echo-slot reassert id=${id}`);
        this.reassertNodeToSlot(node, { force: true });
        this.updateBorderLayout?.();
      } catch (_e) {
        /* ignore */
      }
    });
  }

  /**
   * Lone TILE Meta-max only when maximize-on-single is on (D026 otherwise).
   * Fullscreen is not lone-max (IC3 restores it).
   */
  _isLoneMaximizedTile(node) {
    if (!node || node.mode !== WINDOW_MODES.TILE) return false;
    try {
      if (!this.ext?.settings?.get_boolean?.("window-maximize-on-single")) return false;
    } catch (_e) {
      return false;
    }
    const metaWindow = node.nodeValue;
    if (!metaWindow) return false;
    if (metaWindow.is_fullscreen && metaWindow.is_fullscreen()) return false;
    if (Compat.getMaximizeFlags(metaWindow) === 0) return false;
    const monitor = this.tree.findAncestorMonitor(node);
    return this._tiledWindowsOnMonitor(monitor).length === 1;
  }

  updateDecorationLayout(...a) {
    return this.decorationManager.updateDecorationLayout(...a);
  }

  freezeRender() {
    return presentIdleFreezeRender(this);
  }

  unfreezeRender() {
    return presentIdleUnfreezeRender(this);
  }

  /**
   * Temporarily unfreeze render state, render the tree, then restore.
   * @param {string} from - Debug identifier for the render call
   */
  _renderWithFreezeState(from) {
    return renderWithFreezeState(this, from);
  }

  /**
   * forge-4yl: shared handler for the minimize/unminimize signals. Both reset
   * the focused node's parent sibling percents and re-render under the freeze
   * state. Minimize additionally hides borders and, when the parent has no
   * tiled children left, resets the grandparent's percents too.
   */
  // Dispatch a GSettings "changed" signal. Extracted from the connect() closure so
  // the routing is unit-testable (the mock settings object emits no signals).
  _onSettingsChanged(settingName) {
    return settingsOnSettingsChanged(this, settingName);
  }

  _onMinimizeChange(
    reason,
    { hideBorders = false, resetGrandparentIfEmpty = false, metaWindow = null } = {}
  ) {
    if (hideBorders) this.hideWindowBorders();
    // forge-43zk: reset the container of the window the signal is actually about,
    // not whatever holds the display focus — a background (un)minimize (dock,
    // self-minimize, wmctrl) would otherwise wipe the focused container's ratios.
    let changedNodeWindow = this.findNodeWindow(metaWindow || this.focusMetaWindow);
    if (changedNodeWindow) {
      const parent = changedNodeWindow.parentNode;
      if (parent) {
        if (
          resetGrandparentIfEmpty &&
          this.tree.getTiledChildren(liveChildrenForPresent(this, parent)).length === 0
        ) {
          this._resetSiblingPercent(parent.parentNode);
        }
        this._resetSiblingPercent(parent);
      }
    }
    this._renderWithFreezeState(reason);
  }

  floatingWindow(node) {
    if (!node) return false;
    return node.nodeType === NODE_TYPES.WINDOW && node.mode === WINDOW_MODES.FLOAT;
  }

  /**
   * Moves the pointer along with the nodeWindow's meta
   *
   * This is useful for making sure that Forge calculates the attachNode
   * properly
   */
  movePointerWith(...args) {
    return this.focusManager.movePointerWith(...args);
  }

  warpPointerToNodeWindow(...args) {
    return this.focusManager.warpPointerToNodeWindow(...args);
  }

  getPointer() {
    return global.get_pointer();
  }

  minimizedWindow(node) {
    if (!node) return false;
    const isWin =
      (typeof node.isWindow === "function" && node.isWindow()) ||
      node.nodeType === NODE_TYPES.WINDOW ||
      node._type === NODE_TYPES.WINDOW;
    if (!isWin) return false;
    const meta = node.nodeValue ?? node._data;
    return !!(meta && meta.minimized);
  }

  swapWindowsUnderPointer(...a) {
    return this.dragDrop.swapWindowsUnderPointer(...a);
  }

  _showDropPreview(...a) {
    return this.dragDrop._showDropPreview(...a);
  }

  /** Effective dnd-center-layout; STACKED → TABBED when stack mode off. */
  _resolveDndCenterLayout(...a) {
    return this.dragDrop._resolveDndCenterLayout(...a);
  }

  /** Preview/apply drag-drop tile under pointer. */
  moveWindowToPointer(...a) {
    return this.dragDrop.moveWindowToPointer(...a);
  }

  /** R015 empty-mon grab-end rehome (session-api / live matrix). */
  _commitEmptyMonitorDrop(...a) {
    return this.dragDrop._commitEmptyMonitorDrop(...a);
  }

  canMovePointerInsideNodeWindow(nodeWindow) {
    if (nodeWindow && nodeWindow._data) {
      const metaWindow = nodeWindow.nodeValue;
      const metaRect = metaWindow.get_frame_rect();
      const pointerCoord = global.get_pointer();
      return (
        metaRect &&
        // xdg-copy creates a 1x1 pixel window to capture mouse events.
        metaRect.width > 8 &&
        metaRect.height > 8 &&
        !Utils.rectContainsPoint(metaRect, pointerCoord) &&
        !metaWindow.minimized &&
        !Main.overview.visible &&
        !this.pointerIsOverParentDecoration(nodeWindow, pointerCoord)
      );
    }
    return false;
  }

  pointerIsOverParentDecoration(nodeWindow, pointerCoord) {
    if (pointerCoord && nodeWindow && nodeWindow.parentNode) {
      let node = nodeWindow.parentNode;
      if (node.isStackedOrTabbed()) {
        return Utils.rectContainsPoint(node.rect, pointerCoord);
      }
    }
    return false;
  }

  getPointerPositionInside(nodeWindow) {
    if (nodeWindow && nodeWindow._data) {
      const metaWindow = nodeWindow.nodeValue;
      const metaRect = metaWindow.get_frame_rect();
      // on: last position of cursor inside window
      // on: titlebar: near to app toolbars, menubar, tabs, etc...
      let [wx, wy] = nodeWindow.pointer
        ? [nodeWindow.pointer.x, nodeWindow.pointer.y]
        : [metaRect.width / 2, 8];
      let px = wx >= metaRect.width ? metaRect.width - 8 : wx;
      let py = wy >= metaRect.height ? metaRect.height - 8 : wy;
      return {
        x: metaRect.x + px,
        y: metaRect.y + py,
      };
    }
    return null;
  }

  storePointerLastPosition(nodeWindow) {
    // forge-s02h: this.lastFocusedWindow can point at a disposed Meta.Window
    // (focused window closed / app exited across suspend) whose wrapper keeps
    // _data truthy; guard liveness so get_frame_rect() can't throw.
    if (nodeWindow && nodeWindow._data && Utils.isWindowAlive(nodeWindow.nodeValue)) {
      const metaWindow = nodeWindow.nodeValue;
      const metaRect = metaWindow.get_frame_rect();
      const pointerCoord = global.get_pointer();
      if (Utils.rectContainsPoint(metaRect, pointerCoord)) {
        let px = pointerCoord[0] - metaRect.x;
        let py = pointerCoord[1] - metaRect.y;
        if (px > 0 && py > 0) {
          nodeWindow.pointer = { x: px, y: py };
          Logger.debug(`stored pointer for [${metaWindow.get_title()}] at (${px},${py})`);
        }
      }
    }
  }

  /** Bug #151: pointer for drag target (touch/stylus vs mouse). */
  getDragPointer(...a) {
    return this.dragDrop.getDragPointer(...a);
  }

  findNodeWindowAtPointer(...a) {
    return this.dragDrop.findNodeWindowAtPointer(...a);
  }

  /**
   * Focus the window under the pointer and raise it.
   *
   * @returns {boolean} true if we should continue polling, false otherwise
   */
  _focusWindowUnderPointer() {
    return this.focusManager._focusWindowUnderPointer();
  }

  /**
   * Get the Meta.Window at the pointer coordinates
   *
   * @param {[number, number]} pointer x and y coordinates
   * @returns null if no window is found, otherwise the Meta.Window
   */
  _getMetaWindowAtPointer(pointer) {
    const windows = global.get_window_actors();
    const [x, y] = pointer;

    // Iterate through the windows in reverse order to get the top-most window
    for (let i = windows.length - 1; i >= 0; i--) {
      let window = windows[i];
      let metaWindow = window.meta_window;

      // Feature #396: Skip notification windows and other non-focusable types
      const windowType = metaWindow.get_window_type();
      if (
        windowType === Meta.WindowType.NOTIFICATION ||
        windowType === Meta.WindowType.POPUP_MENU ||
        windowType === Meta.WindowType.DROPDOWN_MENU
      ) {
        continue;
      }

      let { x: wx, y: wy, width, height } = metaWindow.get_frame_rect();

      // Check if the position is within the window bounds
      if (x >= wx && x <= wx + width && y >= wy && y <= wy + height) {
        return metaWindow;
      }
    }

    // No window found at the pointer
    return null;
  }

  /** Finds NodeWindow under pointer coords (uses sortedWindows snapshot). */
  _findNodeWindowAtPointer(...a) {
    return this.dragDrop._findNodeWindowAtPointer(...a);
  }

  _handleGrabOpBegin(...a) {
    return this.dragDrop._handleGrabOpBegin(...a);
  }

  _handleGrabOpEnd(...a) {
    return this.dragDrop._handleGrabOpEnd(...a);
  }

  _grabCleanup(...a) {
    return this.dragDrop._grabCleanup(...a);
  }

  /**
   * Mid-grab destroy must not leave GRAB_TILE / stage track sticky.
   * @param {any} metaWindow
   */
  _clearGrabOnUnmanaged(metaWindow) {
    try {
      const dragged = this._draggedNodeWindow;
      if (dragged?.nodeValue !== metaWindow && dragged?.mode !== WINDOW_MODES.GRAB_TILE) {
        return;
      }
      Logger.debug(
        `grab-unmanaged clear dragged=${dragged?.mode || "-"} grabOp=${this.grabOp || "-"}`
      );
      this.dragDrop?.cancelTabDrag?.();
      this.dragDrop?._disarmGrabPointerTrack?.();
      this._grabCleanup?.(dragged);
      if (this._draggedNodeWindow === dragged) this._draggedNodeWindow = null;
      this.grabOp = null;
      try {
        this.unfreezeRender?.();
      } catch (_e2) {
        /* ignore */
      }
    } catch (_e) {
      /* ignore */
    }
  }

  allowDragDropTile(...a) {
    return this.dragDrop.allowDragDropTile(...a);
  }

  /**
   * forge-12f (gh-305): start-of-grab anchor for the resize pair.
   */
  _pairInitRect(focusNodeWindow, resizePairForWindow) {
    return grabPairInitRect(focusNodeWindow, resizePairForWindow);
  }

  /**
   * Grab-time percent debit for a resolved owning split. changePx is the
   * grabbed frame vs initRect (cumulative); who is target/pair is I3.
   */
  _applyOwningSplitFromGrab(resolved, focusNodeWindow, currentRect, orientation) {
    return grabApplyOwningSplitFromGrab(this, resolved, focusNodeWindow, currentRect, orientation);
  }

  _handleResizing(focusNodeWindow) {
    return grabHandleResizing(this, focusNodeWindow);
  }

  /**
   * Repositions the focused window during resize to prevent "traveling".
   */
  _repositionDuringResize(focusNodeWindow) {
    return grabRepositionDuringResize(this, focusNodeWindow);
  }

  _handleMoving(...a) {
    return this.dragDrop._handleMoving(...a);
  }

  /**
   * Whether a window's WM class matches an override's wmClass value. The override may
   * list several classes comma-separated; each is compared for exact equality.
   */
  _wmClassMatches(overrideWmClass, windowWmClass) {
    return floatWmClassMatches(this, overrideWmClass, windowWmClass);
  }

  // Classify matching TILE overrides by specificity (forge-jbkg):
  //  - "specific" = targets this exact window via wmTitle or wmId (explicit intent)
  //  - "class-only" = matches on wmClass alone, so it matches EVERY window of the
  //    class — including the dialogs/transients/non-resizable windows the bundled
  //    config (Chrome, Evolution, Anki, ...) never meant to force into the grid.
  _classifyTileOverrides(metaWindow) {
    return floatClassifyTileOverrides(this, metaWindow);
  }

  /**
   * Whether a single float override (`kf`) matches `metaWindow`. Shared by
   * _matchesFloatOverride and _matchesSpecificFloatOverride so the per-rule
   * title/class/id matching logic lives in exactly one place (DRY).
   */
  _matchesFloatRule(kf, metaWindow) {
    return floatMatchesFloatRule(this, kf, metaWindow);
  }

  _matchesFloatOverride(metaWindow) {
    return floatMatchesFloatOverride(this, metaWindow);
  }

  // forge-11k: true iff some float override that carries a wmTitle OR wmId (i.e.
  // targets this specific window, not a bare class) matches. Lets a per-title PIP
  // float rule beat a bundled class-only tile rule for Chrome/Brave/Chromium.
  _matchesSpecificFloatOverride(metaWindow) {
    return floatMatchesSpecificFloatOverride(this, metaWindow);
  }

  /**
   * mode: "ignore" — never manage (no tree node / session claim). Stronger than
   * float. User overrides via windows.json; DING Desktop Icons are product-ignore.
   */
  isWindowIgnored(metaWindow) {
    return floatIsWindowIgnored(this, metaWindow);
  }

  isFloatingExempt(metaWindow) {
    return floatIsFloatingExempt(this, metaWindow);
  }

  /**
   * @param {Meta.Window} metaWindow
   * @returns {string|null}
   */
  floatExemptReason(metaWindow) {
    return floatFloatExemptReason(this, metaWindow);
  }

  _getDragDropCenterPreviewStyle(...a) {
    return this.dragDrop._getDragDropCenterPreviewStyle(...a);
  }

  get currentMonWsNode() {
    const monWs = this.currentMonWs;
    if (monWs) {
      return this.tree.findNode(monWs);
    }
    return null;
  }

  get currentWsNode() {
    const ws = this.currentWs;
    if (ws) {
      return this.tree.findNode(ws);
    }
    return null;
  }

  get currentMonWs() {
    const monWs = `${this.currentMon}${this.currentWs}`;
    return monWs;
  }

  get currentWs() {
    const display = global.display;
    const wsMgr = display.get_workspace_manager();
    return `ws${wsMgr.get_active_workspace_index()}`;
  }

  get currentMon() {
    const display = global.display;
    return `mo${display.get_current_monitor()}`;
  }

  /**
   * Reload window overrides from the configuration file
   * This is called when the preferences page modifies the overrides
   */
  /**
   * Reload window overrides from the configuration file.
   * @param {boolean} pruneStaleWmId - When true (startup), drop per-window (wmId)
   *   overrides whose ids are stale from a prior session. Runtime reloads (prefs
   *   edits, ConfigReload) pass false so live FloatToggle'd overrides survive (forge-8rm6).
   */
  reloadWindowOverrides(pruneStaleWmId = true) {
    // Get fresh data from the ConfigManager
    const freshProps = this.ext.configMgr.windowProps;
    if (freshProps) {
      this.windowProps = freshProps;
      if (pruneStaleWmId) {
        const beforeLength = this.windowProps.overrides.length;
        this.windowProps.overrides = this.windowProps.overrides.filter(
          (override) => !override.wmId
        );
        // forge-6c0e: persist the prune. configMgr.windowProps re-reads the file on
        // every access, so a cache-only prune is undone by the first
        // _updateWindowOverrides (window close / float toggle), which reads the
        // still-unpruned file back into the cache and resurrects every stale wmId row.
        if (this.windowProps.overrides.length !== beforeLength) {
          this.ext.configMgr.windowProps = this.windowProps;
        }
      }
      Logger.info(`Reloaded ${this.windowProps.overrides.length} window overrides from file`);
      // Drop already-tracked matches. Use _tree (not tree getter): constructor
      // calls reload before assigning this._tree; the getter would create a
      // throwaway live ROOT and double-bind workspace signals (forge-gw2c).
      if (this._tree) this._dropAllIgnoredWindows();
    }
  }

  _dropAllIgnoredWindows() {
    return destroyDropAllIgnoredWindows(this);
  }

  _dropIfIgnored(metaWindow) {
    return destroyDropIfIgnored(this, metaWindow);
  }

  floatAllWindows() {
    this.tree.getNodeByType(NODE_TYPES.WINDOW).forEach((w) => {
      if (w.isFloat()) {
        w.prevFloat = true;
      }
      w.mode = WINDOW_MODES.FLOAT;
    });
  }

  unfloatAllWindows() {
    this.tree.getNodeByType(NODE_TYPES.WINDOW).forEach((w) => {
      if (!w.prevFloat) {
        w.mode = WINDOW_MODES.TILE;
      } else {
        // Reset the float marker
        w.prevFloat = false;
      }
    });
  }
}
