import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import St from "gi://St";
import { File } from "../../mocks/gnome/Gio.js";
import { ExtensionThemeManager } from "../../../lib/extension/extension-theme-manager.js";
import { Logger } from "../../../lib/shared/logger.js";

// production mocked for ThemeManagerBase / logger imports; stylesheet load no
// longer branches on it (make dev must still use user colors).
vi.mock("../../../lib/shared/production.js", () => ({
  production: true,
  setProductionForTests: () => {},
}));
vi.mock("../../../lib/shared/settings.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, production: true, PERMISSIONS_MODE: 0o744 };
});

// Minimal CSS so ThemeManagerBase._importCss() succeeds in the constructor.
const sampleCss = `.tiled { color: rgba(255,255,255,0.8); border-width: 1px; opacity: 0.8; }`;
const baseCss = `.tiled { color: rgba(236, 94, 94, 1); border-width: 3px; }`;
const userCss = `.tiled { color: rgba(59, 1, 224, 1); border-width: 2px; }`;

function createMockStylesheetFile(path, contents = sampleCss) {
  const file = new File(path);
  file.load_contents = vi.fn(() => [true, new TextEncoder().encode(contents), null]);
  file.get_parent = vi.fn(() => ({ get_path: () => "/mock" }));
  file.get_path = vi.fn(() => path);
  file.replace_contents = vi.fn(() => [true, null]);
  file.set_attribute_uint32 = vi.fn();
  return file;
}

/**
 * forge-wwn8: the manually loaded stylesheet was never unloaded on disable().
 * reloadStylesheet() loads via theme.load_stylesheet() and remembers it in
 * this.stylesheet, but the only unload_stylesheet calls lived inside
 * reloadStylesheet itself (run on the NEXT enable). unloadStylesheet() lets
 * disable() release the currently-loaded stylesheet so theme state isn't leaked.
 */
describe("forge-wwn8: ExtensionThemeManager.unloadStylesheet", () => {
  let theme;
  let mgr;

  beforeEach(() => {
    theme = {
      load_stylesheet: vi.fn(),
      unload_stylesheet: vi.fn(),
    };
    vi.spyOn(St.ThemeContext, "get_for_stage").mockReturnValue({
      get_theme: () => theme,
    });

    const stylesheetFile = createMockStylesheetFile("/mock/user-stylesheet.css", userCss);
    const defaultStylesheetFile = createMockStylesheetFile("/mock/default-stylesheet.css", baseCss);

    const extension = {
      metadata: { uuid: "forge@jmmaranan.com" },
      configMgr: {
        stylesheetFile,
        defaultStylesheetFile,
        confDir: "/mock/config/forge",
      },
      settings: {},
    };

    mgr = new ExtensionThemeManager(extension);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("unloads the effective stylesheet that was loaded", () => {
    mgr.reloadStylesheet();
    expect(mgr.stylesheets.length).toBe(1);
    const loaded = mgr.stylesheets[0];

    theme.unload_stylesheet.mockClear();
    mgr.unloadStylesheet();

    expect(theme.unload_stylesheet).toHaveBeenCalledTimes(1);
    expect(theme.unload_stylesheet).toHaveBeenCalledWith(loaded);
  });

  it("does nothing when no stylesheet is loaded", () => {
    mgr.unloadStylesheet();
    expect(theme.unload_stylesheet).not.toHaveBeenCalled();
  });

  it("clears the remembered handles so a second unload is a no-op", () => {
    mgr.reloadStylesheet();
    expect(mgr.stylesheets.length).toBeGreaterThan(0);

    mgr.unloadStylesheet();
    expect(mgr.stylesheet).toBeNull();
    expect(mgr.stylesheets).toEqual([]);

    theme.unload_stylesheet.mockClear();
    mgr.unloadStylesheet();
    expect(theme.unload_stylesheet).not.toHaveBeenCalled();
  });
});

describe("ExtensionThemeManager.reloadStylesheet", () => {
  let theme;
  let mgr;
  let stylesheetFile;
  let defaultStylesheetFile;

  beforeEach(() => {
    theme = {
      load_stylesheet: vi.fn(),
      unload_stylesheet: vi.fn(),
    };
    vi.spyOn(St.ThemeContext, "get_for_stage").mockReturnValue({
      get_theme: () => theme,
    });

    stylesheetFile = createMockStylesheetFile("/mock/user-stylesheet.css", userCss);
    defaultStylesheetFile = createMockStylesheetFile("/mock/default-stylesheet.css", baseCss);

    const extension = {
      metadata: { uuid: "forge@jmmaranan.com" },
      configMgr: {
        stylesheetFile,
        defaultStylesheetFile,
        confDir: "/mock/config/forge",
      },
      settings: {},
    };

    mgr = new ExtensionThemeManager(extension);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads a single effective sheet (base+user merged, not dual-load)", () => {
    mgr.reloadStylesheet();

    // One St load only — dual-load cascade is unreliable in St.
    expect(theme.load_stylesheet).toHaveBeenCalledTimes(1);
    expect(mgr.stylesheets.length).toBe(1);
    expect(mgr.stylesheet).toBe(mgr.stylesheets[0]);
    // Effective write used base + user contents.
    const written = mgr.stylesheet.replace_contents?.mock?.calls?.[0]?.[0];
    // File is the effective path's Gio.File from build — replace_contents on outFile.
    // We assert user CSS was read and load happened once.
    expect(stylesheetFile.load_contents).toHaveBeenCalled();
    expect(defaultStylesheetFile.load_contents).toHaveBeenCalled();
  });

  it("loads only the bundled default when no user stylesheet exists", () => {
    mgr.configMgr.stylesheetFile = null;
    mgr.reloadStylesheet();

    expect(theme.load_stylesheet).toHaveBeenCalledTimes(1);
    expect(mgr.stylesheets.length).toBe(1);
  });

  it("unloads previous sheets before loading effective (forge-wwn8 leak guard)", () => {
    mgr.reloadStylesheet();
    expect(theme.unload_stylesheet).toHaveBeenCalled();
  });

  it("does not throw when load_stylesheet fails", () => {
    const errorSpy = vi.spyOn(Logger, "error").mockImplementation(() => {});
    theme.load_stylesheet = vi.fn(() => {
      throw new Error("theme refused stylesheet");
    });

    expect(() => mgr.reloadStylesheet()).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
  });
});
