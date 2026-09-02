import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NODE_TYPES } from "../../lib/extension/tree.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  parentOf,
  kidsOf,
} from "../mocks/helpers/index.js";
import { seedLiveForest } from "../../lib/extension/tom-live.js";

/**
 * R030: Grok/Ghostty can exist as Meta windows but miss the tree (dest attach
 * drop, missed window-created). Second `layout dev` then launches again.
 * User contract: admit puts them in the tree so the next plan can reuse.
 */
describe("R030: untracked maps are admitted", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture();
  });

  afterEach(() => {
    ctx.cleanup();
  });

  const wm = () => ctx.windowManager;

  it("admits a valid Meta window that is not in the tree", () => {
    const grok = createMockWindow({
      id: 4401,
      wm_class: "Google-chrome",
      title: "Grok",
    });
    Object.defineProperty(wm(), "windowsAllWorkspaces", {
      configurable: true,
      get: () => [grok],
    });

    expect(ctx.tree.findNode(grok)).toBeFalsy();
    const out = wm().admitUntrackedWindows();
    expect(out.ok).toBe(true);
    expect(out.admitted).toBeGreaterThanOrEqual(1);
    expect(ctx.tree.findNode(grok)?.isWindow?.()).toBe(true);
  });

  it("trackWindow still attaches when planned dest mon-ws is missing", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const ghost = createMockWindow({
      id: 4402,
      wm_class: "com.mitchellh.ghostty",
      title: "Ghostty",
      monitor: 0,
    });
    wm()._planOpenAppPlacement = () => ({
      homeMonitor: 99,
      isDock: false,
      isEmptyHead: false,
      attachLft: null,
      attachMode: "mon-root",
    });

    const before = kidsOf(wm(), monitor).filter((n) => n?.isWindow?.()).length;
    wm().trackWindow(null, ghost);
    if (wm()._liveForestSeeded) seedLiveForest(wm());
    const node = ctx.tree.findNode(ghost);
    expect(node?.isWindow?.()).toBe(true);
    expect(parentOf(wm(), node)).toBe(monitor);
    expect(kidsOf(wm(), monitor).filter((n) => n?.isWindow?.()).length).toBe(before + 1);
  });

  it("census lists untracked Meta windows separately from tree windows", () => {
    const tracked = createMockWindow({ id: 1, wm_class: "A", title: "in-tree" });
    const stray = createMockWindow({ id: 2, wm_class: "B", title: "stray" });
    const { monitor } = getWorkspaceAndMonitor(ctx);
    ctx.tree.createNode(monitor.nodeValue, NODE_TYPES.WINDOW, tracked);
    if (wm()._liveForestSeeded) seedLiveForest(wm());
    Object.defineProperty(wm(), "windowsAllWorkspaces", {
      configurable: true,
      get: () => [tracked, stray],
    });

    const rows = wm().censusMetaWindows();
    const byId = Object.fromEntries(rows.map((r) => [String(r.windowId), r]));
    expect(byId["1"].tracked).toBe(true);
    expect(byId["2"].tracked).toBe(false);
    expect(byId["2"].skip).toBeFalsy();
  });
});
