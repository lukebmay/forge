/*
 * ForgeAdapterGnome — destroy / ignore-drop / focus-after-close.
 */

import Meta from "gi://Meta";
import { Logger } from "../shared/logger.js";
import { NODE_TYPES } from "./tree-types.js";
import { pickFocusAfterClose } from "./focus-after-close.js";
import {
  forestRemoveWindow,
  liveChildrenForPresent,
  liveParentForPresent,
  liveWindowFromActor,
  liveWindowFromMeta,
  paintWmForest,
} from "./tom-live.js";
import { resyncWmToReality } from "./observe-reality.js";
import { takeDeferredOpen } from "./layout-deferred-open.js";
import { recordFallback } from "./metrics.js";

/**
 * Actor destroy: detach borders, Forest/GObject node, focus restore, paint.
 * @param {object} wm
 * @param {object} actor
 */
export function windowDestroy(wm, actor) {
  wm._destroyActorBorder(actor, "border");
  wm._destroyActorBorder(actor, "splitBorder");

  // GObject walk misses Forest-detached lives (D096 join); bag/liveById first.
  let nodeWindow = liveWindowFromActor(wm, actor) || wm.tree.findNodeByActor(actor);
  if (!nodeWindow) {
    let metaHint = null;
    try {
      metaHint = actor?.meta_window ?? actor?.get_meta_window?.() ?? null;
    } catch (_e) {
      metaHint = null;
    }
    if (metaHint) {
      nodeWindow = liveWindowFromMeta(wm, metaHint) || wm.tree.findNode(metaHint);
    }
  }

  // forge-s02h: lastFocusedWindow is dereferenced inside deferred pointer
  // warps (storePointerLastPosition); clear it when its node closes so it
  // can't survive as a stale/disposed reference.
  if (nodeWindow && wm.lastFocusedWindow === nodeWindow) {
    wm.lastFocusedWindow = null;
  }
  // OP1: drop closed tiles from LFT MRU before detach.
  if (nodeWindow) wm.lftMru?.remove(nodeWindow);

  const metaWindow = nodeWindow?.nodeValue;
  // CL4: drop pending open quiet timer before tree detach.
  if (metaWindow) wm._cancelOpenCommit(metaWindow);
  // SL1: no settle sample if window dies before first agreement.
  if (metaWindow) wm.layoutController?.clearOpenPendingForSettle?.(metaWindow);
  // CL8: drop deferred mark (window is gone; no unhide needed).
  if (metaWindow) takeDeferredOpen(wm._deferredOpenStore, metaWindow);
  const hadFocus = metaWindow && wm.focusMetaWindow === metaWindow;

  const seeded = !!(wm.forest && wm._liveForestSeeded);
  if (nodeWindow?.isWindow()) {
    // Snapshot siblings via liveChildrenForPresent before Forest/GObject detach.
    const focusRestore =
      hadFocus && wm.ext.settings.get_boolean("tiling-mode-enabled")
        ? captureFocusRestore(wm, nodeWindow)
        : null;

    const forestRemoved = forestRemoveWindow(wm, nodeWindow);
    if (seeded) {
      if (!forestRemoved) recordFallback("close", "ids-miss");
      try {
        nodeWindow._destroyTab?.();
      } catch (_e) {
        /* tab chip may already be gone */
      }
      try {
        resyncWmToReality(wm, "window-destroy");
      } catch (_e) {
        /* best-effort */
      }
      paintWmForest(wm);
    } else {
      wm.tree.removeNode(nodeWindow);
    }
    // forge-zo4: a closing fullscreen window does not fire in-fullscreen-changed.
    wm._reconcileFullscreenFloatDemotion();
    wm.renderTree("window-destroy-quick", true);
    wm.removeFloatOverride(nodeWindow.nodeValue, true);

    if (focusRestore) restoreFocusAfterWindowClosed(wm, focusRestore);
  } else if (seeded) {
    // Actor-destroy with no live node: still drop Forest by Meta if bag knows it.
    let metaHint = null;
    try {
      metaHint = actor?.meta_window ?? actor?.get_meta_window?.() ?? null;
    } catch (_e) {
      metaHint = null;
    }
    if (metaHint && forestRemoveWindow(wm, metaHint)) {
      try {
        resyncWmToReality(wm, "window-destroy");
      } catch (_e) {
        /* best-effort */
      }
      paintWmForest(wm);
    }
  }

  let focusNodeWindow = wm.findNodeWindow(wm.focusMetaWindow);
  if (focusNodeWindow) {
    wm.tree.attachNode =
      liveParentForPresent(wm, focusNodeWindow) || focusNodeWindow.parentNode;
  }

  wm.queueEvent({
    name: "window-destroy",
    callback: () => {
      wm.renderTree("window-destroy", true);
    },
  });
}

/**
 * Bug #470 / #258: snapshot focus-restore inputs before removeNode detaches.
 * FC1: ids for pickFocusAfterClose (LFT → next/prev sibling → workspace).
 * @param {object} wm
 * @param {object} closedNodeWindow
 */
export function captureFocusRestore(wm, closedNodeWindow) {
  const parent =
    liveParentForPresent(wm, closedNodeWindow) || closedNodeWindow.parentNode;
  const windowChildren = parent
    ? liveChildrenForPresent(wm, parent).filter((node) => node.isWindow() && node.nodeValue)
    : [];
  const closedMeta = closedNodeWindow.nodeValue;
  const closedId = metaWindowId(closedMeta);
  const preCloseChildIds = windowChildren.map((n) => metaWindowId(n.nodeValue));
  const siblingIds = windowChildren
    .filter((node) => node !== closedNodeWindow)
    .map((n) => metaWindowId(n.nodeValue))
    .filter((id) => id != null);
  // Closed node already dropped from lftMru in windowDestroy.
  const lftMruIds = (wm.lftMru?.globalOrder?.() ?? [])
    .map((n) => metaWindowId(n?.nodeValue))
    .filter((id) => id != null);
  const workspaceNode = wm.tree.findAncestor(closedNodeWindow, NODE_TYPES.WORKSPACE);
  return {
    closedId,
    closedNodeWindow,
    siblingIds,
    preCloseChildIds,
    lftMruIds,
    workspaceNode,
  };
}

/** Stable Meta id for focus-after-close policy (stringable). */
export function metaWindowId(metaWindow) {
  if (!metaWindow) return null;
  try {
    if (typeof metaWindow.get_id === "function") return metaWindow.get_id();
  } catch (_e) {
    /* disposed */
  }
  return metaWindow;
}

/**
 * @param {object} wm
 * @param {unknown} id
 * @returns {Meta.Window|null}
 */
export function findMetaWindowById(wm, id) {
  if (id == null || !wm.tree) return null;
  const want = String(id);
  const nodes = wm.tree.getNodeByType?.(NODE_TYPES.WINDOW) ?? [];
  for (const node of nodes) {
    const meta = node?.nodeValue;
    if (!meta) continue;
    if (String(metaWindowId(meta)) === want) return meta;
  }
  return null;
}

/**
 * @param {object} wm
 * @param {object} restore
 */
export function restoreFocusAfterWindowClosed(wm, restore) {
  if (!restore) return;

  Logger.debug(`Restoring focus after window closed`);

  const activate = (metaWindow) => {
    if (!metaWindow || metaWindow.minimized) return false;
    // CL8: never raise/activate a still-hidden deferred map.
    if (wm._isDeferredOpen(metaWindow)) return false;
    metaWindow.raise();
    metaWindow.focus(global.display.get_current_time());
    metaWindow.activate(global.display.get_current_time());
    return true;
  };

  const workspaceCandidateIds = [];
  const wsNode = restore.workspaceNode;
  if (wsNode) {
    for (const node of wsNode.getNodeByType(NODE_TYPES.WINDOW)) {
      if (node === restore.closedNodeWindow || !node.nodeValue) continue;
      try {
        if (node.nodeValue.get_window_type() !== Meta.WindowType.NORMAL) continue;
      } catch (_e) {
        continue;
      }
      const id = metaWindowId(node.nodeValue);
      if (id != null) workspaceCandidateIds.push(id);
    }
  }

  const pick = pickFocusAfterClose({
    closedId: restore.closedId,
    siblingIds: restore.siblingIds,
    preCloseChildIds: restore.preCloseChildIds,
    lftMruIds: restore.lftMruIds,
    workspaceCandidateIds,
  });
  if (!pick?.id) return;

  const meta = findMetaWindowById(wm, pick.id);
  if (meta && activate(meta)) return;

  // Stale id after collapse: fall back to first live workspace NORMAL.
  for (const id of workspaceCandidateIds) {
    if (String(id) === String(pick.id)) continue;
    const m = findMetaWindowById(wm, id);
    if (m && activate(m)) return;
  }
}

/**
 * Drop every currently tracked window that matches a mode: "ignore" override.
 * Snapshot the list first — removeNode mutates the tree while we walk it.
 * @param {object} wm
 */
export function dropAllIgnoredWindows(wm) {
  if (!wm._tree) return;
  const windows = wm._tree.getNodeByType(NODE_TYPES.WINDOW) ?? [];
  for (const node of [...windows]) {
    const meta = node?.nodeValue;
    if (meta) dropIfIgnored(wm, meta);
  }
}

/**
 * If metaWindow matches mode: "ignore", remove it from the tree (no float
 * node, no decorations, no further layout). Window may still be alive —
 * disconnect forge window signals so we stay hands-off.
 * @param {object} wm
 * @param {Meta.Window} metaWindow
 * @returns {boolean} true when ignored (whether or not a node existed)
 */
export function dropIfIgnored(wm, metaWindow) {
  if (!metaWindow || !wm.isWindowIgnored(metaWindow)) return false;

  const nodeWindow = wm.findNodeWindow(metaWindow);
  if (!nodeWindow) return true;

  if (wm.lastFocusedWindow === nodeWindow) {
    wm.lastFocusedWindow = null;
  }
  wm.lftMru?.remove(nodeWindow);
  wm._cancelOpenCommit(metaWindow);
  wm.layoutController?.clearOpenPendingForSettle?.(metaWindow);
  takeDeferredOpen(wm._deferredOpenStore, metaWindow);

  const windowActor = metaWindow.get_compositor_private?.();
  if (windowActor) {
    wm._destroyActorBorder(windowActor, "border");
    wm._destroyActorBorder(windowActor, "splitBorder");
  }

  if (metaWindow.windowSignals) {
    for (const id of metaWindow.windowSignals) {
      try {
        metaWindow.disconnect(id);
      } catch (_e) {
        /* already disconnected */
      }
    }
    metaWindow.windowSignals = null;
  }

  if (wm.forest && wm._liveForestSeeded) {
    if (!forestRemoveWindow(wm, nodeWindow)) recordFallback("ignore-drop", "ids-miss");
    try {
      nodeWindow._destroyTab?.();
    } catch (_e) {
      /* tab chip may already be gone */
    }
    paintWmForest(wm);
  } else {
    wm.tree.removeNode(nodeWindow);
  }
  wm.renderTree("window-ignored", true);
  Logger.info(
    `Ignore override: dropped ${metaWindow.get_title?.()} (${metaWindow.get_wm_class?.()})`
  );
  return true;
}
