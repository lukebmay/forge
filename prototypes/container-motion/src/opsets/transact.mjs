// @ts-check
/**
 * OpSet transaction: mutate a cloned TOM, then one-shot commit.
 * Presenters paint only after this returns.
 */

import { applyForestSnapshot, cloneForest } from "../tom/index.mjs";

/** @typedef {import('../tom/kernel.mjs').Forest} Forest */

/**
 * @param {Forest} live
 * @param {{ hydrateSeq?: (f: Forest) => void }} api
 * @param {(draft: Forest, api: any) => { ok: boolean, [k: string]: any }} fn
 */
export function runOpAbstract(live, api, fn) {
  const draft = cloneForest(live);
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
  return r;
}
