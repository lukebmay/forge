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
 * Action pipeline stage composers (FocusChanged, Structure/Open).
 * Formulas: docs/dev/actions.md
 *
 * Stages are invoked via the live WindowManager so spies and manager
 * delegates (FocusManager / DecorationManager) still intercept.
 */

import { Logger } from "../shared/logger.js";

/**
 * FocusChanged body: F → Dfocus → B → P → A.
 * Idempotent: safe to re-run for the same node (stages reassert cheaply).
 * Never runs renderTree / Dfull.
 *
 * @param {import('./window.js').WindowManager} wm
 * @param {import('./tree.js').Node|null|undefined} node
 * @param {{ source?: string, forcePointer?: boolean }} [opts]
 */
export function afterFocus(wm, node, opts = {}) {
  if (!wm || !node) return;

  // Intentional focus ends explicit-unfocus hover suppress (FC2).
  if (wm._unfocusHoverSuppressMeta) {
    wm._unfocusHoverSuppressMeta = null;
  }

  // Cold/layout: Chrome/PWA late activate steals open leaf. If this group has a
  // pinned open leaf from focus/layout ops, restore it and do not adopt stealer.
  Logger.trace(`afterFocus source=${opts.source || "-"}`);
  if (
    opts.source === "meta-focus" &&
    typeof wm.restoreLayoutOpenLeafIfStolen === "function" &&
    wm.restoreLayoutOpenLeafIfStolen(node)
  ) {
    Logger.debug("afterFocus pin-restore stolen open-leaf");
    try {
      wm.updateBorderLayout?.();
    } catch (_e) {
      /* best-effort */
    }
    return;
  }

  const forcePointer = !!opts.forcePointer;
  // Temporarily clear freeze so F/Dfocus run; restore if batch still owns Z.
  const wasFrozen = !!wm._freezeRender;

  try {
    if (wasFrozen) {
      try {
        wm.unfreezeRender?.();
      } catch (_e) {
        /* ignore */
      }
    }

    // F — tab/stack lastTabFocus + raise leaf
    try {
      wm.updateStackedFocus?.(node);
      wm.updateTabbedFocus?.(node);
    } catch (_e) {
      /* best-effort */
    }

    // Dfocus — restack only this group's strip (no other-mon hide)
    try {
      wm.updateDecorationLayout?.({ scope: "focus", focusNode: node });
    } catch (_e) {
      /* best-effort */
    }

    // B — focus/split borders from tree slot
    try {
      wm.updateBorderLayout?.();
    } catch (_e) {
      /* best-effort */
    }

    // P — pointer warp (settings-gated) + LFT touch
    try {
      wm.movePointerWith?.(node, { force: forcePointer });
    } catch (_e) {
      /* best-effort */
    }

    // A — next open attaches under the focused leaf
    try {
      if (wm.tree) wm.tree.attachNode = node;
    } catch (_e) {
      /* best-effort */
    }
  } finally {
    if (wasFrozen) {
      try {
        wm.freezeRender?.();
      } catch (_e) {
        /* ignore */
      }
    }
  }
}

/**
 * StructureChanged / SizeOnly commit: one C (queued or force).
 * force → Cf (renderTree force); else Cq (requestLayout) when available.
 *
 * @param {import('./window.js').WindowManager} wm
 * @param {string} [reason]
 * @param {{ force?: boolean }} [opts]
 */
export function commitLayout(wm, reason, opts = {}) {
  if (!wm) return;
  const from = reason || "commit-layout";
  const force = !!opts.force;
  try {
    if (force) {
      wm.renderTree?.(from, true);
    } else if (typeof wm.requestLayout === "function") {
      wm.requestLayout(from);
    } else {
      wm.renderTree?.(from, false);
    }
  } catch (_e) {
    /* best-effort */
  }
}

/**
 * Post-structure tab/stack open leaf without a second full commit.
 * F (+ Dfocus + B). No C, no P, no A — callers own pointer if needed.
 *
 * @param {import('./window.js').WindowManager} wm
 * @param {import('./tree.js').Node|null|undefined} node
 */
export function settleTabFocus(wm, node) {
  if (!wm || !node) return;

  const wasFrozen = !!wm._freezeRender;

  try {
    if (wasFrozen) {
      try {
        wm.unfreezeRender?.();
      } catch (_e) {
        /* ignore */
      }
    }

    // F — lastTabFocus + raise leaf
    try {
      wm.updateStackedFocus?.(node);
      wm.updateTabbedFocus?.(node);
    } catch (_e) {
      /* best-effort */
    }

    // Dfocus + B — strip may be buried after structure raise/apply
    try {
      wm.updateDecorationLayout?.({ scope: "focus", focusNode: node });
    } catch (_e) {
      /* best-effort */
    }
    try {
      wm.updateBorderLayout?.();
    } catch (_e) {
      /* best-effort */
    }
  } finally {
    if (wasFrozen) {
      try {
        wm.freezeRender?.();
      } catch (_e) {
        /* ignore */
      }
    }
  }
}

function _displayNow() {
  if (typeof global !== "undefined" && global.display?.get_current_time) {
    return global.display.get_current_time();
  }
  if (typeof global !== "undefined" && global.get_current_time) {
    return global.get_current_time();
  }
  return 0;
}

/**
 * Make this child the visible leaf of its TABBED/STACKED group (D025).
 * Write LTF → pin or adopt live pin (R026) → reassert slot → raise →
 * settleTabFocus; keyboard → focus + activate + afterFocus (restack last).
 *
 * @param {import('./window.js').WindowManager} wm
 * @param {import('./tree.js').Node|null|undefined} node
 * @param {{ keyboard?: boolean, pin?: boolean, source?: string }} [opts]
 */
export function revealGroupChild(wm, node, opts = {}) {
  if (!wm || !node) return;

  const keyboard = !!opts.keyboard;
  const pin = !!opts.pin;
  const meta = node.nodeValue;
  const parent = node.parentNode;
  const source = opts.source || "reveal";
  Logger.trace(`revealGroupChild source=${source} keyboard=${keyboard} pin=${pin}`);

  if (parent && typeof parent.isStackedOrTabbed === "function" && parent.isStackedOrTabbed()) {
    if (meta != null) parent.lastTabFocus = meta;
    // User reveal during a live pin is intent, not steal (R026).
    const livePin =
      !pin && meta && typeof wm.getLayoutOpenLeafPin === "function"
        ? wm.getLayoutOpenLeafPin(parent)
        : null;
    const adoptPin = !!(livePin && livePin.meta !== meta);
    if ((pin || adoptPin) && meta) {
      try {
        wm.pinLayoutOpenLeaf?.(parent, meta);
      } catch (_e) {
        /* best-effort pin */
      }
    }
    if (source === "tab-click" || adoptPin) {
      Logger.info(
        `revealGroupChild source=${source} adoptPin=${!!adoptPin} pin=${!!pin} keyboard=${keyboard}`
      );
    }
  }

  // Hidden tab may still be FLOAT/old-slot. Not on afterFocus (PWA frame-lie).
  if (!node.zoomMode) {
    try {
      wm.reassertNodeToSlot?.(node);
    } catch (_e) {
      /* best-effort */
    }
  }

  try {
    meta?.raise?.();
  } catch (_e) {
    /* ignore */
  }

  try {
    if (typeof wm.settleTabFocus === "function") {
      wm.settleTabFocus(node);
    } else {
      settleTabFocus(wm, node);
    }
  } catch (_e) {
    /* best-effort */
  }

  if (!keyboard) return;

  // LF2: X11 after multi-mon/layout needs focus+activate. Restack after both
  // (afterFocus) — a trailing focus() after Dfocus buries the strip (R032).
  const now = _displayNow();
  try {
    meta?.focus?.(now);
  } catch (_e) {
    /* ignore */
  }
  try {
    meta?.activate?.(now);
  } catch (_e) {
    /* ignore */
  }

  try {
    if (typeof wm.afterFocus === "function") {
      wm.afterFocus(node, { source });
    } else {
      afterFocus(wm, node, { source });
    }
  } catch (_e) {
    /* best-effort */
  }
}
