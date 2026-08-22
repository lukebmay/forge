#!/usr/bin/env -S gjs -m
/**
 * GJS smoke: import plog.gjs.js, init({ file }), emit, prove Gio-backed bytes.
 * Run: gjs -m util/js/plog.gjs.smoke.js
 */

import System from "system";
import GLib from "gi://GLib";
import Gio from "gi://Gio";
import { log, PLOG_VERSION, actions, defaults } from "./plog.gjs.js";

const tmpDir = GLib.build_filenamev([
  GLib.get_tmp_dir(),
  `plog-gjs-smoke-${GLib.get_monotonic_time()}`,
]);
GLib.mkdir_with_parents(tmpDir, 0o700);
const logFile = GLib.build_filenamev([tmpDir, "out.log"]);

let failed = 0;
function check(cond, msg) {
  if (!cond) {
    printerr(`FAIL: ${msg}`);
    failed++;
  }
}

check(PLOG_VERSION === "1.2.0", `PLOG_VERSION=${PLOG_VERSION}`);
check(typeof actions.toFile === "function", "actions.toFile");
check(defaults.pipelines.info[0] === actions.toConsole, "default console pipeline");

log.init({
  file: logFile,
  level: "info",
  sessionId: "GjS01",
  sessionFg: "c0ffee",
  sessionBg: "1a1a1a",
  now: () => "2026-08-22_12:00:00",
});

const line = log.info("gjs-smoke-line");
check(typeof line === "string" && line.includes("gjs-smoke-line"), "info return");
check(line.includes("\x1b["), "returned ansiText has CSI");

const file = Gio.File.new_for_path(logFile);
check(file.query_exists(null), "log file exists");
const [, contents] = file.load_contents(null);
const text = new TextDecoder().decode(contents);
check(text.includes("gjs-smoke-line"), "file contains message");
check(text.includes("[GjS01]"), "file contains session");
check(text.includes("\x1b["), "file has ANSI (Gio toFile wrote ansiText)");

const dual = GLib.build_filenamev([tmpDir, "dual.log"]);
log.init({
  file: dual,
  console: true,
  sessionId: "GjS02",
  sessionFg: "c0ffee",
  sessionBg: "1a1a1a",
  now: () => "2026-08-22_12:00:01",
});
log.info("dual-sink");
check(Gio.File.new_for_path(dual).query_exists(null), "dual file exists");

try {
  Gio.File.new_for_path(logFile).delete(null);
  Gio.File.new_for_path(dual).delete(null);
  Gio.File.new_for_path(tmpDir).delete(null);
} catch (_) {
  /* leave tmp on failure */
}

if (failed) {
  printerr(`plog.gjs.smoke: ${failed} failed`);
  System.exit(1);
}
print(`plog.gjs.smoke: ok (PLOG_VERSION=${PLOG_VERSION})`);
