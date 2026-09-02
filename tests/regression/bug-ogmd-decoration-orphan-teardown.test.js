import { describe, it, expect, beforeEach } from "vitest";
import { LAYOUT_TYPES } from "../../lib/extension/tree.js";
import {
  createTreeFixture,
  getWorkspaceAndMonitor,
  createWindowNode,
  createContainerNode,
} from "../mocks/helpers/index.js";
import { seedLiveForest } from "../../lib/extension/tom-live.js";

/**
 * Bug forge-ogmd: processStacked/processTabbed self-heal nulled decoration on
 * throw without destroying the St.BoxLayout first (orphan strip).
 *
 * Fix: destroyDecoration tears down before nulling; processNode may recreate.
 * Assert orphan destroy ran; do not require decoration===null after recreate.
 */
describe("Bug forge-ogmd: a decoration that throws mid-update is destroyed before recreation", () => {
  let ctx;

  beforeEach(() => {
    ctx = createTreeFixture({
      fullExtWm: true,
      settings: { "tiling-mode-enabled": true, "showtab-decoration-enabled": true },
    });
    ctx.extWm.currentMonWsNode = getWorkspaceAndMonitor(ctx).monitor;
    ctx.extWm.currentWsNode = getWorkspaceAndMonitor(ctx).workspace;
  });

  const drives = (layout) => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const con = createContainerNode(monitor, layout, { x: 0, y: 0, width: 800, height: 600 });
    createWindowNode(ctx.tree, con);
    createWindowNode(ctx.tree, con);
    if (ctx.extWm._liveForestSeeded) seedLiveForest(ctx.extWm);

    ctx.tree.processNode(monitor);
    const deco = con.decoration;
    expect(deco).toBeTruthy();

    let destroyed = 0;
    const realDestroy = deco.destroy.bind(deco);
    deco.destroy = () => {
      destroyed++;
      realDestroy();
    };
    deco.set_size = () => {
      throw new Error("boom: finalized actor");
    };

    expect(() => ctx.tree.processNode(monitor)).not.toThrow();
    return { con, deco, destroyed: () => destroyed };
  };

  it("destroys the orphaned STACKED decoration on a render-time throw", () => {
    const { deco, destroyed } = drives(LAYOUT_TYPES.STACKED);
    expect(destroyed()).toBe(1);
    // Heal may recreate a fresh strip; the orphan must have been destroyed.
    expect(deco._forgeDisposed || destroyed() === 1).toBeTruthy();
  });

  it("destroys the orphaned TABBED decoration on a render-time throw", () => {
    const { deco, destroyed } = drives(LAYOUT_TYPES.TABBED);
    expect(destroyed()).toBe(1);
    expect(deco._forgeDisposed || destroyed() === 1).toBeTruthy();
  });
});
