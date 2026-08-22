/**
 * GJS I/O for plog-core (Gio append / GLib env+path).
 * Zero-config console: prefer global `console`, else Shell `log` / `print`
 * (wired in plog-core toConsole — this module only supplies file/env/stdio).
 */

import Gio from "gi://Gio";
import GLib from "gi://GLib";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function readPid() {
  try {
    const file = Gio.File.new_for_path("/proc/self/stat");
    const [, contents] = file.load_contents(null);
    const n = parseInt(textDecoder.decode(contents).split(" ")[0], 10);
    return Number.isFinite(n) ? n : -1;
  } catch {
    return -1;
  }
}

function readUid() {
  try {
    const file = Gio.File.new_for_path("/proc/self/status");
    const [, contents] = file.load_contents(null);
    const m = textDecoder.decode(contents).match(/^Uid:\s+(\d+)/m);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * @returns {import("./plog-core.js").PlogRuntime}
 */
export function createGjsRuntime() {
  return {
    envGet(key) {
      const v = GLib.getenv(key);
      return v == null ? undefined : v;
    },
    envSet(key, value) {
      GLib.setenv(key, value, true);
    },
    envDel(key) {
      GLib.unsetenv(key);
    },
    pid() {
      return readPid();
    },
    getuid() {
      return readUid();
    },
    homeDir() {
      return GLib.get_home_dir() || null;
    },
    sudoUser() {
      const v = GLib.getenv("SUDO_USER");
      return v == null || v === "" ? null : v;
    },
    randomBytes(n) {
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i++) out[i] = GLib.random_int_range(0, 256);
      return out;
    },
    resolvePath(p0) {
      return GLib.canonicalize_filename(String(p0), null);
    },
    dirname(p0) {
      return GLib.path_get_dirname(String(p0));
    },
    basename(p0) {
      return GLib.path_get_basename(String(p0));
    },
    pathJoin(a, b) {
      return GLib.build_filenamev([String(a), String(b)]);
    },
    pathSep: "/",
    realpathOrResolve(p0) {
      const abs = GLib.canonicalize_filename(String(p0), null);
      try {
        const file = Gio.File.new_for_path(abs);
        if (file.query_exists(null)) {
          const path = file.get_path();
          return path || abs;
        }
      } catch {
        /* fall through */
      }
      return abs;
    },
    exists(p0) {
      return Gio.File.new_for_path(String(p0)).query_exists(null);
    },
    appendFile(filePath, bytes) {
      const file = Gio.File.new_for_path(String(filePath));
      const stream = file.append_to(Gio.FileCreateFlags.PRIVATE, null);
      try {
        const data = typeof bytes === "string" ? textEncoder.encode(bytes) : bytes;
        const [ok] = stream.write_all(data, null);
        if (!ok) throw new Error("write_all failed");
      } finally {
        stream.close(null);
      }
    },
    readFile(filePath) {
      const file = Gio.File.new_for_path(String(filePath));
      const [ok, contents] = file.load_contents(null);
      if (!ok) throw new Error(`cannot read ${filePath}`);
      return textDecoder.decode(contents);
    },
    writeFileAtomic(filePath, content, tmpPath) {
      const tmp = Gio.File.new_for_path(String(tmpPath));
      const stream = tmp.replace(null, false, Gio.FileCreateFlags.PRIVATE, null);
      try {
        const data = textEncoder.encode(content == null ? "" : String(content));
        const [ok] = stream.write_all(data, null);
        if (!ok) throw new Error("write_all failed");
      } finally {
        stream.close(null);
      }
      const dest = Gio.File.new_for_path(String(filePath));
      tmp.move(dest, Gio.FileCopyFlags.OVERWRITE, null, null);
    },
    writeFileInPlace(filePath, content) {
      const file = Gio.File.new_for_path(String(filePath));
      const stream = file.replace(null, false, Gio.FileCreateFlags.PRIVATE, null);
      try {
        const data = textEncoder.encode(content == null ? "" : String(content));
        const [ok] = stream.write_all(data, null);
        if (!ok) throw new Error("write_all failed");
      } finally {
        stream.close(null);
      }
    },
    truncateFile(filePath) {
      const file = Gio.File.new_for_path(String(filePath));
      const stream = file.replace(null, false, Gio.FileCreateFlags.PRIVATE, null);
      stream.close(null);
    },
    unlinkQuiet(filePath) {
      try {
        Gio.File.new_for_path(String(filePath)).delete(null);
      } catch {
        /* ignore */
      }
    },
    writeStderr(text) {
      const line = text.endsWith("\n") ? text.slice(0, -1) : text;
      if (typeof console !== "undefined" && typeof console.error === "function") {
        console.error(line);
      } else if (typeof globalThis.printerr === "function") {
        globalThis.printerr(line);
      } else if (typeof globalThis.print === "function") {
        globalThis.print(line);
      }
    },
    writeStdout(text) {
      const line = text.endsWith("\n") ? text.slice(0, -1) : text;
      if (typeof console !== "undefined" && typeof console.log === "function") {
        console.log(line);
      } else if (typeof globalThis.print === "function") {
        globalThis.print(line);
      }
    },
    get stdout() {
      return null;
    },
    get stderr() {
      return null;
    },
  };
}
