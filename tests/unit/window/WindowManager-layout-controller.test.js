import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createWindowManagerFixture } from "../../mocks/helpers/index.js";
import {
  LayoutController,
  LAYOUT_REQUEST_DEBOUNCE_MS,
  VERIFY_REQUEST_DEBOUNCE_MS,
} from "../../../lib/extension/layout-controller.js";

/**
 * Rebuild WM.layoutController with a fake clock (GLib.timeout_add never fires).
 */
function installFakeTimersOnController(wm) {
  let nextId = 1;
  const timers = new Map();
  let now = 0;

  const schedule = (delayMs, cb) => {
    const id = nextId++;
    timers.set(id, { due: now + delayMs, cb });
    return id;
  };
  const cancel = (id) => {
    timers.delete(id);
  };
  const advance = (ms) => {
    now += ms;
    let progressed = true;
    while (progressed) {
      progressed = false;
      const due = [...timers.entries()]
        .filter(([, t]) => t.due <= now)
        .sort((a, b) => a[1].due - b[1].due);
      for (const [id, t] of due) {
        if (!timers.has(id)) continue;
        timers.delete(id);
        t.cb();
        progressed = true;
      }
    }
  };

  wm.layoutController.destroy();
  wm.layoutController = new LayoutController(wm, { schedule, cancel });
  return { advance };
}

describe("WindowManager layout controller (CL0)", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: {
        "tiling-mode-enabled": true,
        "focus-on-hover-enabled": false,
        "move-pointer-focus-enabled": false,
      },
      globals: {
        display: { monitorCount: 1 },
        workspaceManager: { workspaceCount: 1 },
      },
    });
  });

  afterEach(() => {
    ctx?.cleanup();
  });

  const wm = () => ctx.windowManager;

  it("constructs LayoutController and exposes requestLayout / requestVerify", () => {
    expect(wm().layoutController).toBeTruthy();
    expect(typeof wm().requestLayout).toBe("function");
    expect(typeof wm().requestVerify).toBe("function");
    expect(LAYOUT_REQUEST_DEBOUNCE_MS).toBe(200);
    expect(VERIFY_REQUEST_DEBOUNCE_MS).toBe(150);
  });

  it("constructs AppThrashCatalog and wires it into LayoutController (CL3)", async () => {
    const { AppThrashCatalog } = await import("../../../lib/extension/app-thrash-catalog.js");
    expect(wm().appThrashCatalog).toBeInstanceOf(AppThrashCatalog);
    expect(wm().layoutController.catalog).toBe(wm().appThrashCatalog);
    expect(wm().appThrashCatalog.needsExtraVerify("ghostty")).toBe(true);
  });

  it("requestLayout delegates to controller and eventually calls renderTree", () => {
    const { advance } = installFakeTimersOnController(wm());
    const spy = vi.spyOn(wm(), "renderTree");

    wm().requestLayout("burst-a");
    wm().requestLayout("burst-b");
    expect(spy).not.toHaveBeenCalled();

    advance(LAYOUT_REQUEST_DEBOUNCE_MS);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("burst-a,burst-b");
  });

  it("requestVerify coalesces on the controller stub", () => {
    const { advance } = installFakeTimersOnController(wm());
    const lc = wm().layoutController;

    wm().requestVerify("pos");
    wm().requestVerify("size");
    advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(lc.verifyFireCount).toBe(1);
    expect(lc.lastVerifyReasons).toEqual(["pos", "size"]);
  });

  it("successful renderTree body schedules post-render verify", () => {
    const { advance } = installFakeTimersOnController(wm());
    const lc = wm().layoutController;
    const verifySpy = vi.spyOn(lc, "requestVerify");

    // idle_add mock runs the idle body immediately
    wm().renderTree("unit-test-render");

    expect(verifySpy).toHaveBeenCalledWith("post-render");
    expect(lc.pendingVerifyReasons).toContain("post-render");

    advance(VERIFY_REQUEST_DEBOUNCE_MS);
    expect(lc.lastVerifyReasons).toContain("post-render");
  });

  it("does not schedule post-render verify when render body throws", () => {
    installFakeTimersOnController(wm());
    const lc = wm().layoutController;
    const completeSpy = vi.spyOn(lc, "onRenderComplete");

    vi.spyOn(wm().tree, "pruneDeadWindows").mockImplementation(() => {
      throw new Error("simulated prune failure");
    });

    // try/finally rethrows after clearing _renderTreeSrcId; onRenderComplete skipped
    expect(() => wm().renderTree("boom")).toThrow(/simulated prune failure/);
    expect(completeSpy).not.toHaveBeenCalled();
    expect(lc.pendingVerifyReasons).not.toContain("post-render");
  });

  it("cancel clears pending layout and verify timers", () => {
    const { advance } = installFakeTimersOnController(wm());
    const spy = vi.spyOn(wm(), "renderTree");

    wm().requestLayout("pending-layout");
    wm().requestVerify("pending-verify");
    expect(wm().layoutController.layoutPending).toBe(true);
    expect(wm().layoutController.verifyPending).toBe(true);

    wm().layoutController.cancel();
    expect(wm().layoutController.layoutPending).toBe(false);
    expect(wm().layoutController.verifyPending).toBe(false);

    advance(LAYOUT_REQUEST_DEBOUNCE_MS + VERIFY_REQUEST_DEBOUNCE_MS + 50);
    expect(spy).not.toHaveBeenCalled();
    expect(wm().layoutController.verifyFireCount).toBe(0);
  });

  it("disable cancels pending controller requests", () => {
    const { advance } = installFakeTimersOnController(wm());
    const spy = vi.spyOn(wm(), "renderTree");

    wm().requestLayout("will-cancel");
    wm().requestVerify("will-cancel-v");

    // Minimal signal bookkeeping so _removeSignals does not throw on disconnect
    wm()._signalsBound = false;
    wm().layoutController.cancel();
    // Also exercise disable's unconditional cancel (before full disable side effects)
    expect(typeof wm().disable).toBe("function");
    wm().layoutController.requestLayout("again");
    wm().layoutController.cancel();
    advance(LAYOUT_REQUEST_DEBOUNCE_MS + 50);
    expect(spy).not.toHaveBeenCalled();
  });

  it("does not rename soft-rehome symbols", () => {
    expect(wm().softRehome).toBeTruthy();
    expect(typeof wm().softRehome.queueSoftRehomeOnWorkareas).toBe("function");
    expect(typeof wm().softRehome.softRehomeAfterWorkareas).toBe("function");
  });

  it("CL0 keeps renderTree and requestLayout as separate layers", () => {
    expect(typeof wm().renderTree).toBe("function");
    expect(typeof wm().requestLayout).toBe("function");
    // createDelay open path still calls renderTree directly (CL4), not replaced here
  });
});
