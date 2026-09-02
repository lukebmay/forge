import { describe, expect, it } from "vitest";
import { createHostBag } from "../../../lib/host/bag.js";

describe("createHostBag", () => {
  it("get returns undefined for missing id", () => {
    const bag = createHostBag();
    expect(bag.get("n1")).toBeUndefined();
    expect(bag.has("n1")).toBe(false);
    expect(bag.size).toBe(0);
  });

  it("set creates and get returns the entry", () => {
    const bag = createHostBag();
    const meta = { id: 42 };
    const entry = bag.set("n1", { meta, windowId: "42" });
    expect(entry.meta).toBe(meta);
    expect(entry.windowId).toBe("42");
    expect(bag.get("n1")).toBe(entry);
    expect(bag.has("n1")).toBe(true);
    expect(bag.size).toBe(1);
  });

  it("set merges shallowly into an existing entry", () => {
    const bag = createHostBag();
    const meta = { id: 1 };
    const actor = { name: "a" };
    bag.set("n1", { meta, windowId: "1" });
    const merged = bag.set("n1", { actor });
    expect(merged.meta).toBe(meta);
    expect(merged.windowId).toBe("1");
    expect(merged.actor).toBe(actor);
    expect(bag.get("n1")).toBe(merged);
    expect(bag.size).toBe(1);
  });

  it("set replaces fields when partial overrides them", () => {
    const bag = createHostBag();
    const m1 = { id: 1 };
    const m2 = { id: 2 };
    bag.set("n1", { meta: m1, windowId: "1" });
    bag.set("n1", { meta: m2, windowId: "2" });
    expect(bag.get("n1")?.meta).toBe(m2);
    expect(bag.get("n1")?.windowId).toBe("2");
    expect(bag.idFromMeta(m1)).toBeUndefined();
    expect(bag.idFromMeta(m2)).toBe("n1");
    expect(bag.idFromWindowId("1")).toBeUndefined();
    expect(bag.idFromWindowId("2")).toBe("n1");
  });

  it("delete removes the entry and reverse indexes", () => {
    const bag = createHostBag();
    const meta = { id: 7 };
    bag.set("n1", { meta, windowId: 7 });
    expect(bag.delete("n1")).toBe(true);
    expect(bag.get("n1")).toBeUndefined();
    expect(bag.has("n1")).toBe(false);
    expect(bag.size).toBe(0);
    expect(bag.idFromMeta(meta)).toBeUndefined();
    expect(bag.idFromWindowId(7)).toBeUndefined();
    expect(bag.delete("n1")).toBe(false);
  });

  it("clear wipes all entries and reverse indexes", () => {
    const bag = createHostBag();
    const m1 = { id: 1 };
    const m2 = { id: 2 };
    bag.set("n1", { meta: m1, windowId: "1" });
    bag.set("n2", { meta: m2, windowId: "2" });
    bag.clear();
    expect(bag.size).toBe(0);
    expect(bag.get("n1")).toBeUndefined();
    expect(bag.get("n2")).toBeUndefined();
    expect(bag.idFromMeta(m1)).toBeUndefined();
    expect(bag.idFromMeta(m2)).toBeUndefined();
    expect(bag.idFromWindowId("1")).toBeUndefined();
    expect(bag.idFromWindowId("2")).toBeUndefined();
  });

  it("entries yields [id, entry] pairs", () => {
    const bag = createHostBag();
    bag.set("a", { windowId: "a" });
    bag.set("b", { windowId: "b" });
    const pairs = [...bag.entries()];
    expect(pairs).toHaveLength(2);
    expect(Object.fromEntries(pairs)).toEqual({
      a: { windowId: "a" },
      b: { windowId: "b" },
    });
  });

  it("idFromMeta and idFromWindowId reverse-index set entries", () => {
    const bag = createHostBag();
    const meta = { id: 99 };
    bag.set("nid-x", { meta, windowId: "99", actor: {} });
    expect(bag.idFromMeta(meta)).toBe("nid-x");
    expect(bag.idFromWindowId("99")).toBe("nid-x");
    expect(bag.idFromWindowId(99)).toBe("nid-x");
    expect(bag.idFromMeta({ id: 99 })).toBeUndefined();
    expect(bag.idFromWindowId("missing")).toBeUndefined();
    expect(bag.idFromMeta(null)).toBeUndefined();
    expect(bag.idFromWindowId(null)).toBeUndefined();
  });

  it("instances do not share state", () => {
    const a = createHostBag();
    const b = createHostBag();
    a.set("n1", { windowId: "1" });
    expect(b.get("n1")).toBeUndefined();
    expect(b.size).toBe(0);
  });

  it("geometry fields shallow-merge; rect objects replace wholly", () => {
    const bag = createHostBag();
    const meta = { id: 3 };
    const desired1 = { x: 0, y: 0, width: 100, height: 80 };
    const observed1 = { x: 0, y: 0, width: 100, height: 80 };
    bag.set("n1", {
      meta,
      windowId: "3",
      desiredRect: desired1,
      observed: observed1,
      commanded: null,
      slotGen: 1,
      healTrail: null,
    });
    const desired2 = { x: 10, y: 20, width: 200, height: 160 };
    const commanded2 = { x: 10, y: 20, width: 200, height: 160 };
    const merged = bag.set("n1", {
      desiredRect: desired2,
      commanded: commanded2,
      slotGen: 2,
    });
    expect(merged.meta).toBe(meta);
    expect(merged.desiredRect).toBe(desired2);
    expect(merged.desiredRect).not.toBe(desired1);
    expect(merged.observed).toBe(observed1);
    expect(merged.commanded).toBe(commanded2);
    expect(merged.slotGen).toBe(2);
    expect(merged.healTrail).toBeNull();
    expect(bag.idFromMeta(meta)).toBe("n1");
  });

  it("border field shallow-merges and can be cleared", () => {
    const bag = createHostBag();
    const meta = { id: 8 };
    const border1 = { name: "b1" };
    const border2 = { name: "b2" };
    bag.set("n1", { meta, windowId: "8", actor: { name: "a" } });
    const withBorder = bag.set("n1", { border: border1 });
    expect(withBorder.meta).toBe(meta);
    expect(withBorder.actor).toEqual({ name: "a" });
    expect(withBorder.border).toBe(border1);
    expect(bag.set("n1", { border: border2 }).border).toBe(border2);
    expect(bag.set("n1", { border: undefined }).border).toBeUndefined();
    expect(bag.get("n1")?.meta).toBe(meta);
    expect(bag.idFromMeta(meta)).toBe("n1");
  });

  it("delete drops border with the entry", () => {
    const bag = createHostBag();
    const border = { name: "gone" };
    bag.set("n1", { windowId: "9", border });
    expect(bag.delete("n1")).toBe(true);
    expect(bag.get("n1")).toBeUndefined();
  });

  it("decoration/tabStrip shallow-merge and clear (D096 G5c)", () => {
    const bag = createHostBag();
    const actor = { name: "con-actor" };
    const strip1 = { name: "strip1" };
    const strip2 = { name: "strip2" };
    bag.set("con-1", { actor });
    const withStrip = bag.set("con-1", { decoration: strip1, tabStrip: strip1 });
    expect(withStrip.actor).toBe(actor);
    expect(withStrip.decoration).toBe(strip1);
    expect(withStrip.tabStrip).toBe(strip1);
    expect(bag.set("con-1", { decoration: strip2, tabStrip: strip2 }).decoration).toBe(strip2);
    expect(bag.set("con-1", { decoration: undefined, tabStrip: undefined }).decoration).toBeUndefined();
    expect(bag.get("con-1")?.tabStrip).toBeUndefined();
    expect(bag.get("con-1")?.actor).toBe(actor);
  });

  it("tab/tabChip shallow-merge and clear (D096 G8b)", () => {
    const bag = createHostBag();
    const meta = { id: 11 };
    const chip1 = { name: "chip1" };
    const chip2 = { name: "chip2" };
    bag.set("win-1", { meta, windowId: "11" });
    const withTab = bag.set("win-1", { tab: chip1, tabChip: chip1 });
    expect(withTab.meta).toBe(meta);
    expect(withTab.tab).toBe(chip1);
    expect(withTab.tabChip).toBe(chip1);
    expect(bag.set("win-1", { tab: chip2, tabChip: chip2 }).tab).toBe(chip2);
    expect(bag.set("win-1", { tab: undefined, tabChip: undefined }).tab).toBeUndefined();
    expect(bag.get("win-1")?.tabChip).toBeUndefined();
    expect(bag.get("win-1")?.meta).toBe(meta);
  });
});
