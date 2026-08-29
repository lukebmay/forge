// @ts-check
/**
 * OpSet transaction: mutate a cloned TOM, then one-shot commit.
 * Presenters paint only after this returns.
 */

import { copySession } from "../session/index.js";
import { applyForestSnapshot, cloneForest } from "../tom/index.js";
import { copyWorld } from "../world/index.js";

/** @typedef {import('../tom/kernel.js').Forest} Forest */

/**
 * @param {Forest} live
 * @param {{ hydrateSeq?: (f: Forest) => void }} api
 * @param {(draft: Forest, api: any) => { ok: boolean, [k: string]: any }} fn
 */
export function runOpAbstract(live, api, fn) {
  const draft = cloneForest(live);
  copySession(live, draft);
  copyWorld(live, draft);
  let r;
  try {
    r = fn(draft, api);
  } catch (err) {
    return {
      ok: false,
      reason: err && err.message ? String(err.message) : String(err),
    };
  }
  if (!r?.ok) return r;
  applyForestSnapshot(live, draft, api);
  copySession(draft, live);
  copyWorld(draft, live);
  return r;
}
