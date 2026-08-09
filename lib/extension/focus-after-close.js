/*
 * Focus-after-close policy (FC0) — pure pick of which window to activate.
 *
 * Priority (plan forge-focus-close-and-escape):
 *   1. Global LFT / focus MRU survivor (still focusable; not the closed id)
 *   2. Next sibling in the closed window’s container (child order)
 *   3. Previous sibling in that container
 *   4. Other NORMAL candidates on the same workspace
 *
 * Floats are not in LFT by policy — callers must not put them in lftMruIds.
 * No Mutter / Shell imports — unit-testable.
 */

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function idEq(a, b) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

/**
 * @param {unknown} id
 * @param {Iterable<unknown>} list
 * @returns {boolean}
 */
function idIn(id, list) {
  for (const x of list) {
    if (idEq(id, x)) return true;
  }
  return false;
}

/**
 * @param {unknown[]} ids
 * @param {unknown} closedId
 * @returns {unknown[]}
 */
function withoutClosed(ids, closedId) {
  if (!Array.isArray(ids)) return [];
  return ids.filter((id) => id != null && !idEq(id, closedId));
}

/**
 * Pick focus target after a window is closed.
 *
 * @param {object} input
 * @param {unknown} input.closedId
 *   Id of the window that closed (windowId or opaque key).
 * @param {unknown[]} [input.siblingIds]
 *   Remaining window siblings in parent child order (excluding closed).
 * @param {unknown[]} [input.preCloseChildIds]
 *   Ordered window children of parent *before* close (including closed).
 *   Used to resolve next/prev relative to the closed index.
 * @param {unknown[]} [input.lftMruIds]
 *   Global LFT MRU head-first (tile ids only; floats omitted by caller).
 * @param {unknown[]} [input.workspaceCandidateIds]
 *   Other NORMAL windows on the closed window’s workspace (excluding closed).
 * @returns {{ id: unknown, reason: string }|null}
 */
export function pickFocusAfterClose(input) {
  if (input == null || typeof input !== "object") return null;
  const closedId = input.closedId;
  if (closedId == null) return null;

  const siblings = withoutClosed(input.siblingIds, closedId);
  const workspace = withoutClosed(input.workspaceCandidateIds, closedId);
  const lftMru = withoutClosed(input.lftMruIds, closedId);

  /** Focusable survivor set for LFT membership. */
  const survivorIds = [...siblings, ...workspace];
  if (survivorIds.length === 0 && lftMru.length === 0) return null;

  // 1. LFT / MRU among survivors (global head first).
  for (const id of lftMru) {
    if (idIn(id, survivorIds)) {
      return { id, reason: "lft-mru" };
    }
  }

  // 2–3. Next then previous sibling from pre-close order.
  const pre = Array.isArray(input.preCloseChildIds)
    ? input.preCloseChildIds.filter((id) => id != null)
    : null;
  if (pre && pre.length > 0) {
    let closedIndex = -1;
    for (let i = 0; i < pre.length; i++) {
      if (idEq(pre[i], closedId)) {
        closedIndex = i;
        break;
      }
    }
    if (closedIndex >= 0) {
      for (let i = closedIndex + 1; i < pre.length; i++) {
        const id = pre[i];
        if (idIn(id, siblings)) {
          return { id, reason: "next-sibling" };
        }
      }
      for (let i = closedIndex - 1; i >= 0; i--) {
        const id = pre[i];
        if (idIn(id, siblings)) {
          return { id, reason: "prev-sibling" };
        }
      }
    }
  }

  // Fallback without pre-close order: first remaining sibling in child order.
  if (siblings.length > 0) {
    return { id: siblings[0], reason: "sibling" };
  }

  // 4. Workspace NORMAL candidates (caller order = tree walk order).
  if (workspace.length > 0) {
    return { id: workspace[0], reason: "workspace" };
  }

  return null;
}
