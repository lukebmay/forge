// @ts-check
/**
 * Duck-typed parent/child walks. Host nodes expose the same fields.
 */

/** @param {any} node @param {any} ancestor */
export function hasAncestor(node, ancestor) {
  let p = node;
  while (p) {
    if (p === ancestor) return true;
    p = p.parentNode;
  }
  return false;
}

/** @param {any} node @returns {any|null} */
export function findMonitorAncestor(node) {
  let p = node;
  while (p) {
    if (typeof p.isMonitor === "function" && p.isMonitor()) return p;
    p = p.parentNode;
  }
  return null;
}

/**
 * WINDOW nodes under `root` (DFS). Includes root when it is a WINDOW.
 * @param {any} root
 * @returns {any[]}
 */
export function windowsUnder(root) {
  if (!root) return [];
  const out = [];
  const walk = (n) => {
    if (!n) return;
    if (typeof n.isWindow === "function" && n.isWindow()) {
      out.push(n);
      return;
    }
    for (const c of n.childNodes || []) walk(c);
  };
  walk(root);
  return out;
}
