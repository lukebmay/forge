// @ts-check
/**
 * H1 monitor pick: preferred survivors → stableKey → majority.
 * Session restore uses a different strict resolve — do not merge.
 */

import { collectWindowIds } from "./schema.js";
import { findMonitorAncestor, hasAncestor } from "./walk.js";

/**
 * @param {any} monDesc
 * @param {{
 *   findMonitor: (id: string) => any,
 *   findNode: (windowId: string) => any,
 *   findMonitorByStableKey?: (stableKey: string, monDescId?: string) => any,
 *   windowIdOf?: (node: any) => any,
 * }} ctx
 * @returns {any|null}
 */
export function resolveTargetMonitor(monDesc, ctx) {
  if (!monDesc || !ctx) return null;
  const preferred = monDesc.id ? ctx.findMonitor(monDesc.id) : null;
  let byStable = null;
  if (monDesc.stableKey && typeof ctx.findMonitorByStableKey === "function") {
    byStable = ctx.findMonitorByStableKey(monDesc.stableKey, monDesc.id) || null;
  }

  const allIds = collectWindowIds(monDesc);
  const nodes = allIds.map((id) => ctx.findNode(id)).filter(Boolean);
  if (nodes.length === 0) return byStable || preferred;

  const counts = new Map();
  for (const n of nodes) {
    const mon = findMonitorAncestor(n);
    if (!mon) continue;
    counts.set(mon, (counts.get(mon) || 0) + 1);
  }
  let majority = null;
  let best = 0;
  for (const [mon, count] of counts) {
    if (count > best) {
      majority = mon;
      best = count;
    }
  }

  if (preferred) {
    const onPreferred = nodes.filter((n) => hasAncestor(n, preferred)).length;
    if (onPreferred > 0 && onPreferred >= best) {
      if (byStable && byStable !== preferred) {
        const onStable = nodes.filter((n) => hasAncestor(n, byStable)).length;
        if (onStable > onPreferred) return byStable;
      }
      return preferred;
    }
  }

  if (byStable) {
    const onStable = nodes.filter((n) => hasAncestor(n, byStable)).length;
    if (onStable > 0 || best === 0) return byStable;
  }
  return majority || byStable || preferred;
}
