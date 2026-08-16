import { describe, it, expect } from "vitest";
import { dropTargetHitRect, dropTargetSlotRect } from "../../../lib/extension/drag-drop.js";

describe("dropTargetSlotRect / dropTargetHitRect", () => {
  it("prefers renderRect over initRect over rect", () => {
    const node = {
      renderRect: { x: 1, y: 2, width: 100, height: 200 },
      initRect: { x: 0, y: 0, width: 10, height: 10 },
      rect: { x: 0, y: 0, width: 9, height: 9 },
    };
    expect(dropTargetSlotRect(node)).toEqual({ x: 1, y: 2, width: 100, height: 200 });
  });

  it("during grab uses slot even when Meta frame is tiny", () => {
    const slot = { x: 46, y: 71, width: 1255, height: 1365 };
    const node = { renderRect: slot };
    const meta = {
      get_frame_rect: () => ({ x: 46, y: 71, width: 1255, height: 220 }),
    };
    expect(dropTargetHitRect(node, meta, true)).toEqual(slot);
  });

  it("falls back to Meta frame when no slot", () => {
    const frame = { x: 0, y: 0, width: 400, height: 300 };
    const meta = { get_frame_rect: () => frame };
    expect(dropTargetHitRect({}, meta, true)).toEqual(frame);
    expect(dropTargetHitRect(null, meta, false)).toEqual(frame);
  });

  it("without grab does not force slot (live frame)", () => {
    const slot = { x: 0, y: 0, width: 1000, height: 1000 };
    const frame = { x: 0, y: 0, width: 100, height: 100 };
    const node = { renderRect: slot };
    const meta = { get_frame_rect: () => frame };
    expect(dropTargetHitRect(node, meta, false)).toEqual(frame);
  });
});
