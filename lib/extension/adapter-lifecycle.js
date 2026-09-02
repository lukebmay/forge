/*
 * ForgeAdapterGnome — enable/disable, global signal bind, reload/track.
 */

import Shell from "gi://Shell";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Logger } from "../shared/logger.js";
import { logMetricsSession, recordD100Observe } from "./metrics.js";
import { NODE_TYPES } from "./tree-types.js";
import { collectDragDropTargetMetaWindows } from "./drag-drop.js";
import { disconnectSignals } from "./signals.js";
import { ensureLiveForest } from "./tom-live.js";
import { setClassMinFloorPersist } from "./tree-layout.js";
import * as Utils from "./utils.js";

export function queueEvent(wm, eventObj, interval = 220) {
  wm.eventQueue.enqueue(eventObj);

  // Paced drain: one event per interval. SourceBag is one-shot, so re-arm
  // while the queue still has work (same effect as the old return-true GLib loop).
  if (!wm._wmSources.has("queue")) {
    const drain = () => {
      const currEventObj = wm.eventQueue.dequeue();
      if (currEventObj) {
        try {
          currEventObj.callback();
        } catch (e) {
          // Bug #531: throw must not wedge the queue forever.
          Logger.warn(`queueEvent: ${currEventObj.name} callback failed: ${e}`);
        }
      }
      if (wm.eventQueue.length !== 0) {
        wm._wmSources.set("queue", interval, drain);
      }
    };
    wm._wmSources.set("queue", interval, drain);
  }
}

export function bindSignals(wm) {
  if (wm._signalsBound) return;

  const display = global.display;
  const shellWm = global.window_manager;
  const globalWsm = global.workspace_manager;
  const bag = wm._wmSignals;
  const gDisplay = { group: "display" };
  const gWm = { group: "windowManager" };
  const gWsm = { group: "workspaceManager" };
  const gSettings = { group: "settings" };
  const gOverview = { group: "overview" };

  bag.connect(display, "window-created", wm.trackWindow.bind(wm), gDisplay);
  bag.connect(display, "grab-op-begin", wm._handleGrabOpBegin.bind(wm), gDisplay);
  bag.connect(
    display,
    "window-entered-monitor",
    wm._onWindowEnteredMonitor.bind(wm),
    gDisplay
  );
  bag.connect(display, "grab-op-end", wm._handleGrabOpEnd.bind(wm), gDisplay);
  bag.connect(
    display,
    "showing-desktop-changed",
    () => {
      wm.hideWindowBorders();
      wm.updateDecorationLayout();
    },
    gDisplay
  );
  bag.connect(
    display,
    "in-fullscreen-changed",
    () => {
      recordD100Observe("in-fullscreen-changed");
    },
    gDisplay
  );
  bag.connect(display, "workareas-changed", wm._onWorkareasChanged.bind(wm), gDisplay);

  bag.connect(
    shellWm,
    "minimize",
    (_shellwm, actor) =>
      wm._onMinimizeChange("minimize", {
        hideBorders: true,
        resetGrandparentIfEmpty: true,
        metaWindow: actor?.meta_window,
      }),
    gWm
  );
  bag.connect(
    shellWm,
    "unminimize",
    (_shellwm, actor) => wm._onMinimizeChange("unminimize", { metaWindow: actor?.meta_window }),
    gWm
  );
  bag.connect(
    shellWm,
    "show-tile-preview",
    (_, _metaWindow, _rect, _num) => {
      // Empty
    },
    gWm
  );

  bag.connect(
    globalWsm,
    "showing-desktop-changed",
    () => {
      wm.hideWindowBorders();
      wm.updateDecorationLayout();
    },
    gWsm
  );
  bag.connect(
    globalWsm,
    "workspace-added",
    (_, wsIndex) => {
      // If a node with this index already exists, shift existing nodes up first
      if (wm.tree.findNode(`ws${wsIndex}`)) {
        wm.tree.workspaceManager.renumberWorkspacesAfterAddition(wsIndex);
      }
      wm.tree.addWorkspace(wsIndex);
      wm.trackCurrentMonWs();
      wm.workspaceAdded = true;
      wm.renderTree("workspace-added");
    },
    gWsm
  );
  bag.connect(
    globalWsm,
    "workspace-removed",
    (_, wsIndex) => {
      // forge-ojew: re-home surviving windows off the doomed workspace BEFORE
      // removeChild splices the subtree out, otherwise they are stranded.
      wm._rehomeWorkspaceWindowsBeforeRemoval(wsIndex);
      wm.tree.removeWorkspace(wsIndex);
      wm.tree.workspaceManager.renumberWorkspacesAfterRemoval(wsIndex);
      wm.trackCurrentMonWs();
      wm.workspaceRemoved = true;
      wm.updateDecorationLayout();
      wm.renderTree("workspace-removed");
    },
    gWsm
  );
  // forge-2s5b: reorder_workspace() renumbers workspace indices WITHOUT
  // emitting workspace-added/removed or per-window workspace-changed, so the
  // tree's index-keyed nodes (ws{n}, mo{m}ws{n}) go stale and point at the
  // wrong Meta workspaces. The reorder signal carries no permutation args, so
  // a targeted rekey would need identity tracking; instead reload the tree,
  // which rebuilds the index-keyed scaffold from live workspace indices and
  // re-homes every window by its current workspace. Reorders are rare, so the
  // reload cost is acceptable (same recovery path as the no-meta-monws case).
  bag.connect(
    globalWsm,
    "workspaces-reordered",
    () => {
      // forge-gw2c: a reorder permutes index<->object with no add/remove signal,
      // leaving the index-keyed signal map stale (bindWorkspaceSignals then
      // early-returns for every index, so reload alone never rebinds it). Tear the
      // map down first — object-anchored disconnect makes this reliable — then the
      // reload rebinds each workspace against its current index.
      wm.tree.workspaceManager.destroy();
      wm.reloadTree("workspaces-reordered");
    },
    gWsm
  );
  if (wm._lastActiveWsIndex == null) {
    try {
      wm._lastActiveWsIndex = globalWsm.get_active_workspace_index?.() ?? 0;
    } catch (_e) {
      wm._lastActiveWsIndex = 0;
    }
  }
  bag.connect(
    globalWsm,
    "active-workspace-changed",
    () => {
      // Bug #374 fix: Set flag to prevent focus jumping during workspace transitions
      wm._workspaceChanging = true;
      let toIdx = -1;
      try {
        toIdx = globalWsm.get_active_workspace_index?.() ?? -1;
      } catch (_e) {
        /* ignore */
      }
      const fromIdx = wm._lastActiveWsIndex;
      wm._lastActiveWsIndex = toIdx;
      // Hunt Super+N bounce: who holds focus + which ws they live on.
      let focusLab = "-";
      let focusWs = "?";
      let overview = "?";
      try {
        const fw =
          (typeof global.display.get_focus_window === "function"
            ? global.display.get_focus_window()
            : null) ?? global.display.focus_window;
        if (fw) {
          const id = typeof fw.get_id === "function" ? fw.get_id() : "?";
          const t = fw.get_title?.() || "?";
          const cls = fw.get_wm_class?.() || "?";
          focusLab = `${id}:${cls}:${t}`;
          try {
            focusWs = fw.get_workspace?.()?.index?.() ?? "?";
          } catch (_e2) {
            focusWs = "?";
          }
        }
      } catch (_e) {
        /* ignore */
      }
      try {
        overview = Main.overview?.visible ? "1" : "0";
      } catch (_e) {
        overview = "?";
      }
      Logger.trace(
        `active-workspace-changed from=${
          fromIdx ?? "?"
        } to=${toIdx} focus=${focusLab} focusWs=${focusWs} overview=${overview}`
      );
      wm.hideWindowBorders();
      wm.trackCurrentMonWs();
      wm.updateDecorationLayout();
      wm.renderTree("active-workspace-changed");
      // Clear previous timer to avoid races on rapid workspace switches
      wm._wmSources.set("workspaceChanging", 300, () => {
        wm._workspaceChanging = false;
        // Meta may have raised a non-open tab sibling during the transition.
        wm.reassertOpenLeavesOnActiveWs?.("workspace-settle");
      });
    },
    gWsm
  );

  let numberOfWorkspaces = globalWsm.get_n_workspaces();

  for (let i = 0; i < numberOfWorkspaces; i++) {
    let workspace = globalWsm.get_workspace_by_index(i);
    wm.bindWorkspaceSignals(workspace);
  }

  let settings = wm.ext.settings;

  bag.connect(
    settings,
    "changed",
    (_, settingName) => wm._onSettingsChanged(settingName),
    gSettings
  );

  bag.connect(
    Main.overview,
    "hiding",
    () => {
      wm.fromOverview = true;
      const eventObj = {
        name: "focus-after-overview",
        callback: () => {
          const focusNodeWindow = wm.findNodeWindow(wm.focusMetaWindow);
          wm.afterFocus(focusNodeWindow, { source: "overview" });
        },
      };
      wm.queueEvent(eventObj);
    },
    gOverview
  );
  bag.connect(
    Main.overview,
    "showing",
    () => {
      wm.toOverview = true;
    },
    gOverview
  );

  wm._signalsBound = true;
}

export function trackCurrentMonWs(wm, forWindow = null) {
  let metaWindow = forWindow || wm.focusMetaWindow;
  if (!metaWindow) return;
  const currentWorkspace = global.display.get_workspace_manager().get_active_workspace_index();
  let currentWsNode = wm.tree.findNode(`ws${currentWorkspace}`);

  if (!currentWsNode) {
    wm.sortedWindows = [];
    return;
  }

  // Workspace subtree includes every monitor head — no mon-index filter.
  const monWindows = collectDragDropTargetMetaWindows(
    currentWsNode.getNodeByType(NODE_TYPES.WINDOW),
    metaWindow
  );

  try {
    wm.sortedWindows = global.display.sort_windows_by_stacking(monWindows).reverse();
  } catch (_e) {
    wm.sortedWindows = monWindows;
  }
}

export function bindWorkspaceSignals(wm, metaWorkspace) {
  if (wm.tree && wm.tree.workspaceManager) {
    wm.tree.workspaceManager.bindWorkspaceSignals(metaWorkspace);
  }
}

export function disable(wm) {
  logMetricsSession("disable");
  setClassMinFloorPersist(null);
  // Tab chrome layer + strips before tree drop (I-TabPickable teardown).
  Utils._disableDecorations(wm.decorationManager);
  wm.layoutDebugOverlay?.destroyAll();
  // CL10: never leave apply chrome / hard-clear timer after disable.
  wm.layoutApplyChrome?.destroy();
  wm._cancelAllOpenCommits();
  wm._releaseAllDeferredOpens();
  wm._layoutBatch?.reset();
  wm._layoutBindPending = false;
  wm.layoutController?.cancel();
  wm._removeSignals();
  // Persist topology for install/update reload (Meta.Window refs die with us).
  wm._saveSessionLayoutForReload({ immediate: true });
  // forge-zo4: re-pin any floats demoted for a fullscreen window before the
  // tree is dropped, so they aren't stranded below after Forge is disabled.
  // Done after _removeSignals so the make_above notify::above can't re-render.
  wm._restoreAllDemotedFloats();
  // Release any preview hint left over from an in-progress drag before dropping the tree.
  wm.dragDrop?.clearAllPreviewHints?.();
  // LX4: stage captured-event arm must not outlive disable.
  wm.dragDrop?.cancelTabDrag?.();
  wm.allNodeWindows.forEach((node) => wm._grabCleanup(node));
  wm._draggedNodeWindow = null;
  // forge-ph7f / W2: cancel per-window attach sources (stack pin slot) then
  // unpin transiently-pinned windows so none is stranded "Always on Top"
  // after the tree is dropped (skips genuine user/float pins).
  wm._windowAttach?.disposeAll();
  wm.allNodeWindows.forEach((node) => {
    const mw = node.nodeValue;
    if (!mw) return;
    if (mw._forgeTransientAbove) {
      try {
        if (Utils.isWindowAlive(mw) && mw.is_above() && !node._forgeSetAbove) {
          wm._withSuppressedAboveHandler(() => mw.unmake_above());
        }
      } catch (e) {
        // Window may have been destroyed
      }
      mw._forgeTransientAbove = false;
    }
  });
  // forge-h6jc: remove the tree's scaffold bins from window_group before
  // dropping the tree, otherwise the root/workspace/monitor St.Bins leak.
  wm._tree?.destroy();
  wm._tree = null;
  wm.hostBag?.clear();
  wm.hostBag = null;
  wm.forest = null;
  wm.liveById = null;
  wm._liveForestSeeded = false;
  // Drop shared dock-hook pointer so a disabled WM cannot note launches.
  try {
    if (Shell.App?.prototype?._forgeDockWm === wm) {
      Shell.App.prototype._forgeDockWm = null;
    }
  } catch (_e) {
    // Shell.App unavailable
  }
  wm.disabled = true;
  Logger.debug(`extension:disable`);
}

export function enable(wm) {
  wm._bindSignals();
  wm._tryInstallDockLaunchHook();
  wm._refreshMonitorIdentityMap();
  wm._bindLayoutMonitorsChanged();
  wm._holdSessionLayoutSave(12_000_000);
  // disable() cancels the controller (incl. CL6 periodic); re-arm from gsettings.
  wm._syncLayoutVerifyInterval();
  // Wayland mins: load durable class floor then wire persist.
  wm._seedClassMinFloorFromDisk();
  setClassMinFloorPersist((map) => wm._persistClassMinFloor(map));
  wm.reloadTree("enable");
  Logger.debug(`extension:enable`);
}

export function removeSignals(wm) {
  if (!wm._signalsBound) return;

  wm._unbindLayoutMonitorsChanged();

  // W5: global display/wm/wsm/settings/overview connects (not dispose — re-enable rebinds).
  wm._wmSignals?.disconnectAll();

  // Clean up workspace signals via WorkspaceManager
  if (wm.tree?.workspaceManager) {
    wm.tree.workspaceManager.destroy();
  }

  // forge-lvhp: windowsAllWorkspaces (get_tab_list NORMAL_ALL) excludes
  // DIALOG/MODAL_DIALOG, but trackWindow connects windowSignals/actorSignals to
  // those window types too — so a still-open tracked dialog would keep live
  // handlers bound to this disabled manager. Union the tab list with the tree's
  // WINDOW nodes (which include dialogs) so every tracked window is
  // disconnected. The tree is still live here (nulled later in disable());
  // de-dup by metaWindow identity.
  const allWindows = new Set(wm.windowsAllWorkspaces || []);
  for (const wNode of wm._tree ? wm._tree.getNodeByType(NODE_TYPES.WINDOW) : []) {
    if (wNode.nodeValue) allWindows.add(wNode.nodeValue);
  }

  for (const metaWindow of allWindows) {
    disconnectSignals(metaWindow, metaWindow.windowSignals);
    metaWindow.windowSignals = undefined;

    let windowActor = metaWindow.get_compositor_private();
    if (windowActor) {
      disconnectSignals(windowActor, windowActor.actorSignals);
      windowActor.actorSignals = undefined;
    }

    if (windowActor) {
      wm._destroyActorBorder(windowActor, "border");
      wm._destroyActorBorder(windowActor, "splitBorder");
    }
    const bagId = wm.hostBag?.idFromMeta?.(metaWindow);
    if (bagId && wm.hostBag?.has?.(bagId)) {
      wm.hostBag.set(bagId, { border: undefined });
    }
  }

  // W1: WM-global timers owned by SourceBag (cancelAll; bag lives across enable).
  wm._wmSources?.cancelAll();
  wm._wsWindowAddQueue = null; // forge-wqlx: drop pending re-home queue
  wm._manualResizeEndWindow = null;
  wm._workareasThrashPending = false;
  // Drop pending layout/verify timers; controller stays for re-enable.
  wm.layoutController?.cancel();

  wm._signalsBound = false;
}

export function reloadTree(wm, from) {
  // Coalesce reloads onto one idle slot (SourceBag auto-clears on fire / throw).
  // Note: was PRIORITY_LOW; bag idle is DEFAULT — coalesce semantics unchanged.
  if (!wm._wmSources.has("reloadTree")) {
    wm._wmSources.setIdle("reloadTree", () => {
      // T6: snapshot before wipe; restore after flat re-track.
      // Empty live snapshot (enable / Shell HUP) → portable session-layout.
      const treeSnapshot = wm.tree.snapshotTree();
      wm.tree.reload();
      wm.lftMru?.clear();
      wm.trackCurrentWindows();
      wm.tree.restoreTree(treeSnapshot);
      if (!treeSnapshot?.monitors?.length) {
        wm._restoreSessionLayoutAfterTrack();
      }
      wm.admitUntrackedWindows();
      wm._lftTouchFocusAfterRestore();
      wm.renderTree(from);
    });
  }
}

export function trackCurrentWindows(wm) {
  wm.tree.attachNode = null;
  let windowsAll = wm.windowsAllWorkspaces;
  for (let i = 0; i < windowsAll.length; i++) {
    let metaWindow = windowsAll[i];
    wm.trackWindow(global.display, metaWindow);
    // This updates and handles dynamic workspaces
    wm.updateMetaWorkspaceMonitor(
      "track-current-windows",
      metaWindow.get_monitor(),
      metaWindow
    );
  }
  wm.updateDecorationLayout();
  // Cold seed only. trackWindow already Forest-insert + RESYNC.
  if (!wm._liveForestSeeded) ensureLiveForest(wm);
}

