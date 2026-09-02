/*
 * ApplyLayout open phase (AL6): spawn + PlaceNext, map-pin on Meta signals
 * (admit + census, D034/D035), LayoutBatch, residual planReconcile.
 */

import { Logger } from "../shared/logger.js";
import { collectWindows, classEq } from "../shared/layout-plan.js";
import {
  DEFAULT_OPEN_PIN_TIMEOUT_MS,
  assignOpenRolePins,
  chromeSerialWaitPins,
  openActionToLaunchFields,
  openActionIsChromeFamily,
  pendingPinsWithoutTitle,
  pinEntryFromOpenAction,
  applyPlaceNextOptions,
  summarizePinWindows,
} from "../shared/layout-open.js";
import { buildStructurePlan, partitionStepsByPhase } from "./layout-apply-structure.js";

/**
 * Mulberry32 seeded PRNG → [0, 1).
 * @param {number} seed
 * @returns {() => number}
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {unknown} raw
 * @returns {number}
 */
export function chaosSeedFrom(raw) {
  if (raw == null || String(raw).trim() === "") {
    return (Date.now() ^ (Math.floor(Math.random() * 0xffffffff) >>> 0)) >>> 0;
  }
  const s = String(raw).trim();
  if (/^\d+$/.test(s)) return Number(s) >>> 0;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Slice-1 layout chaos cocktail (shuffle + inter-group delays).
 * Each strategy is independently on/off (~50%). Always log + nest-queue.
 * @param {object[]} actions
 * @param {{ seed?: string|number, rand?: () => number }} [opts]
 * @returns {{
 *   actions: object[],
 *   cocktail: {
 *     seed: number,
 *     shuffle: boolean,
 *     delaysMs: number[],
 *     strategies: string[],
 *   },
 * }}
 */
export function applyLayoutChaosCocktail(actions, opts = {}) {
  const list = Array.isArray(actions) ? actions.slice() : [];
  const seed = chaosSeedFrom(opts.seed);
  const rand = typeof opts.rand === "function" ? opts.rand : mulberry32(seed);
  const strategies = [];
  let shuffle = false;
  const delaysMs = [];

  if (list.length >= 2 && rand() < 0.5) {
    shuffle = true;
    strategies.push("launch-order");
    // Fisher–Yates; chrome-family serialize still waits at spawn time.
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
  }

  if (list.length >= 2 && rand() < 0.5) {
    strategies.push("inter-group-delay");
    const nDelays = rand() < 0.5 ? 1 : 2;
    for (let i = 0; i < nDelays; i++) {
      // 50–400ms bounded — enough to race place-hint without multi-second fluff.
      delaysMs.push(50 + Math.floor(rand() * 351));
    }
  }

  return {
    actions: list,
    cocktail: {
      seed,
      shuffle,
      delaysMs,
      strategies,
    },
  };
}

/**
 * Merge assigned pins into rolePins + used set.
 * @param {object} rolePins
 * @param {Set<string>} used
 * @param {object} assigned
 */
export function mergeRolePins(rolePins, used, assigned) {
  if (!assigned || typeof assigned !== "object") return;
  for (const [rid, wid] of Object.entries(assigned)) {
    if (wid == null || String(wid).trim() === "") continue;
    rolePins[rid] = wid;
    used.add(String(wid).trim());
  }
}

/**
 * Signal-driven pin wait: admit + census on events, class-only leftover at timeout.
 * Not a GetTree poll loop.
 *
 * @param {object[]} pending
 * @param {{
 *   usedIds?: Iterable<string>,
 *   timeoutMs?: number,
 *   classEq?: Function,
 *   admit?: () => void,
 *   loadWindows?: () => object[],
 *   onWindowEvent?: (cb: () => void) => (() => void)|null,
 *   schedule?: (ms: number, cb: () => void) => number|string,
 *   cancel?: (id: number|string) => void,
 *   isCancelled?: () => boolean,
 * }} opts
 * @param {(result: object) => void} done
 */
export function waitPinsOnSignals(pending, opts, done) {
  const eq = typeof opts.classEq === "function" ? opts.classEq : classEq;
  const used = new Set();
  for (const x of opts.usedIds || []) used.add(String(x));
  const pins = {};
  let remaining = (pending || []).filter(
    (p) => p && typeof p === "object" && p.role != null && String(p.role).trim() !== ""
  );
  let timer = null;
  let unsub = null;
  let settled = false;
  let lastWins = [];

  const settle = (out) => {
    if (settled) return;
    settled = true;
    if (timer != null && typeof opts.cancel === "function") {
      try {
        opts.cancel(timer);
      } catch (_e) {
        /* */
      }
    }
    timer = null;
    if (typeof unsub === "function") {
      try {
        unsub();
      } catch (_e) {
        /* */
      }
    }
    unsub = null;
    done(out);
  };

  const tick = (isTimeout) => {
    if (settled) return;
    if (typeof opts.isCancelled === "function" && opts.isCancelled()) {
      settle({
        ok: false,
        rolePins: pins,
        missing: remaining.map((p) => String(p.role)),
        seen: summarizePinWindows(lastWins),
        error: "cancelled",
        cancelled: true,
      });
      return;
    }
    try {
      opts.admit?.();
    } catch (e) {
      Logger.warn(`layout-apply-open admit: ${e}`);
    }
    let wins = [];
    try {
      wins = opts.loadWindows?.() || [];
      if (!Array.isArray(wins)) wins = [];
    } catch (e) {
      Logger.warn(`layout-apply-open loadWindows: ${e}`);
      wins = [];
    }
    lastWins = wins;
    const assigned = assignOpenRolePins(remaining, wins, used, { classEq: eq });
    mergeRolePins(pins, used, assigned);
    remaining = remaining.filter((p) => !(String(p.role) in pins));
    if (!remaining.length) {
      settle({
        ok: true,
        rolePins: pins,
        missing: [],
        seen: summarizePinWindows(wins),
        error: null,
      });
      return;
    }
    if (!isTimeout) return;
    const fallback = assignOpenRolePins(pendingPinsWithoutTitle(remaining), wins, used, {
      classEq: eq,
    });
    mergeRolePins(pins, used, fallback);
    remaining = remaining.filter((p) => !(String(p.role) in pins));
    const missing = remaining.map((p) => String(p.role));
    settle({
      ok: missing.length === 0,
      rolePins: pins,
      missing,
      seen: summarizePinWindows(wins),
      error: missing.length ? `map wait timeout for roles: ${missing}` : null,
    });
  };

  tick(false);
  if (settled) return;

  if (typeof opts.onWindowEvent === "function") {
    try {
      unsub = opts.onWindowEvent(() => tick(false));
    } catch (e) {
      Logger.warn(`layout-apply-open onWindowEvent: ${e}`);
      unsub = null;
    }
  }

  const timeoutMs =
    opts.timeoutMs != null && Number.isFinite(Number(opts.timeoutMs))
      ? Math.max(0, Number(opts.timeoutMs))
      : DEFAULT_OPEN_PIN_TIMEOUT_MS;
  if (typeof opts.schedule === "function") {
    timer = opts.schedule(timeoutMs, () => tick(true));
  } else {
    tick(true);
  }
}

/**
 * Residual plan after maps: same flags + rolePins / justOpenedRoles.
 * @param {object} profile
 * @param {object} forest
 * @param {object} flags
 * @param {object} rolePins
 * @param {{ workspace?: number, forceClose?: boolean }} [opts]
 */
export function buildResidualPlan(profile, forest, flags, rolePins, opts = {}) {
  const pins = rolePins && typeof rolePins === "object" ? rolePins : {};
  const justOpened = Object.keys(pins);
  return buildStructurePlan(
    profile,
    forest,
    {
      ...(flags && typeof flags === "object" ? flags : {}),
      rolePins: pins,
      justOpenedRoles: justOpened,
    },
    opts
  );
}

/**
 * Windows for pin assign: tree forest + Meta census (D035).
 * @param {object} forest
 * @param {object[]} [census]
 * @returns {object[]}
 */
export function pinWindowsFromForest(forest, census) {
  const f = forest && typeof forest === "object" ? { ...forest } : {};
  if (Array.isArray(census) && census.length) {
    f.metaWindows = [...(Array.isArray(f.metaWindows) ? f.metaWindows : []), ...census];
  }
  return collectWindows(f);
}

/**
 * Run open phase. Calls onComplete once (sync if waitPins is sync).
 *
 * @param {{
 *   openActions: object[],
 *   workspace?: number,
 *   name?: string|null,
 *   profile?: object,
 *   flags?: object,
 *   deps: {
 *     spawn: (fields: object, action: object) => { ok: boolean, error?: string, waitClasses?: string[], acceptAnyNew?: boolean, timeoutMs?: number, pid?: number },
 *     placeNext: (options: object) => { ok: boolean, error?: string },
 *     admit?: () => object,
 *     loadWindows?: () => object[],
 *     waitPins?: typeof waitPinsOnSignals,
 *     beginBatch?: (name?: string|null) => { ok?: boolean, error?: string },
 *     releaseDeferred?: () => { ok?: boolean },
 *     endBatch?: (reason?: string) => { ok?: boolean },
 *     snapshotForest?: () => object,
 *     census?: () => object[],
 *     schedule?: Function,
 *     cancel?: Function,
 *     onWindowEvent?: Function,
 *     nowMs?: () => number,
 *   },
 *   onProgress?: (p: { event?: string, message?: string, counts?: object }) => void,
 *   onComplete: (out: object) => void,
 *   isCancelled?: () => boolean,
 * }} opts
 * @returns {{ sync: boolean }}
 */
export function startOpenPhase(opts) {
  const deps = opts.deps && typeof opts.deps === "object" ? opts.deps : {};
  let actions = Array.isArray(opts.openActions) ? opts.openActions.filter(Boolean) : [];
  const workspace = opts.workspace != null ? opts.workspace : 0;
  const onComplete = typeof opts.onComplete === "function" ? opts.onComplete : () => {};
  const emit =
    typeof opts.onProgress === "function"
      ? opts.onProgress
      : () => {
          /* */
        };
  const isCancelled = typeof opts.isCancelled === "function" ? opts.isCancelled : () => false;
  const flags = opts.flags && typeof opts.flags === "object" ? opts.flags : {};

  /** @type {null|{ seed: number, shuffle: boolean, delaysMs: number[], strategies: string[] }} */
  let chaosCocktail = null;
  /** @type {number[]} */
  let chaosDelayQueue = [];
  if (flags.chaos && actions.length) {
    const applied = applyLayoutChaosCocktail(actions, { seed: flags.chaosSeed });
    actions = applied.actions;
    chaosCocktail = applied.cocktail;
    chaosDelayQueue = (chaosCocktail.delaysMs || []).slice();
    Logger.info("layout-chaos cocktail", {
      fields: {
        seed: chaosCocktail.seed,
        shuffle: chaosCocktail.shuffle ? 1 : 0,
        delays: chaosCocktail.delaysMs.join(",") || "-",
        strategies: chaosCocktail.strategies.join(",") || "none",
      },
    });
    emit({
      event: "info",
      message: `layout-chaos seed=${chaosCocktail.seed} strategies=${
        chaosCocktail.strategies.join(",") || "none"
      } delays=${chaosCocktail.delaysMs.join(",") || "-"}`,
    });
  }

  let finished = false;
  const finish = (out) => {
    if (finished) return;
    finished = true;
    if (chaosCocktail && out && typeof out === "object") {
      out.chaos = chaosCocktail;
    }
    onComplete(out);
  };

  Logger.debug("open-phase", {
    fields: {
      n: actions.length,
      ws: workspace,
      name: opts.name || "-",
    },
  });
  if (!actions.length) {
    finish({
      ok: true,
      rolePins: {},
      missing: [],
      launched: 0,
      failures: [],
      residual: null,
      skipped: true,
      batch: { begun: false },
    });
    return { sync: true };
  }

  let batchBegun = false;
  try {
    const begin = deps.beginBatch?.(opts.name ?? null);
    batchBegun = !!(begin && begin.ok !== false);
    if (!batchBegun && begin && begin.error) {
      emit({ event: "warn", message: `LayoutBatch begin failed (continuing): ${begin.error}` });
    }
  } catch (e) {
    emit({ event: "warn", message: `LayoutBatch begin failed (continuing): ${e}` });
    batchBegun = false;
  }

  const rolePins = {};
  const used = new Set();
  try {
    const base = deps.baselineIds;
    if (typeof base === "function") {
      for (const x of base() || []) used.add(String(x));
    } else if (base) {
      for (const x of base) used.add(String(x));
    }
  } catch (e) {
    Logger.warn(`layout-apply-open baselineIds: ${e}`);
  }

  const pendingPins = [];
  const chromeRoles = new Set();
  const failures = [];
  const opens = [];
  let openTimeoutMs = DEFAULT_OPEN_PIN_TIMEOUT_MS;
  let index = 0;

  const waitPins =
    typeof deps.waitPins === "function"
      ? deps.waitPins
      : (pending, waitOpts, done) => waitPinsOnSignals(pending, { ...deps, ...waitOpts }, done);

  const waitOpts = () => ({
    usedIds: used,
    timeoutMs: openTimeoutMs,
    classEq,
    admit: deps.admit,
    loadWindows: deps.loadWindows,
    onWindowEvent: deps.onWindowEvent,
    schedule: deps.schedule,
    cancel: deps.cancel,
    isCancelled,
  });

  const mergeWait = (res) => {
    if (!res) return;
    mergeRolePins(rolePins, used, res.rolePins || res.role_pins);
    if (res.cancelled) {
      endBatchQuiet();
      finish({
        ok: false,
        rolePins,
        missing: res.missing || [],
        launched: opens.length,
        failures,
        residual: null,
        error: "cancelled",
        code: "cancel",
        cancelled: true,
        batch: { begun: batchBegun },
        opens,
      });
      return true;
    }
    return false;
  };

  const endBatchQuiet = () => {
    if (!batchBegun) return;
    try {
      deps.releaseDeferred?.();
    } catch (e) {
      Logger.warn(`layout-apply-open releaseDeferred: ${e}`);
    }
    try {
      deps.endBatch?.("open-batch");
    } catch (e) {
      Logger.warn(`layout-apply-open endBatch: ${e}`);
    }
    batchBegun = false;
  };

  const spawnOne = (action) => {
    const fields = openActionToLaunchFields(action, { workspace });
    fields.no_wait = true;
    const role = action.role != null ? String(action.role) : null;
    let forest = null;
    const takeForest = deps.desiredForest || deps.snapshotForest;
    if (typeof takeForest === "function") {
      try {
        forest = takeForest();
      } catch (e) {
        Logger.debug?.(`layout-apply-open dest forest: ${e}`);
      }
    }
    const resolved = applyPlaceNextOptions(action, fields, forest);
    if (!resolved.ok) {
      const err = resolved.error || "PlaceNext dest is mon-root-only";
      failures.push(role != null ? role : err);
      opens.push({
        ok: false,
        role,
        error: err,
        placeNext: true,
        destKind: resolved.destKind,
      });
      Logger.warn(`open PlaceNext dest failed role=${role}: ${err}`);
      emit({ event: "warn", message: `open PlaceNext dest failed role=${role}: ${err}` });
      return;
    }
    let pr;
    try {
      pr = deps.placeNext(resolved.placeOpts);
    } catch (e) {
      pr = { ok: false, error: String(e?.message || e) };
    }
    if (!pr || pr.ok === false) {
      const err = pr?.error || "PlaceNext failed";
      failures.push(role != null ? role : err);
      opens.push({ ok: false, role, error: err, placeNext: true, destKind: resolved.destKind });
      emit({ event: "warn", message: `open PlaceNext failed role=${role}: ${err}` });
      return;
    }
    Logger.trace(
      `open spawn role=${role || "-"} destKind=${resolved.destKind || "-"} PlaceNext=ok`
    );

    let sr;
    try {
      sr = deps.spawn(fields, action);
    } catch (e) {
      sr = { ok: false, error: String(e?.message || e) };
    }
    const entry = { ...(sr && typeof sr === "object" ? sr : {}), role, parallel: true };
    opens.push(entry);
    if (!sr || sr.ok === false) {
      const err = sr?.error || "spawn failed";
      failures.push(role != null ? role : err);
      emit({ event: "warn", message: `open spawn failed role=${role}: ${err}` });
      return;
    }
    if (role == null || role.trim() === "") return;
    if (sr.timeoutMs != null && Number.isFinite(Number(sr.timeoutMs))) {
      openTimeoutMs = Math.max(openTimeoutMs, Number(sr.timeoutMs));
    } else if (fields.timeout != null && Number.isFinite(Number(fields.timeout))) {
      openTimeoutMs = Math.max(openTimeoutMs, Number(fields.timeout));
    }
    const pin = pinEntryFromOpenAction(action, sr);
    if (pin) pendingPins.push(pin);
    if (openActionIsChromeFamily(action)) chromeRoles.add(role);
    emit({ event: "info", message: `spawned ${role}` });
  };

  const afterMaps = () => {
    if (finished) return;
    if (isCancelled()) {
      endBatchQuiet();
      finish({
        ok: false,
        rolePins,
        missing: [],
        launched: opens.length,
        failures,
        residual: null,
        error: "cancelled",
        code: "cancel",
        cancelled: true,
        batch: { begun: true },
        opens,
      });
      return;
    }

    if (batchBegun) {
      try {
        deps.releaseDeferred?.();
      } catch (e) {
        emit({ event: "warn", message: `release-deferred failed: ${e}` });
      }
      try {
        deps.endBatch?.("open-batch");
      } catch (e) {
        emit({ event: "warn", message: `LayoutBatch end failed: ${e}` });
      }
      batchBegun = false;
    }

    let residual = null;
    try {
      const forest = typeof deps.snapshotForest === "function" ? deps.snapshotForest() : null;
      if (forest && typeof forest === "object") {
        if (typeof deps.census === "function") {
          try {
            const census = deps.census();
            if (Array.isArray(census) && census.length) forest.metaWindows = census;
          } catch (e) {
            Logger.warn(`layout-apply-open census: ${e}`);
          }
        }
        residual = buildResidualPlan(opts.profile, forest, opts.flags || {}, rolePins, {
          workspace,
          forceClose: !!(opts.flags && opts.flags.forceClose),
        });
      }
    } catch (e) {
      finish({
        ok: false,
        rolePins,
        missing: [],
        launched: opens.length,
        failures,
        residual: null,
        error: `re-plan after open failed: ${e?.message || e}`,
        code: "replan-error",
        batch: { begun: false, ended: true },
        opens,
      });
      return;
    }

    const stillOpen = residual?.ok ? residual.openCount || 0 : 0;
    // Pinned roles already mapped; residual may still emit open when the
    // window is briefly on the wrong workspace in the snapshot.
    const stillRoles = residual?.ok
      ? (residual.openActions || [])
          .map((a) => a?.role)
          .filter((r) => r != null && !(String(r) in rolePins))
      : [];
    const missing = [];
    for (const p of pendingPins) {
      if (!(String(p.role) in rolePins)) missing.push(String(p.role));
    }
    for (const f of failures) {
      if (f != null && !missing.includes(String(f))) missing.push(String(f));
    }

    finish({
      ok: true,
      rolePins,
      missing,
      stillOpenRoles: stillRoles,
      stillOpen,
      launched: opens.length,
      failures,
      residual,
      batch: { begun: true, ended: true },
      opens,
    });
  };

  const leftoverWait = () => {
    if (finished) return;
    const leftover = pendingPins.filter((p) => !(String(p.role) in rolePins));
    if (!leftover.length) {
      afterMaps();
      return;
    }
    emit({
      event: "info",
      message: `map-wait ${leftover.length} role(s)`,
    });
    waitPins(leftover, waitOpts(), (res) => {
      if (mergeWait(res)) return;
      if (res && res.missing && res.missing.length) {
        emit({
          event: "warn",
          message: `map-wait missing ${res.missing.join(",")}`,
        });
      }
      afterMaps();
    });
  };

  const afterSpawnContinue = () => {
    index += 1;
    if (chaosDelayQueue.length && index < actions.length && typeof deps.schedule === "function") {
      const delayMs = Math.max(0, Number(chaosDelayQueue.shift()) || 0);
      emit({
        event: "info",
        message: `layout-chaos delay ${delayMs}ms before next open`,
      });
      deps.schedule(delayMs, () => {
        if (!finished) step();
      });
      return;
    }
    step();
  };

  const step = () => {
    if (finished) return;
    if (isCancelled()) {
      endBatchQuiet();
      finish({
        ok: false,
        rolePins,
        missing: [],
        launched: opens.length,
        failures,
        residual: null,
        error: "cancelled",
        code: "cancel",
        cancelled: true,
        batch: { begun: batchBegun },
        opens,
      });
      return;
    }
    if (index >= actions.length) {
      leftoverWait();
      return;
    }
    const oa = actions[index];
    const unpinned = chromeSerialWaitPins(oa, chromeRoles, pendingPins, rolePins);
    if (unpinned.length) {
      emit({
        event: "info",
        message: `chrome-family serialize wait before ${oa.role != null ? oa.role : "open"}`,
      });
      waitPins(unpinned, waitOpts(), (res) => {
        if (mergeWait(res)) return;
        spawnOne(oa);
        afterSpawnContinue();
      });
      return;
    }
    spawnOne(oa);
    afterSpawnContinue();
  };

  emit({ event: "info", message: `open ${actions.length} role(s)` });
  try {
    deps.admit?.();
  } catch (e) {
    Logger.warn(`layout-apply-open admit start: ${e}`);
  }
  step();
  return { sync: finished };
}

/**
 * Apply residual buckets onto a live run after maps.
 * @param {object} run
 * @param {object} openOut startOpenPhase result
 */
export function applyOpenResultToRun(run, openOut) {
  if (!run || !openOut) return;
  run.rolePins = openOut.rolePins || {};
  run.openLaunched = openOut.launched || 0;
  if (openOut.chaos && typeof openOut.chaos === "object") {
    run.chaos = openOut.chaos;
  }
  run.openFailures = openOut.failures || [];
  run.openMissing = openOut.missing || [];
  run.openStillRoles = openOut.stillOpenRoles || [];
  run.openRan = true;
  run.batchEnded = !!(openOut.batch && openOut.batch.ended);
  if (openOut.residual && openOut.residual.ok) {
    run.structureBuilt = {
      ...openOut.residual,
      openCount: 0,
    };
    run.structureBuckets = partitionStepsByPhase(openOut.residual.steps);
    run.residualPlan = openOut.residual.plan || null;
  }
}
