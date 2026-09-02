import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NODE_TYPES } from "../../lib/extension/tree.js";
import { createTreeFixture } from "../mocks/helpers/index.js";

/**
 * forge-h6jc: the tree scaffold actors (root bin + per-workspace actorBins +
 * per-monitor actorBins) were added to global.window_group but never removed on
 * disable() or Tree.reload(). reload() recreated a new generation of
 * workspace/monitor bins without removing the old one, so every reload leaked a
 * full set of St.Bins. Tree.destroy() (and reload()'s pre-init teardown) now
 * remove the current generation.
 *
 * G8n: Forest spine may not re-parent every scaffold bin into window_group the
 * same way as classic Tree; assert non-accumulation + destroy cleanup.
 */
describe("forge-h6jc: tree scaffold bin leak", () => {
  let ctx;

  const scaffoldBins = () => {
    const root = ctx.tree.nodeValue;
    const bins = [root];
    for (const ws of ctx.tree.getNodeByType(NODE_TYPES.WORKSPACE)) bins.push(ws.actorBin);
    for (const mon of ctx.tree.getNodeByType(NODE_TYPES.MONITOR)) bins.push(mon.actorBin);
    return bins.filter((bin) => bin && ctx.windowGroup.contains(bin)).length;
  };

  beforeEach(() => {
    ctx = createTreeFixture();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ctx.cleanup();
  });

  it("removes every scaffold bin from window_group on destroy()", () => {
    expect(scaffoldBins()).toBeGreaterThan(0);
    const groupBefore = ctx.windowGroup._children.length;
    const scaffoldCount = scaffoldBins();

    ctx.tree.destroy();

    expect(ctx.windowGroup._children.length).toBe(groupBefore - scaffoldCount);
  });

  it("does not accumulate bins across repeated reload()s", () => {
    const baseline = ctx.windowGroup._children.length;

    ctx.tree.reload();
    const afterFirst = ctx.windowGroup._children.length;

    ctx.tree.reload();
    const afterSecond = ctx.windowGroup._children.length;

    // Must not grow each reload (old leak). Forest spine may leave fewer bins
    // parented than classic Tree; flat or shrinking is OK.
    expect(afterFirst).toBeLessThanOrEqual(baseline);
    expect(afterSecond).toBeLessThanOrEqual(afterFirst);
  });
});
