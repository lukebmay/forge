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

import GObject from "gi://GObject";
import St from "gi://St";

import { NODE_TYPES } from "./tree.js";
import * as Utils from "./utils.js";

const LABEL_INSET = 6;

// Inline style so labels stay readable when the user profile stylesheet
// (preferred over bundled) omits .window-layout-debug-label.
const LABEL_STYLE =
  "font-family: monospace; font-size: 11px; " +
  "color: rgba(255, 255, 255, 0.95); " +
  "background-color: rgba(0, 0, 0, 0.78); " +
  "border-radius: 4px; padding: 3px 8px;";

/**
 * Compact per-window layout debug label text.
 * @param {{ parentLayout?: string|null, percent?: number|null, userSized?: boolean, monWsId?: string|null, minW?: number|null, minH?: number|null }} opts
 * @returns {string}
 */
export function formatLayoutDebugLabel({
  parentLayout = null,
  percent = null,
  userSized = false,
  monWsId = null,
  minW = null,
  minH = null,
} = {}) {
  const layout = parentLayout || "?";
  // T4: user-resized → explicit %; automatic (min write-back / equal) → auto or ~%
  let pct = "auto";
  if (typeof percent === "number" && percent > 0) {
    const rounded = `${Math.round(percent * 100)}%`;
    pct = userSized ? rounded : `~${rounded}`;
  }
  const mon = monWsId || "?";
  const parts = [layout, pct, mon];
  if (minW != null && minH != null && (minW > 0 || minH > 0)) {
    parts.push(`min:${minW}x${minH}`);
  }
  return parts.join(" ");
}

/**
 * Collect pure fields used by formatLayoutDebugLabel from a WINDOW node.
 * @param {import('./tree.js').Node} node
 * @param {import('./tree.js').Tree} tree
 */
export function layoutDebugInfoFromNode(node, tree) {
  const parentLayout = node?.parentNode?.layout ?? null;
  const percent = node?.percent ?? 0;
  const userSized = !!node?.userSized;
  const monWsId = tree?.findAncestorMonitor?.(node)?.nodeValue ?? null;
  let minW = null;
  let minH = null;
  const hints = node?.nodeValue?.get_size_hints?.();
  if (hints) {
    minW = hints.min_width ?? 0;
    minH = hints.min_height ?? 0;
  }
  return { parentLayout, percent, userSized, monWsId, minW, minH };
}

/**
 * Opt-in St.Label overlay: parent layout, percent, monitor id per tiled window.
 * No-op when the GSettings flag is off; destroyAll() on disable.
 */
export class LayoutDebugOverlay extends GObject.Object {
  static {
    GObject.registerClass(this);
  }

  /** @type {import('./window.js').WindowManager} */
  _extWm;

  /** @type {Map<object, import('gi://St').Label>} */
  _labels = new Map();

  /**
   * @param {import('./window.js').WindowManager} extWm
   */
  constructor(extWm) {
    super();
    this._extWm = extWm;
  }

  get enabled() {
    return this._extWm.ext.settings.get_boolean("layout-debug-overlay-enabled");
  }

  get _tree() {
    return this._extWm._tree;
  }

  /**
   * Refresh labels for tiled windows. Early-returns (and clears) when disabled.
   */
  update() {
    const tree = this._tree;
    if (!this.enabled || !tree) {
      this.destroyAll();
      return;
    }

    const live = new Set();
    const windows = tree.getNodeByType(NODE_TYPES.WINDOW) || [];

    for (const node of windows) {
      if (!node?.isTile?.() || !node.nodeValue) continue;
      const metaWindow = node.nodeValue;
      if (metaWindow.minimized) continue;

      const actor = metaWindow.get_compositor_private?.() || node.windowActor;
      if (!actor) continue;

      let rect = metaWindow.get_frame_rect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        if (node.rect) rect = node.rect;
      }
      if (!rect || rect.width <= 0 || rect.height <= 0) continue;

      const text = formatLayoutDebugLabel(layoutDebugInfoFromNode(node, tree));
      let label = this._labels.get(node);
      if (!label) {
        label = new St.Label({
          style_class: "window-layout-debug-label",
          style: LABEL_STYLE,
          text,
        });
        if (global.window_group) {
          global.window_group.add_child(label);
        }
        this._labels.set(node, label);
      } else {
        label.set_text(text);
        // Re-apply: user CSS reload can clear inline styles on some Shell versions.
        if (typeof label.set_style === "function") {
          label.set_style(LABEL_STYLE);
        }
      }

      const inset = LABEL_INSET * Utils.dpi();
      label.set_position(rect.x + inset, rect.y + inset);
      label.show();

      if (global.window_group && global.window_group.contains(label)) {
        global.window_group.remove_child(label);
        if (typeof global.window_group.insert_child_above === "function") {
          global.window_group.insert_child_above(label, actor);
        } else {
          global.window_group.add_child(label);
        }
      }

      live.add(node);
    }

    for (const [node, label] of this._labels) {
      if (!live.has(node)) {
        this._destroyLabel(label);
        this._labels.delete(node);
      }
    }
  }

  destroyAll() {
    for (const label of this._labels.values()) {
      this._destroyLabel(label);
    }
    this._labels.clear();
  }

  _destroyLabel(label) {
    if (!label) return;
    try {
      label.hide();
      if (global.window_group && global.window_group.contains(label)) {
        global.window_group.remove_child(label);
      }
      label.destroy();
    } catch (_e) {
      // actor may already be disposed
    }
  }
}
