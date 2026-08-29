// @ts-check
/**
 * T6 in-memory forest document. WINDOW leaves keyed by windowId.
 */

export const SNAPSHOT_VERSION = 1;

/** @param {any} descriptor */
export function isWindowDescriptor(descriptor) {
  return (
    !!descriptor &&
    (descriptor.kind === "WINDOW" || (descriptor.windowId != null && descriptor.windowId !== ""))
  );
}

/**
 * DFS windowId strings. Forest, monitor, CON, or WINDOW.
 * @param {any} descriptor
 * @returns {string[]}
 */
export function collectWindowIds(descriptor) {
  if (!descriptor) return [];
  if (Array.isArray(descriptor.monitors)) {
    return descriptor.monitors.flatMap((m) => collectWindowIds(m));
  }
  if (isWindowDescriptor(descriptor)) {
    if (descriptor.windowId == null || descriptor.windowId === "") return [];
    return [String(descriptor.windowId)];
  }
  return (descriptor.children || []).flatMap((c) => collectWindowIds(c));
}

/**
 * Live WINDOW identity from ctx, else node.windowId / string nodeValue.
 * @param {any} node
 * @param {{ windowIdOf?: (node: any) => any }} [ctx]
 * @returns {string|null}
 */
export function windowIdOf(node, ctx) {
  if (!node) return null;
  if (typeof ctx?.windowIdOf === "function") {
    const id = ctx.windowIdOf(node);
    if (id != null && id !== "") return String(id);
  }
  if (node.windowId != null && node.windowId !== "") return String(node.windowId);
  const v = node.nodeValue;
  if (typeof v === "string" || typeof v === "number") return String(v);
  return null;
}

/** @param {any} descriptor @param {any} windowId */
export function findLeafDescForWindow(descriptor, windowId) {
  if (!descriptor || windowId == null || windowId === "") return null;
  const want = String(windowId);
  if (isWindowDescriptor(descriptor)) {
    return descriptor.windowId != null && String(descriptor.windowId) === want ? descriptor : null;
  }
  for (const c of descriptor.children || []) {
    const found = findLeafDescForWindow(c, want);
    if (found) return found;
  }
  return null;
}
