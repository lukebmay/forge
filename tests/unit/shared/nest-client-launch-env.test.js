import { describe, expect, it } from "vitest";
import {
  NEST_CLIENT_UNSET_KEYS,
  nestClientLaunchEnvVars,
} from "../../../lib/shared/nest-client-launch-env.js";

describe("nestClientLaunchEnvVars", () => {
  it("rewrites host-inherited Shell env to full nest client_env", () => {
    const vars = nestClientLaunchEnvVars({
      nestStateDir: "/tmp/nest-state",
      nestWaylandDisplay: "wayland-forge",
      forgeHost: "black-sub-forge",
      forgeConfigHome: "/tmp/nest-state/forge-config",
    });
    expect(vars.WAYLAND_DISPLAY).toBe("wayland-forge");
    expect(vars.GDK_BACKEND).toBe("wayland");
    expect(vars.XDG_RUNTIME_DIR).toBe("/tmp/nest-state/runtime");
    expect(vars.XDG_CONFIG_HOME).toBe("/tmp/nest-state/config-home");
    expect(vars.XDG_CACHE_HOME).toBe("/tmp/nest-state/cache");
    expect(vars.XDG_DATA_HOME).toBe("/tmp/nest-state/data");
    expect(vars.HOME).toBe("/tmp/nest-state/home");
    expect(vars.FORGE_HOST).toBe("black-sub-forge");
    expect(vars.FORGE_CONFIG_HOME).toBe("/tmp/nest-state/forge-config");
    expect(vars.GTK_USE_PORTAL).toBe("0");
    expect(vars.GIO_USE_VFS).toBe("local");
    expect(vars.GSK_RENDERER).toBe("cairo");
    expect(vars.LIBGL_ALWAYS_SOFTWARE).toBe("1");
    expect(vars.XDG_SESSION_TYPE).toBe("wayland");
    expect(vars.DISPLAY).toBeUndefined();
  });

  it("derives FORGE_CONFIG_HOME from state when omitted", () => {
    const vars = nestClientLaunchEnvVars({
      nestStateDir: "/s/",
      nestWaylandDisplay: "wayland-forge",
    });
    expect(vars.FORGE_CONFIG_HOME).toBe("/s/forge-config");
    expect(vars.XDG_RUNTIME_DIR).toBe("/s/runtime");
  });

  it("still sets cairo/portal when nest display missing", () => {
    const vars = nestClientLaunchEnvVars({});
    expect(vars.WAYLAND_DISPLAY).toBeUndefined();
    expect(vars.GSK_RENDERER).toBe("cairo");
    expect(vars.GTK_USE_PORTAL).toBe("0");
    expect(vars.XDG_SESSION_TYPE).toBe("wayland");
    expect(vars.GDK_BACKEND).toBe("wayland");
    expect(vars.DISPLAY).toBeUndefined();
  });

  it("unsets DISPLAY rather than emptying it (empty is host X11 :0)", () => {
    expect(NEST_CLIENT_UNSET_KEYS).toContain("DISPLAY");
  });
});
