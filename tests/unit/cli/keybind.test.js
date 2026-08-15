import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  resolveProfilesDir,
  parseGvariantStrv,
  formatStrv,
  bindingDiffs,
  closestKit,
  inspectLiveKit,
  resolveLoadName,
  listProfiles,
  profileStem,
  parseArgv,
  run,
} from "../../../cli/keybind.mjs";
import {
  getKit,
  isReservedKitName,
  matchKitId,
  sanitizeProfileName,
  buildProfileProps,
  KEYBINDING_PRESET_KEYS,
} from "../../../lib/shared/keybind-presets.js";

describe("cli/keybind profiles dir", () => {
  it("honors FORGE_KEYBIND_PROFILES_DIR", () => {
    expect(resolveProfilesDir({ FORGE_KEYBIND_PROFILES_DIR: "/tmp/kbd-profiles" })).toBe(
      path.resolve("/tmp/kbd-profiles")
    );
  });

  it("trims FORGE_KEYBIND_PROFILES_DIR", () => {
    expect(resolveProfilesDir({ FORGE_KEYBIND_PROFILES_DIR: "  /tmp/kbd  " })).toBe(
      path.resolve("/tmp/kbd")
    );
  });

  it("uses FORGE_CONFIG_HOME when profiles dir unset", () => {
    expect(
      resolveProfilesDir({
        FORGE_KEYBIND_PROFILES_DIR: "",
        FORGE_CONFIG_HOME: "/tmp/nest-forge-config",
      })
    ).toBe(path.resolve("/tmp/nest-forge-config/config/keybinding-profiles"));
  });

  it("falls back to ~/.config/forge/config/keybinding-profiles", () => {
    const d = resolveProfilesDir({
      FORGE_KEYBIND_PROFILES_DIR: "",
      FORGE_CONFIG_HOME: "",
    });
    expect(d.endsWith("keybinding-profiles")).toBe(true);
    expect(d.includes("forge")).toBe(true);
  });
});

describe("cli/keybind reserved + sanitize", () => {
  it("sanitizeProfileName via shared", () => {
    expect(sanitizeProfileName("my-kit")).toBe("my-kit");
    expect(sanitizeProfileName("../evil")).toBeNull();
    expect(sanitizeProfileName("has space")).toBeNull();
    expect(profileStem("my-kit.json")).toBe("my-kit");
  });

  it("reserved kit names via shared", () => {
    for (const name of ["vim", "Vim", "safe", "i3", "i3.json"]) {
      expect(isReservedKitName(name)).toBe(true);
    }
    expect(isReservedKitName("my-kit")).toBe(false);
    expect(isReservedKitName("vimish")).toBe(false);
  });
});

describe("cli/keybind gvariant helpers", () => {
  it("formatStrv", () => {
    expect(formatStrv([])).toBe("@as []");
    expect(formatStrv(["<Super>h"])).toBe("['<Super>h']");
    expect(formatStrv(["<Super>h", "<Super>Left"])).toBe("['<Super>h', '<Super>Left']");
  });

  it("parseGvariantStrv", () => {
    expect(parseGvariantStrv("@as []")).toEqual([]);
    expect(parseGvariantStrv("['<Super>h']")).toEqual(["<Super>h"]);
    expect(parseGvariantStrv("['a', 'b']")).toEqual(["a", "b"]);
  });
});

describe("cli/keybind match + status (injected run)", () => {
  it("matchKitId uses shared — full vim kit matches", () => {
    const kit = getKit("vim");
    expect(
      matchKitId({
        modMaskMouseTile: kit.modMaskMouseTile,
        bindings: kit.bindings,
      })
    ).toBe("vim");
  });

  it("inspectLiveKit slim shape via injected snap", () => {
    const kit = getKit("safe");
    const info = inspectLiveKit(
      () => ({ stdout: "", stderr: "", code: 1 }),
      {},
      {
        snap: {
          modMaskMouseTile: kit.modMaskMouseTile,
          bindings: kit.bindings,
        },
      }
    );
    expect(info.matched).toBe("safe");
    expect(info.diffCount).toBe(0);
    expect(info.hint).toContain("--kit=vim");
  });

  it("status --json with mock live returning safe kit", () => {
    const kit = getKit("safe");
    const known = ["mod-mask-mouse-tile", ...KEYBINDING_PRESET_KEYS];
    /** @type {Record<string, string>} */
    const store = {
      "mod-mask-mouse-tile": `'${kit.modMaskMouseTile}'`,
    };
    for (const key of KEYBINDING_PRESET_KEYS) {
      const accels = kit.bindings[key] || [];
      store[key] = formatStrv(accels);
    }

    const runCmd = (cmd) => {
      if (cmd[0] === "gsettings" && cmd[1] === "list-keys") {
        return { stdout: known.join("\n") + "\n", stderr: "", code: 0 };
      }
      if (cmd[0] === "gsettings" && cmd[1] === "get") {
        const key = cmd[3];
        if (key in store) {
          return { stdout: store[key] + "\n", stderr: "", code: 0 };
        }
        return { stdout: "", stderr: "no key", code: 1 };
      }
      if (cmd[0] === "dconf") {
        return { stdout: "", stderr: "", code: 0 };
      }
      return { stdout: "", stderr: "", code: 1 };
    };

    const chunks = { out: "", err: "" };
    const rc = run(["status", "--json"], {
      run: runCmd,
      env: {
        FORGE_GSETTINGS_SCHEMA_DIR: path.join(process.cwd(), "schemas"),
      },
      stdout: {
        write(s) {
          chunks.out += s;
        },
      },
      stderr: {
        write(s) {
          chunks.err += s;
        },
      },
    });

    expect(rc).toBe(0);
    const slim = JSON.parse(chunks.out.trim());
    expect(slim).toMatchObject({
      matched: "safe",
      closest: "safe",
      diffCount: 0,
    });
    expect(slim).toHaveProperty("hint");
    expect(slim).toHaveProperty("diffs");
    expect(Array.isArray(slim.diffs)).toBe(true);
  });

  it("status --json exit 2 when custom", () => {
    const known = ["mod-mask-mouse-tile", "prefs-app-launch"];
    const runCmd = (cmd) => {
      if (cmd[0] === "gsettings" && cmd[1] === "list-keys") {
        return { stdout: known.join("\n") + "\n", stderr: "", code: 0 };
      }
      if (cmd[0] === "gsettings" && cmd[1] === "get") {
        if (cmd[3] === "mod-mask-mouse-tile") {
          return { stdout: "'None'\n", stderr: "", code: 0 };
        }
        if (cmd[3] === "prefs-app-launch") {
          return { stdout: "['<Super>F12']\n", stderr: "", code: 0 };
        }
        return { stdout: "@as []\n", stderr: "", code: 0 };
      }
      if (cmd[0] === "dconf") {
        return { stdout: "", stderr: "", code: 0 };
      }
      return { stdout: "", stderr: "", code: 1 };
    };

    const chunks = { out: "" };
    const rc = run(["status", "--json"], {
      run: runCmd,
      env: {
        FORGE_GSETTINGS_SCHEMA_DIR: path.join(process.cwd(), "schemas"),
      },
      stdout: {
        write(s) {
          chunks.out += s;
        },
      },
      stderr: { write() {} },
    });
    expect(rc).toBe(2);
    const slim = JSON.parse(chunks.out.trim());
    expect(slim.matched).toBe("custom");
    expect(slim.diffCount).toBeGreaterThan(0);
    expect(["vim", "safe", "i3"]).toContain(slim.closest);
  });

  it("bindingDiffs + closestKit", () => {
    const vim = getKit("vim");
    const live = {
      ...vim.bindings,
      "prefs-app-launch": ["<Super>F12"],
    };
    const diffs = bindingDiffs(vim.bindings, live);
    expect(diffs.some((d) => d.key === "prefs-app-launch")).toBe(true);
    const [closest, cdiffs] = closestKit({ bindings: live });
    expect(["vim", "safe", "i3"]).toContain(closest);
    expect(cdiffs.length).toBeGreaterThan(0);
  });
});

describe("cli/keybind resolve load + list", () => {
  let tmp;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "forge-keybind-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("resolveLoadName kit wins over file", () => {
    fs.writeFileSync(path.join(tmp, "vim.json"), "{}", "utf8");
    expect(resolveLoadName("vim", tmp)).toEqual(["kit", "vim"]);
    expect(resolveLoadName("SAFE", tmp)).toEqual(["kit", "safe"]);
  });

  it("resolveLoadName profile by name", () => {
    fs.writeFileSync(path.join(tmp, "my-kit.json"), "{}", "utf8");
    const [kind, p] = resolveLoadName("my-kit", tmp);
    expect(kind).toBe("profile");
    expect(p).toBe(path.join(tmp, "my-kit.json"));
  });

  it("listProfiles skips reserved stems", () => {
    fs.writeFileSync(path.join(tmp, "desk.json"), "{}", "utf8");
    fs.writeFileSync(path.join(tmp, "vim.json"), "{}", "utf8");
    expect(listProfiles(tmp)).toEqual(["desk"]);
  });

  it("dir and list via run()", () => {
    fs.writeFileSync(path.join(tmp, "alpha.json"), "{}", "utf8");
    let out = "";
    expect(
      run(["dir", "--dir", tmp], {
        stdout: {
          write(s) {
            out += s;
          },
        },
        stderr: { write() {} },
      })
    ).toBe(0);
    expect(out.trim()).toBe(path.resolve(tmp));

    out = "";
    expect(
      run(["list", "--dir", tmp], {
        stdout: {
          write(s) {
            out += s;
          },
        },
        stderr: { write() {} },
      })
    ).toBe(0);
    const lines = out.trim().split("\n");
    expect(lines[0]).toBe(`# ${path.resolve(tmp)}`);
    expect(lines).toContain("alpha");
  });

  it("save rejects reserved and writes named json with mock live", () => {
    const kit = getKit("vim");
    const known = ["mod-mask-mouse-tile", ...KEYBINDING_PRESET_KEYS];
    /** @type {Record<string, string>} */
    const store = { "mod-mask-mouse-tile": "'None'" };
    for (const key of KEYBINDING_PRESET_KEYS) {
      store[key] = formatStrv(kit.bindings[key] || []);
    }
    const runCmd = (cmd) => {
      if (cmd[0] === "gsettings" && cmd[1] === "list-keys") {
        return { stdout: known.join("\n") + "\n", stderr: "", code: 0 };
      }
      if (cmd[0] === "gsettings" && cmd[1] === "get") {
        const key = cmd[3];
        return key in store
          ? { stdout: store[key] + "\n", stderr: "", code: 0 }
          : { stdout: "", stderr: "", code: 1 };
      }
      if (cmd[0] === "dconf") return { stdout: "", stderr: "", code: 0 };
      return { stdout: "", stderr: "", code: 1 };
    };

    let err = "";
    expect(
      run(["save", "vim", "--dir", tmp], {
        run: runCmd,
        env: { FORGE_GSETTINGS_SCHEMA_DIR: path.join(process.cwd(), "schemas") },
        stdout: { write() {} },
        stderr: {
          write(s) {
            err += s;
          },
        },
      })
    ).toBe(1);
    expect(err.toLowerCase()).toMatch(/built-in|reserved/);

    let out = "";
    expect(
      run(["save", "my-kit", "--dir", tmp], {
        run: runCmd,
        env: { FORGE_GSETTINGS_SCHEMA_DIR: path.join(process.cwd(), "schemas") },
        stdout: {
          write(s) {
            out += s;
          },
        },
        stderr: { write() {} },
      })
    ).toBe(0);
    const dest = out.trim();
    expect(dest).toBe(path.join(path.resolve(tmp), "my-kit.json"));
    const data = JSON.parse(fs.readFileSync(dest, "utf8"));
    expect(data).toEqual(
      buildProfileProps({
        modMaskMouseTile: "None",
        bindings: Object.fromEntries(KEYBINDING_PRESET_KEYS.map((k) => [k, kit.bindings[k] || []])),
        name: "my-kit",
      })
    );
  });

  it("load dry-run kit prints stderr line", () => {
    const known = ["mod-mask-mouse-tile", ...KEYBINDING_PRESET_KEYS];
    const runCmd = (cmd) => {
      if (cmd[0] === "gsettings" && cmd[1] === "list-keys") {
        return { stdout: known.join("\n") + "\n", stderr: "", code: 0 };
      }
      if (cmd[0] === "gsettings" && cmd[1] === "set") {
        return { stdout: "", stderr: "should not set", code: 1 };
      }
      if (cmd[0] === "dconf") return { stdout: "", stderr: "", code: 0 };
      if (cmd[0] === "glib-compile-schemas") {
        return { stdout: "", stderr: "", code: 0 };
      }
      return { stdout: "", stderr: "", code: 0 };
    };

    let err = "";
    const rc = run(["load", "vim", "--dry-run"], {
      run: runCmd,
      env: { FORGE_GSETTINGS_SCHEMA_DIR: path.join(process.cwd(), "schemas") },
      stdout: { write() {} },
      stderr: {
        write(s) {
          err += s;
        },
      },
    });
    expect(rc).toBe(0);
    expect(err).toMatch(/dry-run loaded kit:vim \(\d+ keys\)/);
  });
});

describe("cli/keybind parseArgv", () => {
  it("parses flags", () => {
    expect(parseArgv(["load", "vim", "--dry-run", "-v"])).toMatchObject({
      cmd: "load",
      name: "vim",
      dryRun: true,
      verbose: true,
    });
    expect(parseArgv(["status", "--json"]).json).toBe(true);
    expect(parseArgv(["list", "--dir", "/tmp/x"]).dir).toBe("/tmp/x");
  });
});

describe("cli/keybind.mjs spawn smoke", () => {
  it("dir works without PATH forge", () => {
    const mjs = path.join(process.cwd(), "cli/keybind.mjs");
    const r = spawnSync(process.execPath, [mjs, "dir", "--dir", "/tmp/kb"], {
      encoding: "utf8",
      env: { ...process.env },
    });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(path.resolve("/tmp/kb"));
  });
});
