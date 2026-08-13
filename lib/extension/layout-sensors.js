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
 * Attribution: chrome-only vs TILE-slot restore vs diagnostic verify (AC1).
 */

import { LAYOUT_VERIFY_EPSILON_PX, rectsAgree } from "./layout-verify.js";

/**
 * True when size/position signals are from our own apply path:
 *  - stack `_suppressGeom.active` (in-call re-entrancy during move/apply), or
 *  - active per-window command echo epoch (post-stack client snap residual, AC2).
 *
 * @param {{
 *   _suppressGeom?: { active?: boolean },
 *   layoutEpoch?: { isEchoActive?: (mw: unknown) => boolean },
 * }|null|undefined} wm
 * @param {unknown} [metaWindow] window that changed (echo is per-window)
 * @returns {boolean}
 */
export function isForgeCausedGeometrySignal(wm, metaWindow) {
  if (!wm) return false;
  if (wm._suppressGeom?.active) return true;
  if (
    metaWindow &&
    wm.layoutEpoch &&
    typeof wm.layoutEpoch.isEchoActive === "function" &&
    wm.layoutEpoch.isEchoActive(metaWindow)
  ) {
    return true;
  }
  return false;
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
    options && typeof options.isMaximized === "function" ? options.isMaximized : flagsMeanMaximized;
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

/**
 * True when a TILE should snap back to `renderRect` (D026).
 * Lone-tile maximize-on-single is left alone. Live grab uses `forGrab`
 * so resize/move percents are not treated as drift.
 *
 * @param {{ mode?: string, renderRect?: object, rect?: object }|null|undefined} node
 * @param {{
 *   get_frame_rect?: () => object,
 *   is_fullscreen?: () => boolean,
 *   get_maximized?: () => number,
 *   get_maximize_flags?: () => number,
 * }|null|undefined} metaWindow
 * @param {number} [epsilon=LAYOUT_VERIFY_EPSILON_PX]
 * @param {{
 *   isMaximized?: (mw: object) => boolean,
 *   isLoneMaximized?: (node: object, mw: object) => boolean,
 *   tilingEnabled?: boolean,
 *   forGrab?: boolean,
 * }|null} [options]
 * @returns {boolean}
 */
export function shouldRestoreTileSlot(
  node,
  metaWindow,
  epsilon = LAYOUT_VERIFY_EPSILON_PX,
  options = null
) {
  if (!node || !metaWindow) return false;
  if (node.mode !== "TILE") return false;
  // Zoom geom is intentional (D030); Meta max/fs on a non-zoomed TILE still restores.
  if (node.zoomMode) return false;
  if (options && options.tilingEnabled === false) return false;
  if (
    options &&
    typeof options.isLoneMaximized === "function" &&
    options.isLoneMaximized(node, metaWindow)
  ) {
    return false;
  }

  const isMaximized =
    options && typeof options.isMaximized === "function" ? options.isMaximized : flagsMeanMaximized;
  const fullscreen = typeof metaWindow.is_fullscreen === "function" && metaWindow.is_fullscreen();
  if (fullscreen || isMaximized(metaWindow)) return true;
  if (options && options.forGrab) return false;

  const slot = node.renderRect || node.rect;
  if (!slot || !(slot.width > 0) || !(slot.height > 0)) return false;

  return !shouldChromeOnlyGeometry(node, metaWindow, epsilon, options);
}

function flagsMeanMaximized(mw) {
  if (typeof mw.get_maximize_flags === "function") {
    return mw.get_maximize_flags() !== 0;
  }
  if (typeof mw.get_maximized === "function") {
    return mw.get_maximized() !== 0;
  }
  return false;
}

export { LAYOUT_VERIFY_EPSILON_PX };
