/*
 * Sent vs observed geometry samples for the ε campaign (D095 S1).
 * Measurement only — does not change acceptance or bump ε.
 */
import { Logger } from "../shared/logger.js";
import { LAYOUT_VERIFY_EPSILON_PX, normalizeRect } from "./layout-verify.js";

/** Grep: `forge log --grep geom-epsilon` */
export const GEOM_EPSILON_TOKEN = "geom-epsilon";

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

/**
 * Classify a sample for later progressive-forgiveness planning (S6).
 * S1 only logs the tag — no behavior change.
 *
 * @param {object} input
 * @param {number} input.dMax
 * @param {number} [input.epsilon=LAYOUT_VERIFY_EPSILON_PX]
 * @param {number} [input.nearBand] defaults to max(2*ε, ε+8)
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
      : Math.max(eps * 2, eps + 8);

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
