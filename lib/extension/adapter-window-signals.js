/*
 * ForgeAdapterGnome — per-window Meta/actor signal wiring (D100a observe-only).
 */

import { recordD100Observe } from "./metrics.js";
import { onLateIdentity } from "./adapter-map-admit.js";
import { forgetHostWindow } from "./adapter-destroy.js";
import { refreshApp, render as renderChromeLabel } from "./node-chrome.js";

/**
 * D099: instant tab/stack label only. No chrome size, no renderTree.
 * @param {any} node
 */
export function paintTitleChromeLabel(node) {
  if (!node) return;
  try {
    renderChromeLabel(node);
  } catch (_e) {
    /* fixtures */
  }
}

/**
 * Bind per-window and per-actor signals once for a tracked window.
 * Handlers close over windowActor (border hiding) and wm; stored on
 * metaWindow.windowSignals / windowActor.actorSignals for disable().
 * @param {object} wm
 * @param {object} metaWindow
 * @param {object} windowActor
 */
export function bindWindowSignals(wm, metaWindow, windowActor) {
  if (!metaWindow.windowSignals) {
    let windowSignals = [
      metaWindow.connect("position-changed", (_metaWindow) => {
        let from = "position-changed";
        wm.updateMetaPositionSize(_metaWindow, from);
      }),
      metaWindow.connect("size-changed", (_metaWindow) => {
        // CL11: late compositor actor / client map can unhide deferred opens.
        wm._rehideDeferredIfNeeded(_metaWindow);
        let from = "size-changed";
        wm.updateMetaPositionSize(_metaWindow, from);
      }),
      metaWindow.connect("notify::fullscreen", (_metaWindow) => {
        wm.updateMetaPositionSize(_metaWindow, "notify::fullscreen");
      }),
      metaWindow.connect("unmanaged", (_metaWindow) => {
        wm.hideActorBorder(windowActor);
        // forge-ph7f / W2: dispose per-window attach bag (cancels stack pin)
        // so a pending unpin can't fire against a destroyed MetaWindow.
        wm._windowAttach?.dispose(_metaWindow);
        _metaWindow._forgeTransientAbove = false;
        wm._clearGrabOnUnmanaged(_metaWindow);
        forgetHostWindow(wm, _metaWindow, "unmanaged");
      }),
      metaWindow.connect("focus", (_metaWindowFocus) => {
        // CL8: deferred LayoutBatch maps must not raise / thrash focus chrome.
        if (wm._isDeferredOpen(_metaWindowFocus) || wm._isDeferredOpen(wm.focusMetaWindow)) {
          return;
        }
        wm.queueEvent({
          name: "focus-update",
          callback: () => {
            // FocusChanged: F → Dfocus → B → P → A (no renderTree / Dfull).
            let focusNodeWindow = wm.findNodeWindow(wm.focusMetaWindow);
            wm.afterFocus(focusNodeWindow, { source: "meta-focus" });
          },
        });
        let focusNodeWindow = wm.findNodeWindow(wm.focusMetaWindow);
        if (focusNodeWindow) {
          // A early (before 220ms queue) so open-under-focus is current.
          wm.tree.attachNode = focusNodeWindow;
          if (wm.floatingWindow(focusNodeWindow)) {
            wm.queueEvent({
              name: "raise-float",
              callback: () => {
                // Raise the focused float above the tiled grid (and other
                // floats) instead of pinning dialogs always-on-top. Mutter
                // raises transient children with their parent, so a focused
                // window keeps its popup on top. Re-resolve focus live: the
                // callback runs at idle and focus may have moved on.
                // forge-5l9b: but never a float demoted under a fullscreen
                // window — raise() would undo the reconcile's lower() without
                // touching is_above(), so nothing would ever re-demote it.
                const fw = wm.focusMetaWindow;
                if (wm._isDeferredOpen(fw)) return;
                const fwNode = fw ? wm.findNodeWindow(fw) : null;
                if (fwNode && wm.floatingWindow(fwNode) && !fwNode._aboveDemotedForFullscreen) {
                  fw.raise();
                  try {
                    // Float raise can insert between a tiled window and its
                    // border in window_group — re-pair every border (D096 G5d).
                    const dm = wm.decorationManager;
                    if (typeof dm?.restackAllWindowBorders === "function") {
                      dm.restackAllWindowBorders();
                    } else {
                      wm.restackBorderForMeta?.(fw);
                    }
                  } catch (_e) {
                    /* best-effort */
                  }
                }
                recordD100Observe("raise-float");
              },
            });
          }
        }
        // No full renderTree on focus: TABBED/STACKED rects are not
        // focus-dependent; chrome/restack runs via focus-update above.
        // Full apply on Wayland reflowed Chrome PWAs (~¼ → full tile).
      }),
      metaWindow.connect("workspace-changed", (_metaWindow) => {
        recordD100Observe("workspace-changed");
      }),
      metaWindow.connect("notify::above", (_metaWindow) => {
        // forge-w7e (#469): a user pinning a tiled window "Always on Top"
        // should float it out of the tree, and unsetting returns it to tile.
        wm._handleUserAboveChange(_metaWindow);
      }),
      metaWindow.connect("notify::wm-class", () => {
        if (wm._dropIfIgnored(metaWindow)) return;
        const live = wm.findNodeWindow(metaWindow);
        if (live) refreshApp(live);
        if (wm._openCommitPending?.has(metaWindow)) {
          wm._refreshOpenCommitIdentity(metaWindow);
          wm._armOpenCommitTimer(metaWindow);
        }
        let adopted = false;
        if (metaWindow._forgeProvisionalPlaceHint || wm._pendingPlaceHints?.length) {
          adopted = !!wm._tryAdoptLatePlaceHint(metaWindow);
        }
        if (adopted) {
          wm.renderTree("wm-class-late-adopt");
          return;
        }
        // Null class at map → FLOAT; promote when class lands (no maze reconnect).
        onLateIdentity(wm, metaWindow, "wm-class");
      }),
      metaWindow.connect("notify::title", () => {
        if (wm._dropIfIgnored(metaWindow)) return;
        const node = wm.findNodeWindow(metaWindow);
        if (wm._openCommitPending?.has(metaWindow)) {
          wm._refreshOpenCommitIdentity(metaWindow);
          wm._armOpenCommitTimer(metaWindow);
        }
        let adopted = false;
        if (metaWindow._forgeProvisionalPlaceHint || wm._pendingPlaceHints?.length) {
          adopted = !!wm._tryAdoptLatePlaceHint(metaWindow);
        }
        if (adopted) {
          wm.renderTree("title-late-adopt");
          return;
        }
        wm._paintTitleChromeLabel(node);
        // Ordinary title ticks: label only (D099). Empty↔nonempty may flip exempt.
        onLateIdentity(wm, metaWindow, "title", { node });
      }),
    ];
    metaWindow.windowSignals = windowSignals;
  }

  if (!windowActor.actorSignals) {
    let actorSignals = [windowActor.connect("destroy", wm.windowDestroy.bind(wm))];
    windowActor.actorSignals = actorSignals;
  }
}
