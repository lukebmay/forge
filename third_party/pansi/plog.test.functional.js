#!/usr/bin/env node

/**
 * plog.test.functional.js
 * Action pipelines (D064) + view/clear/wrappers. Temp dirs only.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ansiStrip } from "./p.js";
import {
  log as importedLog,
  plog,
  logInit,
  PLOG_VERSION,
  LEVELS,
  STOCK_LEVELS,
  actions,
  defaults,
} from "./plog.js";
import logDefault from "./plog.js";

const require = createRequire(import.meta.url);

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
  "P_LOG_JSONL",
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

const suiteRoot = fs.mkdtempSync(path.join(os.tmpdir(), "plog-l1-"));
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

printHeader("plog write path / progressive defaults");

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
  assert(!parsed.some((r) => r.msg.includes("plog session start")), "magic banner");
  assert(parsed.map((r) => r.level).join(",") === "INFO,WARN,ERROR");
  assert(parsed.map((r) => r.msg).join(",") === "i,w,e");
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

await run("L1a-6 file+console NO_COLOR=1 strips console; file still ANSI", async ({ logFile }) => {
  process.env.NO_COLOR = "1";
  const { log } = await loadPlog();
  standardInit(log, { file: logFile, console: true });
  const { out } = captureStdio(() => log.info("hello"));
  const raw = fs.readFileSync(logFile, "utf8");
  assert(raw.includes("\x1b["), "file missing CSI");
  assert(!out.includes("\x1b["), "console still has CSI");
  assert(out.includes("hello"));
  assert(ansiStrip(out).includes(`${TS} INFO [${SID}] | hello`));
});

await run("L1a-7 filtered debug creates neither file nor banner", async ({ logFile }) => {
  const { log } = await loadPlog();
  standardInit(log, { file: logFile });
  assert(log.debug("secret") === "");
  assert(!fs.existsSync(logFile), "debug created file");
  log.info("boot");
  assert(fs.existsSync(logFile));
  const raw = fs.readFileSync(logFile, "utf8");
  assert(!raw.includes("plog session start"), "magic banner");
  assert(raw.includes("boot"));
  assert(!raw.includes("secret"));
});

await run("L1a-8 no banner when min level is warn", async ({ logFile }) => {
  const { log } = await loadPlog();
  standardInit(log, { file: logFile, level: "warn" });
  log.warn("w");
  const recs = records(logFile);
  assert(recs.length === 1, `expected one line, got ${recs.length}`);
  assert(recs[0].startsWith(`${TS} WARN [${SID}] | w`));
  assert(!recs[0].includes("plog session start"));
});

await run(
  "L1a-9 never-init + env session id; no banner; P_LOG_FILE works",
  async ({ caseDir, logFile }) => {
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
    assert(data.dest === logFile);
    assert(data.envAfterMaterialize === SID, "materialize cleared session env");
    assert(data.envAfterWrite === SID);
    assert(!data.text.includes("plog session start"), "wrote banner");
    const recs = ansiStrip(data.text)
      .split("\n")
      .filter((l) => l.length > 0);
    assert(recs.length === 1);
    assert(RECORD_RE.test(recs[0]));
    assert(recs[0].endsWith("| hello"));
    assert(recs[0].includes(`[${SID}]`));
  }
);

await run(
  "L1a-10 init({ sessionId }) no banner; init() clears sticky",
  async ({ caseDir, logFile }) => {
    const { log } = await loadPlog();
    standardInit(log, { file: logFile });
    assert(log.options.sessionId === SID);
    log.info("boot");
    const text = fs.readFileSync(logFile, "utf8");
    assert(!text.includes("plog session start"));
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
    assert(!textB.includes("plog session start"));
    assert(textB.includes("new"));
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

await run("L1a-13 newlines in message become \\\\n", async ({ caseDir, logFile }) => {
  const { log } = await loadPlog();
  standardInit(log, { file: logFile });
  const line = log.info("a\nb\rc");
  assert(!line.slice(0, -1).includes("\n"), "record not single-line");
  const plain = ansiStrip(line).replace(/\n$/, "");
  const m = plain.match(RECORD_RE);
  assert(m, plain);
  assert(m[4] === "a\\nb\\rc", m[4]);

  const jsonlPath = path.join(caseDir, "app.jsonl");
  const { log: logDual } = await loadPlog();
  standardInit(logDual, { file: logFile + ".dual", jsonl: jsonlPath });
  logDual.info("a\nb\rc");
  const dualPlain = ansiStrip(fs.readFileSync(logFile + ".dual", "utf8"))
    .trim()
    .split("\n")
    .pop();
  const dm = dualPlain.match(RECORD_RE);
  assert(dm, dualPlain);
  assert(dm[4] === "a\\nb\\rc", dm[4]);
  const rows = fs
    .readFileSync(jsonlPath, "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));
  assert(rows.length === 1);
  assert(rows[0].text === "a\nb\rc", JSON.stringify(rows[0].text));
  assert(rows[0].text.includes("\n") && rows[0].text.includes("\r"));
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
  assert(!primary.includes("plog session start"));
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

await run(
  "L1a-16 no default ~/.plog.log; file null + console false = no sink",
  async ({ caseDir }) => {
    const home = fs.mkdtempSync(path.join(caseDir, "home-"));
    process.env.HOME = home;
    delete process.env.P_LOG_FILE;
    const { log } = await loadPlog();
    log.init({
      tee: "none",
      sessionId: SID,
      sessionFg: FG,
      sessionBg: BG,
      now: () => TS,
    });
    assert(log.dest === null, "zero-config must not invent home file");
    assert(log.options.file === null);
    const { out } = captureStdio(() => log.info("console-default"));
    assert(out.includes("console-default"), "zero-config should console");
    assert(!fs.existsSync(path.join(home, ".plog.log")), "created ~/.plog.log");

    const home2 = fs.mkdtempSync(path.join(caseDir, "home2-"));
    process.env.HOME = home2;
    const { log: logOff } = await loadPlog();
    logOff.init({
      file: null,
      console: false,
      tee: "none",
      sessionId: SID,
      sessionFg: FG,
      sessionBg: BG,
      now: () => TS,
    });
    assert(logOff.dest === null);
    assert(logOff.options.file === null);
    const { result, out: out2 } = captureStdio(() => logOff.info("noop"));
    assert(result !== "", "no-sink write should still return the line");
    assert(!out2.includes("noop"), "console:false still printed");
    assert(!fs.existsSync(path.join(home2, ".plog.log")));

    const { log: logFalse } = await loadPlog();
    logFalse.init({
      file: false,
      console: false,
      tee: "none",
      sessionId: SID,
      sessionFg: FG,
      sessionBg: BG,
    });
    assert(logFalse.dest === null);
    const { log: logEmpty } = await loadPlog();
    logEmpty.init({
      file: "",
      console: false,
      tee: "none",
      sessionId: SID,
      sessionFg: FG,
      sessionBg: BG,
    });
    assert(logEmpty.dest === null);
  }
);

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

await run(
  "L1a-18 new file mode 0600; no mkdir -p; console survives file fail",
  async ({ caseDir, logFile }) => {
    const { log } = await loadPlog();
    standardInit(log, { file: logFile, tee: "none" });
    log.info("hello");
    const mode = fs.statSync(logFile).mode & 0o777;
    assert(mode === 0o600, `mode ${mode.toString(8)} !== 0600`);

    const missing = path.join(caseDir, "no-such-dir", "x.log");
    const { log: log2 } = await loadPlog();
    standardInit(log2, { file: missing, console: true });
    const { result, out, err } = captureStdio(() => log2.info("teed"));
    assert(!fs.existsSync(missing));
    assert(!fs.existsSync(path.dirname(missing)), "mkdir -p happened");
    assert(err.includes("cannot write") || err.includes("action toFile"), err);
    assert(result.includes("teed"), "console should still succeed");
    assert(out.includes("teed") || ansiStrip(out).includes("teed"));
  }
);

await run("L1a-19 no $shellrc / SHELLRC_* / pscript in JS", async () => {
  const jsDir = path.dirname(PLOG_SRC_PATH);
  const src = fs.readFileSync(PLOG_SRC_PATH, "utf8");
  const core = fs.readFileSync(path.join(jsDir, "plog-core.js"), "utf8");
  for (const [label, text] of [
    ["plog.js", src],
    ["plog-core.js", core],
  ]) {
    assert(!text.includes("SHELLRC_"), `SHELLRC_ in ${label}`);
    assert(!text.includes("$shellrc"), `$shellrc in ${label}`);
    assert(!text.includes("pscript"), `pscript import in ${label}`);
    assert(!text.includes("await import"), `${label} must stay free of top-level await`);
  }
  assert(src.includes("module.exports"), "expected CJS shim in plog.js");
  assert(src.includes('from "./plog-core.js"'));
  assert(src.includes('from "./plog-runtime-node.js"'));
  assert(core.includes('from "./p.js"'));
  assert(core.includes('from "./ansi_color.js"'));
  assert(!core.includes("node:"), "plog-core must not import node:*");
});

await run('L1a-20 ESM import { log } from "./plog.js"', async ({ logFile }) => {
  assert(PLOG_VERSION === "1.3.0");
  assert(importedLog === plog);
  assert(importedLog === logDefault);
  assert(typeof logInit === "function");
  assert(LEVELS.trace === 10 && LEVELS.debug === 20 && LEVELS.info === 30);
  assert(LEVELS.warn === 40 && LEVELS.error === 50);
  assert(Object.isFrozen(LEVELS));
  assert(STOCK_LEVELS.join(",") === "trace,debug,info,warn,error");
  assert(typeof actions.toConsole === "function");
  assert(typeof actions.toFile === "function");
  assert(typeof actions.toJsonl === "function");
  assert(defaults.pipelines.info[0] === actions.toConsole);
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

await run('L1a-21 require("./p.js") and require("./plog.js")', async ({ logFile }) => {
  const jsDir = path.dirname(PLOG_SRC_PATH);
  const pSrc = fs.readFileSync(path.join(jsDir, "p.js"), "utf8");
  assert(!pSrc.includes("await import"), "p.js must not use top-level await");

  const pMod = require("./p.js");
  assert(typeof pMod.p === "function", "require(p).p");
  assert(typeof pMod.pstr === "function", "require(p).pstr");
  assert(pMod.ps === pMod.pstr, "require(p).ps");
  assert(pMod.PANSI_VERSION === "1.0.0");
  assert(typeof pMod.ansiStrip === "function");

  const plogMod = require("./plog.js");
  const reqLog = plogMod.log || plogMod.default || plogMod;
  assert(typeof reqLog.init === "function", "require(plog).log.init");
  assert(typeof reqLog.info === "function");
  assert(plogMod.PLOG_VERSION === "1.3.0");
  assert(plogMod.LEVELS.info === 30);
  assert(typeof plogMod.actions.toConsole === "function");
  assert(typeof plogMod.actions.toJsonl === "function");
  assert(plogMod.defaults.pipelines.warn[0] === plogMod.actions.toConsole);

  reqLog.init({
    file: logFile,
    tee: "none",
    sessionId: SID,
    sessionFg: FG,
    sessionBg: BG,
    now: () => TS,
  });
  reqLog.info("via-require");
  assert(ansiStrip(fs.readFileSync(logFile, "utf8")).includes("via-require"));

  const child = spawnSync(
    process.execPath,
    [
      "-e",
      `const m=require(${JSON.stringify(path.join(jsDir, "plog.js"))});` +
        `if(!m.log||typeof m.log.info!=="function") process.exit(2);` +
        `if(m.PLOG_VERSION!=="1.3.0") process.exit(3);` +
        `if(!m.actions||typeof m.actions.toFile!=="function") process.exit(4);` +
        `if(typeof m.actions.toJsonl!=="function") process.exit(5);`,
    ],
    { encoding: "utf8" }
  );
  assert(child.status === 0, `child require failed: ${child.stderr || child.stdout}`);
});

printHeader("plog action pipelines");

await run("A-1 init({ file }) replaces console with toFile only", async ({ logFile }) => {
  const { log, actions: acts } = await loadPlog();
  standardInit(log, { file: logFile });
  const listed = log.listActions("info");
  assert(listed.length === 1);
  assert(listed[0].name === "toFile");
  const { out } = captureStdio(() => log.info("file-only"));
  assert(out === "" || !out.includes("file-only"), "console should be off");
  assert(records(logFile).some((l) => l.endsWith("| file-only")));
  assert(acts.toFile("x").name === "toFile");
});

await run("A-2 init({ file, console: true }) file then console", async ({ logFile }) => {
  const { log } = await loadPlog();
  const dest = logFile + ".2";
  standardInit(log, { file: dest, console: true });
  const fns = log.listActions("info");
  assert(fns.length === 2);
  assert(fns[0].name === "toFile");
  assert(fns[1].name === "toConsole");
  const { out } = captureStdio(() => log.info("both"));
  assert(fs.readFileSync(dest, "utf8").includes("both"));
  assert(out.includes("both"));
});

await run("A-3 payload fields on custom action", async ({ logFile }) => {
  const { log } = await loadPlog();
  let seen = null;
  standardInit(log, {
    file: logFile,
    level: "debug",
    actions: {
      info: [
        (rec) => {
          seen = rec;
        },
      ],
    },
  });
  log.info("+c", "payload-check");
  assert(seen);
  assert(seen.level === "info");
  assert(typeof seen.ansiText === "string" && seen.ansiText.endsWith("\n"));
  assert(typeof seen.plainText === "string" && seen.plainText.endsWith("\n"));
  assert(seen.plainText === ansiStrip(seen.ansiText));
  assert(seen.timestamp === TS);
  assert(seen.sessionId === SID);
  assert(seen.pid === process.pid);
  assert(Array.isArray(seen.originalArgs));
  assert(seen.originalArgs[0] === "+c");
  assert(seen.originalArgs[1] === "payload-check");
  assert(seen.plainText.includes("payload-check"));
  assert(seen.fields && typeof seen.fields === "object");
  assert(Object.keys(seen.fields).length === 0);
  assert(seen.levelN === 30);
  assert(seen.id === `${SID}:${process.pid}:1`, seen.id);
});

await run("A-4 add/remove/set/clear/listActions; init replaces", async ({ logFile }) => {
  const { log, actions: acts } = await loadPlog();
  standardInit(log, { file: logFile });
  const calls = [];
  const a = (rec) => {
    calls.push("a:" + ansiStrip(rec.ansiText).trim().split("| ").pop());
  };
  const b = (rec) => {
    calls.push("b:" + ansiStrip(rec.ansiText).trim().split("| ").pop());
  };
  const id = log.addAction("info", a, { name: "spyA" });
  assert(typeof id === "string");
  log.info("one");
  assert(calls.includes("a:one"));
  assert(log.removeAction("info", id));
  assert(!log.removeAction("info", id));
  log.setActions("info", [acts.toFile(logFile), b]);
  assert(log.listActions("info").length === 2);
  log.info("two");
  assert(calls.includes("b:two"));
  log.clearActions("info");
  assert(log.listActions("info").length === 0);
  const all = log.listActions();
  assert(all.warn && Array.isArray(all.warn));
  log.clearActions();
  for (const L of STOCK_LEVELS) assert(log.listActions(L).length === 0);

  log.init({
    file: logFile,
    tee: "none",
    sessionId: SID,
    sessionFg: FG,
    sessionBg: BG,
    now: () => TS,
  });
  assert(log.listActions("info").length === 1);
  assert(log.listActions("info")[0].name === "toFile");
});

await run("A-5 failure isolation; thenable warn; snapshot mid-emit", async ({ logFile }) => {
  const { log } = await loadPlog();
  const hits = [];
  const boom = () => {
    hits.push("boom");
    throw new Error("explode");
  };
  const ok = (rec) => {
    hits.push("ok");
    fs.appendFileSync(logFile, "OK:" + rec.plainText);
  };
  const asyncish = () => {
    hits.push("async");
    return Promise.resolve(1);
  };
  standardInit(log, {
    console: false,
    file: null,
    actions: { info: [boom, ok, asyncish] },
  });
  const { result, err } = captureStdio(() => log.info("iso"));
  assert(result !== "", "partial success should return line");
  assert(err.includes("action boom") || err.includes("explode"), err);
  assert(err.includes("async action ignored"), err);
  assert(hits.join(",") === "boom,ok,async");
  assert(fs.readFileSync(logFile, "utf8").includes("OK:"));

  const mid = [];
  const first = () => {
    mid.push("first");
    log.addAction("info", () => mid.push("late"));
  };
  const second = () => mid.push("second");
  log.setActions("info", [first, second]);
  log.info("snap");
  assert(mid.join(",") === "first,second", `snapshot broken: ${mid}`);
  mid.length = 0;
  log.info("next");
  assert(mid.includes("late"), "mutation should apply on later emit");
});

await run("A-6 non-array action sugar; explicit actions[level] replaces", async ({ logFile }) => {
  const { log, actions: acts } = await loadPlog();
  let n = 0;
  standardInit(log, {
    file: logFile,
    actions: {
      info: (rec) => {
        n++;
        acts.toFile(logFile)(rec);
      },
    },
  });
  assert(log.listActions("info").length === 1);
  assert(log.listActions("warn").length === 1);
  assert(log.listActions("warn")[0].name === "toFile");
  log.info("x");
  assert(n === 1);
  assert(records(logFile).some((l) => l.endsWith("| x")));
});

printHeader("plog L1b view / clear / wrappers");

await run("L1b-1 log.view({ list: true }) finds session from records", async ({ logFile }) => {
  const { log } = await loadPlog();
  standardInit(log, { file: logFile });
  log.info("boot");
  const raw = fs.readFileSync(logFile, "utf8");
  assert(!ansiStrip(raw).includes("plog session start id="));
  const { result, out } = captureStdio(() =>
    log.view({ list: true, str: true, color: "never", file: logFile })
  );
  assert(out === "", "str:true wrote stdout");
  assert(result.includes(`[${SID}]`), result);
  assert(result.includes(TS), result);
});

await run("L1b-2 log.clear({ sessions }) drops only that id", async ({ caseDir, logFile }) => {
  const { log: logA } = await loadPlog();
  standardInit(logA, { file: logFile, sessionId: SID });
  logA.info("from-a");

  const { log: logB } = await loadPlog();
  standardInit(logB, { file: logFile, sessionId: "Other1", sessionFg: FG, sessionBg: BG });
  logB.info("from-b");

  const before = records(logFile);
  assert(before.some((l) => l.includes(`[${SID}]`) && l.endsWith("| from-a")));
  assert(before.some((l) => l.includes("[Other1]") && l.endsWith("| from-b")));

  logA.clear({ file: logFile, sessions: [SID] });
  const after = records(logFile);
  assert(!after.some((l) => l.includes(`[${SID}]`)), after.join("\n"));
  assert(after.some((l) => l.includes("[Other1]") && l.endsWith("| from-b")));
  assert(!fs.existsSync(path.join(caseDir, "should-not-appear")));
});

await run(
  "L1b-3 full clear truncates in place; missing is success",
  async ({ caseDir, logFile }) => {
    const { log } = await loadPlog();
    standardInit(log, { file: logFile });
    log.info("wipe-me");
    assert(fs.existsSync(logFile));
    const stBefore = fs.statSync(logFile);
    assert(stBefore.size > 0);

    log.clear({ file: logFile });
    const stAfter = fs.statSync(logFile);
    assert(fs.existsSync(logFile), "clear unlinked file");
    assert(stAfter.size === 0, `size ${stAfter.size}`);
    assert(stAfter.ino === stBefore.ino, "inode changed (unlink+create?)");

    const missing = path.join(caseDir, "no-such.log");
    assert(!fs.existsSync(missing));
    log.clear({ file: missing });
    assert(!fs.existsSync(missing), "clear created missing file");
  }
);

await run("L1b-4 fileNamePretty logs without optional pretty import", async ({ logFile }) => {
  const { log } = await loadPlog();
  standardInit(log, { file: logFile });
  const line = log.fileNamePretty("/opt/app/bin");
  assert(line !== "");
  const plain = ansiStrip(line).replace(/\n$/, "");
  assert(plain.endsWith("| bin (/opt/app/bin)"), plain);
  const recs = records(logFile);
  assert(recs.some((l) => l.includes("bin") && l.includes("/opt/app/bin")));
  const src = fs.readFileSync(PLOG_SRC_PATH, "utf8");
  assert(!src.includes("pscript"), "optional UX import must stay out of plog.js");
});

await run("L1b-5 filePath logs; log.dest does not", async ({ logFile }) => {
  const { log } = await loadPlog();
  standardInit(log, { file: logFile });
  log.info("seed");
  const sizeBefore = fs.statSync(logFile).size;
  const dest = log.dest;
  assert(dest === logFile);
  assert(fs.statSync(logFile).size === sizeBefore, "dest getter logged");
  assert(log.options.file === logFile);
  assert(fs.statSync(logFile).size === sizeBefore, "options getter logged");

  const line = log.filePath("/opt/app/bin");
  assert(line !== "");
  const abs = path.resolve("/opt/app/bin");
  assert(ansiStrip(line).includes(abs));
  assert(records(logFile).some((l) => l.endsWith(`| ${abs}`)));

  throws(() => log.filePath(""), /path required/);
  throws(() => log.filePath(null), /path required/);
});

await run("L1b-6 view str:true silent; missing file throws", async ({ caseDir, logFile }) => {
  const { log } = await loadPlog();
  standardInit(log, { file: logFile });
  log.info("hello");
  const { result, out } = captureStdio(() =>
    log.view({ all: true, str: true, color: "never", file: logFile })
  );
  assert(out === "", "str:true wrote stdout");
  assert(ansiStrip(result).includes("hello"));

  const missing = path.join(caseDir, "gone.log");
  const { err } = captureStdio(() => {
    throws(() => log.view({ list: true, str: true, file: missing }), /Log file not found/);
  });
  assert(ansiStrip(err).includes("Log file not found"), err);
});

await run(
  "L1b-7 view sessions digit ids filter sessions not last-N",
  async ({ caseDir, logFile }) => {
    const { log: log50 } = await loadPlog();
    standardInit(log50, { file: logFile, sessionId: "50" });
    log50.info("fifty");

    const { log: log60 } = await loadPlog();
    standardInit(log60, { file: logFile, sessionId: "60" });
    log60.info("sixty");

    const { log: logPad } = await loadPlog();
    standardInit(logPad, { file: logFile, sessionId: SID });
    for (let i = 0; i < 40; i++) logPad.info(`pad-${i}`);

    const listed = logPad.view({
      sessions: ["50", "60"],
      str: true,
      color: "never",
      file: logFile,
    });
    const plain = ansiStrip(listed);
    assert(plain.includes("fifty"), plain);
    assert(plain.includes("sixty"), plain);
    assert(plain.includes("[50]") && plain.includes("[60]"));
    assert(!plain.includes("pad-39"), "treated as last-N instead of sessions");
    assert(!plain.includes(`[${SID}]`) || plain.includes("session(s)"), plain);
    const user = plain.split("\n").filter((l) => RECORD_RE.test(l));
    assert(
      user.every((l) => l.includes("[50]") || l.includes("[60]")),
      user.join("\n")
    );
  }
);

printHeader("plog L3 dual-tape write path (D066)");

await run("L3-1 peel fields; no [object Object]; payload + id", async ({ caseDir, logFile }) => {
  const jsonlPath = path.join(caseDir, "peel.jsonl");
  const { log } = await loadPlog();
  standardInit(log, { file: logFile, jsonl: jsonlPath, level: "debug" });
  const line = log.info("hello", { fields: { key: "foo", n: 12 } });
  assert(!ansiStrip(line).includes("[object Object]"), line);
  assert(records(logFile).some((l) => l.endsWith("| hello")));
  assert(!records(logFile).some((l) => l.includes("object Object")));
  const row = JSON.parse(fs.readFileSync(jsonlPath, "utf8").trim().split("\n")[0]);
  assert(row.v === 1);
  assert(row.payload.key === "foo" && row.payload.n === 12);
  assert(row.text === "hello");
  assert(row.level === "info" && row.levelN === 30);
  assert(row.sessionId === SID);
  assert(row.pid === process.pid);
  assert(row.id === `${SID}:${process.pid}:1`, row.id);
  assert(row.timestamp === TS);
  assert(typeof row.unix === "number");
  {
    const m = /^(\d{4})-(\d{2})-(\d{2})_(\d{2}):(\d{2}):(\d{2})$/.exec(TS);
    const expectUnix = Math.floor(
      new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() / 1000
    );
    assert(row.unix === expectUnix, `unix=${row.unix} expected=${expectUnix}`);
  }
  assert(!Object.prototype.hasOwnProperty.call(row, "ansiText"));
  assert(!Object.prototype.hasOwnProperty.call(row, "type"));

  const printOpts = { color: "always", end: "", sep: " " };
  log.info("keep-opts", printOpts);
  assert(records(logFile).some((l) => l.includes("keep-opts")));
  const rows = fs
    .readFileSync(jsonlPath, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  assert(rows[1].id === `${SID}:${process.pid}:2`);
  assert(rows[1].payload && Object.keys(rows[1].payload).length === 0);
});

await run("L3-2 init sugar K3b; file alone still toFile only", async ({ caseDir, logFile }) => {
  const { log, actions: acts } = await loadPlog();
  standardInit(log, { file: logFile });
  assert(log.options.jsonl === null);
  assert(log.listActions("info").length === 1);
  assert(log.listActions("info")[0].name === "toFile");
  assert(!fs.existsSync(logFile.replace(/\.log$/, ".jsonl")));

  const dest = path.join(caseDir, "sugar.log");
  const { log: logTrue } = await loadPlog();
  standardInit(logTrue, { file: dest, jsonl: true });
  const sibling = path.join(caseDir, "sugar.jsonl");
  assert(logTrue.options.jsonl === sibling, String(logTrue.options.jsonl));
  const fns = logTrue.listActions("info");
  assert(fns.length === 2);
  assert(fns[0].name === "toFile");
  assert(fns[1].name === "toJsonl");
  logTrue.info("dual");
  assert(fs.existsSync(dest) && fs.existsSync(sibling));

  const custom = path.join(caseDir, "custom.jsonl");
  const { log: logPath } = await loadPlog();
  standardInit(logPath, { file: dest + ".2", jsonl: custom });
  assert(logPath.options.jsonl === custom);
  logPath.info("c");
  assert(fs.existsSync(custom));

  const only = path.join(caseDir, "only.jsonl");
  const { log: logOnly } = await loadPlog();
  standardInit(logOnly, { jsonl: only, file: null });
  assert(logOnly.options.file === null);
  assert(logOnly.options.jsonl === only);
  assert(logOnly.listActions("info").length === 1);
  assert(logOnly.listActions("info")[0].name === "toJsonl");
  const { out } = captureStdio(() => logOnly.info("jsonl-only"));
  assert(!out.includes("jsonl-only"));
  assert(fs.existsSync(only));

  const { log: logFalse } = await loadPlog();
  standardInit(logFalse, { file: dest + ".3", jsonl: false });
  assert(logFalse.options.jsonl === null);
  assert(logFalse.listActions("info")[0].name === "toFile");
  assert(acts.toJsonl(only).name === "toJsonl");
});

await run("L3-3 env P_LOG_JSONL; file alone ≠ jsonl", async ({ caseDir, logFile }) => {
  process.env.P_LOG_FILE = logFile;
  delete process.env.P_LOG_JSONL;
  const { log } = await loadPlog();
  log.init({
    tee: "none",
    sessionId: SID,
    sessionFg: FG,
    sessionBg: BG,
    now: () => TS,
  });
  assert(log.options.file === logFile);
  assert(log.options.jsonl === null);
  log.info("env-file-only");
  assert(!fs.existsSync(logFile.replace(/\.log$/, ".jsonl")));

  process.env.P_LOG_JSONL = "1";
  const { log: log1 } = await loadPlog();
  log1.init({
    tee: "none",
    sessionId: SID,
    sessionFg: FG,
    sessionBg: BG,
    now: () => TS,
  });
  const sibling = path.join(caseDir, "app.jsonl");
  assert(log1.options.jsonl === sibling, String(log1.options.jsonl));
  log1.info("env-one");
  assert(fs.existsSync(sibling));

  const custom = path.join(caseDir, "from-env.jsonl");
  process.env.P_LOG_JSONL = custom;
  const { log: logP } = await loadPlog();
  logP.init({
    tee: "none",
    sessionId: SID,
    sessionFg: FG,
    sessionBg: BG,
    now: () => TS,
  });
  assert(logP.options.jsonl === custom);
  logP.info("env-path");
  assert(fs.existsSync(custom));

  process.env.P_LOG_JSONL = "0";
  const { log: log0 } = await loadPlog();
  log0.init({
    file: logFile + ".z",
    tee: "none",
    sessionId: SID,
    sessionFg: FG,
    sessionBg: BG,
    now: () => TS,
  });
  assert(log0.options.jsonl === null);
});

await run("L3-4 clear both tapes; missing jsonl success", async ({ caseDir, logFile }) => {
  const jsonlPath = path.join(caseDir, "clear.jsonl");
  const { log } = await loadPlog();
  standardInit(log, { file: logFile, jsonl: jsonlPath });
  log.info("wipe");
  assert(fs.statSync(logFile).size > 0);
  assert(fs.statSync(jsonlPath).size > 0);
  log.clear();
  assert(fs.statSync(logFile).size === 0);
  assert(fs.statSync(jsonlPath).size === 0);

  log.info("a-line");
  const { log: logB } = await loadPlog();
  standardInit(logB, {
    file: logFile,
    jsonl: jsonlPath,
    sessionId: "Other1",
  });
  logB.info("b-line");
  log.clear({ sessions: [SID] });
  assert(records(logFile).every((l) => l.includes("[Other1]")));
  const jrows = fs
    .readFileSync(jsonlPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  assert(jrows.every((r) => r.sessionId === "Other1"));

  const missing = path.join(caseDir, "no.jsonl");
  assert(!fs.existsSync(missing));
  const { log: logM } = await loadPlog();
  standardInit(logM, { file: logFile, jsonl: missing });
  logM.clear();
  assert(!fs.existsSync(missing));
});

await run("L3-5 cyclic fields → payload {}; never throw", async ({ caseDir, logFile }) => {
  const jsonlPath = path.join(caseDir, "cyc.jsonl");
  const { log } = await loadPlog();
  standardInit(log, { file: logFile, jsonl: jsonlPath });
  const cyclic = { a: 1 };
  cyclic.self = cyclic;
  const { result, err } = captureStdio(() => log.info("cyc", { fields: cyclic }));
  assert(result !== "" && ansiStrip(result).includes("cyc"));
  assert(fs.readFileSync(logFile, "utf8").includes("cyc"));
  assert(err.includes("non-serializable") || err.includes("toJsonl"), err);
  const row = JSON.parse(fs.readFileSync(jsonlPath, "utf8").trim());
  assert(row.text === "cyc");
  assert(row.payload && Object.keys(row.payload).length === 0);
});

await run("L3-6 two processes same session → distinct ids via pid", async ({ caseDir }) => {
  const jsonlPath = path.join(caseDir, "inherit.jsonl");
  const jsDir = path.dirname(PLOG_SRC_PATH);
  const childCode = `
    const { pathToFileURL } = require("node:url");
    const path = require("node:path");
    (async () => {
      const m = await import(pathToFileURL(path.join(${JSON.stringify(jsDir)}, "plog.js")).href);
      m.log.init({
        file: null,
        jsonl: ${JSON.stringify(jsonlPath)},
        tee: "none",
        sessionId: ${JSON.stringify(SID)},
        sessionFg: ${JSON.stringify(FG)},
        sessionBg: ${JSON.stringify(BG)},
        now: () => ${JSON.stringify(TS)},
      });
      m.log.info("child-" + process.pid);
      process.stdout.write(String(process.pid));
    })().catch((e) => { console.error(e); process.exit(1); });
  `;
  const runChild = () =>
    spawnSync(process.execPath, ["-e", childCode], {
      encoding: "utf8",
      env: {
        ...process.env,
        P_LOG_SESSION_ID: SID,
        P_LOG_SESSION_COLOR_FG: FG,
        P_LOG_SESSION_COLOR_BG: BG,
      },
    });
  const a = runChild();
  const b = runChild();
  assert(a.status === 0, a.stderr || a.stdout);
  assert(b.status === 0, b.stderr || b.stdout);
  const pidA = String(a.stdout).trim();
  const pidB = String(b.stdout).trim();
  assert(pidA !== pidB, `pids ${pidA} ${pidB}`);
  const rows = fs
    .readFileSync(jsonlPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  assert(rows.length === 2, JSON.stringify(rows));
  const ids = new Set(rows.map((r) => r.id));
  assert(ids.size === 2, [...ids].join(","));
  assert(rows.every((r) => r.sessionId === SID));
  assert(rows.every((r) => r.id.startsWith(`${SID}:${r.pid}:`)));
  assert(String(rows[0].pid) === pidA || String(rows[0].pid) === pidB);
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
