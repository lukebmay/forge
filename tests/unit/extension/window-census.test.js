import { describe, it, expect } from "vitest";
import {
  fallbackMonitorNode,
  resolveTrackDestId,
  summarizeCensus,
  untrackedSkipReason,
} from "../../../lib/extension/window-census.js";

describe("window-census", () => {
  it("skips tracked / invalid / ignored; admits the rest", () => {
    expect(untrackedSkipReason({ tracked: true })).toBe("tracked");
    expect(untrackedSkipReason({ valid: false })).toBe("invalid-type");
    expect(untrackedSkipReason({ ignored: true })).toBe("ignored");
    expect(untrackedSkipReason({ tracked: false, valid: true, ignored: false })).toBeNull();
  });

  it("counts tracked vs untracked", () => {
    expect(
      summarizeCensus([
        { tracked: true },
        { tracked: false },
        { tracked: false, skip: "invalid-type" },
      ])
    ).toEqual({ total: 3, tracked: 1, untracked: 1, skipped: 1 });
  });

  it("picks a monitor node on the requested workspace", () => {
    const mons = [{ nodeValue: "mo0ws1" }, { nodeValue: "mo0ws0" }];
    expect(fallbackMonitorNode(mons, 0).nodeValue).toBe("mo0ws0");
    expect(fallbackMonitorNode(mons, 1).nodeValue).toBe("mo0ws1");
    expect(fallbackMonitorNode([], 0)).toBeNull();
  });

  it("resolves dest id from window monitor when home is missing", () => {
    const dest = resolveTrackDestId({
      homeMonitor: -1,
      windowMonitor: 1,
      activeWorkspace: 0,
    });
    expect(dest).toEqual({ mon: 1, ws: 0, id: "mo1ws0" });
  });
});
