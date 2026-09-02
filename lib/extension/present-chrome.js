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
 * Chrome / present slot walk (D096 G8f) — extracted off Tree; duck-typed `tree`.
 * Tab measure helpers (min width / glyph / chrome px) live here too.
 */

import Clutter from "gi://Clutter";
import St from "gi://St";

import { Logger } from "../shared/logger.js";
import { recordWarn } from "./metrics.js";
import * as Utils from "./utils.js";
import * as TreeLayout from "./tree-layout.js";
import * as Compat from "./compat.js";
import { liveChildrenForPresent } from "./tom-live.js";
import { NODE_TYPES, LAYOUT_TYPES } from "./tree-types.js";
import { tabForNode } from "./decoration.js";
import * as NodeChrome from "./node-chrome.js";

function warnDecoDisposed(where) {
  recordWarn("deco-disposed", { where: String(where || "present") });
}

function healChildTab(child) {
  NodeChrome.dropDeadTab(child, "apply-decoration");
  if (child.isWindow()) NodeChrome.createWindowTab(child);
  else if (child.isCon()) NodeChrome.ensureConTab(child);
}

function destroyDeadDecoration(node, where) {
  if (!node?.decoration) return;
  if (!NodeChrome.actorAlive(node.decoration)) {
    node.decoration._forgeDisposed = true;
  }
  warnDecoDisposed(where);
  NodeChrome.destroyDecoration(node);
}

// Tuning for stacked/tabbed decoration placement (forge-u8ni).
const DECORATION_ADJUST_FACTOR = 4;

/** Non-floating, non-minimized kids (slot area). CON recurse via liveChildrenForPresent. */
export function getTiledChildren(tree, items) {
  let filterFn = (node) => {
    if (node.isWindow()) {
      if (node.isPlaceholder()) {
        return !node.isFloat() && !node.isGrabTile();
      }
      if (!Utils.isWindowAlive(node.nodeValue)) return false;
      let floating = node.isFloat();
      let grabTiling = node.isGrabTile();
      if (!node.nodeValue.minimized && !(floating || grabTiling)) {
        return true;
      }
    }
    if (node.isCon()) {
      return getTiledChildren(tree, liveChildrenForPresent(tree.extWm, node)).length > 0;
    }
    return false;
  };

  return items ? items.filter(filterFn) : [];
}

/** Per-title-bar height (DPI-scaled). */
export function stackedBarHeight(tree) {
  return tree.settings.get_uint("stacked-tab-bar-height") * Utils.dpi();
}

/** "top" or "bottom" tab strip placement. */
export function tabPosition(tree) {
  return tree.settings.get_string("tab-position") === "bottom" ? "bottom" : "top";
}

/** Drop cached measureMinTabWidth results (css/dpi/font). */
export function invalidateMinTabWidthCache(tree) {
  tree._minTabWidthCache = null;
}

export function tabTitleFontDesc(_tree) {
  try {
    const theme = St.ThemeContext.get_for_stage?.(global.stage);
    const font = theme?.get_font?.() || theme?.font;
    if (font?.to_string) return font.to_string();
    if (typeof font === "string" && font) return font;
  } catch (_e) {
    /* stage/theme unavailable */
  }
  return "default";
}

/** Average advance of minChars copies of "0" (physical px). */
export function avgTabGlyphPx(_tree, minChars, scale, _fontDesc) {
  try {
    const text = "0".repeat(minChars);
    const lab = new St.Label({ text, style_class: "window-tabbed-tab" });
    if (typeof lab.get_preferred_width === "function") {
      const pref = lab.get_preferred_width(-1);
      const nat = Array.isArray(pref) ? pref[1] ?? pref[0] : pref;
      if (nat > 0 && minChars > 0) return nat / minChars;
    }
  } catch (_e) {
    /* measure unavailable */
  }
  // Fallback when St/Pango cannot measure (unit mocks, unrealized stage).
  return 0.55 * 11 * scale;
}

/** Icon + close + pad in the same physical space as processGap width. */
export function tabChromePx(_tree, scale) {
  const s = scale || 1;
  return Math.round((24 + 30 + 12) * s);
}

/**
 * Min tab slot width for readable-fill wrap. 0 when minChars===0 (no chrome floor).
 * Glyph measure uses "0"×minChars in the tab title font; cache key font+dpi+chars.
 */
export function measureMinTabWidth(tree, { minChars = 0, dpi = null, fontDesc = null } = {}) {
  const chars = Math.max(0, minChars | 0);
  if (chars === 0) return 0;

  const scale = dpi != null ? Number(dpi) || 1 : Utils.dpi() || 1;
  const desc = fontDesc || tabTitleFontDesc(tree) || "default";
  const key = `${desc}|${scale}|${chars}`;
  if (tree._minTabWidthCache?.key === key) return tree._minTabWidthCache.value;

  const avgGlyph = avgTabGlyphPx(tree, chars, scale, desc);
  const chromePx = tabChromePx(tree, scale);
  const value = TreeLayout.minTabWidthFromChars(chars, avgGlyph, chromePx);
  tree._minTabWidthCache = { key, value };
  return value;
}

/** Content/bar Y anchors for stacked/tabbed chrome. */
export function decorationLayout(rectY, height, barSize, position) {
  return TreeLayout.decorationLayout(rectY, height, barSize, position);
}

/** True when CON lives on the Shell active workspace. */
export function decorationOnActiveWorkspace(tree, node) {
  try {
    const mon = tree.findAncestorMonitor?.(node) ?? null;
    if (!mon?.nodeValue) return true;
    const wsIdx = Utils.workspaceIndex(mon.nodeValue);
    const active = global.display?.get_workspace_manager?.()?.get_active_workspace_index?.();
    if (typeof active !== "number" || typeof wsIdx !== "number") return true;
    return wsIdx === active;
  } catch (_e) {
    return true;
  }
}

/** Chrome slot walk (i3-like). */
export function processNode(tree, node) {
  if (!node) return;

  const presentKids = () => liveChildrenForPresent(tree.extWm, node);

  if (node.nodeType === NODE_TYPES.ROOT) {
    presentKids().forEach((child) => {
      processNode(tree, child);
    });
  }

  if (node.nodeType === NODE_TYPES.WORKSPACE) {
    presentKids().forEach((child) => {
      processNode(tree, child);
    });
  }

  let params = {};

  if (node.nodeType === NODE_TYPES.MONITOR || node.nodeType === NODE_TYPES.CON) {
    const kids = presentKids();
    if (kids.length === 0) {
      return;
    }

    if (node.nodeType === NODE_TYPES.MONITOR) {
      let monitorIndex = Utils.monitorIndex(node.nodeValue);
      let wsIndex = Utils.workspaceIndex(node.nodeValue);
      let workspaceMgr = global.display.get_workspace_manager();
      let workspace = workspaceMgr.get_workspace_by_index(wsIndex);
      if (!workspace) {
        workspace = workspaceMgr.get_active_workspace();
      }
      let monitorArea = workspace.get_work_area_for_monitor(monitorIndex);
      if (!monitorArea) return;
      node.rect = applyMargins(tree, monitorArea);
      node.rect = processGap(tree, node);
    }

    let tiledChildren = getTiledChildren(tree, kids);
    let sizes = computeSizes(tree, node, tiledChildren);

    params.sizes = sizes;
    let showTabs = tree.settings.get_boolean("showtab-decoration-enabled");
    params.stackedHeight = showTabs ? stackedBarHeight(tree) : 0;
    params.tiledChildren = tiledChildren;
    params.maxTabsPerLine = tree.settings.get_uint("max-tabs-per-line") || 0;
    params.minTabLabelChars = tree.settings.get_uint("min-tab-label-chars") || 0;
    params.maxTabRows = tree.settings.get_uint("max-tab-rows") || 0;

    const groupChrome = NodeChrome.chromeGroupEligible(node, kids);

    let decoration = node.decoration;
    if (decoration && !NodeChrome.actorAlive(decoration)) {
      destroyDeadDecoration(node, "process-node");
      decoration = null;
    }

    if (decoration && !groupChrome) {
      if (node.isStackedOrTabbed()) {
        Logger.trace(`chrome-unary skip layout=${node.layout || "-"} kids=${kids.length}`);
        NodeChrome.destroyDecoration(node);
        decoration = null;
      } else {
        try {
          if (!NodeChrome.actorAlive(decoration)) {
            destroyDeadDecoration(node, "present-hide");
          } else {
            decoration.hide();
            if (decoration.set_size) decoration.set_size(0, 0);
            if ("reactive" in decoration) decoration.reactive = false;
          }
        } catch (e) {
          if (NodeChrome.isDisposedActorError(e) && node.decoration) {
            node.decoration._forgeDisposed = true;
            destroyDeadDecoration(node, "present-hide");
          } else {
            NodeChrome.destroyDecoration(node);
          }
        }
      }
    } else if (decoration) {
      try {
        if (!NodeChrome.actorAlive(decoration)) {
          destroyDeadDecoration(node, "present-strip");
        } else {
          let decoChildren = decoration.get_children().slice();
          for (const decoChild of decoChildren) {
            if (decoChild._forgeTabRow) {
              if (!NodeChrome.actorAlive(decoChild)) {
                destroyDeadDecoration(node, "present-strip");
                decoration = null;
                break;
              }
              if (decoChild.get_children) {
                decoChild
                  .get_children()
                  .slice()
                  .forEach((tab) => {
                    if (NodeChrome.actorAlive(decoChild) && NodeChrome.actorAlive(tab)) {
                      decoChild.remove_child(tab);
                    }
                  });
              }
            }
            if (!NodeChrome.actorAlive(decoration)) {
              destroyDeadDecoration(node, "present-strip");
              decoration = null;
              break;
            }
            decoration.remove_child(decoChild);
            if (decoChild._forgeTabRow && decoChild.destroy && NodeChrome.actorAlive(decoChild)) {
              try {
                decoChild.destroy();
              } catch (_e2) {
                /* finalized */
              }
            }
          }
          if (node.decoration) node._tabRowHosts = null;
        }
      } catch (e) {
        if (node.decoration) {
          if (NodeChrome.isDisposedActorError(e)) node.decoration._forgeDisposed = true;
          destroyDeadDecoration(node, "present-strip");
        }
      }
    }

    tiledChildren.forEach((child, index) => {
      if (groupChrome && node.layout === LAYOUT_TYPES.STACKED) {
        if (child.isCon()) NodeChrome.ensureConTab(child);
        else if (child.isWindow()) NodeChrome.createWindowTab(child);
        processStacked(tree, node, child, params, index);
      } else if (groupChrome && node.layout === LAYOUT_TYPES.TABBED) {
        if (child.isCon()) NodeChrome.ensureConTab(child);
        else if (child.isWindow()) NodeChrome.createWindowTab(child);
        processTabbed(tree, node, child, params, index);
      } else if (node.layout === LAYOUT_TYPES.HSPLIT || node.layout === LAYOUT_TYPES.VSPLIT) {
        processSplit(tree, node, child, params, index);
      } else if (node.rect) {
        child.rect = {
          x: node.rect.x,
          y: node.rect.y,
          width: node.rect.width,
          height: node.rect.height,
        };
      }
      processNode(tree, child);
    });
  }

  if (node.isWindow()) {
    if (!node.rect) {
      const wa = Utils.getWorkAreaSafe(node.nodeValue);
      if (wa) node.rect = wa;
    }
    if (node.rect) node.renderRect = processGap(tree, node);
  }
}

/** Gap inset for non-Window and Window nodes. */
export function processGap(tree, node) {
  const gap = tree.extWm?.calculateGaps?.(node) ?? 0;
  return TreeLayout.processGap(node, gap);
}

/** Screen-edge margins from settings. */
export function applyMargins(tree, rect) {
  return TreeLayout.applyMargins(rect, {
    top: tree.settings.get_uint("window-margin-top"),
    bottom: tree.settings.get_uint("window-margin-bottom"),
    left: tree.settings.get_uint("window-margin-left"),
    right: tree.settings.get_uint("window-margin-right"),
  });
}

export function processSplit(_tree, node, child, params, index) {
  child.rect = TreeLayout.splitChildRect(node.layout, node.rect, params.sizes, index);
}

/**
 * Size/position stacked or tabbed decoration host and attach child tab.
 * Optional `tabHost` is a multi-row BoxLayout; else attach to outer decoration.
 */
export function applyDecorationRect(tree, node, child, params, barSize, tabExpand, tabHost = null) {
  let gap = tree.extWm.calculateGaps(node);
  let renderRect = processGap(tree, node);
  let position = tabPosition(tree);
  let borderWidth =
    child.isWindow() && child.actor && child.actor.border
      ? child.actor.border.get_theme_node().get_border_width(St.Side.TOP)
      : 0;

  let adjust = DECORATION_ADJUST_FACTOR * Utils.dpi();
  let adjustWidth = renderRect.width + (borderWidth * 2 + gap) / adjust;
  let adjustX = renderRect.x - (gap + borderWidth * 2) / (adjust * 2);
  let adjustY =
    position === "bottom"
      ? decorationLayout(renderRect.y, renderRect.height, barSize, position).decorationY
      : gap === 0
      ? renderRect.y
      : renderRect.y - adjust;

  if (!NodeChrome.actorAlive(node.decoration)) {
    destroyDeadDecoration(node, "apply-decoration");
    NodeChrome.createDecoration(node);
  }
  let decoration = node.decoration;
  if (!NodeChrome.actorAlive(tabHost)) tabHost = null;
  const onActiveWs = decorationOnActiveWorkspace(tree, node);
  try {
    if (!NodeChrome.actorAlive(decoration)) {
      destroyDeadDecoration(node, "apply-decoration");
      NodeChrome.createDecoration(node);
      decoration = node.decoration;
    }
    if (!NodeChrome.actorAlive(decoration)) {
      NodeChrome.render(child);
      return;
    }
    decoration.set_size(adjustWidth, barSize);
    decoration.set_position(adjustX, adjustY);
    if (params.tiledChildren.length > 0 && params.stackedHeight !== 0 && onActiveWs) {
      decoration.show();
    } else {
      decoration.hide();
    }
    let childTab = tabForNode(tree.extWm, child);
    if (!NodeChrome.actorAlive(childTab)) {
      healChildTab(child);
      childTab = tabForNode(tree.extWm, child);
    }
    const host = NodeChrome.actorAlive(tabHost) ? tabHost : decoration;
    if (
      NodeChrome.actorAlive(childTab) &&
      NodeChrome.actorAlive(host) &&
      !host.contains(childTab)
    ) {
      const tabDrag = tree.extWm?.dragDrop?._tabDrag;
      if (
        tabDrag?.chipFloating &&
        (tabDrag.unitNode === child || tabDrag.metaWindow === child.nodeValue)
      ) {
        // leave floating until release/abort
      } else {
        const tabParent = childTab.get_parent();
        if (tabParent && NodeChrome.actorAlive(tabParent)) tabParent.remove_child(childTab);
        childTab.y_expand = tabExpand;
        if (NodeChrome.actorAlive(host) && NodeChrome.actorAlive(childTab)) {
          host.add_child(childTab);
        }
      }
    }
  } catch (e) {
    Logger.warn(`Failed to update decoration: ${e}`);
    const disposed = NodeChrome.isDisposedActorError(e);
    if (disposed) {
      if (node.decoration) node.decoration._forgeDisposed = true;
      warnDecoDisposed("apply-decoration");
    }
    NodeChrome.destroyDecoration(node);
    if (disposed) {
      NodeChrome.createDecoration(node);
      healChildTab(child);
      const host = node.decoration;
      const childTab = tabForNode(tree.extWm, child);
      if (NodeChrome.actorAlive(host) && NodeChrome.actorAlive(childTab)) {
        try {
          if (!host.contains(childTab)) host.add_child(childTab);
        } catch (_e2) {
          /* still dead */
        }
      }
    }
  }
  NodeChrome.render(child);
}

/** Horizontal row hosts under a vertical outer decoration. */
export function ensureTabRowHosts(_tree, node, rowCount) {
  if (!NodeChrome.actorAlive(node.decoration)) {
    destroyDeadDecoration(node, "tab-row");
    return [];
  }
  if (!node._tabRowHosts) node._tabRowHosts = [];
  node._tabRowHosts = node._tabRowHosts.filter((row) => NodeChrome.actorAlive(row));
  const decoration = node.decoration;
  while (node._tabRowHosts.length < rowCount) {
    if (!NodeChrome.actorAlive(decoration)) {
      destroyDeadDecoration(node, "tab-row");
      return [];
    }
    const row = new St.BoxLayout();
    Compat.setBoxOrientation(row, Clutter.Orientation.HORIZONTAL);
    row.x_expand = true;
    row.y_expand = false;
    row._forgeTabRow = true;
    row.reactive = true;
    try {
      row.connect("destroy", () => {
        row._forgeDisposed = true;
      });
    } catch (_e) {
      /* mock without signals */
    }
    decoration.add_child(row);
    node._tabRowHosts.push(row);
  }
  for (const row of node._tabRowHosts) {
    if (!NodeChrome.actorAlive(row) || !NodeChrome.actorAlive(decoration)) continue;
    if (!decoration.contains(row)) decoration.add_child(row);
  }
  return node._tabRowHosts;
}

/** Ensure decoration host along `orientation` (self-heal if missing). */
export function ensureDecoration(_tree, node, orientation) {
  if (!NodeChrome.actorAlive(node.decoration)) {
    destroyDeadDecoration(node, "ensure-decoration");
  }
  if (!node.decoration) NodeChrome.createDecoration(node);
  if (!NodeChrome.actorAlive(node.decoration)) return;
  Compat.setBoxOrientation(node.decoration, orientation);
  if ("reactive" in node.decoration) node.decoration.reactive = true;
}

export function processStacked(tree, node, child, params, _index) {
  const count = params.tiledChildren ? params.tiledChildren.length : 0;
  if (count < 2) {
    child.rect = TreeLayout.tabbedChildRect(node.rect, 0, tabPosition(tree), false);
    return;
  }
  ensureDecoration(tree, node, Clutter.Orientation.VERTICAL);

  const barH = params.stackedHeight;
  const laid = TreeLayout.stackedChildRect(
    node.rect,
    barH,
    params.tiledChildren.length,
    tabPosition(tree)
  );
  child.rect = laid.rect;

  if (node.decoration && (child.isWindow() || child.isCon())) {
    applyDecorationRect(tree, node, child, params, laid.totalBars, false);
    const childTab = tabForNode(tree.extWm, child);
    if (NodeChrome.actorAlive(childTab) && barH > 0) {
      childTab.y_expand = false;
      childTab.set_height(barH);
    }
  }
}

export function processTabbed(tree, node, child, params, index) {
  if (node.layout !== LAYOUT_TYPES.TABBED) return;

  const count = params.tiledChildren ? params.tiledChildren.length : 0;
  if (count < 2) {
    child.rect = TreeLayout.tabbedChildRect(node.rect, 0, tabPosition(tree), false);
    return;
  }

  const maxPerLine = params.maxTabsPerLine || 0;
  const minChars =
    params.minTabLabelChars !== undefined
      ? params.minTabLabelChars
      : tree.settings?.get_uint?.("min-tab-label-chars") || 0;
  const maxRows =
    params.maxTabRows !== undefined
      ? params.maxTabRows
      : tree.settings?.get_uint?.("max-tab-rows") || 0;
  const minTabWidth =
    params.minTabWidth !== undefined ? params.minTabWidth : measureMinTabWidth(tree, { minChars });
  const rowInnerWidth =
    params.rowInnerWidth !== undefined ? params.rowInnerWidth : processGap(tree, node).width;

  const plan =
    params._tabbedWrapPlan ||
    TreeLayout.planTabbedWrap({
      count,
      rowInnerWidth,
      minTabWidth,
      maxPerLine,
      maxRows,
    });
  params._tabbedWrapPlan = plan;

  const rowCount = plan.rowCount || 0;
  const totalBar = rowCount > 0 ? params.stackedHeight * rowCount : 0;
  const multiRow = rowCount > 1;

  if (multiRow) {
    ensureDecoration(tree, node, Clutter.Orientation.VERTICAL);
    const hosts = ensureTabRowHosts(tree, node, rowCount);
    const perRow = plan.perRow > 0 ? plan.perRow : 1;
    const rowIndex = Math.floor(index / perRow);
    const barH = params.stackedHeight;
    child.rect = TreeLayout.tabbedChildRect(node.rect, totalBar, tabPosition(tree), true);
    if (node.decoration && (child.isWindow() || child.isCon())) {
      applyDecorationRect(tree, node, child, params, totalBar, false, hosts[rowIndex] || null);
      if (barH > 0) {
        const row = hosts[rowIndex];
        if (NodeChrome.actorAlive(row)) {
          row.y_expand = false;
          row.set_height(barH);
        }
        const childTab = tabForNode(tree.extWm, child);
        if (NodeChrome.actorAlive(childTab)) {
          childTab.y_expand = false;
          childTab.set_height(barH);
        }
      }
    }
  } else {
    ensureDecoration(tree, node, Clutter.Orientation.HORIZONTAL);
    const barH = totalBar || params.stackedHeight;
    child.rect = TreeLayout.tabbedChildRect(node.rect, barH, tabPosition(tree), true);
    if (node.decoration && (child.isWindow() || child.isCon())) {
      applyDecorationRect(tree, node, child, params, barH, false);
    }
  }
}

export function computeSizes(tree, node, childItems) {
  return TreeLayout.computeSizes(node, childItems, (items) => getTiledChildren(tree, items), {
    skipWriteBack: !!tree.extWm?.openLayoutBatchActive,
  });
}
