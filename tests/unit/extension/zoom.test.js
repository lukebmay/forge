import { describe, it, expect } from "vitest";
import {
  zoomRect,
  resolveZoomToggle,
  applyOneZoomPerMonitor,
  isZoomMode,
  ZOOM_FULL,
  ZOOM_HORIZONTAL,
  ZOOM_VERTICAL,
} from "../../../lib/extension/zoom.js";
import { projectNode } from "../../../lib/extension/tree-query.js";

const slot = { x: 100, y: 200, width: 400, height: 300 };
const workarea = { x: 0, y: 32, width: 1920, height: 1048 };

describe("zoomRect", () => {
  it("full uses workarea", () => {
    expect(zoomRect(slot, workarea, ZOOM_FULL)).toEqual(workarea);
  });

  it("horizontal keeps slot y/height, takes workarea x/width", () => {
    expect(zoomRect(slot, workarea, ZOOM_HORIZONTAL)).toEqual({
      x: workarea.x,
      y: slot.y,
      width: workarea.width,
      height: slot.height,
    });
  });

  it("vertical keeps slot x/width, takes workarea y/height", () => {
    expect(zoomRect(slot, workarea, ZOOM_VERTICAL)).toEqual({
      x: slot.x,
      y: workarea.y,
      width: slot.width,
      height: workarea.height,
    });
  });

  it("null / unknown mode returns a slot copy", () => {
    expect(zoomRect(slot, workarea, null)).toEqual(slot);
    expect(zoomRect(slot, workarea, undefined)).toEqual(slot);
    expect(zoomRect(slot, workarea, "nope")).toEqual(slot);
    expect(zoomRect(slot, workarea, null)).not.toBe(slot);
  });

  it("missing workarea or slot is a no-op", () => {
    expect(zoomRect(slot, null, ZOOM_FULL)).toEqual(slot);
    expect(zoomRect(null, workarea, ZOOM_FULL)).toBeNull();
  });
});

describe("resolveZoomToggle", () => {
  it("any current zoom + any chord clears", () => {
    for (const current of [ZOOM_FULL, ZOOM_HORIZONTAL, ZOOM_VERTICAL]) {
      for (const requested of [ZOOM_FULL, ZOOM_HORIZONTAL, ZOOM_VERTICAL]) {
        expect(resolveZoomToggle(current, requested)).toBeNull();
      }
    }
  });

  it("cleared unit takes the requested mode", () => {
    expect(resolveZoomToggle(null, ZOOM_FULL)).toBe(ZOOM_FULL);
    expect(resolveZoomToggle(undefined, ZOOM_HORIZONTAL)).toBe(ZOOM_HORIZONTAL);
    expect(resolveZoomToggle(null, ZOOM_VERTICAL)).toBe(ZOOM_VERTICAL);
  });

  it("rejects unknown requested mode", () => {
    expect(resolveZoomToggle(null, "maximize")).toBeNull();
    expect(isZoomMode("full")).toBe(true);
    expect(isZoomMode(null)).toBe(false);
  });
});

describe("applyOneZoomPerMonitor", () => {
  it("sets target and clears other TILE peers", () => {
    const a = { zoomMode: null };
    const b = { zoomMode: ZOOM_FULL };
    const c = { zoomMode: ZOOM_VERTICAL };
    applyOneZoomPerMonitor([a, b, c], a, ZOOM_HORIZONTAL);
    expect(a.zoomMode).toBe(ZOOM_HORIZONTAL);
    expect(b.zoomMode).toBeNull();
    expect(c.zoomMode).toBeNull();
  });

  it("does not touch nodes outside the list", () => {
    const a = { zoomMode: null };
    const otherMon = { zoomMode: ZOOM_FULL };
    applyOneZoomPerMonitor([a], a, ZOOM_FULL);
    expect(a.zoomMode).toBe(ZOOM_FULL);
    expect(otherMon.zoomMode).toBe(ZOOM_FULL);
  });
});

describe("GetTree zoomMode", () => {
  it("includes zoomMode when set", () => {
    const node = {
      nodeType: "WINDOW",
      layout: null,
      rect: slot,
      percent: 1,
      mode: "TILE",
      zoomMode: ZOOM_FULL,
      nodeValue: { get_wm_class: () => "App", get_title: () => "T", get_id: () => 1 },
      childNodes: [],
    };
    expect(projectNode(node).zoomMode).toBe(ZOOM_FULL);
  });

  it("omits zoomMode when unset", () => {
    const node = {
      nodeType: "WINDOW",
      layout: null,
      rect: slot,
      percent: 1,
      mode: "TILE",
      nodeValue: { get_wm_class: () => "App", get_title: () => "T", get_id: () => 1 },
      childNodes: [],
    };
    expect(projectNode(node).zoomMode).toBeUndefined();
  });
});
