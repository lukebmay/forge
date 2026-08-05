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
 */

/**
 * Pure geometry-sensor attribution helpers (CL2).
 * No GObject imports — unit tests stay light.
 *
 * Sensors (size/position-changed) fire for both:
 *   - Forge apply (`move` / tree.apply → move_resize_frame)
 *   - External / client drift (user, app thrash, edge-snap)
 * Attribution decides chrome-only vs markUnsettled + requestLayout/verify.
 */

import { LAYOUT_VERIFY_EPSILON_PX, rectsAgree } from "./layout-verify.js";

/**
 * True when size/position signals are from our own apply path.
 * Reads WM `_suppressGeometrySignalRetile` (set around move / tree.apply).
 *
 * @param {{ _suppressGeometrySignalRetile?: boolean }|null|undefined} wm
 * @param {unknown} [_metaWindow] reserved for future per-window suppress
 * @returns {boolean}
 */
export function isForgeCausedGeometrySignal(wm, _metaWindow) {
  return !!(wm && wm._suppressGeometrySignalRetile);
}

/**
 * True when a TILE node's Meta frame already matches its tree slot within ε
 * (and is not fullscreen / maximized). Full re-layout is unnecessary then —
 * chrome (borders) only (W-storm in-slot path).
 *
 * Pure: no WM / Compat imports. Callers inject maximize check when needed.
 *
 * @param {{ mode?: string, renderRect?: object, rect?: object }|null|undefined} node
 * @param {{
 *   get_frame_rect?: () => object,
 *   is_fullscreen?: () => boolean,
 *   get_maximized?: () => number,
 *   get_maximize_flags?: () => number,
 * }|null|undefined} metaWindow
 * @param {number} [epsilon=LAYOUT_VERIFY_EPSILON_PX]
 * @param {{ isMaximized?: (mw: object) => boolean }|null} [options]
 * @returns {boolean}
 */
export function shouldChromeOnlyGeometry(
  node,
  metaWindow,
  epsilon = LAYOUT_VERIFY_EPSILON_PX,
  options = null
) {
  if (!node || !metaWindow) return false;
  if (node.mode !== "TILE") return false;

  if (typeof metaWindow.is_fullscreen === "function" && metaWindow.is_fullscreen()) {
    return false;
  }

  const isMaximized =
    options && typeof options.isMaximized === "function"
      ? options.isMaximized
      : (mw) => {
          if (typeof mw.get_maximize_flags === "function") {
            return mw.get_maximize_flags() !== 0;
          }
          if (typeof mw.get_maximized === "function") {
            return mw.get_maximized() !== 0;
          }
          return false;
        };
  if (isMaximized(metaWindow)) return false;

  const slot = node.renderRect || node.rect;
  if (!slot || !(slot.width > 0) || !(slot.height > 0)) return false;

  let frame = null;
  try {
    frame = typeof metaWindow.get_frame_rect === "function" ? metaWindow.get_frame_rect() : null;
  } catch {
    return false;
  }
  if (!frame) return false;

  return rectsAgree(frame, slot, epsilon);
}

export { LAYOUT_VERIFY_EPSILON_PX };
