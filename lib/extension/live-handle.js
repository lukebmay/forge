// @ts-check
/**
 * Thin live identity duck (G8n). Not GObject Node. Not a second TOM.
 */

import Shell from "gi://Shell";

import { Logger } from "../shared/logger.js";
import { preferChromePwaApp } from "./place-hint.js";
import { isPlaceholderValue } from "./layout-placeholder.js";
import { NODE_TYPES, LAYOUT_TYPES } from "./tree-types.js";
import { WINDOW_MODES } from "./window-modes.js";

const KINDS = new Set(["ROOT", "WORKSPACE", "MONITOR", "CON", "WINDOW"]);

/**
 * Snapshot Shell.App onto a WINDOW handle (Node `_initMetaWindow` port).
 * @param {any} live
 */
export function initWindowApp(live) {
  if (!live || typeof live.isWindow !== "function" || !live.isWindow()) return;
  if (live.placeholder || isPlaceholderValue(live.nodeValue)) {
    live.app = null;
    return;
  }
  let app = null;
  try {
    const metaWin = live.nodeValue;
    const tracker = Shell.WindowTracker.get_default();
    app = tracker?.get_window_app?.(metaWin) ?? null;
    const wmClass =
      typeof metaWin?.get_wm_class === "function" ? metaWin.get_wm_class() : metaWin?.wm_class;
    const pwa = preferChromePwaApp(wmClass, app, Shell.AppSystem?.get_default?.());
    if (pwa) app = pwa;
  } catch (_e) {
    /* fixtures / tracker unavailable */
  }
  live.app = app;
}

/**
 * Adapter identity for liveById. Topology stays Forest; chrome stays node-chrome.
 * @param {string} kind
 * @param {any} value
 * @param {{
 *   wm?: any,
 *   settings?: any,
 *   mode?: string,
 *   percent?: number,
 *   userSized?: boolean,
 *   layout?: string|null,
 *   lastTabFocus?: any,
 *   actorBin?: any,
 *   placeholder?: boolean,
 *   placeholderReason?: string,
 *   layoutSlot?: string,
 *   layoutRole?: string,
 *   app?: any,
 *   zoomMode?: any,
 *   renderRect?: any,
 * }} [opts]
 */
export function makeLiveHandle(kind, value, opts = {}) {
  const nodeType = KINDS.has(kind) ? kind : String(kind || "");
  const live = {
    nodeType,
    nodeValue: value,
    mode: opts.mode != null ? opts.mode : WINDOW_MODES.DEFAULT,
    percent: Number.isFinite(opts.percent) ? opts.percent : 0,
    userSized: !!opts.userSized,
    layout: opts.layout ?? null,
    lastTabFocus: opts.lastTabFocus ?? null,
    actorBin: opts.actorBin ?? null,
    settings: opts.settings ?? null,
    placeholder: !!opts.placeholder,
    app: opts.app ?? null,
    wm: opts.wm ?? null,
    zoomMode: opts.zoomMode ?? null,
    renderRect: opts.renderRect ?? null,
    tab: null,
    decoration: null,
    isWindow() {
      return this.nodeType === NODE_TYPES.WINDOW;
    },
    isCon() {
      return this.nodeType === NODE_TYPES.CON;
    },
    isMonitor() {
      return this.nodeType === NODE_TYPES.MONITOR;
    },
    isWorkspace() {
      return this.nodeType === NODE_TYPES.WORKSPACE;
    },
    isRoot() {
      return this.nodeType === NODE_TYPES.ROOT;
    },
    isFloat() {
      return this.mode === WINDOW_MODES.FLOAT;
    },
    isTile() {
      return this.mode === WINDOW_MODES.TILE;
    },
    isGrabTile() {
      return this.mode === WINDOW_MODES.GRAB_TILE;
    },
    isTabbed() {
      return this.layout === LAYOUT_TYPES.TABBED;
    },
    isStacked() {
      return this.layout === LAYOUT_TYPES.STACKED;
    },
    isStackedOrTabbed() {
      return this.isTabbed() || this.isStacked();
    },
    isHSplit() {
      return this.layout === LAYOUT_TYPES.HSPLIT;
    },
    isVSplit() {
      return this.layout === LAYOUT_TYPES.VSPLIT;
    },
    isPlaceholder() {
      return this.placeholder === true || isPlaceholderValue(this.nodeValue);
    },
  };
  if (opts.placeholderReason != null) live.placeholderReason = opts.placeholderReason;
  if (opts.layoutSlot != null) live.layoutSlot = opts.layoutSlot;
  if (opts.layoutRole != null) live.layoutRole = opts.layoutRole;

  if (live.isWindow() && (live.placeholder || isPlaceholderValue(value))) {
    live.placeholder = true;
    live.app = null;
  } else if (live.isWindow()) {
    initWindowApp(live);
  }

  Logger.info(`live-handle invent kind=${nodeType}`);
  return live;
}
