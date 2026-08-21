#!/usr/bin/env node

/**
 * plog.test.functional.js
 * L1a write-path tests (plog-design.md cases 1–20). Temp dirs only.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ansiStrip } from "./p.js";
import { log as importedLog, plog, logInit, PLOG_VERSION, LEVELS } from "./plog.js";
import logDefault from "./plog.js";

let testNum = 0;
let passed = 0;
let failed = 0;
const quietOnPass = true;

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";
const RESET = "\x1b[0m";

const TS = "2026-08-21_14:30:00";
const SID = "Ab3xK";
const FG = "c0ffee";
const BG = "1a1a1a";
const RECORD_RE =
  /^(\d{4}-\d{2}-\d{2}_\d{2}:\d{2}:\d{2}) (TRACE|DEBUG|INFO|WARN|ERROR) \[([A-Za-z0-9_-]{1,32})\] \| (.*)$/;

const TRACKED = [
  "HOME",
  "NO_COLOR",
  "FORCE_COLOR",
  "CLICOLOR_FORCE",
  "P_COLOR",
  "P_LOG_FILE",
  "P_LOG_FILE_STDERR",
  "P_LOG_LEVEL",
  "P_LOG_DEBUG",
  "P_LOG_TEE",
  "P_LOG_SESSION_ID",
  "P_LOG_SESSION_COLOR_FG",
  "P_LOG_SESSION_COLOR_BG",
  "P_LOG_COLOR",
];

const PLOG_HREF = pathToFileURL(fileURLToPath(new URL("./plog.js", import.meta.url))).href;
const PLOG_SRC_PATH = fileURLToPath(new URL("./plog.js", import.meta.url));

const operatorHome = process.env.HOME;
const operatorTracked = {};
for (const k of TRACKED) operatorTracked[k] = process.env[k];
const operatorPlog = {};
for (const k of Object.keys(process.env)) {
  if (k.startsWith("P_LOG_")) operatorPlog[k] = process.env[k];
}
const operatorLogs = [".plog.log", ".shellrc.log"].map((name) => {
  const pth = path.join(operatorHome, name);
  let st = null;
  try {
    st = fs.statSync(pth);
  } catch {
    st = null;
  }
  return {
    pth,
    exists: !!st,
    mtimeMs: st ? st.mtimeMs : null,
    size: st ? st.size : null,
  };
});

for (const k of Object.keys(process.env)) {
  if (k.startsWith("P_LOG_")) delete process.env[k];
}
delete process.env.NO_COLOR;
delete process.env.FORCE_COLOR;
delete process.env.CLICOLOR_FORCE;
delete process.env.P_COLOR;
delete process.env.P_LOG_COLOR;

const suiteRoot = fs.mkdtempSync(path.join(os.tmpdir(), "plog-l1a-"));
process.env.HOME = suiteRoot;

let loadSeq = 0;
let envSnap = {};

function printHeader(text) {
  console.log(`${MAGENTA}=== ${text} ===${RESET}\n`);
}

function printTestHeader(num, desc) {
  console.log(
    `${MAGENTA}------------------------------------------------------------------------------${RESET}`
  );
  console.log(`Test ${YELLOW}${num}${RESET}: ${CYAN}${desc}${RESET}`);
  console.log(
    `${MAGENTA}------------------------------------------------------------------------------${RESET}`
  );
}

function saveEnv() {
  envSnap = {};
  for (const k of TRACKED) envSnap[k] = process.env[k];
}

function restoreEnv() {
  for (const k of TRACKED) {
    if (envSnap[k] === undefined) delete process.env[k];
    else process.env[k] = envSnap[k];
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function throws(fn, re) {
  let err;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  assert(err, "expected throw");
  if (re && !re.test(String(err.message))) {
    throw new Error(`throw ${JSON.stringify(err.message)} !~ ${re}`);
  }
}

async function loadPlog() {
  const url = new URL("./plog.js", import.meta.url);
  url.searchParams.set("n", String(++loadSeq));
  return import(url.href);
}

function standardInit(log, extra = {}) {
  return log.init({
    tee: "none",
    sessionId: SID,
    sessionFg: FG,
    sessionBg: BG,
    now: () => TS,
    randomId: () => SID,
    ...extra,
  });
}

function records(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return ansiStrip(fs.readFileSync(filePath, "utf8"))
    .split("\n")
    .filter((l) => l.length > 0);
}

function captureStdio(fn) {
  const ow = process.stdout.write;
  const ew = process.stderr.write;
  let out = "";
  let err = "";
  process.stdout.write = (s) => {
    out += String(s);
    return true;
  };
  process.stderr.write = (s) => {
    err += String(s);
    return true;
  };
  try {
    const result = fn();
    return { result, out, err };
  } finally {
    process.stdout.write = ow;
    process.stderr.write = ew;
  }
}

async function run(desc, fn) {
  testNum++;
  saveEnv();
  const caseDir = fs.mkdtempSync(path.join(suiteRoot, `t${testNum}-`));
  const logFile = path.join(caseDir, "app.log");
  try {
    await fn({ caseDir, logFile });
    passed++;
    if (!quietOnPass) {
      printTestHeader(testNum, desc);
      console.log(`${GREEN}✓ PASS${RESET}\n`);
    }
  } catch (err) {
    failed++;
    printTestHeader(testNum, desc);
    console.log(`${RED}✗ FAIL${RESET}`);
    console.log(err && err.stack ? err.stack : err);
    console.log("");
  } finally {
    restoreEnv();
  }
}

printHeader("plog L1a write path");

await run("L1a-1 default min info drops trace/debug; emits info+", async ({ logFile }) => {
  const { log } = await loadPlog();
  standardInit(log, { file: logFile });
  assert(log.options.level === "info");
  assert(log.trace("t") === "");
  assert(log.debug("d") === "");
  assert(log.info("i") !== "");
  assert(log.warn("w") !== "");
  assert(log.error("e") !== "");
  const recs = records(logFile);
  const parsed = recs.map((l) => {
    const m = l.match(RECORD_RE);
    assert(m, `bad record: ${l}`);
    return { level: m[2], msg: m[4] };
  });
  assert(parsed[0].level === "INFO" && parsed[0].msg.includes("plog session start"));
  const user = parsed.filter((r) => !r.msg.includes("plog session start"));
  assert(user.map((r) => r.level).join(",") === "INFO,WARN,ERROR");
  assert(user.map((r) => r.msg).join(",") === "i,w,e");
  assert(!parsed.some((r) => r.level === "TRACE" || r.level === "DEBUG"));
});

await run("L1a-2 P_LOG_DEBUG=1 emits debug, still drops trace", async ({ logFile }) => {
  process.env.P_LOG_DEBUG = "1";
  const { log } = await loadPlog();
  standardInit(log, { file: logFile });
  assert(log.options.level === "debug");
  assert(log.debug("d") !== "");
  assert(log.trace("t") === "");
  const recs = records(logFile);
  assert(recs.some((l) => RECORD_RE.test(l) && l.includes("DEBUG") && l.endsWith("| d")));
  assert(!recs.some((l) => l.includes("TRACE")));
});

await run("L1a-3 P_LOG_LEVEL=trace wins over P_LOG_DEBUG", async ({ logFile }) => {
  process.env.P_LOG_DEBUG = "1";
  process.env.P_LOG_LEVEL = "trace";
  const { log } = await loadPlog();
  standardInit(log, { file: logFile });
  assert(log.options.level === "trace");
  assert(log.trace("t") !== "");
  const recs = records(logFile);
  assert(recs.some((l) => l.includes("TRACE") && l.endsWith("| t")));
});

await run("L1a-4 P_LOG_DEBUG=false does not emit debug", async ({ logFile }) => {
  process.env.P_LOG_DEBUG = "false";
  const { log } = await loadPlog();
  standardInit(log, { file: logFile });
  assert(log.options.level === "info");
  assert(log.debug("d") === "");
  assert(log.info("i") !== "");
  const recs = records(logFile);
  assert(!recs.some((l) => l.includes("DEBUG")));
  assert(recs.some((l) => l.includes("INFO") && l.endsWith("| i")));
});

await run("L1a-5 file contains ANSI when NO_COLOR=1", async ({ logFile }) => {
  process.env.NO_COLOR = "1";
  const { log } = await loadPlog();
  standardInit(log, { file: logFile });
  log.info("hello");
  const raw = fs.readFileSync(logFile, "utf8");
  assert(raw.includes("\x1b["), "file missing CSI");
  assert(raw.includes("hello"));
});

await run("L1a-6 tee non-TTY + NO_COLOR=1 is stripped; file still ANSI", async ({ logFile }) => {
  process.env.NO_COLOR = "1";
  const { log } = await loadPlog();
  standardInit(log, { file: logFile, tee: "stderr" });
  const { err } = captureStdio(() => log.info("hello"));
  const raw = fs.readFileSync(logFile, "utf8");
  assert(raw.includes("\x1b["), "file missing CSI");
  assert(!err.includes("\x1b["), "tee still has CSI");
  assert(err.includes("hello"));
  assert(ansiStrip(err).includes(`${TS} INFO [${SID}] | hello`));
});

await run("L1a-7 filtered debug creates neither file nor banner", async ({ logFile }) => {
  const { log } = await loadPlog();
  standardInit(log, { file: logFile });
  assert(log.debug("secret") === "");
  assert(!fs.existsSync(logFile), "debug created file");
  log.info("boot");
  assert(fs.existsSync(logFile));
  const raw = fs.readFileSync(logFile, "utf8");
  assert(raw.includes("plog session start"));
  assert(raw.includes("boot"));
  assert(!raw.includes("secret"));
});

await run("L1a-8 banner still writes when min level is warn", async ({ logFile }) => {
  const { log } = await loadPlog();
  standardInit(log, { file: logFile, level: "warn" });
  log.warn("w");
  const recs = records(logFile);
  assert(recs.length === 2, `expected banner+line, got ${recs.length}`);
  assert(recs[0].includes("INFO") && recs[0].includes("plog session start id=Ab3xK"));
  assert(recs[1].startsWith(`${TS} WARN [${SID}] | w`));
});

await run("L1a-9 never-init + env session id skips banner", async ({ caseDir, logFile }) => {
  const src = `
import { log } from ${JSON.stringify(PLOG_HREF)};
import fs from "node:fs";
const dest = log.dest;
const envAfterMaterialize = process.env.P_LOG_SESSION_ID;
const line = log.info("hello");
const envAfterWrite = process.env.P_LOG_SESSION_ID;
const text = fs.readFileSync(process.env.P_LOG_FILE, "utf8");
process.stdout.write(JSON.stringify({
  dest,
  envAfterMaterialize,
  envAfterWrite,
  text,
  line,
}));
`;
  const env = { ...process.env };
  env.HOME = caseDir;
  env.P_LOG_FILE = logFile;
  env.P_LOG_TEE = "none";
  env.P_LOG_SESSION_ID = SID;
  env.P_LOG_SESSION_COLOR_FG = FG;
  env.P_LOG_SESSION_COLOR_BG = BG;
  delete env.P_LOG_LEVEL;
  delete env.P_LOG_DEBUG;
  delete env.P_LOG_FILE_STDERR;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", src], {
    encoding: "utf8",
    env,
  });
  assert(r.status === 0, `child failed: ${r.stderr || r.stdout}`);
  const data = JSON.parse(r.stdout);
  assert(data.envAfterMaterialize === SID, "materialize cleared session env");
  assert(data.envAfterWrite === SID);
  assert(!data.text.includes("plog session start"), "inherit wrote banner");
  const recs = ansiStrip(data.text)
    .split("\n")
    .filter((l) => l.length > 0);
  assert(recs.length === 1);
  assert(RECORD_RE.test(recs[0]));
  assert(recs[0].endsWith("| hello"));
  assert(recs[0].includes(`[${SID}]`));
});

await run(
  "L1a-10 init({ sessionId }) writes banner; init() clears sticky",
  async ({ caseDir, logFile }) => {
    const { log } = await loadPlog();
    standardInit(log, { file: logFile });
    assert(log.options.sessionId === SID);
    log.info("boot");
    const text = fs.readFileSync(logFile, "utf8");
    assert(text.includes("plog session start id=Ab3xK"));
    assert(text.includes("boot"));

    process.env.P_LOG_SESSION_ID = "OldId01";
    process.env.P_LOG_SESSION_COLOR_FG = "111111";
    process.env.P_LOG_SESSION_COLOR_BG = "222222";
    const { log: logB } = await loadPlog();
    const fileB = path.join(caseDir, "b.log");
    logB.init({
      file: fileB,
      tee: "none",
      sessionFg: FG,
      sessionBg: BG,
      now: () => TS,
      randomId: () => SID,
    });
    assert(process.env.P_LOG_SESSION_ID === undefined, "init() did not clear session id");
    assert(logB.options.sessionId === null);
    logB.info("new");
    const textB = fs.readFileSync(fileB, "utf8");
    assert(textB.includes("plog session start id=Ab3xK"));
    assert(process.env.P_LOG_SESSION_ID === SID);
  }
);

await run("L1a-11 ansi_strip(line) matches canonical regex", async ({ logFile }) => {
  const { log } = await loadPlog();
  standardInit(log, { file: logFile });
  const line = log.info("hello");
  const plain = ansiStrip(line).replace(/\n$/, "");
  const m = plain.match(RECORD_RE);
  assert(m, `no match: ${JSON.stringify(plain)}`);
  assert(m[1] === TS);
  assert(m[2] === "INFO");
  assert(m[3] === SID);
  assert(m[4] === "hello");
  for (const rec of records(logFile)) {
    assert(RECORD_RE.test(rec), rec);
  }
});

await run('L1a-12 first " | " split round-trips message containing " | "', async ({ logFile }) => {
  const { log } = await loadPlog();
  standardInit(log, { file: logFile });
  const line = log.info("keep | pipes | here");
  const raw = line.replace(/\n$/, "");
  const idx = raw.indexOf(" | ");
  assert(idx >= 0);
  const msg = ansiStrip(raw.slice(idx + 3));
  assert(msg === "keep | pipes | here", msg);
});

await run("L1a-13 newlines in message become \\\\n", async ({ logFile }) => {
  const { log } = await loadPlog();
  standardInit(log, { file: logFile });
  const line = log.info("a\nb\rc");
  assert(!line.slice(0, -1).includes("\n"), "record not single-line");
  const plain = ansiStrip(line).replace(/\n$/, "");
  const m = plain.match(RECORD_RE);
  assert(m, plain);
  assert(m[4] === "a\\nb\\rc", m[4]);
});

await run("L1a-14 distinct errorFile gets error user lines only", async ({ caseDir, logFile }) => {
  const errFile = path.join(caseDir, "err.log");
  const { log } = await loadPlog();
  standardInit(log, { file: logFile, errorFile: errFile });
  log.error("boom");
  log.warn("warn-only");
  log.info("info-only");
  const primary = fs.readFileSync(logFile, "utf8");
  const extra = fs.readFileSync(errFile, "utf8");
  assert(primary.includes("plog session start"));
  assert(!extra.includes("plog session start"), "banner copied to errorFile");
  assert(ansiStrip(primary).includes("ERROR") && primary.includes("boom"));
  assert(ansiStrip(extra).includes("ERROR") && extra.includes("boom"));
  assert(!extra.includes("warn-only"));
  assert(!extra.includes("info-only"));
  assert(primary.includes("warn-only") && primary.includes("info-only"));
  const extraRecs = records(errFile);
  assert(extraRecs.length === 1);
});

await run("L1a-15 equal file paths → single write", async ({ logFile }) => {
  const { log } = await loadPlog();
  standardInit(log, { file: logFile, errorFile: logFile });
  log.error("boom");
  const raw = fs.readFileSync(logFile, "utf8");
  assert(raw.split("boom").length - 1 === 1, "error line written twice");
});

await run("L1a-16 file: undefined uses default; file: null disables", async ({ caseDir }) => {
  const home = fs.mkdtempSync(path.join(caseDir, "home-"));
  process.env.HOME = home;
  delete process.env.P_LOG_FILE;
  const { log } = await loadPlog();
  log.init({
    file: undefined,
    tee: "none",
    sessionId: SID,
    sessionFg: FG,
    sessionBg: BG,
    now: () => TS,
  });
  assert(log.dest === path.join(home, ".plog.log"));
  assert(log.options.file === log.dest);

  const home2 = fs.mkdtempSync(path.join(caseDir, "home2-"));
  process.env.HOME = home2;
  const { log: logOff } = await loadPlog();
  logOff.init({
    file: null,
    tee: "none",
    sessionId: SID,
    sessionFg: FG,
    sessionBg: BG,
    now: () => TS,
  });
  assert(logOff.dest === null);
  assert(logOff.options.file === null);
  const returned = logOff.info("noop");
  assert(returned !== "", "no-sink write should still return the line");
  assert(!fs.existsSync(path.join(home2, ".plog.log")));
  assert(!fs.existsSync(path.join(home, ".plog.log")));

  const { log: logFalse } = await loadPlog();
  logFalse.init({ file: false, tee: "none", sessionId: SID, sessionFg: FG, sessionBg: BG });
  assert(logFalse.dest === null);
  const { log: logEmpty } = await loadPlog();
  logEmpty.init({ file: "", tee: "none", sessionId: SID, sessionFg: FG, sessionBg: BG });
  assert(logEmpty.dest === null);
});

await run("L1a-17 invalid session id charset throws", async ({ logFile }) => {
  const { log } = await loadPlog();
  throws(() => standardInit(log, { file: logFile, sessionId: "has space" }), /session id charset/);
  const { log: log2 } = await loadPlog();
  throws(
    () => standardInit(log2, { file: logFile, sessionId: "id.with.dots" }),
    /session id charset/
  );
  const { log: log3 } = await loadPlog();
  throws(
    () => standardInit(log3, { file: logFile, sessionId: "x".repeat(33) }),
    /session id charset/
  );
  const { log: log4 } = await loadPlog();
  throws(() => standardInit(log4, { file: logFile, sessionId: "bad!" }), /session id charset/);

  process.env.P_LOG_FILE = logFile;
  process.env.P_LOG_SESSION_ID = "!!!";
  const { log: log5 } = await loadPlog();
  throws(() => log5.info("x"), /session id charset/);

  const { log: logOk } = await loadPlog();
  standardInit(logOk, { file: logFile, sessionId: "a-b_1" });
  logOk.info("ok");
  assert(records(logFile).some((l) => l.includes("[a-b_1]")));
});

await run("L1a-18 new file mode 0600; no mkdir -p", async ({ caseDir, logFile }) => {
  const { log } = await loadPlog();
  standardInit(log, { file: logFile, tee: "none" });
  log.info("hello");
  const mode = fs.statSync(logFile).mode & 0o777;
  assert(mode === 0o600, `mode ${mode.toString(8)} !== 0600`);

  const missing = path.join(caseDir, "no-such-dir", "x.log");
  const { log: log2 } = await loadPlog();
  standardInit(log2, { file: missing, tee: "stderr" });
  const { result, err } = captureStdio(() => log2.info("teed"));
  assert(!fs.existsSync(missing));
  assert(!fs.existsSync(path.dirname(missing)), "mkdir -p happened");
  assert(err.includes("cannot write"), err);
  assert(result.includes("teed"), "tee should still succeed");
  assert(ansiStrip(err).includes("teed"));
});

await run("L1a-19 no $shellrc / SHELLRC_* / pscript in JS", async () => {
  const src = fs.readFileSync(PLOG_SRC_PATH, "utf8");
  assert(!src.includes("SHELLRC_"), "SHELLRC_ in plog.js");
  assert(!src.includes("$shellrc"), "$shellrc in plog.js");
  assert(!src.includes("pscript"), "pscript import in plog.js");
  assert(!src.includes("module.exports"), "CJS shim in plog.js");
  assert(src.includes('from "./p.js"'));
  assert(src.includes('from "./ansi_color.js"'));
});

await run('L1a-20 ESM import { log } from "./plog.js"', async ({ logFile }) => {
  assert(PLOG_VERSION === "1.0.0");
  assert(importedLog === plog);
  assert(importedLog === logDefault);
  assert(typeof logInit === "function");
  assert(LEVELS.trace === 10 && LEVELS.debug === 20 && LEVELS.info === 30);
  assert(LEVELS.warn === 40 && LEVELS.error === 50);
  assert(Object.isFrozen(LEVELS));
  logInit({
    file: logFile,
    tee: "none",
    sessionId: SID,
    sessionFg: FG,
    sessionBg: BG,
    now: () => TS,
  });
  importedLog.info("esm");
  assert(fs.existsSync(logFile));
  assert(ansiStrip(fs.readFileSync(logFile, "utf8")).includes("esm"));
});

function operatorLogsUntouched() {
  for (const snap of operatorLogs) {
    let st = null;
    try {
      st = fs.statSync(snap.pth);
    } catch {
      st = null;
    }
    if (!snap.exists) {
      assert(!st, `test created ${snap.pth}`);
    } else {
      assert(st, `test removed ${snap.pth}`);
      assert(st.mtimeMs === snap.mtimeMs && st.size === snap.size, `test mutated ${snap.pth}`);
    }
  }
}

let cleanupErr = null;
try {
  operatorLogsUntouched();
} catch (err) {
  cleanupErr = err;
}

try {
  fs.rmSync(suiteRoot, { recursive: true, force: true });
} catch {
  /* ignore */
}

for (const k of Object.keys(process.env)) {
  if (k.startsWith("P_LOG_")) delete process.env[k];
}
for (const [k, v] of Object.entries(operatorPlog)) process.env[k] = v;
for (const k of TRACKED) {
  if (operatorTracked[k] === undefined) delete process.env[k];
  else process.env[k] = operatorTracked[k];
}

if (cleanupErr) {
  failed++;
  printTestHeader("cleanup", "never touch ~/.plog.log / ~/.shellrc.log");
  console.log(cleanupErr);
}

console.log(`\n${MAGENTA}=== Results ===${RESET}`);
console.log(`${passed} passed, ${failed} failed`);

if (failed > 0) process.exit(1);
