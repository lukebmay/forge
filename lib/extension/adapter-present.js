/*
 * ForgeAdapterGnome — seeded Forest present (paint + chrome + Meta slots).
 */

import * as PresentChrome from "./present-chrome.js";
import { paintWmForest, presentWmSlots } from "./tom-live.js";

/**
 * Seeded Forest present body used by renderTree idle.
 * Caller owns prune / normalize / processFloats / demotion / chrome layout.
 *
 * @param {object} wm
 * @param {string} [from]
 */
export function presentSeededForest(wm, from) {
  paintWmForest(wm);
  PresentChrome.processNode(wm.tree, wm.tree);
  presentWmSlots(wm, from);
}
