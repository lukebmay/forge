import { describe, it, expect } from "vitest";
import {
  APPLY_EPOCH_DISPLAYS_CHANGED,
  ApplyEpoch,
  cancelErrorForCode,
  isApplyEpochLive,
  policyOnDisplaysChangedDuringApply,
  shouldAllowIdleTileRestore,
} from "../../../lib/extension/layout-apply-epoch.js";

describe("ApplyEpoch", () => {
  it("begin/end toggle live and hold run ref", () => {
    const epoch = new ApplyEpoch();
    expect(epoch.live).toBe(false);
    expect(isApplyEpochLive(epoch)).toBe(false);

    const run = { applyId: "al-1" };
    const entered = epoch.begin(run);
    expect(entered.live).toBe(true);
    expect(epoch.live).toBe(true);
    expect(epoch.run).toBe(run);
    expect(isApplyEpochLive(epoch)).toBe(true);

    const left = epoch.end(run);
    expect(left.live).toBe(false);
    expect(epoch.live).toBe(false);
    expect(epoch.run).toBeNull();
    expect(isApplyEpochLive(epoch)).toBe(false);
  });

  it("isApplyEpochLive false for null/empty", () => {
    expect(isApplyEpochLive(null)).toBe(false);
    expect(isApplyEpochLive(undefined)).toBe(false);
    expect(isApplyEpochLive({})).toBe(false);
  });
});

describe("shouldAllowIdleTileRestore", () => {
  it("allows only when neither apply epoch nor grab", () => {
    expect(shouldAllowIdleTileRestore({})).toBe(true);
    expect(shouldAllowIdleTileRestore({ applyEpochLive: false, grabActive: false })).toBe(true);
    expect(shouldAllowIdleTileRestore({ applyEpochLive: true })).toBe(false);
    expect(shouldAllowIdleTileRestore({ grabActive: true })).toBe(false);
    expect(shouldAllowIdleTileRestore({ applyEpochLive: true, grabActive: true })).toBe(false);
  });
});

describe("policyOnDisplaysChangedDuringApply", () => {
  it("idle: no cancel, no skip H1", () => {
    const epoch = new ApplyEpoch();
    expect(policyOnDisplaysChangedDuringApply(epoch)).toEqual({
      cancelApply: false,
      code: null,
      skipH1: false,
    });
    expect(policyOnDisplaysChangedDuringApply(null)).toEqual({
      cancelApply: false,
      code: null,
      skipH1: false,
    });
  });

  it("live: cancel with displays-changed and skip H1", () => {
    const epoch = new ApplyEpoch();
    epoch.begin({ applyId: "al-x" });
    expect(policyOnDisplaysChangedDuringApply(epoch)).toEqual({
      cancelApply: true,
      code: APPLY_EPOCH_DISPLAYS_CHANGED,
      skipH1: true,
    });
  });
});

describe("cancelErrorForCode", () => {
  it("maps displays-changed and default cancel", () => {
    expect(cancelErrorForCode(APPLY_EPOCH_DISPLAYS_CHANGED)).toBe("displays changed");
    expect(cancelErrorForCode("cancel")).toBe("cancelled");
    expect(cancelErrorForCode(null)).toBe("cancelled");
    expect(cancelErrorForCode("disposed")).toBe("session disposed");
  });
});
