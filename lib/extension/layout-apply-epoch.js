/*
 * This file is part of the Forge extension for GNOME
 *
 * ApplyEpoch / home authority (D039, SM1).
 * While ApplyLayout is live, desired forest is the only writer of mon
 * membership and TILE home. Pure state — no GObject.
 */

/** Done / cancel code when workareas or monitors change mid-apply. */
export const APPLY_EPOCH_DISPLAYS_CHANGED = "displays-changed";

/**
 * Named apply home authority. Not a WindowManager boolean contract.
 */
export class ApplyEpoch {
  constructor() {
    /** @type {boolean} */
    this._live = false;
    /** @type {object|null} */
    this._run = null;
  }

  /** @returns {boolean} */
  get live() {
    return this._live;
  }

  /** @returns {object|null} */
  get run() {
    return this._run;
  }

  /**
   * Enter apply home authority (suppress entered-monitor rehome).
   * @param {object|null|undefined} [run]
   * @returns {{ live: true, run: object|null }}
   */
  begin(run) {
    this._live = true;
    this._run = run ?? null;
    return { live: true, run: this._run };
  }

  /**
   * Leave apply home authority.
   * @param {object|null|undefined} [_run]
   * @returns {{ live: false }}
   */
  end(_run) {
    this._live = false;
    this._run = null;
    return { live: false };
  }
}

/**
 * @param {ApplyEpoch|null|undefined} epoch
 * @returns {boolean}
 */
export function isApplyEpochLive(epoch) {
  return !!(epoch && epoch.live);
}

/**
 * D026 unsolicited TILE restore is idle-only (not during apply or grab).
 * @param {{ applyEpochLive?: boolean, grabActive?: boolean }} [flags]
 * @returns {boolean}
 */
export function shouldAllowIdleTileRestore(flags = {}) {
  if (flags.applyEpochLive) return false;
  if (flags.grabActive) return false;
  return true;
}

/**
 * Workareas / monitors-changed while apply is live: cancel apply; skip H1.
 * @param {ApplyEpoch|null|undefined} epoch
 * @returns {{ cancelApply: boolean, code: string|null, skipH1: boolean }}
 */
export function policyOnDisplaysChangedDuringApply(epoch) {
  if (!isApplyEpochLive(epoch)) {
    return { cancelApply: false, code: null, skipH1: false };
  }
  return {
    cancelApply: true,
    code: APPLY_EPOCH_DISPLAYS_CHANGED,
    skipH1: true,
  };
}

/**
 * Human-readable cancel error for a run cancel code.
 * @param {string|null|undefined} code
 * @returns {string}
 */
export function cancelErrorForCode(code) {
  const c = code != null ? String(code) : "cancel";
  if (c === APPLY_EPOCH_DISPLAYS_CHANGED) return "displays changed";
  if (c === "disposed") return "session disposed";
  return "cancelled";
}
