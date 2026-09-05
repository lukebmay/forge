/*
 * Sent vs observed geometry samples for the ε campaign (D095 S1).
 * S2: evidence-only write decision helper (bag desired + observed).
 * S6: per-wm-class ε store + near-miss forgiveness + fault-inject.
 */
import { Logger } from "../shared/logger.js";
import {
  LAYOUT_VERIFY_EPSILON_PX,
  normalizeRect,
  rectsAgree,
  rectsEqual,
} from "./layout-verify.js";

/** Grep: `forge log --grep geom-epsilon` */
export const GEOM_EPSILON_TOKEN = "geom-epsilon";

/** Locked starting ε (Meta); same as LAYOUT_VERIFY_EPSILON_PX. */
export const GEOM_EPSILON0_PX = LAYOUT_VERIFY_EPSILON_PX;

/** Near-miss failures (with adjusted retry) before class ε bump. */
export const NEAR_MISS_FAILS_BEFORE_BUMP = 3;

/** Bounded same-dest present retries when TILE observe stays far under the slot. */
export const TILE_DEST_UNDERSIZE_RETRIES = 3;

/** Class samples below this → store key falls back to window id. */
export const CLASS_EPS_THIN_SAMPLES = 2;

/**
 * Near-miss band ("reasonably close"): max(2×ε, ε+8).
 * Locked D095 S6 open #2 (ε₀=4 → band 12).
 * @param {number} [epsilon=LAYOUT_VERIFY_EPSILON_PX]
 */
export function defaultNearBand(epsilon = LAYOUT_VERIFY_EPSILON_PX) {
  const eps =
    typeof epsilon === "number" && Number.isFinite(epsilon)
      ? Math.abs(epsilon)
      : LAYOUT_VERIFY_EPSILON_PX;
  return Math.max(eps * 2, eps + 8);
}

/**
 * Decide whether a move_resize write is justified (D095 S2).
 * Desired identity is exact; observed agreement uses ε.
 *
 * @param {object} input
 * @param {{ x?: number, y?: number, width?: number, height?: number }|null|undefined} input.desired
 * @param {{ x?: number, y?: number, width?: number, height?: number }|null|undefined} [input.bagDesired]
 * @param {{ x?: number, y?: number, width?: number, height?: number }|null|undefined} [input.observed]
 * @param {number} [input.epsilon=LAYOUT_VERIFY_EPSILON_PX]
 * @param {boolean} [input.force]
 * @param {boolean} [input.maximized] never skip when maximized
 * @param {boolean} [input.monMismatch] destination monitor disagree
 * @returns {{ write: boolean, desiredChanged: boolean, reason: string }}
 */
export function decideGeomWrite(input) {
  const force = !!input?.force;
  const maximized = !!input?.maximized;
  const monMismatch = !!input?.monMismatch;
  const eps =
    typeof input?.epsilon === "number" && Number.isFinite(input.epsilon)
      ? Math.abs(input.epsilon)
      : LAYOUT_VERIFY_EPSILON_PX;
  const desired = normalizeRect(input?.desired);
  const bagDesired = normalizeRect(input?.bagDesired);
  const observed = normalizeRect(input?.observed);
  const desiredChanged = !desired || !bagDesired ? true : !rectsEqual(desired, bagDesired);

  if (force) return { write: true, desiredChanged, reason: "force" };
  if (maximized) return { write: true, desiredChanged, reason: "maximized" };
  if (monMismatch) return { write: true, desiredChanged, reason: "mon-mismatch" };
  if (!desired) return { write: true, desiredChanged: true, reason: "bad-desired" };

  const observedOk = observed ? rectsAgree(observed, desired, eps) : false;
  if (observedOk) {
    return {
      write: false,
      desiredChanged,
      reason: desiredChanged ? "skip-agree" : "skip-stable",
    };
  }
  return {
    write: true,
    desiredChanged,
    reason: desiredChanged ? "desired-changed" : "observed-disagree",
  };
}

/**
 * @param {{ x?: number, y?: number, width?: number, height?: number }|null|undefined} sent
 * @param {{ x?: number, y?: number, width?: number, height?: number }|null|undefined} observed
 * @returns {{ dx: number, dy: number, dw: number, dh: number, dMax: number }|null}
 */
export function edgeDeltas(sent, observed) {
  const s = normalizeRect(sent);
  const o = normalizeRect(observed);
  if (!s || !o) return null;
  const dx = o.x - s.x;
  const dy = o.y - s.y;
  const dw = o.width - s.width;
  const dh = o.height - s.height;
  const dMax = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dw), Math.abs(dh));
  return { dx, dy, dw, dh, dMax };
}

/** Observed far smaller than commanded dest — not a min clamp. */
export function frameUndersizedVsCommand(commanded, observed, nearBand) {
  const cw = Number(commanded?.width);
  const ch = Number(commanded?.height);
  const ow = Number(observed?.width);
  const oh = Number(observed?.height);
  if (!(cw > 0) || !(ch > 0) || !(ow > 0) || !(oh > 0)) return false;
  const band =
    typeof nearBand === "number" && Number.isFinite(nearBand)
      ? Math.abs(nearBand)
      : defaultNearBand();
  return cw - ow > band || ch - oh > band;
}

/** Far/ambiguous undersize → same TILE dest again (no force). */
export function decideUndersizeDestRetry(input) {
  const tag = input?.tag;
  if (tag !== "far" && tag !== "ambiguous") return { retry: false };
  const retryCount = Number(input?.retryCount) || 0;
  if (retryCount >= TILE_DEST_UNDERSIZE_RETRIES) return { retry: false };
  const dest = normalizeRect(input?.sent);
  if (!dest) return { retry: false };
  if (!frameUndersizedVsCommand(dest, input?.observed, input?.nearBand)) {
    return { retry: false };
  }
  return { retry: true, dest };
}

/**
 * Classify a sample for progressive forgiveness (D095 S6).
 *
 * @param {object} input
 * @param {number} input.dMax
 * @param {number} [input.epsilon=LAYOUT_VERIFY_EPSILON_PX]
 * @param {number} [input.nearBand] defaults to defaultNearBand(ε)
 * @param {{ width?: number, height?: number }|null|undefined} [input.knownMin]
 * @param {{ width?: number, height?: number }|null|undefined} [input.sentSize]
 * @returns {"agree"|"near"|"far"|"min-known"|"ambiguous"|"bad-rect"}
 */
export function classifyEpsilonSample(input) {
  const dMax = Number(input?.dMax);
  if (!Number.isFinite(dMax)) return "bad-rect";
  const eps =
    typeof input?.epsilon === "number" && Number.isFinite(input.epsilon)
      ? Math.abs(input.epsilon)
      : LAYOUT_VERIFY_EPSILON_PX;
  const nearBand =
    typeof input?.nearBand === "number" && Number.isFinite(input.nearBand)
      ? Math.abs(input.nearBand)
      : defaultNearBand(eps);

  const minW = Number(input?.knownMin?.width);
  const minH = Number(input?.knownMin?.height);
  const sentW = Number(input?.sentSize?.width);
  const sentH = Number(input?.sentSize?.height);
  const minKnown =
    (Number.isFinite(minW) && minW > 0 && Number.isFinite(sentW) && sentW > 0 && minW > sentW) ||
    (Number.isFinite(minH) && minH > 0 && Number.isFinite(sentH) && sentH > 0 && minH > sentH);
  if (minKnown) return "min-known";

  if (dMax <= eps) return "agree";
  if (dMax <= nearBand) return "near";
  // Large size miss without known mins: could be jitter or unknown floor.
  if (
    (Number.isFinite(sentW) && sentW > 0 && Math.abs(Number(input?.dw)) > nearBand) ||
    (Number.isFinite(sentH) && sentH > 0 && Math.abs(Number(input?.dh)) > nearBand)
  ) {
    return "ambiguous";
  }
  return "far";
}

/**
 * @param {{ x?: number, y?: number, width?: number, height?: number }|null|undefined} rect
 * @returns {string|null}
 */
export function commandFingerprint(rect) {
  const r = normalizeRect(rect);
  if (!r) return null;
  return `${r.x},${r.y},${r.width},${r.height}`;
}

/**
 * Compensate observed near-miss delta (same target policy, not identical repeat).
 * @returns {{ x:number, y:number, width:number, height:number }|null}
 */
export function adjustCommandForNearMiss(sent, observed) {
  const s = normalizeRect(sent);
  const o = normalizeRect(observed);
  if (!s || !o) return null;
  return {
    x: Math.round(2 * s.x - o.x),
    y: Math.round(2 * s.y - o.y),
    width: Math.max(1, Math.round(2 * s.width - o.width)),
    height: Math.max(1, Math.round(2 * s.height - o.height)),
  };
}

/**
 * `--dev=fault-inject-geometry`: lie about observed as a near-miss.
 * @param {{ x?: number, y?: number, width?: number, height?: number }|null|undefined} sent
 * @param {{ x?: number, y?: number, width?: number, height?: number }|null|undefined} observed
 * @param {object} [opts]
 * @param {boolean} [opts.enabled]
 * @param {number} [opts.epsilon]
 * @param {number} [opts.nearOffset] dMax of the lie (must be >ε and ≤nearBand)
 * @returns {{ x:number, y:number, width:number, height:number }|null|undefined}
 */
export function faultInjectObserved(sent, observed, opts = {}) {
  if (!opts?.enabled) return observed;
  const s = normalizeRect(sent);
  if (!s) return observed;
  const eps =
    typeof opts.epsilon === "number" && Number.isFinite(opts.epsilon)
      ? Math.abs(opts.epsilon)
      : LAYOUT_VERIFY_EPSILON_PX;
  const band = defaultNearBand(eps);
  let offset =
    typeof opts.nearOffset === "number" && Number.isFinite(opts.nearOffset)
      ? Math.abs(opts.nearOffset)
      : Math.min(band, Math.max(eps + 2, Math.ceil((eps + band) / 2)));
  if (offset <= eps) offset = Math.min(band, eps + 2);
  if (offset > band) offset = band;
  return { x: s.x + offset, y: s.y, width: s.width, height: s.height };
}

/**
 * Primary store key: wm-class when known; else window id.
 * @param {string|null|undefined} wmClass
 * @param {string|number|null|undefined} windowId
 */
export function resolveClassEpsilonKey(wmClass, windowId) {
  const cls = wmClass != null ? String(wmClass).trim() : "";
  if (cls && cls !== "-") return cls;
  if (windowId != null && String(windowId) !== "" && String(windowId) !== "-") {
    return `win:${windowId}`;
  }
  return "-";
}

/**
 * Effective ε: class when mature; max(class, window) while class samples thin.
 * @param {ReturnType<typeof createClassEpsilonStore>} store
 * @param {string|null|undefined} wmClass
 * @param {string|number|null|undefined} windowId
 */
export function getEffectiveClassEpsilon(store, wmClass, windowId) {
  if (!store) return GEOM_EPSILON0_PX;
  const classKey = resolveClassEpsilonKey(wmClass, null);
  const winKey =
    windowId != null && String(windowId) !== "" && String(windowId) !== "-"
      ? `win:${windowId}`
      : null;
  if (classKey === "-") {
    return winKey ? store.getEpsilon(winKey) : store.baseEps;
  }
  const classEntry = store.peek(classKey);
  const classEps = store.getEpsilon(classKey);
  const thin = !classEntry || classEntry.samples < CLASS_EPS_THIN_SAMPLES;
  if (thin && winKey) {
    const winEps = store.peek(winKey)?.eps;
    if (typeof winEps === "number" && winEps > classEps) return winEps;
  }
  return classEps;
}

/**
 * Session-learned per-wm-class ε (D095 S6).
 * @param {{ baseEps?: number, failsBeforeBump?: number, now?: () => number }} [opts]
 */
export function createClassEpsilonStore(opts = {}) {
  const baseEps =
    typeof opts.baseEps === "number" && Number.isFinite(opts.baseEps)
      ? Math.abs(opts.baseEps)
      : GEOM_EPSILON0_PX;
  const failsBeforeBump =
    typeof opts.failsBeforeBump === "number" && opts.failsBeforeBump > 0
      ? Math.floor(opts.failsBeforeBump)
      : NEAR_MISS_FAILS_BEFORE_BUMP;
  const nowFn = typeof opts.now === "function" ? opts.now : () => Date.now();
  /** @type {Map<string, { eps: number, nearFails: number, samples: number, bumps: object[], lastCommandKey: string|null, lastAdjustedKey: string|null }>} */
  const map = new Map();

  function ensure(key) {
    const k = key != null ? String(key) : "-";
    let e = map.get(k);
    if (!e) {
      e = {
        eps: baseEps,
        nearFails: 0,
        samples: 0,
        bumps: [],
        lastCommandKey: null,
        lastAdjustedKey: null,
      };
      map.set(k, e);
    }
    return e;
  }

  return {
    baseEps,
    failsBeforeBump,
    /** @param {string} key */
    getEpsilon(key) {
      return ensure(key).eps;
    },
    /** @param {string} key */
    peek(key) {
      return map.get(key != null ? String(key) : "-") ?? null;
    },
    /** @param {string} key */
    ensure,
    /**
     * @param {string} key
     * @param {"agree"|"far"|"min-known"|"ambiguous"|"bad-rect"|string} tag
     */
    noteNonBumpable(key, tag) {
      const e = ensure(key);
      e.samples += 1;
      e.nearFails = 0;
      if (tag === "agree") {
        e.lastCommandKey = null;
        e.lastAdjustedKey = null;
      }
      return e;
    },
    /**
     * @param {string} key
     * @param {{ dMax?: number, commandKey?: string|null, adjustedKey?: string|null, reason?: string }} [info]
     */
    noteNearMiss(key, info = {}) {
      const e = ensure(key);
      e.samples += 1;
      const commandKey = info.commandKey != null ? String(info.commandKey) : null;
      const adjustedKey = info.adjustedKey != null ? String(info.adjustedKey) : null;

      // Identical useless loop: same command + same adjustment already tried → stop.
      if (
        commandKey &&
        adjustedKey &&
        e.lastCommandKey === commandKey &&
        e.lastAdjustedKey === adjustedKey &&
        e.nearFails >= failsBeforeBump
      ) {
        return {
          bumped: false,
          eps: e.eps,
          nearFails: e.nearFails,
          shouldRetry: false,
          skippedIdentical: true,
        };
      }

      if (commandKey) e.lastCommandKey = commandKey;
      if (adjustedKey) e.lastAdjustedKey = adjustedKey;
      e.nearFails += 1;

      if (e.nearFails < failsBeforeBump) {
        return {
          bumped: false,
          eps: e.eps,
          nearFails: e.nearFails,
          shouldRetry: true,
          skippedIdentical: false,
        };
      }

      const dMax = Number(info.dMax);
      // Cap at ε₀ near-band — forgiveness stays in "reasonably close", not far.
      const band =
        typeof info.nearBand === "number" && Number.isFinite(info.nearBand)
          ? Math.abs(info.nearBand)
          : defaultNearBand(baseEps);
      const rawTarget = Number.isFinite(dMax) ? Math.ceil(dMax * 1.2) : e.eps + 1;
      const target = Math.min(band, Math.max(e.eps + 1, rawTarget));
      if (target <= e.eps) {
        return {
          bumped: false,
          eps: e.eps,
          nearFails: e.nearFails,
          shouldRetry: false,
          atCeiling: true,
        };
      }
      const from = e.eps;
      e.eps = target;
      e.nearFails = 0;
      const bump = {
        at: nowFn(),
        from,
        to: target,
        dMax: Number.isFinite(dMax) ? dMax : null,
        reason: info.reason || `near-miss dMax=${dMax}`,
      };
      e.bumps.push(bump);
      return {
        bumped: true,
        eps: e.eps,
        nearFails: 0,
        shouldRetry: false,
        bump,
      };
    },
    snapshot() {
      return [...map.entries()].map(([wmClass, e]) => ({
        wmClass,
        eps: e.eps,
        nearFails: e.nearFails,
        samples: e.samples,
        bumps: e.bumps.map((b) => ({ ...b })),
      }));
    },
    clear() {
      map.clear();
    },
  };
}

/**
 * Progressive forgiveness step after classify (near-miss only bumps).
 * @param {object} input
 * @param {ReturnType<typeof createClassEpsilonStore>} input.store
 * @param {string} [input.key] explicit store key (tests); else from wmClass/windowId
 * @param {string} [input.wmClass]
 * @param {string|number} [input.windowId]
 * @param {ReturnType<typeof classifyEpsilonSample>} input.tag
 * @param {number} [input.dMax]
 * @param {object} [input.sent]
 * @param {object} [input.observed]
 * @param {string|null} [input.commandKey]
 */
export function decideNearMissForgiveness(input) {
  const store = input?.store;
  const tag = input?.tag;
  if (!store) return { action: "no-store", tag };

  const classKey = resolveClassEpsilonKey(input?.wmClass, null);
  const winKey =
    input?.windowId != null && String(input.windowId) !== "" && String(input.windowId) !== "-"
      ? `win:${input.windowId}`
      : null;
  const key =
    input?.key != null
      ? String(input.key)
      : resolveClassEpsilonKey(input?.wmClass, input?.windowId);
  const classEntry = classKey !== "-" ? store.peek(classKey) : null;
  const thin = classKey !== "-" && (!classEntry || classEntry.samples < CLASS_EPS_THIN_SAMPLES);

  const noteBoth = (fn) => {
    const primary = fn(key);
    // While class samples are thin, mirror onto the window key.
    if (thin && winKey && winKey !== key) fn(winKey);
    return primary;
  };

  if (tag === "agree") {
    noteBoth((k) => store.noteNonBumpable(k, tag));
    return { action: "done", tag, key };
  }
  if (tag === "min-known") {
    noteBoth((k) => store.noteNonBumpable(k, tag));
    return { action: "mins-path", tag, key };
  }
  if (tag === "far") {
    noteBoth((k) => store.noteNonBumpable(k, tag));
    return { action: "far-no-bump", tag, key };
  }
  if (tag === "ambiguous" || tag === "bad-rect") {
    noteBoth((k) => store.noteNonBumpable(k, tag));
    return { action: "no-bump", tag, key };
  }
  if (tag !== "near") {
    return { action: "no-bump", tag, key };
  }

  const adjusted = adjustCommandForNearMiss(input.sent, input.observed);
  const adjustedKey = commandFingerprint(adjusted);
  const missInfo = {
    dMax: input.dMax,
    commandKey: input.commandKey ?? commandFingerprint(input.sent),
    adjustedKey,
    nearBand: defaultNearBand(store.baseEps),
    reason: `near-miss dMax=${input.dMax}`,
  };
  const result = noteBoth((k) => store.noteNearMiss(k, missInfo));

  if (result.bumped) {
    return { action: "bumped", tag, key, adjusted, ...result };
  }
  if (result.skippedIdentical || result.atCeiling || !result.shouldRetry) {
    return { action: "stop", tag, key, adjusted, ...result };
  }
  if (!adjusted) {
    return { action: "stop", tag, key, ...result };
  }
  const sentKey = input.commandKey ?? commandFingerprint(input.sent);
  if (adjustedKey && sentKey && adjustedKey === sentKey) {
    return { action: "stop", tag, key, adjusted, ...result, skippedIdentical: true };
  }
  return { action: "retry", tag, key, adjusted, ...result };
}

/**
 * @param {object} sample
 * @param {string} sample.phase
 * @param {{ x:number, y:number, width:number, height:number }} sample.sent
 * @param {{ x:number, y:number, width:number, height:number }|null|undefined} sample.observed
 * @param {number} [sample.epsilon]
 * @param {string|number} [sample.windowId]
 * @param {string} [sample.wmClass]
 * @param {{ width?: number, height?: number }|null|undefined} [sample.knownMin]
 * @param {boolean} [sample.wrote]
 * @returns {Record<string, unknown>}
 */
export function buildGeomEpsilonFields(sample) {
  const eps =
    typeof sample?.epsilon === "number" && Number.isFinite(sample.epsilon)
      ? Math.abs(sample.epsilon)
      : LAYOUT_VERIFY_EPSILON_PX;
  const sent = normalizeRect(sample?.sent);
  const observed = normalizeRect(sample?.observed);
  const deltas = edgeDeltas(sent, observed);
  const tag = classifyEpsilonSample({
    dMax: deltas?.dMax,
    epsilon: eps,
    knownMin: sample?.knownMin,
    sentSize: sent,
    dw: deltas?.dw,
    dh: deltas?.dh,
  });
  /** @type {Record<string, unknown>} */
  const fields = {
    phase: sample?.phase != null ? String(sample.phase) : "-",
    tag,
    eps,
    wrote: !!sample?.wrote,
    windowId: sample?.windowId != null ? String(sample.windowId) : "-",
    wmClass: sample?.wmClass != null ? String(sample.wmClass) : "-",
  };
  if (sent) {
    fields.sx = sent.x;
    fields.sy = sent.y;
    fields.sw = sent.width;
    fields.sh = sent.height;
  }
  if (observed) {
    fields.ox = observed.x;
    fields.oy = observed.y;
    fields.ow = observed.width;
    fields.oh = observed.height;
  }
  if (deltas) {
    fields.dx = deltas.dx;
    fields.dy = deltas.dy;
    fields.dw = deltas.dw;
    fields.dh = deltas.dh;
    fields.dMax = deltas.dMax;
  }
  const minW = Number(sample?.knownMin?.width);
  const minH = Number(sample?.knownMin?.height);
  if (Number.isFinite(minW) && minW > 0) fields.minW = minW;
  if (Number.isFinite(minH) && minH > 0) fields.minH = minH;
  return fields;
}

/**
 * @param {ReturnType<typeof buildGeomEpsilonFields>} fields
 */
export function logGeomEpsilonSample(fields) {
  if (!fields || typeof fields !== "object") return;
  const tag = fields.tag != null ? String(fields.tag) : "-";
  const phase = fields.phase != null ? String(fields.phase) : "-";
  const dMax = fields.dMax != null ? fields.dMax : "-";
  Logger.debug(`${GEOM_EPSILON_TOKEN} phase=${phase} tag=${tag} dMax=${dMax}`, {
    fields,
  });
}
