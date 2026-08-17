import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LAYOUT_TYPES, NODE_TYPES } from "../../lib/extension/tree.js";
import { SessionApi } from "../../lib/extension/session-api.js";
import { WINDOW_MODES } from "../../lib/extension/window.js";
import {
  normalizeProfile,
  planReconcile,
  planActionsToSteps,
} from "../../lib/shared/layout-plan.js";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createMockWindow,
} from "../mocks/helpers/index.js";
import { Bin } from "../mocks/gnome/St.js";

/**
 * R037: saved layout `share` must survive ApplyLayout size → post-size mon unwrap.
 *
 * Green host: mon0 hsplit tab|ghostty with share [0.687, 0.313]. Plan emitted
 * ensure_sizes; size set percents; unwrapMonDegenerate then resetSiblingPercent
 * on every mon child and equalized the desk.
 */
describe("R037 layout share survives post-size mon unwrap", () => {
  /** Green-like sugar (hosts/green/dev.json). */
  const GREEN_DEV_SUGAR = {
    tiles: {
      mon0: {
        hsplit: [{ tab: ["google-chrome", "Grok"], active: "Grok" }, "ghostty"],
        share: [0.687, 0.313],
      },
    },
    focus: "ghostty",
  };

  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      globals: { display: { monitorCount: 1 } },
      settings: {
        "tiling-mode-enabled": true,
        "tabbed-tiling-mode-enabled": true,
        "stacked-tiling-mode-enabled": true,
      },
    });
  });

  afterEach(() => {
    ctx.cleanup();
  });

  function api() {
    return new SessionApi({
      extWm: ctx.windowManager,
      settings: ctx.settings,
    });
  }

  function wm() {
    return ctx.windowManager;
  }

  function mon0Forest(chromeId, grokId, ghostId, { equal = true } = {}) {
    const bagPct = equal ? 0 : 0.687;
    const ghostPct = equal ? 0 : 0.313;
    return {
      apiVersion: 1,
      monitors: [
        {
          nodeType: "MONITOR",
          layout: "HSPLIT",
          id: "mo0ws0",
          stableKey: "geom:0,0,1920,1080#primary",
          rect: { x: 42, y: 32, width: 1878, height: 1048 },
          percent: 0,
          userSized: false,
          children: [
            {
              nodeType: "CON",
              layout: "TABBED",
              percent: bagPct,
              userSized: !equal,
              lastTabFocusId: grokId,
              children: [
                {
                  nodeType: "WINDOW",
                  windowId: chromeId,
                  wmClass: "Google-chrome",
                  title: "New Tab - Google Chrome",
                  mode: "TILE",
                  monitor: 0,
                  percent: 0,
                  userSized: false,
                  children: [],
                  rect: { x: 42, y: 32, width: equal ? 939 : 1290, height: 1048 },
                },
                {
                  nodeType: "WINDOW",
                  windowId: grokId,
                  wmClass: "Google-chrome",
                  title: "Grok",
                  mode: "TILE",
                  monitor: 0,
                  percent: 0,
                  userSized: false,
                  children: [],
                  rect: { x: 42, y: 32, width: equal ? 939 : 1290, height: 1048 },
                },
              ],
            },
            {
              nodeType: "WINDOW",
              windowId: ghostId,
              wmClass: "com.mitchellh.ghostty",
              title: "Ghostty",
              mode: "TILE",
              monitor: 0,
              percent: ghostPct,
              userSized: !equal,
              children: [],
              rect: { x: equal ? 981 : 1332, y: 32, width: equal ? 939 : 588, height: 1048 },
            },
          ],
        },
      ],
    };
  }

  it("normalize keeps mon0 share from green sugar", () => {
    const prof = normalizeProfile(structuredClone(GREEN_DEV_SUGAR));
    expect(prof.layout.mon0.share).toEqual([0.687, 0.313]);
    expect(prof.layout.mon0.children).toHaveLength(2);
  });

  it("planReconcile emits ensure_sizes with profile shares when mon equal", () => {
    const prof = normalizeProfile(structuredClone(GREEN_DEV_SUGAR));
    const forest = mon0Forest(100, 101, 102, { equal: true });
    const plan = planReconcile(prof, forest, { workspace: 0 });
    expect(plan.ok).not.toBe(false);

    const sizeActs = (plan.actions || []).filter(
      (a) => String(a.op || "").toLowerCase() === "ensure_sizes"
    );
    expect(sizeActs.length).toBeGreaterThanOrEqual(1);
    const monSize = sizeActs.find((a) => String(a.slot || "") === "mon0") || sizeActs[0];
    expect(monSize.shares[0]).toBeCloseTo(0.687, 3);
    expect(monSize.shares[1]).toBeCloseTo(0.313, 3);
    expect(monSize.windowIds).toHaveLength(2);

    const steps = planActionsToSteps(plan.actions, { workspace: 0 });
    const sizeSteps = steps.filter((s) => s.op === "size");
    expect(sizeSteps).toHaveLength(1);
    expect(sizeSteps[0].shares[0]).toBeCloseTo(0.687, 3);
    expect(sizeSteps[0].shares[1]).toBeCloseTo(0.313, 3);
  });

  it("size then unwrapMonDegenerate keeps mon-level shares (ApplyLayout order)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    monitor.rect = { x: 42, y: 32, width: 1878, height: 1048 };

    const bag = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    bag.layout = LAYOUT_TYPES.TABBED;
    const chrome = createMockWindow({ id: 100, wm_class: "Google-chrome" });
    const grok = createMockWindow({ id: 101, wm_class: "Google-chrome" });
    const ghost = createMockWindow({ id: 102, wm_class: "com.mitchellh.ghostty" });
    const nChrome = wm().tree.createNode(bag.nodeValue, NODE_TYPES.WINDOW, chrome);
    const nGrok = wm().tree.createNode(bag.nodeValue, NODE_TYPES.WINDOW, grok);
    const nGhost = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, ghost);
    nChrome.mode = WINDOW_MODES.TILE;
    nGrok.mode = WINDOW_MODES.TILE;
    nGhost.mode = WINDOW_MODES.TILE;

    const prof = normalizeProfile(structuredClone(GREEN_DEV_SUGAR));
    const plan = planReconcile(prof, mon0Forest(100, 101, 102, { equal: true }), {
      workspace: 0,
    });
    const steps = planActionsToSteps(plan.actions, { workspace: 0 });
    const sizeStep = steps.find((s) => s.op === "size");
    expect(sizeStep).toBeTruthy();

    const sized = api()._sizeOp(sizeStep.windowIds, sizeStep.shares, { quiet: true });
    expect(sized.ok).toBe(true);
    expect(bag.percent).toBeCloseTo(0.687, 3);
    expect(nGhost.percent).toBeCloseTo(0.313, 3);
    expect(bag.userSized).toBe(true);
    expect(nGhost.userSized).toBe(true);

    // ApplyLayout calls this after the size phase — must not equalize.
    const unwrap = api()._unwrapMonDirectSingleChildSplits();
    expect(unwrap.unwrapped).toBe(0);
    expect(bag.percent).toBeCloseTo(0.687, 3);
    expect(nGhost.percent).toBeCloseTo(0.313, 3);
    expect(bag.userSized).toBe(true);
    expect(nGhost.userSized).toBe(true);
  });

  it("unwrap of mon-direct 1-child H/V transfers wrapper share (sibling intact)", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    monitor.layout = LAYOUT_TYPES.HSPLIT;

    const bag = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    bag.layout = LAYOUT_TYPES.TABBED;
    bag.percent = 0.687;
    bag.userSized = true;
    const chrome = createMockWindow({ id: 200, wm_class: "Google-chrome" });
    const nChrome = wm().tree.createNode(bag.nodeValue, NODE_TYPES.WINDOW, chrome);
    nChrome.mode = WINDOW_MODES.TILE;

    const wrap = wm().tree.createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    wrap.layout = LAYOUT_TYPES.VSPLIT;
    wrap.percent = 0.313;
    wrap.userSized = true;
    const ghost = createMockWindow({ id: 201, wm_class: "com.mitchellh.ghostty" });
    const nGhost = wm().tree.createNode(wrap.nodeValue, NODE_TYPES.WINDOW, ghost);
    nGhost.mode = WINDOW_MODES.TILE;

    const unwrap = api()._unwrapMonDirectSingleChildSplits();
    expect(unwrap.unwrapped).toBe(1);
    expect(nGhost.parentNode).toBe(monitor);
    expect(bag.percent).toBeCloseTo(0.687, 3);
    expect(bag.userSized).toBe(true);
    expect(nGhost.percent).toBeCloseTo(0.313, 3);
    expect(nGhost.userSized).toBe(true);
  });
});
