import { describe, it, expect } from "vitest";
import {
  allowsResizeForFloatPolicy,
  floatExemptReasonFromFlags,
  formatFloatFlagTags,
  processFloatDecisionFromFlags,
} from "../../../lib/shared/float-reason.js";

describe("float-reason", () => {
  it("allowsResizeForFloatPolicy ignores Meta false-while-max/fs", () => {
    expect(allowsResizeForFloatPolicy({ allowsResize: false, maximized: true })).toBe(true);
    expect(allowsResizeForFloatPolicy({ allowsResize: false, fullscreen: true })).toBe(true);
    expect(allowsResizeForFloatPolicy({ allowsResize: false })).toBe(false);
    expect(allowsResizeForFloatPolicy({ allowsResize: true })).toBe(true);
  });

  it("floatExemptReasonFromFlags tags dialog / null-class / no-resize", () => {
    expect(floatExemptReasonFromFlags({ windowType: "dialog" })).toBe("type-dialog");
    expect(floatExemptReasonFromFlags({ wmClassNull: true })).toBe("null-class");
    expect(
      floatExemptReasonFromFlags({
        windowType: "normal",
        allowsResize: false,
      })
    ).toBe("no-resize");
  });

  it("specific tile rule beats role float", () => {
    expect(
      floatExemptReasonFromFlags({
        windowType: "dialog",
        hasSpecificTile: true,
      })
    ).toBeNull();
  });

  it("class-only tile leaves ordinary windows tileable", () => {
    expect(
      floatExemptReasonFromFlags({
        windowType: "normal",
        hasClassOnlyTile: true,
        allowsResize: true,
      })
    ).toBeNull();
  });

  it("class-only tile still floats dialogs by role", () => {
    expect(
      floatExemptReasonFromFlags({
        windowType: "dialog",
        hasClassOnlyTile: true,
      })
    ).toBe("type-dialog");
  });

  it("processFloatDecisionFromFlags orders deferred / skip / exempt", () => {
    expect(processFloatDecisionFromFlags({ grabTile: true }).action).toBe("skip");
    expect(processFloatDecisionFromFlags({ deferred: true })).toEqual({
      action: "float",
      reason: "deferred",
    });
    expect(
      processFloatDecisionFromFlags({
        wsTiled: false,
        windowType: "normal",
        allowsResize: true,
      })
    ).toEqual({ action: "float", reason: "ws-skip-tile" });
    expect(
      processFloatDecisionFromFlags({
        windowType: "normal",
        allowsResize: true,
        wsTiled: true,
        monTiled: true,
      })
    ).toEqual({ action: "tile", reason: "tile" });
  });

  it("formatFloatFlagTags is compact", () => {
    const tags = formatFloatFlagTags({
      deferred: true,
      wmClassNull: true,
      allowsResize: false,
      windowType: "normal",
    });
    expect(tags).toContain("deferred");
    expect(tags).toContain("nullClass");
    expect(tags).toContain("noResize");
    expect(tags).toContain("type=normal");
  });
});
