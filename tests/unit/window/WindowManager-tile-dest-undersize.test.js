import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WINDOW_MODES } from "../../../lib/extension/window-modes.js";
import { clearClassMinFloorForTests } from "../../../lib/extension/tree-layout.js";
import { TILE_DEST_UNDERSIZE_RETRIES } from "../../../lib/extension/geom-epsilon.js";
import { Rectangle } from "../../mocks/gnome/Meta.js";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createWindowNode,
} from "../../mocks/helpers/index.js";

/**
 * R062: TILE dest is Forest slot AABB. A stuck map-size frame must not
 * become a learned min that blocks present of the commanded dest.
 */
describe("R062 TILE dest undersize", () => {
  let ctx;

  beforeEach(() => {
    clearClassMinFloorForTests();
    ctx = createWindowManagerFixture({
      globals: { display: { monitorCount: 1 } },
    });
  });

  afterEach(() => {
    ctx.cleanup();
    clearClassMinFloorForTests();
    vi.restoreAllMocks();
  });

  const wm = () => ctx.windowManager;

  const SLOT = { x: 42, y: 32, width: 1878, height: 1048 };
  const MAP = { x: 0, y: 0, width: 700, height: 651 };

  function tileMapSized() {
    const mon = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
    const { nodeWindow, metaWindow } = createWindowNode(ctx.tree, mon, {
      mode: "TILE",
      windowOverrides: {
        workspace: ctx.workspaces[0],
        monitor: 0,
        id: "map-stuck",
        rect: new Rectangle(MAP),
        size_hints: { min_width: 700, min_height: 651 },
        allows_resize: false,
      },
    });
    nodeWindow.rect = { ...MAP };
    nodeWindow.renderRect = { ...MAP };
    nodeWindow.mode = WINDOW_MODES.TILE;
    const writes = [];
    metaWindow.move_resize_frame = (_interactive, x, y, width, height) => {
      writes.push({ x, y, width, height });
      metaWindow._rect = new Rectangle(MAP);
    };
    return { node: nodeWindow, meta: metaWindow, writes };
  }

  function pendingCbs() {
    /** @type {Map<string, () => void>} */
    const cbs = new Map();
    const orig = wm()._wmSources.set.bind(wm()._wmSources);
    vi.spyOn(wm()._wmSources, "set").mockImplementation((name, delay, cb) => {
      cbs.set(String(name), cb);
      return orig(name, delay, cb);
    });
    return {
      names: () => [...cbs.keys()],
      fire(prefix) {
        let n = 0;
        for (const [name, cb] of [...cbs.entries()]) {
          if (!String(name).startsWith(prefix)) continue;
          cbs.delete(name);
          wm()._wmSources.cancel(name);
          cb();
          n += 1;
        }
        return n;
      },
    };
  }

  it("min-clamp-learn does not record map size as min when dest is the slot", () => {
    const { meta, writes } = tileMapSized();
    const bag = pendingCbs();
    wm().move(meta, SLOT);
    expect(writes.some((w) => w.width === SLOT.width && w.height === SLOT.height)).toBe(true);
    expect(meta.get_frame_rect()).toMatchObject(MAP);

    expect(bag.fire("minClampLearn:")).toBe(1);
    expect(meta._forgeKnownMinW).not.toBe(MAP.width);
    expect(meta._forgeKnownMinH).not.toBe(MAP.height);
    expect(meta.get_frame_rect()).toMatchObject(MAP);
  });

  it("stale tiny slot + undersize command still does not learn map size", () => {
    const { node, meta } = tileMapSized();
    node.rect = { x: 0, y: 0, width: 100, height: 100 };
    node.renderRect = { ...node.rect };
    const bag = pendingCbs();
    wm().move(meta, SLOT);
    expect(bag.fire("minClampLearn:")).toBe(1);
    expect(meta._forgeKnownMinW).not.toBe(MAP.width);
    expect(meta._forgeKnownMinH).not.toBe(MAP.height);
  });

  it("post-write settle re-issues the slot dest without force", () => {
    const { meta, writes } = tileMapSized();
    const bag = pendingCbs();
    const moveSpy = vi.spyOn(wm(), "move");
    wm().move(meta, SLOT);
    expect(bag.fire("geomEpsilon:")).toBe(1);
    const retryName = bag.names().find((n) => String(n).startsWith("geomUndersizeRetry:"));
    expect(retryName).toBeTruthy();
    writes.length = 0;
    moveSpy.mockClear();
    expect(bag.fire("geomUndersizeRetry:")).toBe(1);
    expect(moveSpy).toHaveBeenCalled();
    const dest = moveSpy.mock.calls[0][1];
    expect(dest.width).toBe(SLOT.width);
    expect(dest.height).toBe(SLOT.height);
    const opts = moveSpy.mock.calls[0][3] || {};
    expect(opts.force).not.toBe(true);
    expect(writes.some((w) => w.width === SLOT.width && w.height === SLOT.height)).toBe(true);
  });

  it("caps same-dest undersize retries", () => {
    const { meta } = tileMapSized();
    const bag = pendingCbs();
    wm().move(meta, SLOT);
    let retries = 0;
    for (let i = 0; i < TILE_DEST_UNDERSIZE_RETRIES + 2; i++) {
      bag.fire("geomEpsilon:");
      if (bag.fire("geomUndersizeRetry:") > 0) retries += 1;
    }
    expect(retries).toBe(TILE_DEST_UNDERSIZE_RETRIES);
  });
});
