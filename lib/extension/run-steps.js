/*
 * This file is part of the Forge extension for GNOME
 *
 * Pure RunSteps schema validation + dispatch helpers (FC4).
 * No GObject / Gio / Meta — unit-testable without mocks.
 *
 * Extension ops run in-process (SessionApi). CLI-only ops (launch, wait)
 * must be orchestrated by the forge CLI, not DBus RunSteps.
 */

/** Ops the extension RunSteps engine executes. */
export const EXTENSION_OPS = Object.freeze([
  "ping",
  "focus",
  "swap",
  "move",
  "layout",
  "layout-cycle",
  "merge-group",
  "float",
  "order",
  "size",
  "place-next",
  "set",
  "close",
  // FC2/FC3: clear TILE keyboard focus (WindowUnfocus)
  "unfocus",
  // CT1: cold skeleton (slot-tagged PHs) + bind real window into PH slot
  "skeleton",
  "bind",
]);

/** Ops owned by the CLI only (never accepted by extension RunSteps). */
export const CLI_ONLY_OPS = Object.freeze(["launch", "wait-window", "wait"]);

const EXTENSION_OP_SET = new Set(EXTENSION_OPS);
const CLI_ONLY_OP_SET = new Set(CLI_ONLY_OPS);

/** Canonical layout modes → tree LAYOUT_TYPES values. */
export const LAYOUT_MODE_MAP = Object.freeze({
  tabbed: "TABBED",
  stacked: "STACKED",
  hsplit: "HSPLIT",
  vsplit: "VSPLIT",
  "h-split": "HSPLIT",
  "v-split": "VSPLIT",
  h: "HSPLIT",
  v: "VSPLIT",
  tab: "TABBED",
  stack: "STACKED",
});

/**
 * @param {unknown} mode
 * @returns {{ ok: true, mode: string } | { ok: false, error: string }}
 */
export function normalizeLayoutMode(mode) {
  if (mode == null || mode === "") {
    return { ok: false, error: "layout mode required" };
  }
  const raw = String(mode).trim();
  const lower = raw.toLowerCase();
  if (LAYOUT_MODE_MAP[lower]) {
    return { ok: true, mode: LAYOUT_MODE_MAP[lower] };
  }
  const upper = raw.toUpperCase();
  if (upper === "TABBED" || upper === "STACKED" || upper === "HSPLIT" || upper === "VSPLIT") {
    return { ok: true, mode: upper };
  }
  return {
    ok: false,
    error: `unknown layout mode: ${mode} (want tabbed|stacked|hsplit|vsplit)`,
  };
}

/**
 * Parse RunSteps input: JSON string, array of steps, or { steps, stopOnError? }.
 * @param {unknown} input
 * @returns {{ ok: true, steps: object[], stopOnError: boolean, options: object }
 *   | { ok: false, error: string }}
 */
export function parseStepsPayload(input) {
  let value = input;
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) {
      return { ok: false, error: "steps_json empty" };
    }
    try {
      value = JSON.parse(trimmed);
    } catch (e) {
      return { ok: false, error: `invalid steps_json: ${e.message || e}` };
    }
  }

  if (Array.isArray(value)) {
    return {
      ok: true,
      steps: value,
      stopOnError: true,
      options: {},
    };
  }

  if (value && typeof value === "object") {
    const steps = value.steps;
    if (!Array.isArray(steps)) {
      return { ok: false, error: "payload must be a steps array or { steps: [...] }" };
    }
    const stopOnError = value.stopOnError !== false && value.stop_on_error !== false;
    const options = { ...value };
    delete options.steps;
    delete options.stopOnError;
    delete options.stop_on_error;
    return { ok: true, steps, stopOnError, options };
  }

  return { ok: false, error: "payload must be a steps array or { steps: [...] }" };
}

/**
 * @param {unknown} step
 * @param {number} [index]
 * @returns {{ ok: true, step: object } | { ok: false, error: string, index?: number }}
 */
export function validateStep(step, index = 0) {
  if (!step || typeof step !== "object" || Array.isArray(step)) {
    return { ok: false, error: "step must be an object", index };
  }

  const opRaw = step.op ?? step.action ?? step.type;
  if (opRaw == null || String(opRaw).trim() === "") {
    return { ok: false, error: "step.op required", index };
  }
  const op = String(opRaw).trim().toLowerCase();

  if (CLI_ONLY_OP_SET.has(op)) {
    return {
      ok: false,
      error: `${op} is CLI-only (use forge launch / wait outside RunSteps)`,
      index,
      cliOnly: true,
    };
  }

  if (!EXTENSION_OP_SET.has(op)) {
    return {
      ok: false,
      error: `unknown op: ${op} (supported: ${EXTENSION_OPS.join(", ")})`,
      index,
    };
  }

  /** @type {Record<string, unknown>} */
  const normalized = { op };

  switch (op) {
    case "ping":
      break;

    case "focus": {
      const selector = step.selector ?? step.tile ?? step.target;
      if (selector == null || String(selector).trim() === "") {
        return { ok: false, error: "focus requires selector", index };
      }
      normalized.selector = String(selector);
      // Open-leaf-only layout focus: pin+raise without Meta.activate.
      // Default true when omitted (interactive Focus command).
      if (step.keyboard === false || step.keyboard === 0 || step.keyboard === "false") {
        normalized.keyboard = false;
      }
      break;
    }

    case "swap": {
      const a = step.a ?? step.selector_a ?? step.selectorA ?? step.tile_a;
      const b = step.b ?? step.selector_b ?? step.selectorB ?? step.tile_b;
      if (a == null || String(a).trim() === "") {
        return { ok: false, error: "swap requires a", index };
      }
      if (b == null || String(b).trim() === "") {
        return { ok: false, error: "swap requires b", index };
      }
      normalized.a = String(a);
      normalized.b = String(b);
      break;
    }

    case "move": {
      const tile = step.tile ?? step.selector ?? step.source;
      const dest = step.dest ?? step.destination ?? step.target;
      if (tile == null || String(tile).trim() === "") {
        return { ok: false, error: "move requires tile", index };
      }
      if (dest == null || String(dest).trim() === "") {
        return { ok: false, error: "move requires dest", index };
      }
      normalized.tile = String(tile);
      normalized.dest = String(dest);
      // Optional mon insert position (start/first/0 → prepend under MONITOR)
      if (step.position != null && String(step.position).trim() !== "") {
        normalized.position = step.position;
      }
      break;
    }

    case "layout": {
      const modeRes = normalizeLayoutMode(step.mode ?? step.layout);
      if (!modeRes.ok) {
        return { ok: false, error: modeRes.error, index };
      }
      normalized.mode = modeRes.mode;
      const selector = step.selector ?? step.tile ?? step.target;
      if (selector != null && String(selector).trim() !== "") {
        normalized.selector = String(selector);
      }
      break;
    }

    case "layout-cycle": {
      const axisRaw = step.axis != null ? String(step.axis).trim().toLowerCase() : "group";
      if (axisRaw !== "group" && axisRaw !== "split") {
        return { ok: false, error: "layout-cycle axis must be group|split", index };
      }
      normalized.axis = axisRaw;
      const selector = step.selector ?? step.tile ?? step.target;
      if (selector != null && String(selector).trim() !== "") {
        normalized.selector = String(selector);
      }
      break;
    }

    case "merge-group": {
      const selector = step.selector ?? step.tile ?? step.target;
      if (selector != null && String(selector).trim() !== "") {
        normalized.selector = String(selector);
      }
      const withSel = step.with ?? step.partner ?? step.other;
      if (withSel != null && String(withSel).trim() !== "") {
        normalized.with = String(withSel);
      }
      break;
    }

    case "float": {
      const selector = step.selector ?? step.tile ?? step.target;
      if (selector != null && String(selector).trim() !== "") {
        normalized.selector = String(selector);
      }
      const scopeRaw =
        step.scope != null && String(step.scope).trim() !== ""
          ? String(step.scope).trim().toLowerCase()
          : "window";
      if (scopeRaw !== "window" && scopeRaw !== "class") {
        return { ok: false, error: "float scope must be window|class", index };
      }
      normalized.scope = scopeRaw;
      break;
    }

    case "order": {
      // Mon-level child reorder: windowIds or selectors, ≥2 reps in desired order.
      const raw = step.windowIds ?? step.window_ids ?? step.selectors ?? step.tiles;
      if (!Array.isArray(raw) || raw.length < 2) {
        return {
          ok: false,
          error: "order requires windowIds or selectors (≥2)",
          index,
        };
      }
      const windowIds = [];
      for (const item of raw) {
        if (item == null || String(item).trim() === "") continue;
        windowIds.push(String(item).trim());
      }
      if (windowIds.length < 2) {
        return {
          ok: false,
          error: "order requires windowIds or selectors (≥2)",
          index,
        };
      }
      normalized.windowIds = windowIds;
      break;
    }

    case "size": {
      // Sibling percent shares under common parent (HSPLIT width / VSPLIT height).
      const raw = step.windowIds ?? step.window_ids ?? step.selectors ?? step.tiles;
      if (!Array.isArray(raw) || raw.length < 2) {
        return {
          ok: false,
          error: "size requires windowIds (≥2)",
          index,
        };
      }
      const windowIds = [];
      for (const item of raw) {
        if (item == null || String(item).trim() === "") continue;
        windowIds.push(String(item).trim());
      }
      const sharesRaw = step.shares ?? step.share ?? step.ratios;
      if (!Array.isArray(sharesRaw) || sharesRaw.length !== windowIds.length) {
        return {
          ok: false,
          error: "size requires shares[] matching windowIds length",
          index,
        };
      }
      const shares = [];
      for (const s of sharesRaw) {
        const f = Number(s);
        if (!Number.isFinite(f) || f <= 0) {
          return {
            ok: false,
            error: "size shares must be positive numbers",
            index,
          };
        }
        shares.push(f);
      }
      if (windowIds.length < 2) {
        return {
          ok: false,
          error: "size requires windowIds (≥2)",
          index,
        };
      }
      normalized.windowIds = windowIds;
      normalized.shares = shares;
      break;
    }

    case "place-next": {
      // Remaining fields pass through as PlaceNext options (minus op aliases).
      const opts = { ...step };
      delete opts.op;
      delete opts.action;
      delete opts.type;
      normalized.options = opts;
      break;
    }

    case "set": {
      const key = step.key ?? step.name;
      if (key == null || String(key).trim() === "") {
        return { ok: false, error: "set requires key", index };
      }
      if (!("value" in step) && !("val" in step)) {
        return { ok: false, error: "set requires value", index };
      }
      normalized.key = String(key);
      normalized.value = "value" in step ? step.value : step.val;
      break;
    }

    case "close": {
      // Meta.Window.delete only — never process-kill (WR15 layout --clean).
      const selector = step.selector ?? step.tile ?? step.target;
      if (selector == null || String(selector).trim() === "") {
        return { ok: false, error: "close requires selector", index };
      }
      normalized.selector = String(selector);
      if (step.force === true || step.force === "true" || step.force === 1) {
        normalized.force = true;
      }
      break;
    }

    case "unfocus":
      // No args — clear TILE keyboard focus (WindowUnfocus / Ctrl+Super+Esc).
      break;

    case "skeleton": {
      // Cold path: mon splits + tab/stack CONs + slot-tagged PH leaves (no windowIds).
      const mons = step.mons ?? step.monitors ?? step.forest;
      if (!Array.isArray(mons) || mons.length === 0) {
        return { ok: false, error: "skeleton requires mons[]", index };
      }
      normalized.mons = mons;
      if (step.workspace != null && String(step.workspace).trim() !== "") {
        const ws = Number(step.workspace);
        if (Number.isFinite(ws) && ws >= 0) normalized.workspace = Math.floor(ws);
      }
      break;
    }

    case "bind": {
      // Replace layout PH (layoutRole/layoutSlot) with a real window.
      const tile = step.tile ?? step.selector ?? step.windowId ?? step.window;
      if (tile == null || String(tile).trim() === "") {
        return { ok: false, error: "bind requires tile", index };
      }
      normalized.tile = String(tile).trim();
      if (step.layoutRole != null && String(step.layoutRole).trim() !== "") {
        normalized.layoutRole = String(step.layoutRole).trim();
      }
      if (step.layoutSlot != null && String(step.layoutSlot).trim() !== "") {
        normalized.layoutSlot = String(step.layoutSlot).trim();
      }
      const ph = step.placeholder ?? step.placeholderId ?? step.ph;
      if (ph != null && String(ph).trim() !== "") {
        normalized.placeholder = String(ph).trim();
      }
      break;
    }

    default:
      return { ok: false, error: `unhandled op: ${op}`, index };
  }

  return { ok: true, step: normalized };
}

/**
 * Validate every step; collect all errors (does not stop early).
 * @param {unknown[]} steps
 * @returns {{ ok: true, steps: object[] } | { ok: false, error: string, results: object[] }}
 */
export function validateSteps(steps) {
  if (!Array.isArray(steps)) {
    return { ok: false, error: "steps must be an array", results: [] };
  }
  const out = [];
  const results = [];
  let failed = false;
  for (let i = 0; i < steps.length; i++) {
    const v = validateStep(steps[i], i);
    if (!v.ok) {
      failed = true;
      results.push({ ok: false, index: i, error: v.error });
    } else {
      out.push(v.step);
      results.push({ ok: true, index: i });
    }
  }
  if (failed) {
    return {
      ok: false,
      error: "one or more steps invalid",
      results,
    };
  }
  return { ok: true, steps: out };
}

/**
 * Pure step runner: validates each step, calls handlers[op](normalizedStep).
 * Handler may return `{ ok: false, error }` or throw; otherwise treated as success.
 *
 * @param {unknown[]} steps
 * @param {Record<string, (step: object) => any>} handlers
 * @param {{ stopOnError?: boolean }} [opts]
 * @returns {{ ok: boolean, results: object[], stoppedAt?: number }}
 */
export function runStepsDispatch(steps, handlers, opts = {}) {
  const stopOnError = opts.stopOnError !== false;
  /** @type {object[]} */
  const results = [];

  if (!Array.isArray(steps)) {
    return {
      ok: false,
      results: [{ ok: false, index: 0, error: "steps must be an array" }],
      stoppedAt: 0,
    };
  }

  for (let i = 0; i < steps.length; i++) {
    const v = validateStep(steps[i], i);
    if (!v.ok) {
      results.push({ ok: false, index: i, error: v.error });
      if (stopOnError) {
        return { ok: false, results, stoppedAt: i };
      }
      continue;
    }

    const { op } = v.step;
    const handler = handlers?.[op];
    if (typeof handler !== "function") {
      results.push({ ok: false, index: i, error: `no handler for op: ${op}` });
      if (stopOnError) {
        return { ok: false, results, stoppedAt: i };
      }
      continue;
    }

    try {
      const r = handler(v.step);
      // Fail on ok:false or legacy { error } without ok:true (SessionApi cores).
      const failed =
        r && typeof r === "object" && (r.ok === false || (r.error != null && r.ok !== true));
      if (failed) {
        const entry = {
          ok: false,
          index: i,
          error: r.error != null ? String(r.error) : "step failed",
        };
        if (r.candidates) entry.candidates = r.candidates;
        if (r.which) entry.which = r.which;
        results.push(entry);
        if (stopOnError) {
          return { ok: false, results, stoppedAt: i };
        }
      } else {
        const entry = { ok: true, index: i };
        if (r && typeof r === "object") {
          for (const k of Object.keys(r)) {
            if (k === "ok" || k === "index") continue;
            entry[k] = r[k];
          }
        }
        results.push(entry);
      }
    } catch (e) {
      results.push({
        ok: false,
        index: i,
        error: String(e?.message || e),
      });
      if (stopOnError) {
        return { ok: false, results, stoppedAt: i };
      }
    }
  }

  const allOk = results.length === steps.length && results.every((r) => r.ok);
  return { ok: allOk, results };
}

/**
 * Split a mixed script into extension-runnable chunks vs CLI-only ops.
 * CLI `forge run` may use this to interleave launch/wait with DBus RunSteps.
 *
 * @param {unknown[]} steps
 * @returns {{ kind: "extension"|"cli", steps: object[] }[]}
 */
export function partitionMixedSteps(steps) {
  if (!Array.isArray(steps)) return [];
  /** @type {{ kind: "extension"|"cli", steps: object[] }[]} */
  const chunks = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const opRaw = step && typeof step === "object" ? step.op ?? step.action ?? step.type : null;
    const op = opRaw != null ? String(opRaw).trim().toLowerCase() : "";
    const kind = CLI_ONLY_OP_SET.has(op) ? "cli" : "extension";
    const last = chunks[chunks.length - 1];
    if (last && last.kind === kind) {
      last.steps.push(step);
    } else {
      chunks.push({ kind, steps: [step] });
    }
  }
  return chunks;
}
