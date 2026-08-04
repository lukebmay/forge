import { describe, it, expect } from "vitest";
import {
  SETTINGS_OVERRIDES,
  shouldApplyOverride,
  overridesGatedBy,
  reconcileAction,
  isBareSuperL,
  desktopLockAccelsForKit,
  desktopLockAccelsForFocusRight,
  DESKTOP_LOCK_SAFE,
  DESKTOP_LOCK_POWER,
} from "../../../lib/shared/gnome-overrides.js";

// Minimal fake exposing only get_boolean, like Forge's Gio.Settings.
const settingsWith = (values) => ({
  get_boolean: (key) => Boolean(values[key]),
});

describe("shouldApplyOverride (forge-9fo, forge-abk)", () => {
  const edgeTiling = SETTINGS_OVERRIDES.find((d) => d.key === "edge-tiling");
  const autoMaximize = SETTINGS_OVERRIDES.find((d) => d.key === "auto-maximize");

  it("models edge-tiling as gated by both disable-edge-tiling and tiling-mode-enabled", () => {
    expect(edgeTiling.gatedBy).toEqual(["disable-edge-tiling", "tiling-mode-enabled"]);
  });

  it("applies an array-gated override only when ALL its Forge settings are true", () => {
    expect(
      shouldApplyOverride(
        edgeTiling,
        settingsWith({ "disable-edge-tiling": true, "tiling-mode-enabled": true })
      )
    ).toBe(true);
  });

  it("skips an array-gated override when ANY of its Forge settings is false", () => {
    expect(
      shouldApplyOverride(
        edgeTiling,
        settingsWith({ "disable-edge-tiling": true, "tiling-mode-enabled": false })
      )
    ).toBe(false);
    expect(
      shouldApplyOverride(
        edgeTiling,
        settingsWith({ "disable-edge-tiling": false, "tiling-mode-enabled": true })
      )
    ).toBe(false);
  });

  it("always applies an ungated override regardless of settings", () => {
    expect(autoMaximize.gatedBy).toBeUndefined();
    expect(shouldApplyOverride(autoMaximize, settingsWith({}))).toBe(true);
  });

  it("leaves every override except edge-tiling ungated", () => {
    const gated = SETTINGS_OVERRIDES.filter((d) => d.gatedBy);
    expect(gated).toEqual([edgeTiling]);
  });

  it("does not hardcode screensaver in static SETTINGS_OVERRIDES (kit-aware)", () => {
    expect(SETTINGS_OVERRIDES.find((d) => d.key === "screensaver")).toBeUndefined();
  });
});

describe("desktop lock chords (KB0)", () => {
  it("isBareSuperL accepts only Super+L", () => {
    expect(isBareSuperL("<Super>l")).toBe(true);
    expect(isBareSuperL("<Super>L")).toBe(true);
    expect(isBareSuperL("<Ctrl><Super>l")).toBe(false);
    expect(isBareSuperL("<Super>Right")).toBe(false);
    expect(isBareSuperL("")).toBe(false);
  });

  it("Safe kit keeps Super+L and adds Super+Delete", () => {
    expect(desktopLockAccelsForKit("safe")).toEqual(DESKTOP_LOCK_SAFE);
    expect(desktopLockAccelsForKit("safe")).toEqual(["<Super>l", "<Super>Delete"]);
  });

  it("Vim and i3 free Super+L (Delete only)", () => {
    expect(desktopLockAccelsForKit("vim")).toEqual(DESKTOP_LOCK_POWER);
    expect(desktopLockAccelsForKit("i3")).toEqual(["<Super>Delete"]);
  });

  it("infers power lock from bare Super+L on focus-right", () => {
    expect(desktopLockAccelsForFocusRight(["<Super>l", "<Super>Right"])).toEqual(
      DESKTOP_LOCK_POWER
    );
    expect(desktopLockAccelsForFocusRight(["<Ctrl><Super>Right"])).toEqual(DESKTOP_LOCK_SAFE);
    expect(desktopLockAccelsForFocusRight([])).toEqual(DESKTOP_LOCK_SAFE);
  });
});

describe("overridesGatedBy (forge-abk)", () => {
  it("returns the edge-tiling override for each of its gating keys", () => {
    expect(overridesGatedBy("tiling-mode-enabled").map((d) => d.key)).toEqual(["edge-tiling"]);
    expect(overridesGatedBy("disable-edge-tiling").map((d) => d.key)).toEqual(["edge-tiling"]);
  });

  it("returns nothing for a setting that gates no override", () => {
    expect(overridesGatedBy("not-a-gating-key")).toEqual([]);
  });
});

describe("reconcileAction (forge-abk)", () => {
  const edgeTiling = SETTINGS_OVERRIDES.find((d) => d.key === "edge-tiling");
  const bothOn = settingsWith({ "disable-edge-tiling": true, "tiling-mode-enabled": true });
  const tilingOff = settingsWith({ "disable-edge-tiling": true, "tiling-mode-enabled": false });

  it("applies when it should be active but is not yet saved", () => {
    expect(reconcileAction(edgeTiling, bothOn, false)).toBe("apply");
  });

  it("restores when it should be inactive but is currently saved", () => {
    expect(reconcileAction(edgeTiling, tilingOff, true)).toBe("restore");
  });

  it("is a no-op when already applied and still should apply", () => {
    expect(reconcileAction(edgeTiling, bothOn, true)).toBe("noop");
  });

  it("is a no-op when already restored and still should not apply", () => {
    expect(reconcileAction(edgeTiling, tilingOff, false)).toBe("noop");
  });
});
