// @ts-check
/**
 * Shared Given/Actions/Expect runner for TOM + OpSet tests.
 */

import { ensureMark2Decisions, getOpSet, runOpAbstract } from "../src/opsets/index.mjs";
import { mergeTagsOf } from "../src/session.mjs";
import { nextAppLabel } from "../src/tom/index.mjs";
import {
  buildGiven,
  normalizeTreeStr,
  parseActions,
  serializeForest,
} from "../src/tom/shorthand.mjs";

/** @typedef {import('../src/tom/kernel.mjs').Forest} Forest */
/** @typedef {import('../src/tom/api.mjs').TomApi} TomApi */
/** @typedef {import('../src/tom/kernel.mjs').Node} Node */

/**
 * @typedef {{
 *   id: string,
 *   layer: 'atomics'|'composed'|'opset'|'workflow'|'shorthand'|'keybinds',
 *   given?: string,
 *   actions?: string[],
 *   expect?: string,
 *   expectMode?: string | RegExp,
 *   expectOk?: boolean,
 *   opset?: string,
 *   byOpSet?: Record<string, string[]>,
 *   note?: string,
 *   run?: (t: Ctx) => string | void,
 *   check?: (t: Ctx) => string | void,
 * }} Case
 */

/**
 * @typedef {{
 *   f: Forest,
 *   api: TomApi,
 *   byLabel: Record<string, Node>,
 *   win: (label: string) => Node,
 *   parent: (n: Node) => Node | null,
 *   children: (n: Node) => Node[],
 * }} Ctx
 */

/**
 * @param {Forest} f
 * @param {TomApi} api
 * @param {Record<string, Node>} byLabel
 * @param {string} opsetId
 * @param {import('../src/tom/shorthand.mjs').Action} step
 */
export function runStep(f, api, byLabel, opsetId, step) {
  const set = getOpSet(opsetId);
  const txn = (fn) => runOpAbstract(f, api, (draft) => fn(draft));

  switch (step.op) {
    case "Select": {
      const leaf = byLabel[/** @type {string} */ (step.arg)];
      if (!leaf) return { ok: false, reason: `no window ${step.arg}` };
      api.setFocus(f, leaf.id);
      return { ok: true, op: "Select", arg: step.arg };
    }
    case "SelectParent":
      return api.focusParent ? api.focusParent(f) : failNeed("focusParent");
    case "SelectChild":
      return api.focusChild ? api.focusChild(f) : failNeed("focusChild");
    case "Move":
    case "Join": {
      if (step.arg) {
        const leaf = byLabel[step.arg];
        if (!leaf) return { ok: false, reason: `no window ${step.arg}` };
        api.setFocus(f, leaf.id);
      }
      const fn =
        step.op === "Move"
          ? (draft) => set.ops.move(draft, api, step.dir)
          : (draft) => set.ops.join(draft, api, step.dir);
      return txn(fn);
    }
    case "Swap":
      return api.swapDir ? api.swapDir(f, step.dir) : failNeed("swapDir");
    case "Focus":
      return api.focusDir ? api.focusDir(f, step.dir) : failNeed("focusDir");
    case "Breakout": {
      const side = step.side || (step.dir === "left" || step.dir === "up" ? "before" : "after");
      const cur = api.selectionNode(f);
      if (!cur) return { ok: false, reason: "no selection" };
      return api.breakout(f, cur, side);
    }
    case "SetLayout":
      return api.setLayout(f, step.layout);
    case "Wrap":
      return api.wrap(f, step.layout, mergeTagsOf(f).length > 0);
    case "Ungroup":
      return api.ungroup(f);
    case "Group":
      return api.group ? api.group(f) : failNeed("group");
    case "Promote":
      return txn((draft) => set.ops.promote(draft, api));
    case "PromoteRecursive":
      return txn((draft) => set.ops.promoteRecursive(draft, api));
    case "ToggleSplit":
      return txn((draft) => set.ops.toggleSplit(draft, api));
    case "ToggleTabStack":
      return txn((draft) => set.ops.toggleTabStack(draft, api));
    case "Remove":
      return txn((draft) => set.ops.remove(draft, api));
    case "Delete":
      return api.deleteNode(f);
    case "Flatten":
      return api.flatten(f, false);
    case "FlattenAll":
      return api.flatten(f, true);
    case "Equalize":
      return api.equalizeChildren(f);
    case "Close":
      return api.close(f);
    case "MoveIn":
      return api.moveIn ? api.moveIn(f) : failNeed("moveIn");
    case "MoveOut":
      return api.moveOut ? api.moveOut(f) : failNeed("moveOut");
    case "CycleLayout":
      return api.cycleLayout ? api.cycleLayout(f, step.delta ?? 1) : failNeed("cycleLayout");
    case "CreateGroup":
      return api.createGroup ? api.createGroup(f, step.layout) : failNeed("createGroup");
    case "Launch": {
      const label = nextAppLabel(f);
      let monIndex = step.monIndex;
      if (monIndex == null) {
        const cur = api.selectionNode(f) || api.focusNode(f);
        const mon = cur ? api.ancestorMonitor(f, cur) : f.monitors[0];
        monIndex = Math.max(
          0,
          f.monitors.findIndex((m) => m.id === mon?.id)
        );
      }
      const fn = (draft) =>
        set.ops.launch
          ? set.ops.launch(draft, api, { label, monIndex })
          : { ok: false, reason: "OpSet has no Launch" };
      return txn(fn);
    }
    default:
      return { ok: false, reason: `unknown op ${step.op}` };
  }
}

function failNeed(name) {
  return { ok: false, reason: `${name} needs TreeApi (presenter)` };
}

/**
 * @param {Case} c
 * @param {{ opset?: string }} [opts]
 */
export function runCase(c, opts = {}) {
  const opsetId = opts.opset || c.opset || "mark2";
  if (!c.given && !c.run) {
    return { ok: false, id: c.id, problems: ["no given/run"] };
  }

  const { f, api, byLabel } = c.given
    ? buildGiven(c.given, { opsetId })
    : buildGiven("Mon1(H(A,B))", { opsetId });
  ensureMark2Decisions(f);

  const ctx = makeCtx(f, api, byLabel);
  const before = serializeForest(f, api);

  /** @type {any} */
  let last = { ok: true };
  /** @type {string[]} */
  const problems = [];

  try {
    if (c.run) {
      const extra = c.run(ctx);
      if (typeof extra === "string" && extra) problems.push(extra);
    }
  } catch (err) {
    problems.push(`run threw: ${err && err.message ? err.message : err}`);
  }

  const actionList = c.byOpSet && c.byOpSet[opsetId] ? c.byOpSet[opsetId] : c.actions || [];

  if (actionList.length) {
    try {
      const steps = parseActions(actionList);
      for (const step of steps) {
        last = runStep(f, api, byLabel, opsetId, step);
        if (!last?.ok) break;
      }
    } catch (err) {
      last = { ok: false, reason: err && err.message ? err.message : String(err) };
    }
  }

  const after = serializeForest(f, api);
  const got = normalizeTreeStr(after);
  const want = c.expect != null ? normalizeTreeStr(c.expect) : null;

  if (c.expectOk === false) {
    if (last?.ok) problems.push("expected op to fail");
  } else if (actionList.length && !last?.ok) {
    problems.push(`op failed: ${last?.reason || "?"}`);
  }

  if (want != null && got !== want) {
    problems.push(`tree got ${got} want ${want}`);
  }

  if (
    c.expectMode != null &&
    last?.ok &&
    (last.op === "Move" || last.op === "Join" || last.op === "Launch")
  ) {
    const mode = String(last.mode || "");
    const okMode =
      typeof c.expectMode === "string" ? mode === c.expectMode : c.expectMode.test(mode);
    if (!okMode) problems.push(`mode got ${mode} want ${c.expectMode}`);
  }

  if (c.check) {
    const extra = c.check(ctx);
    if (typeof extra === "string" && extra) problems.push(extra);
  }

  return {
    ok: problems.length === 0,
    id: c.id,
    layer: c.layer,
    before,
    after: got,
    expect: want,
    mode: last?.mode,
    result: last,
    problems,
    actions: actionList.join("; "),
  };
}

/**
 * @param {Forest} f
 * @param {TomApi} api
 * @param {Record<string, Node>} byLabel
 * @returns {Ctx}
 */
export function makeCtx(f, api, byLabel) {
  return {
    f,
    api,
    byLabel,
    win(label) {
      for (const n of Object.values(f.nodes)) {
        if (n.kind === "WINDOW" && n.label === label) return n;
      }
      throw new Error(`no window ${label}`);
    },
    parent(n) {
      return api.parent(f, n);
    },
    children(n) {
      return api.children(f, n);
    },
  };
}
