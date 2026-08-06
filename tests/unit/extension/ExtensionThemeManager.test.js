import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import St from "gi://St";
import { File } from "../../mocks/gnome/Gio.js";
import { ExtensionThemeManager } from "../../../lib/extension/extension-theme-manager.js";
import { Logger } from "../../../lib/shared/logger.js";

// production is still mocked for ThemeManagerBase / logger imports; stylesheet
// load no longer branches on it (make dev must still use user colors).
vi.mock("../../../lib/shared/settings.js", () => ({
  production: true,
  PERMISSIONS_MODE: 0o744,
}));

// Minimal CSS so ThemeManagerBase._importCss() succeeds in the constructor.
const sampleCss = `.tiled { color: rgba(255,255,255,0.8); border-width: 1px; opacity: 0.8; }`;

function createMockStylesheetFile(path) {
  const file = new File(path);
  file.load_contents = vi.fn(() => [true, new TextEncoder().encode(sampleCss), null]);
  file.get_parent = vi.fn(() => ({ get_path: () => "/mock" }));
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
    // Stable theme object so load/unload calls are observable.
    theme = {
      load_stylesheet: vi.fn(),
      unload_stylesheet: vi.fn(),
    };
    vi.spyOn(St.ThemeContext, "get_for_stage").mockReturnValue({
      get_theme: () => theme,
    });

    const stylesheetFile = createMockStylesheetFile("/mock/stylesheet.css");
    const defaultStylesheetFile = createMockStylesheetFile("/mock/default-stylesheet.css");

    const extension = {
      metadata: { uuid: "forge@jmmaranan.com" },
      configMgr: { stylesheetFile, defaultStylesheetFile },
      settings: {},
    };

    mgr = new ExtensionThemeManager(extension);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("unloads every stylesheet that was loaded (base + user)", () => {
    mgr.reloadStylesheet();
    expect(mgr.stylesheets.length).toBe(2);

    theme.unload_stylesheet.mockClear();
    mgr.unloadStylesheet();

    expect(theme.unload_stylesheet).toHaveBeenCalledTimes(2);
    expect(theme.unload_stylesheet).toHaveBeenCalledWith(mgr.configMgr.defaultStylesheetFile);
    expect(theme.unload_stylesheet).toHaveBeenCalledWith(mgr.configMgr.stylesheetFile);
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

    // A second disable() (or double-unload) must not release already-freed handles.
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

    stylesheetFile = createMockStylesheetFile("/mock/stylesheet.css");
    defaultStylesheetFile = createMockStylesheetFile("/mock/default-stylesheet.css");

    const extension = {
      metadata: { uuid: "forge@jmmaranan.com" },
      configMgr: { stylesheetFile, defaultStylesheetFile },
      settings: {},
    };

    mgr = new ExtensionThemeManager(extension);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads base then user when both exist (user cascade wins)", () => {
    mgr.reloadStylesheet();

    expect(theme.load_stylesheet).toHaveBeenCalledTimes(2);
    expect(theme.load_stylesheet.mock.calls[0][0]).toBe(defaultStylesheetFile);
    expect(theme.load_stylesheet.mock.calls[1][0]).toBe(stylesheetFile);
    expect(mgr.stylesheets).toEqual([defaultStylesheetFile, stylesheetFile]);
    expect(mgr.stylesheet).toBe(stylesheetFile);
  });

  it("loads only the bundled default when no user stylesheet exists", () => {
    mgr.configMgr.stylesheetFile = null;
    mgr.reloadStylesheet();

    expect(theme.load_stylesheet).toHaveBeenCalledTimes(1);
    expect(theme.load_stylesheet).toHaveBeenCalledWith(defaultStylesheetFile);
    expect(mgr.stylesheets).toEqual([defaultStylesheetFile]);
    expect(mgr.stylesheet).toBe(defaultStylesheetFile);
  });

  it("unloads both default and custom stylesheets before loading (forge-wwn8 leak guard)", () => {
    mgr.reloadStylesheet();

    expect(theme.unload_stylesheet).toHaveBeenCalledWith(defaultStylesheetFile);
    expect(theme.unload_stylesheet).toHaveBeenCalledWith(stylesheetFile);
  });

  it("loads base alone and logs when user stylesheet throws", () => {
    const errorSpy = vi.spyOn(Logger, "error").mockImplementation(() => {});
    theme.load_stylesheet = vi.fn((file) => {
      if (file === stylesheetFile) throw new Error("theme refused user stylesheet");
    });

    expect(() => mgr.reloadStylesheet()).not.toThrow();

    // Base still loads so structure works; user failure is logged (not silent red-only).
    expect(theme.load_stylesheet).toHaveBeenCalledWith(defaultStylesheetFile);
    expect(mgr.stylesheets).toEqual([defaultStylesheetFile]);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("loads user alone and logs when base stylesheet throws", () => {
    const errorSpy = vi.spyOn(Logger, "error").mockImplementation(() => {});
    theme.load_stylesheet = vi.fn((file) => {
      if (file === defaultStylesheetFile) throw new Error("theme refused base stylesheet");
    });

    expect(() => mgr.reloadStylesheet()).not.toThrow();

    expect(theme.load_stylesheet).toHaveBeenCalledWith(stylesheetFile);
    expect(mgr.stylesheets).toEqual([stylesheetFile]);
    expect(errorSpy).toHaveBeenCalled();
  });
});
