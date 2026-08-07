import { describe, it, expect, beforeEach } from "vitest";
import {
  COMMAND_ECHO_RESIDUAL_MS,
  LayoutCommandEpoch,
} from "../../../lib/extension/layout-epoch.js";
import { isForgeCausedGeometrySignal } from "../../../lib/extension/layout-sensors.js";

describe("LayoutCommandEpoch", () => {
  /** @type {number} */
  let now;
  /** @type {LayoutCommandEpoch} */
  let epochs;

  beforeEach(() => {
    now = 1_000_000;
    epochs = new LayoutCommandEpoch({
      now: () => now,
      residualMs: COMMAND_ECHO_RESIDUAL_MS,
    });
  });

  it("exports residual in 250–500ms band", () => {
    expect(COMMAND_ECHO_RESIDUAL_MS).toBeGreaterThanOrEqual(250);
    expect(COMMAND_ECHO_RESIDUAL_MS).toBeLessThanOrEqual(500);
    expect(COMMAND_ECHO_RESIDUAL_MS).toBe(350);
  });

  it("beginWave increments wave id", () => {
    expect(epochs.waveId).toBe(0);
    expect(epochs.beginWave()).toBe(1);
    expect(epochs.beginWave()).toBe(2);
    expect(epochs.waveId).toBe(2);
  });

  it("startEcho records wave/command/until and auto-begins wave if needed", () => {
    const win = { id: 1 };
    const slot = { x: 0, y: 0, width: 100, height: 80 };
    const e = epochs.startEcho(win, { targetRect: slot });
    expect(e).toMatchObject({
      waveId: 1,
      commandId: 1,
      mode: "echo",
      t0: now,
      until: now + COMMAND_ECHO_RESIDUAL_MS,
      targetRect: slot,
    });
    expect(epochs.isEchoActive(win)).toBe(true);
    expect(epochs.getEpoch(win)?.commandId).toBe(1);
  });

  it("startEcho refreshes residual and uses current wave", () => {
    const win = { id: 2 };
    epochs.beginWave();
    epochs.beginWave();
    epochs.startEcho(win);
    now += 100;
    const e2 = epochs.startEcho(win);
    expect(e2.waveId).toBe(2);
    expect(e2.commandId).toBe(2);
    expect(e2.until).toBe(now + COMMAND_ECHO_RESIDUAL_MS);
  });

  it("isEchoActive false after residual expires", () => {
    const win = { id: 3 };
    epochs.startEcho(win);
    expect(epochs.isEchoActive(win)).toBe(true);
    now += COMMAND_ECHO_RESIDUAL_MS - 1;
    expect(epochs.isEchoActive(win)).toBe(true);
    now += 1;
    expect(epochs.isEchoActive(win)).toBe(false);
    now += 500;
    expect(epochs.isEchoActive(win)).toBe(false);
  });

  it("setNow injects clock for tests", () => {
    const win = { id: 4 };
    let t = 50;
    epochs.setNow(() => t);
    epochs.startEcho(win, { residualMs: 10 });
    expect(epochs.isEchoActive(win)).toBe(true);
    t = 60;
    expect(epochs.isEchoActive(win)).toBe(false);
  });

  it("clearEpoch removes active echo", () => {
    const win = { id: 5 };
    epochs.startEcho(win);
    epochs.clearEpoch(win);
    expect(epochs.isEchoActive(win)).toBe(false);
    expect(epochs.getEpoch(win)).toBe(null);
  });
});

describe("isForgeCausedGeometrySignal + echo epoch", () => {
  it("true for stack suppress without epoch", () => {
    expect(isForgeCausedGeometrySignal({ _suppressGeometrySignalRetile: true }, { id: 1 })).toBe(
      true
    );
  });

  it("true for active echo when suppress is off", () => {
    let now = 0;
    const layoutEpoch = new LayoutCommandEpoch({ now: () => now, residualMs: 100 });
    const win = { id: 9 };
    layoutEpoch.startEcho(win);
    const wm = {
      _suppressGeometrySignalRetile: false,
      layoutEpoch,
    };
    expect(isForgeCausedGeometrySignal(wm, win)).toBe(true);
    expect(isForgeCausedGeometrySignal(wm, { id: "other" })).toBe(false);
    now = 100;
    expect(isForgeCausedGeometrySignal(wm, win)).toBe(false);
  });

  it("suppress OR epoch — either is enough", () => {
    let now = 0;
    const layoutEpoch = new LayoutCommandEpoch({ now: () => now, residualMs: 50 });
    const win = { id: 1 };
    const wm = {
      _suppressGeometrySignalRetile: true,
      layoutEpoch,
    };
    expect(isForgeCausedGeometrySignal(wm, win)).toBe(true);
    wm._suppressGeometrySignalRetile = false;
    layoutEpoch.startEcho(win);
    expect(isForgeCausedGeometrySignal(wm, win)).toBe(true);
  });
});
