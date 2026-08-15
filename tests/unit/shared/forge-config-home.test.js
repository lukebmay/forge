import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveForgeConfigHome, FORGE_CONFIG_HOME_ENV } from "../../../lib/shared/paths.js";
import { forgeConfigHome, forgeConfigDir } from "../../../lib/shared/forge-config-home.js";

describe("resolveForgeConfigHome (pure)", () => {
  it("defaults to userConfigDir/forge when env unset", () => {
    expect(resolveForgeConfigHome({ env: {}, userConfigDir: "/home/test/.config" })).toBe(
      "/home/test/.config/forge"
    );
  });

  it("defaults when env key missing", () => {
    expect(resolveForgeConfigHome({ userConfigDir: "/home/test/.config" })).toBe(
      "/home/test/.config/forge"
    );
  });

  it("uses FORGE_CONFIG_HOME as the root (no /forge append)", () => {
    expect(
      resolveForgeConfigHome({
        env: { [FORGE_CONFIG_HOME_ENV]: "/tmp/nest/forge-config" },
        userConfigDir: "/home/test/.config",
      })
    ).toBe("/tmp/nest/forge-config");
  });

  it("trims whitespace and ignores empty FORGE_CONFIG_HOME", () => {
    expect(
      resolveForgeConfigHome({
        env: { [FORGE_CONFIG_HOME_ENV]: "   " },
        userConfigDir: "/home/test/.config",
      })
    ).toBe("/home/test/.config/forge");
  });

  it("ignores null env value", () => {
    expect(
      resolveForgeConfigHome({
        env: { [FORGE_CONFIG_HOME_ENV]: null },
        userConfigDir: "/home/x/.config",
      })
    ).toBe("/home/x/.config/forge");
  });
});

describe("forgeConfigHome (GJS wrapper)", () => {
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
});
