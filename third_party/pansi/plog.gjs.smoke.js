#!/usr/bin/env -S gjs -m
/**
 * GJS smoke: import plog.gjs.js, init({ file }), emit, prove Gio-backed bytes.
 * Also exercises shared-core toJsonl via Gio append.
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

check(PLOG_VERSION === "1.3.0", `PLOG_VERSION=${PLOG_VERSION}`);
check(typeof actions.toFile === "function", "actions.toFile");
check(typeof actions.toJsonl === "function", "actions.toJsonl");
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

const jsonlPath = GLib.build_filenamev([tmpDir, "tape.jsonl"]);
const dualLog = GLib.build_filenamev([tmpDir, "tape.log"]);
log.init({
  file: dualLog,
  jsonl: jsonlPath,
  sessionId: "GjS03",
  sessionFg: "c0ffee",
  sessionBg: "1a1a1a",
  now: () => "2026-08-22_12:00:02",
});
check(log.options.jsonl === jsonlPath, `options.jsonl=${log.options.jsonl}`);
const acts = log.listActions("info");
check(acts.length === 2, `action count=${acts.length}`);
check(acts[0].name === "toFile", `act0=${acts[0].name}`);
check(acts[1].name === "toJsonl", `act1=${acts[1].name}`);
log.info("jsonl-line", { fields: { k: 1, ok: true } });
log.info("a\nb\rc");

const jfile = Gio.File.new_for_path(jsonlPath);
check(jfile.query_exists(null), "jsonl exists");
const [, jbytes] = jfile.load_contents(null);
const jtext = new TextDecoder().decode(jbytes);
const jrows = jtext
  .split("\n")
  .filter((l) => l.length > 0)
  .map((l) => JSON.parse(l));
check(jrows.length === 2, `jsonl rows=${jrows.length}`);
check(jrows[0].v === 1 && jrows[0].text === "jsonl-line", "row0 text");
check(jrows[0].payload && jrows[0].payload.k === 1, "row0 payload");
check(jrows[0].level === "info" && jrows[0].levelN === 30, "row0 level");
check(typeof jrows[0].id === "string" && jrows[0].id.startsWith("GjS03:"), `id=${jrows[0].id}`);
check(jrows[0].timestamp === "2026-08-22_12:00:02", "row0 ts");
check(typeof jrows[0].unix === "number", "row0 unix");
check(jrows[1].text === "a\nb\rc", "jsonl real newlines");
check(jrows[1].text.includes("\n") && jrows[1].text.includes("\r"), "jsonl nl/cr");

const [, logBytes] = Gio.File.new_for_path(dualLog).load_contents(null);
const logPlain = new TextDecoder().decode(logBytes);
check(logPlain.includes("a\\nb\\rc") || /a\\nb\\rc/.test(logPlain), "H0 escapes on .log");

log.clear();
check(Gio.File.new_for_path(dualLog).query_exists(null), "log still exists after clear");
const [, afterLog] = Gio.File.new_for_path(dualLog).load_contents(null);
const [, afterJsonl] = Gio.File.new_for_path(jsonlPath).load_contents(null);
check(afterLog.byteLength === 0, "log truncated");
check(afterJsonl.byteLength === 0, "jsonl truncated");

try {
  Gio.File.new_for_path(logFile).delete(null);
  Gio.File.new_for_path(dual).delete(null);
  Gio.File.new_for_path(dualLog).delete(null);
  Gio.File.new_for_path(jsonlPath).delete(null);
  Gio.File.new_for_path(tmpDir).delete(null);
} catch (_) {
  /* leave tmp on failure */
}

if (failed) {
  printerr(`plog.gjs.smoke: ${failed} failed`);
  System.exit(1);
}
print(`plog.gjs.smoke: ok (PLOG_VERSION=${PLOG_VERSION})`);
