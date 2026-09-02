/*
 * ForgeAdapterGnome — gsettings changed routing + layout-mode toggles.
 */

import { LAYOUT_TYPES } from "./tree-types.js";

/**
 * CL6: apply `layout-verify-interval-ms` (0 = off) to LayoutController.
 * @param {object} wm
 */
export function syncLayoutVerifyInterval(wm) {
  let ms = 0;
  try {
    ms = wm.ext?.settings?.get_uint?.("layout-verify-interval-ms") ?? 0;
  } catch (_e) {
    ms = 0;
  }
  wm.layoutController?.setVerifyIntervalMs(ms);
}

/**
 * Prefs toggle for stacked/tabbed tiling modes: convert live groups off,
 * restore prevLayout when re-enabled.
 * @param {object} wm
 * @param {string} settingName
 * @param {string} layoutType
 */
export function handleLayoutModeToggle(wm, settingName, layoutType) {
  let settings = wm.ext.settings;
  if (!settings.get_boolean(settingName)) {
    let nodes = wm.tree.getNodeByLayout(layoutType);
    nodes.forEach((node) => {
      node.prevLayout = node.layout;
      // STACKED→TABBED preserves the group; TABBED (and others) ungroup to split.
      if (layoutType === LAYOUT_TYPES.STACKED) {
        wm.tree.setLayout(node, LAYOUT_TYPES.TABBED);
      } else {
        wm.tree.setLayout(node, wm.determineSplitLayout());
      }
    });
  } else {
    // Re-enable STACKED: restore containers we converted to TABBED on disable.
    if (layoutType === LAYOUT_TYPES.STACKED) {
      wm.tree.getNodeByLayout(LAYOUT_TYPES.TABBED).forEach((node) => {
        if (node.prevLayout === LAYOUT_TYPES.STACKED) {
          wm.tree.setLayout(node, LAYOUT_TYPES.STACKED);
        }
      });
    }
    let splitNodes = wm.tree.getNodeByLayout(LAYOUT_TYPES.HSPLIT);
    splitNodes.push(...wm.tree.getNodeByLayout(LAYOUT_TYPES.VSPLIT));
    splitNodes.forEach((node) => {
      if (node.prevLayout && node.prevLayout === layoutType) {
        wm.tree.setLayout(node, layoutType);
      }
    });
  }
  wm.renderTree(settingName);
}

/**
 * Dispatch a GSettings "changed" signal. Extracted so the routing is
 * unit-testable (the mock settings object emits no signals).
 * @param {object} wm
 * @param {string} settingName
 */
export function onSettingsChanged(wm, settingName) {
  const settings = wm.ext.settings;
  switch (settingName) {
    case "window-overrides-reload-trigger":
      // Reload window overrides when triggered by preferences
      // This prevents the main extension from overwriting changes made by preferences.
      // Keep live per-window (wmId) FloatToggle overrides from this session (forge-8rm6).
      wm.reloadWindowOverrides(false);
      break;
    case "focus-border-toggle":
    case "focus-border-hidden-on-single":
      wm.renderTree(settingName);
      break;
    case "layout-debug-overlay-enabled":
      if (settings.get_boolean(settingName)) {
        wm.layoutDebugOverlay?.update();
      } else {
        wm.layoutDebugOverlay?.destroyAll();
      }
      break;
    case "preview-hint-enabled":
      // Never leave a dim overlay when the user turns hints off mid-drag.
      if (!settings.get_boolean(settingName)) {
        wm.dragDrop?.clearAllPreviewHints?.();
      }
      break;
    case "layout-verify-interval-ms":
      syncLayoutVerifyInterval(wm);
      break;
    case "focus-on-hover-enabled":
      wm.shouldFocusOnHover = settings.get_boolean(settingName);

      if (wm.shouldFocusOnHover) {
        wm.pointerLoopInit();
      }

      break;
    case "tiling-mode-enabled":
      wm.renderTree(settingName);
      break;
    case "window-gap-size-increment":
    case "window-gap-size":
    case "window-gap-hidden-on-single":
    case "workspace-skip-tile":
    case "monitor-skip-tile":
    case "stacked-tab-bar-height":
    case "max-tabs-per-line":
    case "min-tab-label-chars":
    case "max-tab-rows":
    case "tab-position":
      if (settingName === "stacked-tab-bar-height") {
        wm.tree?.invalidateMinTabWidthCache?.();
      }
      wm.renderTree(settingName, true);
      break;
    case "stacked-tiling-mode-enabled":
      handleLayoutModeToggle(wm, settingName, LAYOUT_TYPES.STACKED);
      break;
    case "tabbed-tiling-mode-enabled":
      handleLayoutModeToggle(wm, settingName, LAYOUT_TYPES.TABBED);
      break;
    case "css-updated":
      wm.theme.reloadStylesheet();
      wm.tree?.invalidateMinTabWidthCache?.();
      // Restyle existing borders/tabs after theme sheet swap.
      wm.updateDecorationLayout();
      break;
    case "float-always-on-top-enabled":
      if (!settings.get_boolean(settingName)) {
        wm.cleanupAlwaysFloat();
      } else {
        wm.restoreAlwaysFloat();
      }
      break;
    default:
      break;
  }
}
