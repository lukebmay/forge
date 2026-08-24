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
import Clutter from "gi://Clutter";
import GObject from "gi://GObject";
import Meta from "gi://Meta";

// Gnome Shell imports
import * as Main from "resource:///org/gnome/shell/ui/main.js";

// Shared state
import { Logger } from "../shared/logger.js";

// App imports
import { LAYOUT_TYPES, NODE_TYPES } from "./tree.js";

/**
 * FocusManager owns the focus/pointer-follow cluster for WindowManager:
 * pointer warping (movePointerWith/warpPointerToNodeWindow), the focus-on-hover
 * pointer loop (pointerLoopInit/_focusWindowUnderPointer), and stacked/tabbed
 * focus restacking (updateStackedFocus/updateTabbedFocus). Extracted from
 * window.js to keep the focus cluster in one place.
 *
 * Shared WindowManager state and helpers are read/called LIVE via this._extWm so
 * behavior is preserved. In particular: _freezeRender is read live each call (never
 * cached); the fields lastFocusedWindow, shouldFocusOnHover, disabled and
 * _workspaceChanging stay on WindowManager; pointer poll timer lives on
 * `_wmSources` slot `pointerFocus` (cancelAll on disable). Cross-calls between
 * moved methods route through this._extWm too, so spies on the WindowManager
 * instance still intercept them.
 */
export class FocusManager extends GObject.Object {
  static {
    GObject.registerClass(this);
  }

  /** @type {import('./tree.js').Tree} */
  _tree;

  /** @type {import('./window.js').WindowManager} */
  _extWm;

  /**
   * @param {import('./tree.js').Tree} tree
   * @param {import('./window.js').WindowManager} extWm
   */
  constructor(tree, extWm) {
    super();
    this._tree = tree;
    this._extWm = extWm;
  }

  /**
   * Moves the pointer along with the nodeWindow's meta
   *
   * This is useful for making sure that Forge calculates the attachNode
   * properly
   */
  movePointerWith(nodeWindow, { force = false } = {}) {
    if (!nodeWindow || !nodeWindow._data) return;
    const shouldWarp = force || this._extWm.ext.settings.get_boolean("move-pointer-focus-enabled");
    if (shouldWarp) {
      this._extWm.storePointerLastPosition(this._extWm.lastFocusedWindow);
      if (this._extWm.canMovePointerInsideNodeWindow(nodeWindow)) {
        this._extWm.warpPointerToNodeWindow(nodeWindow);
      }
    }
    this._extWm.lastFocusedWindow = nodeWindow;
    // OP1: tile focus advances LFT MRU; floats (Guake) never enter.
    this._extWm._lftTouchIfTile?.(nodeWindow);
    this._tree.debugParentNodes(nodeWindow);
  }

  warpPointerToNodeWindow(nodeWindow) {
    const newCoord = this._extWm.getPointerPositionInside(nodeWindow);
    if (newCoord && newCoord.x && newCoord.y) {
      const seat = Clutter.get_default_backend().get_default_seat();
      if (seat) {
        const wmTitle = nodeWindow.nodeValue.get_title();
        Logger.debug(`moved pointer to [${wmTitle}] at (${newCoord.x},${newCoord.y})`);
        seat.warp_pointer(newCoord.x, newCoord.y);
      }
    }
  }

  pointerLoopInit() {
    const wm = this._extWm;
    // One-shot bag: re-arm while the poll wants to continue (was return-true GLib loop).
    wm._wmSources.cancel("pointerFocus");
    const tick = () => {
      const cont = wm._focusWindowUnderPointer();
      if (cont) {
        wm._wmSources.set("pointerFocus", 16, tick);
      }
    };
    wm._wmSources.set("pointerFocus", 16, tick);
  }

  /**
   * Canonical TABBED/STACKED open-leaf writer (TRACE on change).
   * @param {object|null|undefined} focusNodeWindow
   * @returns {boolean}
   */
  setOpenLeaf(focusNodeWindow) {
    if (!focusNodeWindow || !focusNodeWindow.parentNode) return false;
    const parentNode = focusNodeWindow.parentNode;
    const layout = parentNode.layout;
    if (layout !== LAYOUT_TYPES.TABBED && layout !== LAYOUT_TYPES.STACKED) return false;
    const prev = parentNode.lastTabFocus;
    const next = focusNodeWindow.nodeValue;
    if (prev !== next) {
      const lab = (meta) => {
        if (!meta) return "-";
        try {
          const t = meta.get_title?.() || "?";
          const id = typeof meta.get_id === "function" ? meta.get_id() : "?";
          return `${id}:${t}`;
        } catch (_e) {
          return "?";
        }
      };
      const kind = layout === LAYOUT_TYPES.TABBED ? "tab" : "stack";
      Logger.trace(
        `lastTabFocus ${kind} ${lab(prev)} → ${lab(next)} wsChanging=${!!this._extWm
          ?._workspaceChanging}`
      );
    }
    parentNode.lastTabFocus = next;
    return true;
  }

  updateStackedFocus(focusNodeWindow) {
    if (!focusNodeWindow || !focusNodeWindow.parentNode) return;
    if (focusNodeWindow.parentNode.layout !== LAYOUT_TYPES.STACKED) return;
    // Always record open leaf (data). Raise only when not frozen — RunSteps
    // afterFocus temporarily unfreezes so raise still runs on layout focus.
    this.setOpenLeaf(focusNodeWindow);
    if (!this._extWm._freezeRender) {
      focusNodeWindow.nodeValue.raise?.();
    }
  }

  updateTabbedFocus(focusNodeWindow) {
    if (!focusNodeWindow || !focusNodeWindow.parentNode) return;
    if (focusNodeWindow.parentNode.layout !== LAYOUT_TYPES.TABBED) return;
    // Always record open leaf even under freeze (cold layout pins must stick).
    // Raise only when not frozen (afterFocus unfreezes for F).
    this.setOpenLeaf(focusNodeWindow);
    if (!this._extWm._freezeRender) {
      focusNodeWindow.nodeValue.raise?.();
    }
  }

  /**
   * TABBED/STACKED: reassert TILE Meta frames against renderRect/rect (ε).
   * Not on the hot focus path — use from verify/recovery only.
   * Default mode `open-leaf`: only lastTabFocus. Mode `all`: every off-slot TILE.
   * No full renderTree.
   *
   * @param {object} parentNode
   * @param {{ mode?: "open-leaf"|"all", force?: boolean }} [opts]
   */
  _reassertTabStackSiblingSlots(parentNode, opts = {}) {
    const wm = this._extWm;
    if (!wm || !parentNode) return;
    const mode = opts.mode === "all" ? "all" : "open-leaf";
    const force = !!opts.force;
    const openMeta = parentNode.lastTabFocus;
    const kids = parentNode.childNodes || [];
    for (const child of kids) {
      if (!child) continue;
      const isWin =
        child.nodeType === NODE_TYPES.WINDOW ||
        child.nodeType === "WINDOW" ||
        (typeof child.isWindow === "function" && child.isWindow());
      if (!isWin) continue;
      if (child.mode !== "TILE") continue;
      const meta = child.nodeValue;
      if (!meta) continue;
      if (mode === "open-leaf" && openMeta != null && meta !== openMeta) continue;
      // Prefer WM helper (ε / maximize / fullscreen).
      if (!force && typeof wm._tiledWindowAtTreeSlot === "function") {
        if (wm._tiledWindowAtTreeSlot(child, meta)) continue;
      } else if (!force) {
        const slot0 = child.renderRect || child.rect;
        if (!slot0 || !(slot0.width > 0) || !(slot0.height > 0)) continue;
      }
      const slot = child.renderRect || child.rect;
      if (!slot || !(slot.width > 0) || !(slot.height > 0)) continue;
      if (typeof wm.reassertNodeToSlot === "function") {
        wm.reassertNodeToSlot(child, { force });
      } else if (typeof wm.move === "function") {
        wm.move(meta, slot, null, { force });
      }
    }
  }

  /**
   * Focus the window under the pointer and raise it.
   *
   * @returns {boolean} true if we should continue polling, false otherwise
   */
  /**
   * Clear TILE keyboard focus (best-effort). Hover will not re-focus the
   * window under the pointer until the pointer leaves it.
   *
   * Mutter always focuses *something*. On X11, stage key focus on the panel
   * is often enough for GetTree focusWindowId to leave the TILE. On Wayland,
   * Meta keeps the client window focused unless another Meta window takes
   * focus — prefer a FLOAT (Guake, etc.) so no managed TILE holds keys.
   */
  unfocusTiles() {
    const wm = this._extWm;
    let suppressMeta = null;
    try {
      suppressMeta =
        (typeof global.display.get_focus_window === "function"
          ? global.display.get_focus_window()
          : null) ??
        global.display.focus_window ??
        null;
    } catch (_e) {
      suppressMeta = null;
    }
    try {
      const pointer = global.get_pointer();
      const under = wm._getMetaWindowAtPointer?.(pointer);
      if (under) suppressMeta = under;
    } catch (_e) {
      /* pointer probe optional */
    }
    wm._unfocusHoverSuppressMeta = suppressMeta;

    // Hand Meta focus to a FLOAT when available (Wayland needs a real surface).
    let handedToFloat = false;
    try {
      const floatMeta = this._pickFloatMetaForUnfocus?.(suppressMeta) ?? null;
      if (floatMeta && typeof floatMeta.activate === "function") {
        const t = typeof global.get_current_time === "function" ? global.get_current_time() : 0;
        floatMeta.activate(t);
        handedToFloat = true;
      }
    } catch (_e) {
      handedToFloat = false;
    }

    try {
      global.stage.set_key_focus(null);
    } catch (_e) {
      /* stage may be unavailable in tests */
    }
    // Prefer shell panel over a tile for stage key focus when present.
    try {
      if (Main.panel) {
        global.stage.set_key_focus(Main.panel);
      }
    } catch (_e) {
      /* panel optional */
    }

    try {
      wm.updateBorderLayout?.();
    } catch (_e) {
      /* best-effort */
    }
    Logger.debug(`unfocus: tiles${handedToFloat ? " (float target)" : " (stage/panel only)"}`);
  }

  /**
   * Pick a Meta window outside the tiling tree (FLOAT / unmanaged) so unfocus
   * can leave TILE keyboard focus. Prefer Guake; else any NORMAL float.
   * @param {Meta.Window|null} avoidMeta
   * @returns {Meta.Window|null}
   */
  _pickFloatMetaForUnfocus(avoidMeta = null) {
    const wm = this._extWm;
    let guake = null;
    let anyFloat = null;
    let actors = [];
    try {
      actors = typeof global.get_window_actors === "function" ? global.get_window_actors() : [];
    } catch (_e) {
      actors = [];
    }
    for (const actor of actors) {
      let meta = null;
      try {
        meta = actor?.meta_window ?? actor?.get_meta_window?.() ?? null;
      } catch (_e) {
        meta = null;
      }
      if (!meta || meta === avoidMeta) continue;
      // Skip minimized / skip-taskbar noise when possible.
      try {
        if (typeof meta.minimized === "boolean" && meta.minimized) continue;
        if (typeof meta.is_skip_taskbar === "function" && meta.is_skip_taskbar()) {
          continue;
        }
      } catch (_e) {
        /* optional */
      }
      // In tiling tree as TILE → not a float target.
      try {
        const node = typeof wm.findNodeWindow === "function" ? wm.findNodeWindow(meta) : null;
        if (node) {
          const mode = node?.mode ?? node?.nodeValue?.mode;
          // String compare: WINDOW_MODES.FLOAT if present on node.
          const modeStr = String(mode || "").toUpperCase();
          if (modeStr && modeStr !== "FLOAT" && modeStr !== "DEFAULT") {
            continue;
          }
          if (modeStr === "TILE" || modeStr === "GRAB_TILE") continue;
        }
      } catch (_e) {
        /* treat as candidate if tree probe fails */
      }
      let cls = "";
      try {
        cls = String(meta.get_wm_class?.() || meta.wm_class || "");
      } catch (_e) {
        cls = "";
      }
      if (/guake/i.test(cls)) {
        guake = meta;
        break;
      }
      if (!anyFloat) {
        let wtype = null;
        try {
          wtype =
            typeof meta.get_window_type === "function" ? meta.get_window_type() : meta.window_type;
        } catch (_e) {
          wtype = null;
        }
        // NORMAL client not in tile tree — likely float (Guake-class already handled).
        if (
          wtype == null ||
          wtype === Meta.WindowType.NORMAL ||
          wtype === Meta.WindowType.DIALOG ||
          wtype === Meta.WindowType.MODAL_DIALOG
        ) {
          anyFloat = meta;
        }
      }
    }
    return guake || anyFloat;
  }

  _focusWindowUnderPointer() {
    if (!this._extWm.shouldFocusOnHover || this._extWm.disabled) {
      // Return false → pointerLoopInit tick does not re-arm; bag already cleared on fire.
      return false;
    }

    // Feature #458: Skip hover-to-focus if tiling-only mode is set and tiling is disabled
    const tilingOnly = this._extWm.ext.settings.get_boolean("focus-on-hover-tiling-only");
    const tilingEnabled = this._extWm.ext.settings.get_boolean("tiling-mode-enabled");
    if (tilingOnly && !tilingEnabled) return true;

    // We don't want to focus windows when the overview is visible
    if (Main.overview.visible) return true;

    // Bug #374 fix: Skip focus-on-hover during workspace transitions
    if (this._extWm._workspaceChanging) return true;

    // Don't steal focus from modal dialogs or password prompts (#483)
    // Prefer get_focus_window(); fall back to focus_window (GObject prop / older tests).
    const focusedWindow =
      (typeof global.display.get_focus_window === "function"
        ? global.display.get_focus_window()
        : null) ?? global.display.focus_window;
    if (focusedWindow) {
      const focusedType = focusedWindow.get_window_type();
      if (focusedType === Meta.WindowType.MODAL_DIALOG || focusedType === Meta.WindowType.DIALOG) {
        return true;
      }
    }

    let pointer = global.get_pointer();

    const metaWindow = this._extWm._getMetaWindowAtPointer(pointer);

    // Explicit unfocus: do not hover-refocus the same window until pointer leaves.
    const suppressMeta = this._extWm._unfocusHoverSuppressMeta;
    if (suppressMeta) {
      if (metaWindow === suppressMeta) {
        return true;
      }
      this._extWm._unfocusHoverSuppressMeta = null;
    }

    // Only act when the window under the pointer is not already focused.
    // Re-raise every ~16ms buried tab strips under the window actor (LF2):
    // decoration restack only runs on focus-change / render, not on hover.
    if (metaWindow && metaWindow !== focusedWindow) {
      metaWindow.focus(global.get_current_time());
      metaWindow.raise();
    }

    return true;
  }
}
