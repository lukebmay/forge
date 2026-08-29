import { describe, expect, it } from "vitest";
import { runOpAbstract } from "../../../prototypes/container-motion/src/opsets/transact.mjs";
import { cloneForest, createForest, dumpForest, makeIdFactory } from "../../../lib/tom/kernel.js";
import { attachWorld, copyWorld, geomOf, worldOf } from "../../../lib/world/index.js";

const GEOMS = [{ id: "mon0", x: 0, y: 0, width: 1920, height: 1080, primary: true }];

function forest() {
  const ids = makeIdFactory(1);
  return createForest(GEOMS, () => ids.nid());
}

describe("Forest world bag", () => {
  it("createForest nodes have no geom", () => {
    const f = forest();
    for (const n of Object.values(f.nodes)) {
      expect(n).not.toHaveProperty("geom");
    }
    for (const m of f.monitors) {
      expect(m).not.toHaveProperty("geom");
    }
  });

  it("worldOf peels leftover node.geom then deletes it", () => {
    const f = forest();
    const mon = f.monitors[0];
    /** @type {any} */ (mon).geom = {
      id: mon.id,
      x: 10,
      y: 20,
      width: 800,
      height: 600,
      primary: true,
    };
    const w = worldOf(f);
    expect(mon).not.toHaveProperty("geom");
    expect(w.geoms[mon.id].width).toBe(800);
    expect(w.geoms[mon.id].x).toBe(10);
    expect(geomOf(f, mon).height).toBe(600);
  });

  it("dumpForest has no geom on monitors", () => {
    const f = forest();
    /** @type {any} */ (f.monitors[0]).geom = {
      id: "mon0",
      x: 0,
      y: 0,
      width: 800,
      height: 600,
      primary: true,
    };
    const d = dumpForest(f);
    expect(d.monitors[0].geom).toBeUndefined();
    expect(d.nodes[d.monitors[0].id].geom).toBeUndefined();
  });

  it("cloneForest does not copy world; copyWorld does", () => {
    const f = forest();
    attachWorld(f, {
      geoms: {
        mon0: { id: "mon0", x: 0, y: 0, width: 800, height: 600, primary: true },
      },
    });
    expect(geomOf(f, "mon0").width).toBe(800);
    const c = cloneForest(f);
    expect(c.monitors[0]).not.toHaveProperty("geom");
    expect(geomOf(c, c.monitors[0]).width).toBe(1920);
    copyWorld(f, c);
    expect(geomOf(c, c.monitors[0]).width).toBe(800);
    geomOf(c, c.monitors[0]).width = 100;
    expect(geomOf(f, "mon0").width).toBe(800);
  });

  it("runOpAbstract copies world onto the draft and back", () => {
    const f = forest();
    attachWorld(f, {
      geoms: {
        mon0: { id: "mon0", x: 0, y: 0, width: 800, height: 600, primary: true },
      },
    });
    const r = runOpAbstract(f, {}, (draft) => {
      expect(geomOf(draft, draft.monitors[0]).width).toBe(800);
      geomOf(draft, draft.monitors[0]).width = 100;
      return { ok: true, op: "test" };
    });
    expect(r.ok).toBe(true);
    expect(geomOf(f, f.monitors[0]).width).toBe(100);
  });

  it("missing geom defaults to 1920×1080 by monitor index", () => {
    const ids = makeIdFactory(1);
    const f = createForest([{ id: "mon0" }, { id: "mon1" }], () => ids.nid());
    expect(geomOf(f, "mon0")).toMatchObject({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      primary: true,
    });
    expect(geomOf(f, "mon1")).toMatchObject({
      x: 1920,
      y: 0,
      width: 1920,
      height: 1080,
      primary: false,
    });
  });
});
