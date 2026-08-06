import { describe, it, expect, vi } from "vitest";
import {
  RIVAL_TILER_UUIDS,
  isRivalTilerUuid,
  disableRivalTilers,
} from "../../../lib/shared/rival-tilers.js";

describe("rival-tilers", () => {
  it("lists known GNOME Shell tilers, never forge itself", () => {
    expect(RIVAL_TILER_UUIDS.length).toBeGreaterThan(0);
    expect(RIVAL_TILER_UUIDS).toContain("tiling-assistant@ubuntu.com");
    expect(RIVAL_TILER_UUIDS).toContain("pop-shell@system76.com");
    expect(RIVAL_TILER_UUIDS).not.toContain("forge@jmmaranan.com");
  });

  it("isRivalTilerUuid is true only for listed rivals", () => {
    expect(isRivalTilerUuid("tiling-assistant@ubuntu.com")).toBe(true);
    expect(isRivalTilerUuid("forge@jmmaranan.com")).toBe(false);
    expect(isRivalTilerUuid("ding@rastersoft.com")).toBe(false);
    expect(isRivalTilerUuid("")).toBe(false);
    expect(isRivalTilerUuid(null)).toBe(false);
  });

  it("disableRivalTilers only disables enabled rivals", () => {
    const enabled = new Set(["tiling-assistant@ubuntu.com", "ding@rastersoft.com"]);
    const disable = vi.fn();
    const log = vi.fn();
    const out = disableRivalTilers({
      isEnabled: (uuid) => enabled.has(uuid),
      disable,
      log,
    });
    expect(out).toEqual(["tiling-assistant@ubuntu.com"]);
    expect(disable).toHaveBeenCalledTimes(1);
    expect(disable).toHaveBeenCalledWith("tiling-assistant@ubuntu.com");
    expect(log).toHaveBeenCalledWith("Disabled rival tiler: tiling-assistant@ubuntu.com");
  });

  it("disableRivalTilers swallows disable errors", () => {
    const out = disableRivalTilers({
      isEnabled: () => true,
      disable: () => {
        throw new Error("nope");
      },
    });
    expect(out).toEqual([]);
  });
});
