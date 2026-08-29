// @ts-check
/**
 * KeybindAdapterGnome overlay (D088). Super+q = host.quit.
 * WebView must not import this.
 */

/** @typedef {{ chord: string, action: string, label: string }} OverlayBind */

/** @type {readonly OverlayBind[]} */
export const GNOME_OVERLAY = Object.freeze([
  Object.freeze({
    chord: "<Super>q",
    action: "host.quit",
    label: "Quit / close focused app",
  }),
  Object.freeze({
    chord: "<Super>Delete",
    action: "prefs-lock-screen",
    label: "Lock screen",
  }),
  Object.freeze({
    chord: "<Super>Return",
    action: "window-zoom-toggle",
    label: "Zoom",
  }),
  Object.freeze({
    chord: "<Ctrl><Super>Return",
    action: "window-zoom-horizontal",
    label: "Zoom horizontal",
  }),
  Object.freeze({
    chord: "<Shift><Super>Return",
    action: "window-zoom-vertical",
    label: "Zoom vertical",
  }),
  Object.freeze({
    chord: "<Super>space",
    action: "prefs-app-launch",
    label: "Run dialog",
  }),
  Object.freeze({
    chord: "<Ctrl><Super>e",
    action: "prefs-tiling-toggle",
    label: "Tiling master",
  }),
  Object.freeze({
    chord: "<Ctrl><Super>b",
    action: "focus-border-toggle",
    label: "Focus border",
  }),
  Object.freeze({
    chord: "<Super>Period",
    action: "prefs-open",
    label: "Preferences",
  }),
  Object.freeze({
    chord: "<Shift><Super>slash",
    action: "prefs-cheatsheet-toggle",
    label: "Cheatsheet",
  }),
]);
