/*
 * Pure float / processFloats reason tags (no gi). WM gathers flags → here.
 */

/**
 * Desktop Icons NG (DING) surfaces: wm_class `gjs`, title `Desktop Icons N`.
 * Never tile — admit as ignore so they cannot carve mon percent shares.
 * @param {{ wmClass?: string|null, title?: string|null }} [opts]
 * @returns {boolean}
 */
export function isDingDesktopIconsSurface(opts = {}) {
  if (String(opts.wmClass ?? "") !== "gjs") return false;
  const title = String(opts.title ?? "");
  return title.toLowerCase().startsWith("desktop icons");
}

/**
 * @typedef {{
 *   ignored?: boolean,
 *   windowType?: string|null,
 *   transient?: boolean,
 *   wmClassNull?: boolean,
 *   titleEmpty?: boolean,
 *   above?: boolean,
 *   forgeTransientAbove?: boolean,
 *   alwaysOnAllWorkspaces?: boolean,
 *   allowsResize?: boolean,
 *   hasSpecificTile?: boolean,
 *   hasSpecificFloat?: boolean,
 *   hasClassOnlyTile?: boolean,
 *   matchesClassFloatOverride?: boolean,
 * }} FloatExemptFlags
 */

/**
 * @typedef {FloatExemptFlags & {
 *   grabTile?: boolean,
 *   deferred?: boolean,
 *   wsTiled?: boolean,
 *   monTiled?: boolean,
 * }} ProcessFloatFlags
 */

/**
 * Meta `allows_resize()` is false while maximized/fullscreen — transient, not
 * a permanent non-resizable window. Float policy must not treat that as
 * `no-resize` (D051), or TILE→FLOAT races beat D026 restore and ApplyLayout
 * late-adopt/`_ensureTiledForSlotPlace`.
 * @param {{ allowsResize?: boolean, maximized?: boolean, fullscreen?: boolean }} [opts]
 * @returns {boolean}
 */
export function allowsResizeForFloatPolicy(opts = {}) {
  if (opts.maximized || opts.fullscreen) return true;
  return opts.allowsResize !== false;
}

/**
 * Mirror WindowManager.isFloatingExempt → reason tag (or null = not exempt).
 * @param {FloatExemptFlags} [flags]
 * @returns {string|null}
 */
export function floatExemptReasonFromFlags(flags = {}) {
  if (flags.ignored) return "ignored";
  if (flags.hasSpecificTile) return null;

  const type = flags.windowType != null ? String(flags.windowType).toLowerCase() : "";
  const dialogType = type === "dialog" || type === "modal-dialog";
  // Non-transient dialog types are app windows (D110). Meta may also
  // report allows_resize=false on those (same gatherer-lie class as D051).
  const dialogRole = dialogType && !!flags.transient;
  const floatByRole =
    dialogRole ||
    !!flags.transient ||
    !!flags.wmClassNull ||
    !!flags.titleEmpty ||
    (!!flags.above && !flags.forgeTransientAbove) ||
    !!flags.alwaysOnAllWorkspaces;

  if (flags.hasSpecificFloat) return "override-specific-float";
  if (flags.hasClassOnlyTile && !floatByRole) return null;

  if (type === "dialog" && dialogRole) return "type-dialog";
  if (type === "modal-dialog" && dialogRole) return "type-modal-dialog";
  if (flags.transient) return "transient";
  if (flags.wmClassNull) return "null-class";
  if (flags.titleEmpty) return "empty-title";
  if (flags.above && !flags.forgeTransientAbove) return "above";
  if (flags.alwaysOnAllWorkspaces) return "sticky-pin";
  if (flags.allowsResize === false && !dialogType) return "no-resize";
  if (flags.matchesClassFloatOverride) return "override-class-float";
  if (floatByRole) return "role";
  return null;
}

/**
 * processFloats decision: skip | float | tile + reason.
 * @param {ProcessFloatFlags} [flags]
 * @returns {{ action: "skip"|"float"|"tile", reason: string }}
 */
export function processFloatDecisionFromFlags(flags = {}) {
  if (flags.grabTile) return { action: "skip", reason: "grab-tile" };
  if (flags.deferred) return { action: "float", reason: "deferred" };
  if (flags.wsTiled === false) return { action: "float", reason: "ws-skip-tile" };
  if (flags.monTiled === false) return { action: "float", reason: "mon-skip-tile" };
  const exempt = floatExemptReasonFromFlags(flags);
  if (exempt) return { action: "float", reason: exempt };
  return { action: "tile", reason: "tile" };
}

/**
 * Compact one-line tags for hunt / hard-ready logs.
 * @param {ProcessFloatFlags} [flags]
 * @returns {string}
 */
export function formatFloatFlagTags(flags = {}) {
  const parts = [];
  const push = (k, v) => {
    if (v == null || v === false || v === "") return;
    if (v === true) parts.push(k);
    else parts.push(`${k}=${v}`);
  };
  push("deferred", !!flags.deferred);
  push("grab", !!flags.grabTile);
  push("ignored", !!flags.ignored);
  push("type", flags.windowType);
  push("transient", !!flags.transient);
  push("nullClass", !!flags.wmClassNull);
  push("emptyTitle", !!flags.titleEmpty);
  push("above", !!flags.above);
  push("forgeAbove", !!flags.forgeTransientAbove);
  push("stickyPin", !!flags.alwaysOnAllWorkspaces);
  push("noResize", flags.allowsResize === false);
  push("tileRule", !!flags.hasSpecificTile);
  push("floatRule", !!flags.hasSpecificFloat);
  push("classTile", !!flags.hasClassOnlyTile);
  push("classFloat", !!flags.matchesClassFloatOverride);
  push("wsSkip", flags.wsTiled === false);
  push("monSkip", flags.monTiled === false);
  return parts.join(",") || "-";
}
