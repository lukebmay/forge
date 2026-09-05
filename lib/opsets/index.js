// @ts-check
/**
 * OpSet registry — control surfaces over the TOM.
 *
 * @typedef {Object} OpSet
 * @property {string} id
 * @property {string} label
 * @property {string} [description]
 * @property {Record<string, Function>} ops
 * @property {{ hover: Function, release: Function }} [pointer]
 * @property {(f: import('../tom/kernel.js').Forest, api?: any) => any} [settle]
 * @property {object} [defaults]
 */

import { MARK2_OPSET } from "./mark2.js";

export { runOpAbstract } from "./transact.js";
export {
  MARK2_OPSET,
  coerceDifferentType,
  ensureMark2Decisions,
  layoutForJoinWrap,
  mark2CleanupForest,
  mark2CleanupUnder,
  mark2Group,
  mark2Join,
  mark2Launch,
  mark2Move,
  mark2Promote,
  mark2PromoteRecursive,
  mark2Remove,
  mark2ToggleSplit,
  mark2ToggleTabStack,
  LAYOUT_CYCLE,
} from "./mark2.js";
export {
  MARK2_POINTER,
  buildMark2Zones,
  hitTestMark2Zone,
  mark2PointerHover,
  mark2PointerRelease,
  mark2ZonePaintRect,
  mark2ZonePaintRects,
  resolvePointerWould,
  worldPointInMark2Zone,
} from "./mark2-pointer.js";

/** @type {Record<string, OpSet>} */
export const OPSETS = {
  mark2: MARK2_OPSET,
};

/** @param {string} [id] */
export function getOpSet(id) {
  return OPSETS[id || "mark2"] || MARK2_OPSET;
}
