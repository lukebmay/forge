import { describe, expect, it } from "vitest";
import {
  SNAPSHOT_VERSION,
  collectWindowIds,
  isWindowDescriptor,
} from "../../../lib/epochs/index.js";

describe("epochs schema", () => {
  it("WINDOW leaf is windowId, not .window", () => {
    const leaf = { kind: "WINDOW", windowId: "w1", percent: 0.5, userSized: true };
    expect(isWindowDescriptor(leaf)).toBe(true);
    expect(leaf).not.toHaveProperty("window");
    expect(collectWindowIds(leaf)).toEqual(["w1"]);
    expect(SNAPSHOT_VERSION).toBe(1);
  });

  it("isWindowDescriptor accepts kind or windowId", () => {
    expect(isWindowDescriptor({ kind: "WINDOW", windowId: "a" })).toBe(true);
    expect(isWindowDescriptor({ windowId: "a" })).toBe(true);
    expect(isWindowDescriptor({ kind: "CON", layout: "HSPLIT", children: [] })).toBe(false);
    expect(isWindowDescriptor({ layout: "HSPLIT", children: [] })).toBe(false);
    expect(isWindowDescriptor({ window: {} })).toBe(false);
  });

  it("collectWindowIds walks a forest", () => {
    const forest = {
      version: 1,
      monitors: [
        {
          id: "mo0ws0",
          layout: "HSPLIT",
          children: [
            { kind: "WINDOW", windowId: "a", percent: 0, userSized: false },
            {
              kind: "CON",
              layout: "TABBED",
              percent: 0,
              userSized: false,
              children: [
                { kind: "WINDOW", windowId: "b", percent: 0, userSized: false },
                { kind: "WINDOW", windowId: "c", percent: 0, userSized: false },
              ],
            },
          ],
        },
      ],
    };
    expect(collectWindowIds(forest)).toEqual(["a", "b", "c"]);
  });
});
