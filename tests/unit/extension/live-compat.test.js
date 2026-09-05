import { describe, expect, it } from "vitest";
import { ensureLiveListMutators } from "../../../lib/extension/live-compat.js";
import { makeLiveHandle } from "../../../lib/extension/live-handle.js";
import { NODE_TYPES } from "../../../lib/extension/tree-types.js";

describe("ensureLiveListMutators (G8n-s6 NODE_ONLY)", () => {
  it("index / level / nextSibling walk parentNode lists", () => {
    const root = makeLiveHandle(NODE_TYPES.ROOT, "root");
    const a = makeLiveHandle(NODE_TYPES.CON, "a");
    const b = makeLiveHandle(NODE_TYPES.CON, "b");
    ensureLiveListMutators(root);
    ensureLiveListMutators(a);
    ensureLiveListMutators(b);
    root.appendChild(a);
    root.appendChild(b);
    expect(a.index).toBe(0);
    expect(b.index).toBe(1);
    expect(root.level).toBe(0);
    expect(a.level).toBe(1);
    expect(a.nextSibling).toBe(b);
    expect(b.previousSibling).toBe(a);
    expect(b.nextSibling).toBeNull();
  });

  it("windowActor reads _actor (G8n-s6 NODE_ONLY skip on ROOT)", () => {
    const win = makeLiveHandle(NODE_TYPES.WINDOW, "w");
    ensureLiveListMutators(win);
    win._actor = { id: "actor" };
    expect(win.windowActor).toEqual({ id: "actor" });
    expect(win.actor).toEqual({ id: "actor" });
  });
});
