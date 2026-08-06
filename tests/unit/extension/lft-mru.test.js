import { describe, it, expect, beforeEach } from "vitest";
import {
  LftMru,
  aspectOrientationFromRect,
  isTabOrStackParent,
  shouldTabInsteadOfSplit,
  resolveOpenAppPlacement,
  matchPendingDockLaunch,
  normalizeDockAppId,
  DOCK_LAUNCH_TTL_MS,
} from "../../../lib/extension/lft-mru.js";

describe("LftMru", () => {
  /** @type {LftMru} */
  let mru;
  const a = { id: "a" };
  const b = { id: "b" };
  const c = { id: "c" };
  const floaty = { id: "float" }; // never touched → never enters

  beforeEach(() => {
    mru = new LftMru();
  });

  it("touch moves node to front of global and mon rings", () => {
    mru.touch(a, 0);
    mru.touch(b, 0);
    mru.touch(c, 1);

    expect(mru.globalHead()).toBe(c);
    expect(mru.globalOrder()).toEqual([c, b, a]);
    expect(mru.monHead(0)).toBe(b);
    expect(mru.monOrder(0)).toEqual([b, a]);
    expect(mru.monHead(1)).toBe(c);
  });

  it("re-touch of existing node reorders without duplicates", () => {
    mru.touch(a, 0);
    mru.touch(b, 0);
    mru.touch(a, 0);

    expect(mru.globalOrder()).toEqual([a, b]);
    expect(mru.monOrder(0)).toEqual([a, b]);
  });

  it("remove drops from global and mon rings", () => {
    mru.touch(a, 0);
    mru.touch(b, 1);
    mru.remove(a);

    expect(mru.globalHead()).toBe(b);
    expect(mru.monHead(0)).toBeNull();
    expect(mru.monHead(1)).toBe(b);
  });

  it("floats never enter unless touch is called (caller discipline)", () => {
    mru.touch(a, 0);
    // floaty never touched
    expect(mru.globalOrder()).not.toContain(floaty);
    expect(mru.monOrder(0)).not.toContain(floaty);
  });

  it("touch rehomes mon membership when monitor changes", () => {
    mru.touch(a, 0);
    mru.touch(a, 1);

    expect(mru.monOrder(0)).toEqual([]);
    expect(mru.monHead(1)).toBe(a);
    expect(mru.globalHead()).toBe(a);
  });

  it("dropMonRings keeps global membership", () => {
    mru.touch(a, 0);
    mru.dropMonRings(a);
    expect(mru.globalHead()).toBe(a);
    expect(mru.monHead(0)).toBeNull();
  });
});

describe("aspectOrientationFromRect", () => {
  it("taller than wide → vertical (VSPLIT)", () => {
    expect(aspectOrientationFromRect({ width: 400, height: 800 })).toBe("vertical");
  });

  it("wider or square → horizontal (HSPLIT)", () => {
    expect(aspectOrientationFromRect({ width: 800, height: 400 })).toBe("horizontal");
    expect(aspectOrientationFromRect({ width: 500, height: 500 })).toBe("horizontal");
  });

  it("null rect defaults to horizontal", () => {
    expect(aspectOrientationFromRect(null)).toBe("horizontal");
  });
});

describe("isTabOrStackParent", () => {
  const LT = { TABBED: "TABBED", STACKED: "STACKED", HSPLIT: "HSPLIT" };

  it("true for TABBED/STACKED", () => {
    expect(isTabOrStackParent({ layout: "TABBED" }, LT)).toBe(true);
    expect(isTabOrStackParent({ layout: "STACKED" }, LT)).toBe(true);
  });

  it("false for splits / missing", () => {
    expect(isTabOrStackParent({ layout: "HSPLIT" }, LT)).toBe(false);
    expect(isTabOrStackParent(null, LT)).toBe(false);
  });
});

describe("shouldTabInsteadOfSplit", () => {
  // wa min 1080 → 12% floor = 129; minEdge 320 → base threshold 320
  const base = {
    workareaMinEdge: 1080,
    minEdgePx: 320,
    appMinW: 0,
    appMinH: 0,
    enabled: true,
  };

  it("disabled always false even when panes would be tiny", () => {
    expect(
      shouldTabInsteadOfSplit({
        ...base,
        enabled: false,
        lftWidth: 400,
        lftHeight: 600,
        orientation: "horizontal",
      })
    ).toBe(false);
  });

  it("HSPLIT: half width below min-edge → tab", () => {
    // halfW = 250 < 320
    expect(
      shouldTabInsteadOfSplit({
        ...base,
        lftWidth: 500,
        lftHeight: 800,
        orientation: "horizontal",
      })
    ).toBe(true);
  });

  it("HSPLIT: both half edges above threshold → split", () => {
    // halfW = 600 >= 320, halfH = 800 >= 320
    expect(
      shouldTabInsteadOfSplit({
        ...base,
        lftWidth: 1200,
        lftHeight: 800,
        orientation: "horizontal",
      })
    ).toBe(false);
  });

  it("VSPLIT: half height below min-edge → tab", () => {
    // halfH = 200 < 320
    expect(
      shouldTabInsteadOfSplit({
        ...base,
        lftWidth: 900,
        lftHeight: 400,
        orientation: "vertical",
      })
    ).toBe(true);
  });

  it("VSPLIT: both half edges above threshold → split", () => {
    // halfH = 500 >= 320, halfW = 900 >= 320
    expect(
      shouldTabInsteadOfSplit({
        ...base,
        lftWidth: 900,
        lftHeight: 1000,
        orientation: "vertical",
      })
    ).toBe(false);
  });

  it("12% workarea can raise threshold above min-edge", () => {
    // minEdge 100, wa 2000 → floor(0.12*2000)=240 → thresh 240
    // halfW = 200 < 240
    expect(
      shouldTabInsteadOfSplit({
        enabled: true,
        minEdgePx: 100,
        workareaMinEdge: 2000,
        lftWidth: 400,
        lftHeight: 1000,
        orientation: "horizontal",
        appMinW: 0,
        appMinH: 0,
      })
    ).toBe(true);
  });

  it("app min on axis can force tab when base threshold would allow split", () => {
    // halfW = 500 >= 320 base, but appMinW 600 → threshW 600 → tab
    expect(
      shouldTabInsteadOfSplit({
        ...base,
        lftWidth: 1000,
        lftHeight: 800,
        orientation: "horizontal",
        appMinW: 600,
        appMinH: 0,
      })
    ).toBe(true);
  });

  it("unsplit full edge also checked (height on HSPLIT)", () => {
    // halfW ok, but full H below thresh
    expect(
      shouldTabInsteadOfSplit({
        ...base,
        lftWidth: 1000,
        lftHeight: 200,
        orientation: "horizontal",
      })
    ).toBe(true);
  });
});

describe("resolveOpenAppPlacement", () => {
  const lft0 = { id: "lft0" };
  const lft1 = { id: "lft1" };

  it("dock sticky mon + LFT(m)", () => {
    const r = resolveOpenAppPlacement({
      dockMonitor: 1,
      monLft: lft1,
      globalLft: lft0,
      lftMonitor: 0,
    });
    expect(r.isDock).toBe(true);
    expect(r.homeMonitor).toBe(1);
    expect(r.attachLft).toBe(lft1);
    expect(r.attachMode).toBe("after-lft");
  });

  it("dock with no tiles on mon → mon-root", () => {
    const r = resolveOpenAppPlacement({
      dockMonitor: 1,
      monLft: null,
      globalLft: lft0,
      lftMonitor: 0,
    });
    expect(r.homeMonitor).toBe(1);
    expect(r.attachMode).toBe("mon-root");
    expect(r.attachLft).toBeNull();
  });

  it("dock monLft empty but global LFT on dock mon → after-lft", () => {
    const r = resolveOpenAppPlacement({
      dockMonitor: 1,
      monLft: null,
      globalLft: lft1,
      lftMonitor: 1,
    });
    expect(r.homeMonitor).toBe(1);
    expect(r.attachLft).toBe(lft1);
    expect(r.attachMode).toBe("after-lft");
  });

  it("generic uses global LFT mon not pointer/window mon", () => {
    const r = resolveOpenAppPlacement({
      dockMonitor: -1,
      globalLft: lft0,
      lftMonitor: 1,
      windowMonitor: 0,
      placement: "pointer",
    });
    expect(r.isDock).toBe(false);
    expect(r.homeMonitor).toBe(1);
    expect(r.attachLft).toBe(lft0);
    expect(r.attachMode).toBe("after-lft");
  });

  it("no LFT → mon 0 root", () => {
    const r = resolveOpenAppPlacement({
      dockMonitor: -1,
      globalLft: null,
      lftMonitor: -1,
    });
    expect(r.homeMonitor).toBe(0);
    expect(r.attachMode).toBe("mon-root");
  });

  it("window-actual homes to window mon; attach LFT only if same mon", () => {
    const same = resolveOpenAppPlacement({
      placement: "window-actual",
      windowMonitor: 1,
      globalLft: lft1,
      lftMonitor: 1,
    });
    expect(same.homeMonitor).toBe(1);
    expect(same.attachLft).toBe(lft1);

    const other = resolveOpenAppPlacement({
      placement: "window-actual",
      windowMonitor: 0,
      globalLft: lft1,
      lftMonitor: 1,
    });
    expect(other.homeMonitor).toBe(0);
    expect(other.attachMode).toBe("mon-root");
  });

  it("dock wins over window-actual", () => {
    const r = resolveOpenAppPlacement({
      dockMonitor: 0,
      monLft: lft0,
      placement: "window-actual",
      windowMonitor: 1,
      globalLft: lft1,
      lftMonitor: 1,
    });
    expect(r.isDock).toBe(true);
    expect(r.homeMonitor).toBe(0);
    expect(r.attachLft).toBe(lft0);
  });
});

describe("matchPendingDockLaunch", () => {
  const now = 1_000_000;

  it("matches appId when present", () => {
    const pending = [
      { monitor: 0, appId: "a.desktop", ts: now - 100 },
      { monitor: 1, appId: "b.desktop", ts: now - 50 },
    ];
    const m = matchPendingDockLaunch(pending, { appId: "b.desktop", now });
    expect(m).toEqual({ monitor: 1, index: 1 });
  });

  it("normalizes .desktop suffix (OP2 Ghostty dock id drift)", () => {
    expect(normalizeDockAppId("com.mitchellh.ghostty.desktop")).toBe("com.mitchellh.ghostty");
    expect(normalizeDockAppId("Com.Mitchellh.Ghostty")).toBe("com.mitchellh.ghostty");
    const pending = [{ monitor: 1, appId: "com.mitchellh.ghostty.desktop", ts: now - 20 }];
    // WindowTracker may omit .desktop while Shell.App.get_id includes it.
    const m = matchPendingDockLaunch(pending, {
      appId: "com.mitchellh.ghostty",
      now,
    });
    expect(m).toEqual({ monitor: 1, index: 0 });
  });

  it("ignores expired entries", () => {
    const pending = [{ monitor: 0, appId: "a.desktop", ts: now - DOCK_LAUNCH_TTL_MS - 1 }];
    expect(matchPendingDockLaunch(pending, { appId: "a.desktop", now })).toBeNull();
  });

  it("without appId uses most recent unexpired", () => {
    const pending = [
      { monitor: 0, ts: now - 200 },
      { monitor: 1, ts: now - 10 },
    ];
    expect(matchPendingDockLaunch(pending, { now }).monitor).toBe(1);
  });
});
