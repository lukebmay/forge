import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createMockWindow, createWindowManagerFixture } from "../mocks/helpers/index.js";

/**
 * Bug #328 hardening: disconnectSignals() had no guard, so one
 * disposed/finalized target throwing from disconnect() aborted the whole
 * _removeSignals() loop - every remaining window kept its connections and
 * _signalsBound stayed true, producing the "invalid (NULL) pointer instance /
 * g_signal_handler_disconnect assertion" storm on later disable/destroy
 * passes. SignalBag._safeDisconnect and disconnectSignals both swallow
 * per-id throws so cleanup continues.
 */
describe("Bug #328: disconnect on destroyed targets must not abort cleanup", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture();
  });

  afterEach(() => {
    ctx.cleanup();
    vi.restoreAllMocks();
  });

  const wm = () => ctx.windowManager;

  function seedSignalState(windows) {
    wm()._signalsBound = true;
    wm()._wmSignals?.disconnectAll();
    ctx.display.get_tab_list = vi.fn(() => windows);
  }

  it("a disposed window must not abort _removeSignals for remaining windows", () => {
    const metaA = createMockWindow({ workspace: ctx.workspaces[0] });
    const metaB = createMockWindow({ workspace: ctx.workspaces[0] });
    metaA.windowSignals = [101];
    metaB.windowSignals = [102];
    seedSignalState([metaA, metaB]);

    // GJS finalized-wrapper behavior: method exists but throws on invocation.
    vi.spyOn(metaA, "disconnect").mockImplementation(() => {
      throw new Error("Object 0xdead has been already deallocated");
    });
    const disconnectB = vi.spyOn(metaB, "disconnect");

    expect(() => wm()._removeSignals()).not.toThrow();

    expect(disconnectB).toHaveBeenCalledWith(102);
    expect(metaB.windowSignals).toBeUndefined();
    expect(wm()._signalsBound).toBe(false);
  });

  it("a bag-owned target that throws on disconnect does not abort cleanup", () => {
    seedSignalState([]);
    // W5: globals live on SignalBag; dead GObject-style disconnect must not throw out.
    const dead = {
      connect: () => 201,
      disconnect: () => {
        throw new Error("Object 0xdead has been already deallocated");
      },
    };
    wm()._wmSignals.connect(dead, "fake", () => {}, { group: "windowManager" });

    expect(() => wm()._removeSignals()).not.toThrow();
    expect(wm()._signalsBound).toBe(false);
    expect(wm()._wmSignals.size).toBe(0);
  });
});
