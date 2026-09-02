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

/**
 * St tab + CON decoration lifecycle (D096 G8n) — extracted off Node.
 */

import Clutter from "gi://Clutter";
import St from "gi://St";

import { Logger } from "../shared/logger.js";
import { recordWarn } from "./metrics.js";
import * as Compat from "./compat.js";
import { NODE_TYPES } from "./tree-types.js";
import { initWindowApp } from "./live-handle.js";
import { liveBagId, liveChildrenForPresent, liveParentForPresent } from "./tom-live.js";

/** True when the St actor is still ours to touch. Never probe GObject methods. */
export function actorAlive(actor) {
  return !!(actor && !actor._forgeDisposed);
}

export function isDisposedActorError(err) {
  return String(err?.message ?? err ?? "").includes("has been already disposed");
}

function warnDecoDisposed(where) {
  recordWarn("deco-disposed", { where: String(where || "present") });
}

function bagTabRaw(wm, live) {
  const id = liveBagId(wm, live);
  if (!id) return null;
  const bag = wm.hostBag?.get?.(id);
  return bag?.tab || bag?.tabChip || null;
}

function clearTabBag(wm, live) {
  const id = liveBagId(wm, live);
  if (id && wm?.hostBag) wm.hostBag.set(id, { tab: undefined, tabChip: undefined });
}

/** Real St destroy does not set `_forgeDisposed`; the mock does. */
function noteTabActorDestroyed(node, tabContents) {
  if (!tabContents) return;
  tabContents._forgeDisposed = true;
  if (node.tab === tabContents) {
    node.tab = null;
    node._tabRep = null;
  }
  const wm = resolveLiveWm(node);
  if (bagTabRaw(wm, node) === tabContents) clearTabBag(wm, node);
}

/** Drop JS refs to a dead tab chip. Does not call St. */
export function dropDeadTab(node, where = "tab") {
  if (!node) return false;
  const wm = resolveLiveWm(node);
  const bagChip = bagTabRaw(wm, node);
  const tab = node.tab || bagChip;
  if (!tab || actorAlive(tab)) return false;
  node.tab = null;
  node._tabRep = null;
  clearTabBag(wm, node);
  warnDecoDisposed(where);
  return true;
}

function resolveLiveWm(live) {
  let n = live;
  const seen = new Set();
  while (n && !seen.has(n)) {
    seen.add(n);
    if (n.wm) return n.wm;
    if (n.extWm) return n.extWm;
    if (n._extWm) return n._extWm;
    n = n.parentNode;
  }
  return null;
}

function bagTabOf(wm, live) {
  const chip = bagTabRaw(wm, live);
  return actorAlive(chip) ? chip : null;
}

/** WINDOW descendants via Forest kids when seeded; else childNodes. */
function liveWindowDescendants(wm, live) {
  if (!live) return [];
  const kidsOf = (n) => (wm ? liveChildrenForPresent(wm, n) : n.childNodes || []);
  const isWin = (n) =>
    (typeof n?.isWindow === "function" && n.isWindow()) || n?.nodeType === NODE_TYPES.WINDOW;
  const out = [];
  const q = [...kidsOf(live)];
  const seen = new Set();
  while (q.length) {
    const n = q.shift();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    if (isWin(n)) out.push(n);
    else q.push(...kidsOf(n));
  }
  return out;
}

function siblingLives(node) {
  const wm = resolveLiveWm(node);
  const parent = (wm && liveParentForPresent(wm, node)) || node.parentNode;
  if (!parent) return [];
  return wm ? liveChildrenForPresent(wm, parent) : parent.childNodes || [];
}

function clearSiblingTabActive(node) {
  for (const c of siblingLives(node)) {
    if (!actorAlive(c.tab)) {
      dropDeadTab(c, "sibling-tab");
      continue;
    }
    c.tab.remove_style_class_name("window-tabbed-tab-active");
    render(c);
  }
}

/** Icon + title scaffold; title stays at child index 1 for render(). */
export function buildTabBase(app, labelText) {
  let tabContents = new St.BoxLayout({
    style_class: "window-tabbed-tab",
    x_expand: true,
  });
  // reactive:false — pick hits the tab parent (press = reveal + arm drag).
  let iconBin = new St.Button({
    style_class: "window-tabbed-tab-icon",
    reactive: false,
    track_hover: false,
    can_focus: false,
  });
  // Logical 24: St scales by scale_factor; 24*dpi() double-scales.
  iconBin.child = app
    ? app.create_icon_texture(24)
    : new St.Icon({ icon_name: "application-x-executable-symbolic", icon_size: 24 });
  let titleButton = new St.Button({
    x_expand: true,
    label: `${labelText ?? ""}`,
    reactive: false,
    track_hover: false,
    can_focus: false,
  });
  tabContents.add_child(iconBin);
  tabContents.add_child(titleButton);
  return { tabContents, iconBin, titleButton };
}

export function createWindowTab(node) {
  // Null app is OK — fallback icon/label so processNode never attaches zero tabs.
  if (!node.isWindow()) return;
  const wm = resolveLiveWm(node);
  dropDeadTab(node, "create-window-tab");
  const bagChip = bagTabOf(wm, node);
  if (bagChip) {
    node.tab = bagChip;
    return;
  }
  if (actorAlive(node.tab)) {
    const existingId = liveBagId(wm, node);
    if (existingId && wm?.hostBag) {
      wm.hostBag.set(existingId, { tab: node.tab, tabChip: node.tab });
    }
    return;
  }
  node.tab = null;

  let metaWin = node.nodeValue;
  let { tabContents } = buildTabBase(node.app, getTitle(node));
  node._tabFallback = !node.app;
  let closeButton = new St.Button({
    style_class: "window-tabbed-tab-close",
    child: new St.Icon({ icon_name: "window-close-symbolic" }),
  });
  tabContents.add_child(closeButton);

  let clickFn = () => {
    clearSiblingTabActive(node);
    tabContents.add_style_class_name("window-tabbed-tab-active");
    activateFromTab(wm, node, metaWin);
  };

  let closeFn = () => {
    metaWin.delete(global.get_current_time());
  };

  let middleClickCloseFn = (_, event) => {
    if (event.get_button() === Clutter.BUTTON_MIDDLE) {
      metaWin.delete(global.get_current_time());
    }
  };

  // Close on primary/middle press + STOP so strip activate/restack cannot steal.
  const isCloseControl = (source) => {
    if (!source || !closeButton) return false;
    if (source === closeButton) return true;
    try {
      if (closeButton.contains?.(source)) return true;
    } catch (_e) {
      // finalized
    }
    let a = source;
    for (let i = 0; i < 8 && a; i++) {
      if (a === closeButton) return true;
      a = typeof a.get_parent === "function" ? a.get_parent() : a._parent;
    }
    return false;
  };

  closeButton.connect("button-press-event", (_, event) => {
    const btn = event.get_button();
    if (btn === Clutter.BUTTON_PRIMARY || btn === Clutter.BUTTON_MIDDLE) {
      closeFn();
      return Clutter.EVENT_STOP;
    }
    return Clutter.EVENT_PROPAGATE;
  });
  closeButton.connect("clicked", closeFn);
  closeButton.connect("button-release-event", middleClickCloseFn);

  tabContents.reactive = true;
  tabContents.connect("button-press-event", (_, event) => {
    const source = typeof event.get_source === "function" ? event.get_source() : null;
    if (isCloseControl(source)) return Clutter.EVENT_PROPAGATE;
    const btn = event.get_button();
    if (btn === Clutter.BUTTON_PRIMARY) {
      clickFn();
      armTabDragForWindow(wm, node, metaWin, event);
      return Clutter.EVENT_STOP;
    }
    if (btn === Clutter.BUTTON_MIDDLE) {
      metaWin.delete(global.get_current_time());
      return Clutter.EVENT_STOP;
    }
    return Clutter.EVENT_PROPAGATE;
  });

  if (metaWin === global.display?.get_focus_window?.()) {
    tabContents.add_style_class_name("window-tabbed-tab-active");
  }
  node.tab = tabContents;
  const bagId = liveBagId(wm, node);
  if (bagId && wm?.hostBag) wm.hostBag.set(bagId, { tab: tabContents, tabChip: tabContents });
  // Parent decoration destroy() finalizes children; drop our ref if this actor dies.
  tabContents.connect("destroy", () => {
    noteTabActorDestroyed(node, tabContents);
    cancelTabDragIfWindow(wm, node, metaWin);
  });
}

/** CON header tab: first descendant window is icon/title/activation target. */
export function ensureConTab(node) {
  if (!node.isCon()) return;
  const wm = resolveLiveWm(node);
  const windows = liveWindowDescendants(wm, node);
  let rep = windows[0];
  if (!rep) {
    destroyTab(node);
    node._tabRep = null;
    return;
  }
  dropDeadTab(node, "ensure-con-tab");
  if (actorAlive(node.tab) && node._tabRep === rep && !(node._tabFallback && rep.app)) return;
  destroyTab(node);
  node._tabRep = rep;

  let { tabContents } = buildTabBase(rep.app, getTitle(node));
  node._tabFallback = !rep.app;

  let clickFn = () => {
    clearSiblingTabActive(node);
    tabContents.add_style_class_name("window-tabbed-tab-active");
    const wins = liveWindowDescendants(wm, node);
    wins.forEach((w) => {
      try {
        w.nodeValue?.raise();
      } catch (_e) {
        // finalized
      }
    });
    const target = wins[0]?.nodeValue;
    if (target) activateFromTab(wm, node, target);
  };

  tabContents.reactive = true;
  tabContents.connect("button-press-event", (_, event) => {
    if (event.get_button() === Clutter.BUTTON_PRIMARY) {
      clickFn();
      const win = liveWindowDescendants(wm, node)[0]?.nodeValue;
      if (win) armTabDragForWindow(wm, node, win, event);
      return Clutter.EVENT_STOP;
    }
    return Clutter.EVENT_PROPAGATE;
  });

  node.tab = tabContents;
  tabContents.connect("destroy", () => {
    noteTabActorDestroyed(node, tabContents);
    const win = liveWindowDescendants(wm, node)[0]?.nodeValue;
    if (win) cancelTabDragIfWindow(wm, node, win);
  });
}

export function destroyTab(node) {
  const wm = resolveLiveWm(node);
  const bagChip = bagTabRaw(wm, node);
  const tab = node.tab || bagChip;
  node.tab = null;
  node._tabRep = null;
  clearTabBag(wm, node);
  if (!tab) return;
  if (!actorAlive(tab)) return;
  try {
    const parent = tab.get_parent ? tab.get_parent() : null;
    if (parent && actorAlive(parent)) parent.remove_child(tab);
    if (tab.destroy) tab.destroy();
  } catch (e) {
    Logger.warn(`_destroyTab: tab actor already finalized: ${e}`);
  }
}

/** Null first: create early-returns while .tab still points at a dead actor. */
export function resetTabForReparent(node) {
  const wm = resolveLiveWm(node);
  // Host bag can still hold the chip about to die with the old strip.
  clearTabBag(wm, node);
  node.tab = null;
  node._tabRep = null;
  if (node.isWindow()) createWindowTab(node);
}

export function createDecoration(node) {
  if (!actorAlive(node.decoration)) node.decoration = null;
  if (node.decoration) {
    const wmExist = resolveLiveWm(node);
    const existId = liveBagId(wmExist, node);
    if (existId && wmExist?.hostBag) {
      wmExist.hostBag.set(existId, {
        decoration: node.decoration,
        tabStrip: node.decoration,
      });
    }
    return;
  }
  let decoration = new St.BoxLayout();
  Compat.setBoxOrientation(decoration, Clutter.Orientation.HORIZONTAL);
  decoration.type = "forge-deco";
  decoration.parentNode = node;
  decoration.reactive = true;
  decoration.style_class = "window-tabbed-bg";

  decoration.hide();
  node.decoration = decoration;
  const wm = resolveLiveWm(node);
  const bagId = liveBagId(wm, node);
  if (bagId && wm?.hostBag) {
    wm.hostBag.set(bagId, { decoration, tabStrip: decoration });
  }
  try {
    decoration.connect("destroy", () => {
      decoration._forgeDisposed = true;
      if (node.decoration === decoration) {
        node.decoration = null;
        node._tabRowHosts = null;
      }
    });
  } catch (_e) {
    // mock without signals
  }
  try {
    resolveLiveWm(node)?.decorationManager?.attachTabDecoration?.(node);
  } catch (e) {
    Logger.warn(`_createDecoration attach: ${e}`);
  }
}

/** Untrack + destroy the CON strip; null the pointer before any GObject call. */
export function releaseDecorationActor(node) {
  const decoration = node.decoration;
  if (!decoration) return;
  const wm = resolveLiveWm(node);
  const bagId = liveBagId(wm, node);
  node.decoration = null;
  node._tabRowHosts = null;
  if (bagId && wm?.hostBag) {
    wm.hostBag.set(bagId, { decoration: undefined, tabStrip: undefined });
  }
  const alreadyDead = !actorAlive(decoration);
  decoration._forgeDisposed = true;
  try {
    resolveLiveWm(node)?.decorationManager?.untrackTabDecoration?.(decoration);
  } catch (_e) {
    // ignore
  }
  if (alreadyDead) return;
  try {
    const parent = decoration.get_parent ? decoration.get_parent() : null;
    if (parent && actorAlive(parent)) parent.remove_child(decoration);
  } catch (_e) {
    // ignore
  }
  try {
    decoration.destroy_all_children?.();
  } catch (_e) {
    // ignore
  }
  try {
    decoration.destroy?.();
  } catch (e) {
    Logger.warn(`_destroyDecoration: decoration actor already finalized: ${e}`);
  }
}

/** TABBED/STACKED chrome only when the group has 2+ children (unary collapse). */
export function chromeGroupEligible(node, kids) {
  if (!node || !Array.isArray(kids) || kids.length < 2) return false;
  if (typeof node.isStackedOrTabbed === "function") return !!node.isStackedOrTabbed();
  return node.layout === "TABBED" || node.layout === "STACKED";
}

/** Kids that may own tab chips: Forest present list, leftover GObject list. */
function collectChromeKids(node) {
  const wm = resolveLiveWm(node);
  const seen = new Set();
  const out = [];
  const add = (n) => {
    if (!n || seen.has(n)) return;
    seen.add(n);
    out.push(n);
  };
  for (const k of node.childNodes || []) add(k);
  if (!wm) return out;
  try {
    for (const k of liveChildrenForPresent(wm, node)) add(k);
  } catch (_e) {
    /* disposed / unseeded */
  }
  return out;
}

/**
 * Tear decoration + child tabs. Child tabs use destroyTab (not reset): rebuild
 * would leave unparented tabs after TABBED/STACKED exit.
 */
export function destroyDecoration(node) {
  if (!node) return;
  try {
    for (const child of collectChromeKids(node)) {
      if (!child?.tab) continue;
      if (typeof child._destroyTab === "function") child._destroyTab();
      else destroyTab(child);
    }
    if (node.tab) {
      if (typeof node._destroyTab === "function") node._destroyTab();
      else destroyTab(node);
    }
  } catch (_e) {
    // ignore
  }
  if (!node.decoration) return;
  releaseDecorationActor(node);
}

export function titleForMeta(metaWin, app) {
  if (metaWin.title) return metaWin.title;
  let appName = app && typeof app.get_name === "function" ? app.get_name() : null;
  if (appName) return appName;
  let wmClass =
    typeof metaWin.get_wm_class === "function" ? metaWin.get_wm_class() : metaWin.wm_class;
  if (wmClass) return wmClass;
  return "Window";
}

export function getTitle(node) {
  if (node.isWindow() && node.nodeValue) {
    return titleForMeta(node.nodeValue, node.app);
  }
  if (node.isCon()) {
    let rep = liveWindowDescendants(resolveLiveWm(node), node)[0];
    if (rep && rep.nodeValue) {
      return titleForMeta(rep.nodeValue, rep.app);
    }
  }
  return "Window";
}

/** Re-snapshot app and rebuild tab when class lands late or Shell.App id changes. */
export function refreshApp(node) {
  const prevId = node.app?.get_id?.() ?? null;
  const wasFallback = !!node._tabFallback;
  initWindowApp(node);
  const newId = node.app?.get_id?.() ?? null;
  if (wasFallback || !node.tab || prevId !== newId) {
    destroyTab(node);
  }
  createWindowTab(node);
}

/** Title chrome only (D099) — not tiling. */
export function render(node) {
  if (!actorAlive(node.tab)) {
    dropDeadTab(node, "render");
    return;
  }
  try {
    let titleLabel = node.tab.get_child_at_index(1);
    let title = getTitle(node);
    if (titleLabel) titleLabel.label = title;
  } catch (e) {
    if (isDisposedActorError(e)) {
      node.tab._forgeDisposed = true;
      dropDeadTab(node, "render");
      return;
    }
    throw e;
  }
}

/** Arm tab chrome drag — DragDropManager owns the gesture after this. */
export function armTabDragForWindow(wm, live, metaWin, event) {
  try {
    const extWm = wm || resolveLiveWm(live);
    extWm?.dragDrop?.armTabDrag?.(metaWin, event);
  } catch (e) {
    Logger.warn(`_armTabDragForWindow: ${e}`);
  }
}

export function cancelTabDragIfWindow(wm, live, metaWin) {
  try {
    const dd = (wm || resolveLiveWm(live))?.dragDrop;
    if (!dd?._tabDrag || dd._tabDrag.metaWindow !== metaWin) return;
    dd.cancelTabDrag?.();
  } catch (_e) {
    // ignore
  }
}

/**
 * Activate a window from a tab click: raise, focus, restack stack/tab group.
 * Must match keyboard `_activateWindowNode` (focus+activate) — activate-only
 * fails to take desk focus on X11 after multi-mon focus / layout apply (LF2).
 * @param {any} wm
 * @param {any} live
 * @param {any} metaWin
 */
export function activateFromTab(wm, live, metaWin) {
  if (!metaWin) return;
  try {
    const extWm = wm || resolveLiveWm(live);
    if (!extWm?.tree) {
      Logger.warn("_activateFromTab: no wm.tree");
      return;
    }
    const node = extWm.tree.findNode(metaWin) || live;
    const title =
      typeof metaWin.get_title === "function" ? metaWin.get_title() : metaWin.title || "";
    const cls =
      typeof metaWin.get_wm_class === "function" ? metaWin.get_wm_class() : metaWin.wm_class || "";
    Logger.info(
      `_activateFromTab class=${cls || "?"} title=${String(title || "").slice(
        0,
        48
      )} source=tab-click`
    );
    if (typeof extWm.revealGroupChild === "function") {
      extWm.revealGroupChild(node, { keyboard: true, source: "tab-click" });
    } else if (typeof extWm.afterFocus === "function") {
      const parent = liveParentForPresent(extWm, live) || live?.parentNode;
      if (parent) parent.lastTabFocus = metaWin;
      const now0 = global.display.get_current_time();
      metaWin.raise?.();
      metaWin.focus?.(now0);
      metaWin.activate?.(now0);
      extWm.afterFocus(node, { source: "tab-click" });
    } else {
      const parent = liveParentForPresent(extWm, live) || live?.parentNode;
      if (parent) parent.lastTabFocus = metaWin;
      const now0 = global.display.get_current_time();
      metaWin.raise?.();
      metaWin.focus?.(now0);
      metaWin.activate?.(now0);
      extWm.unfreezeRender?.();
      extWm.updateTabbedFocus?.(node);
      extWm.updateStackedFocus?.(node);
      extWm.updateDecorationLayout?.({ scope: "focus", focusNode: node });
      extWm.updateBorderLayout?.();
    }
  } catch (e) {
    Logger.warn(`_activateFromTab: activate failed: ${e}`);
  }
}
