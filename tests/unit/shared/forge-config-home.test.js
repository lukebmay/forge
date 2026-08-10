import { describe, it, expect, vi, afterEach } from "vitest";
import {
  forgeConfigHome,
  forgeConfigDir,
  FORGE_CONFIG_HOME_ENV,
} from "../../../lib/shared/forge-config-home.js";

describe("forgeConfigHome", () => {
  /** @type {import("vitest").MockInstance | undefined} */
  let getenvSpy;

  afterEach(() => {
    getenvSpy?.mockRestore();
    getenvSpy = undefined;
  });

  async function spyGetenv(impl) {
    const mod = await import("../../mocks/gnome/GLib.js");
    const target = mod.default ?? mod;
    getenvSpy = vi.spyOn(target, "getenv").mockImplementation(impl);
    return target;
  }

  it("defaults to user_config_dir/forge when env unset", async () => {
    await spyGetenv(() => null);
    expect(forgeConfigHome()).toBe("/home/test/.config/forge");
    expect(forgeConfigDir()).toBe("/home/test/.config/forge/config");
  });

  it("uses FORGE_CONFIG_HOME as the root (no /forge append)", async () => {
    await spyGetenv((k) => (k === FORGE_CONFIG_HOME_ENV ? "/tmp/nest/forge-config" : null));
    expect(forgeConfigHome()).toBe("/tmp/nest/forge-config");
    expect(forgeConfigDir()).toBe("/tmp/nest/forge-config/config");
  });

  it("trims whitespace and ignores empty FORGE_CONFIG_HOME", async () => {
    await spyGetenv((k) => (k === FORGE_CONFIG_HOME_ENV ? "   " : null));
    expect(forgeConfigHome()).toBe("/home/test/.config/forge");
  });
});
