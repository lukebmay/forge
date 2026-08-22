/**
 * OH2 ambient stubs for focused checkJs (tsconfig.check.json) without a full
 * GJS/@girs or Node program. Escape hatch: gi:// and vendored pansi bags stay
 * loosely typed — full hand-rolled surfaces are out of scope for this slice.
 */

declare module "gi://Gio" {
  // Escape: GObject introspected bag — not hand-modeling Gio.
  const Gio: any;
  export default Gio;
}

/** JSDoc `{Gio.File}` / `{Gio.Settings}` names — escape, not a full gir model. */
declare namespace Gio {
  type File = any;
  type Settings = any;
}
declare module "gi://GLib" {
  const GLib: any;
  export default GLib;
}
declare module "gi://GObject" {
  const GObject: any;
  export default GObject;
}
declare module "gi://Gdk" {
  const Gdk: any;
  export default Gdk;
}
declare module "gi://Gtk" {
  const Gtk: any;
  export default Gtk;
}
declare module "gi://Meta" {
  const Meta: any;
  export default Meta;
}
declare module "gi://St" {
  const St: any;
  export default St;
}
declare module "gi://Clutter" {
  const Clutter: any;
  export default Clutter;
}
declare module "gi://Shell" {
  const Shell: any;
  export default Shell;
}
declare module "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js" {
  export class ExtensionPreferences {
    getSettings(schema?: string): any;
    dir: any;
    metadata: any;
  }
}

interface Console {
  error(...args: unknown[]): void;
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}
declare var console: Console;
declare var TextDecoder: {
  new (): { decode(input?: AllowSharedBufferSource): string };
};
declare function structuredClone<T>(value: T): T;

/** Minimal Node globals for cli/*.mjs under focused checkJs (no @types/node). */
declare namespace NodeJS {
  interface ProcessEnv {
    [key: string]: string | undefined;
  }
  interface Process {
    env: ProcessEnv;
  }
}
declare var process: NodeJS.Process;
