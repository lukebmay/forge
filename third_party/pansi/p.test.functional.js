#!/usr/bin/env node

/**
 * p.test.functional.js
 * Functional tests for p.js (Node version)
 */

import { PANSI_VERSION, ansiEscape, ansiStrip, ansiUnescape, p } from "./p.js";

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

function recordResult(success) {
  if (success) {
    passed++;
    if (!quietOnPass) console.log(`${GREEN}✓ PASS${RESET}\n`);
  } else {
    failed++;
    console.log(`${RED}✗ FAIL${RESET}\n`);
  }
}

// ====================== ansiEscape ======================
function testAnsiEscape(desc, input, expected) {
  testNum++;
  const got = ansiEscape(input);
  const success = got === expected;

  if (!success || !quietOnPass) {
    printTestHeader(testNum, desc);
    console.log(`Input (raw)   : ${JSON.stringify(input)}`);
    console.log(`Expected      : ${JSON.stringify(expected)}`);
    console.log(`Received      : ${JSON.stringify(got)}\n`);
    recordResult(success);
  } else {
    passed++;
  }
}

// ====================== ansiUnescape ======================
function testAnsiUnescape(desc, input, expected) {
  testNum++;
  const got = ansiUnescape(input);
  const success = got === expected;

  if (!success || !quietOnPass) {
    printTestHeader(testNum, desc);
    console.log(`Input         : ${JSON.stringify(input)}`);
    console.log(`Expected      : ${JSON.stringify(expected)}`);
    console.log(`Received      : ${JSON.stringify(got)}\n`);
    recordResult(success);
  } else {
    passed++;
  }
}

// ====================== ansiStrip ======================
function testAnsiStrip(desc, input, expected) {
  testNum++;
  const got = ansiStrip(input);
  const success = got === expected;

  if (!success || !quietOnPass) {
    printTestHeader(testNum, desc);
    console.log(`Input (escaped)   : ${ansiEscape(input)}`);
    console.log(`Expected (escaped): ${ansiEscape(expected)}`);
    console.log(`Received (escaped): ${ansiEscape(got)}\n`);
    recordResult(success);
  } else {
    passed++;
  }
}

// ====================== p() helpers ======================
function captureP(...args) {
  // Use new library mode: trailing options object + str:true to capture without side effects.
  return p(...args, { color: "always", str: true });
}

function pOutputTest(desc, expected, ...args) {
  testNum++;
  const output = captureP(...args);
  const success = output === expected;

  if (!success || !quietOnPass) {
    printTestHeader(testNum, desc);
    console.log("Args     :", args);
    console.log("Expected :", JSON.stringify(expected));
    console.log("Received :", JSON.stringify(output), "\n");
    recordResult(success);
  } else {
    passed++;
  }
}

// =============================================================================
// Tests
// =============================================================================

printHeader("ansi_escape Tests");

const ESC = "\x1b";

testAnsiEscape("basic color sequence", `${ESC}[31mred${ESC}[0m`, "\\x1b[31mred\\x1b[0m");
testAnsiEscape("color + newline", `${ESC}[36mcyan${ESC}[0m\n`, "\\x1b[36mcyan\\x1b[0m\\n");
testAnsiEscape("plain text", "hello world", "hello world");
testAnsiEscape("empty input", "", "");
testAnsiEscape(
  "multiple escapes",
  `${ESC}[1m${ESC}[32mbold green${ESC}[0m`,
  "\\x1b[1m\\x1b[32mbold green\\x1b[0m"
);

printHeader("ansi_unescape Tests");

testAnsiUnescape("basic roundtrip", "\\x1b[31mred\\x1b[0m", `${ESC}[31mred${ESC}[0m`);
testAnsiUnescape("\\e variant (compatibility)", "\\e[36mcyan\\e[0m", `${ESC}[36mcyan${ESC}[0m`);
testAnsiUnescape(
  "mixed \\x1b and \\e",
  "\\x1b[1m\\e[32mbold\\x1b[0m",
  `${ESC}[1m${ESC}[32mbold${ESC}[0m`
);
testAnsiUnescape("with newline text", "hello\\nworld", "hello\nworld");
testAnsiUnescape("empty", "", "");

printHeader("ansi_strip Tests");

testAnsiStrip("simple fg color", `${ESC}[31mred${ESC}[0m`, "red");
testAnsiStrip("combined + attr", `${ESC}[36;1mcyan bold${ESC}[0m`, "cyan bold");
testAnsiStrip("truecolor", `${ESC}[38;2;255;0;0mtrue${ESC}[0m`, "true");
testAnsiStrip("mixed", `plain${ESC}[31mred${ESC}[0mplain`, "plainredplain");
testAnsiStrip("only codes", `${ESC}[31m`, "");
testAnsiStrip("newlines preserved", `a\nb${ESC}[31mc`, "a\nbc");

printHeader("p() Output Tests");

pOutputTest("basic +r", "\x1b[31mhello\x1b[0m\n", "+r", "hello");
pOutputTest(
  "two colors",
  "\x1b[31mhello\x1b[0m \x1b[34mworld\x1b[0m\n",
  "+r",
  "hello",
  "+b",
  "world"
);
pOutputTest("2-char style", "\x1b[31m\x1b[42mredbg\x1b[0m\n", "+rG", "redbg");
pOutputTest(
  "hex fg+bg",
  "\x1b[38;2;255;0;0m\x1b[48;2;0;255;0mred on green\x1b[0m\n",
  "+hff0000H00ff00",
  "red on green"
);
pOutputTest("plain text", "hello\n", "hello");
pOutputTest("no args", "\n");

// --default
pOutputTest(
  "--default red",
  "\x1b[31mone\x1b[0m \x1b[31mtwo\x1b[0m\n",
  "--default=+r",
  "one",
  "two"
);

// --escaped flag
function testEscapedFlag() {
  testNum++;
  const output = captureP("--escaped", "+b", "hello");
  const success = output.includes("\\x1b[34m");
  if (!success || !quietOnPass) {
    printTestHeader(testNum, "--escaped flag");
    console.log("Received:", JSON.stringify(output));
    recordResult(success);
  } else {
    passed++;
  }
}
testEscapedFlag();

// stderr tests
function testStderrFlag() {
  testNum++;
  const origWrite = process.stdout.write;
  const origErrWrite = process.stderr && process.stderr.write;
  const origErrLog = console.error;
  let out = "",
    errOut = "";
  process.stdout.write = (s) => {
    out += s;
    return true;
  };
  if (process.stderr)
    process.stderr.write = (s) => {
      errOut += s;
      return true;
    };
  console.error = (s) => {
    errOut += s;
  };
  try {
    p("--color=always", "--stderr", "+r", "err-out");
  } finally {
    process.stdout.write = origWrite;
    if (process.stderr && origErrWrite) process.stderr.write = origErrWrite;
    console.error = origErrLog;
  }
  const success =
    errOut.includes("err-out") && (errOut.includes("\x1b[31m") || !out.includes("err-out"));
  if (!success || !quietOnPass) {
    printTestHeader(testNum, "--stderr flag (script style)");
    console.log("errOut:", JSON.stringify(errOut), "out:", JSON.stringify(out));
    recordResult(success);
  } else {
    passed++;
  }
}
testStderrFlag();

function testStderrOpt() {
  testNum++;
  const origWrite = process.stdout.write;
  const origErrWrite = process.stderr.write;
  let out = "",
    errOut = "";
  process.stdout.write = (s) => {
    out += s;
    return true;
  };
  process.stderr.write = (s) => {
    errOut += s;
    return true;
  };
  try {
    p("+b", "blue-err", { color: "always", stderr: true });
  } finally {
    process.stdout.write = origWrite;
    process.stderr.write = origErrWrite;
  }
  const success = errOut.includes("blue-err") && errOut.includes("\x1b[34m");
  if (!success || !quietOnPass) {
    printTestHeader(testNum, "stderr:true in options object");
    console.log("errOut:", JSON.stringify(errOut));
    recordResult(success);
  } else {
    passed++;
  }
}
testStderrOpt();

function testStrIgnoresStderr() {
  testNum++;
  const origWrite = process.stdout.write;
  const origErrWrite = process.stderr.write;
  let out = "",
    errOut = "";
  process.stdout.write = (s) => {
    out += s;
    return true;
  };
  process.stderr.write = (s) => {
    errOut += s;
    return true;
  };
  try {
    const s = p("+g", "str-no-print", { color: "always", str: true, stderr: true });
    const success = s === "\x1b[32mstr-no-print\x1b[0m\n" && out === "" && errOut === "";
    if (!success || !quietOnPass) {
      printTestHeader(testNum, "str:true ignores stderr + no side output");
      console.log(
        "s:",
        JSON.stringify(s),
        "out:",
        JSON.stringify(out),
        "err:",
        JSON.stringify(errOut)
      );
      recordResult(success);
    } else {
      passed++;
    }
  } finally {
    process.stdout.write = origWrite;
    process.stderr.write = origErrWrite;
  }
}
testStrIgnoresStderr();

function testPansiVersion() {
  testNum++;
  const success = PANSI_VERSION === "1.0.0";
  if (!success || !quietOnPass) {
    printTestHeader(testNum, "PANSI_VERSION pinned");
    console.log("PANSI_VERSION:", JSON.stringify(PANSI_VERSION));
    recordResult(success);
  } else {
    passed++;
  }
}
testPansiVersion();

// =============================================================================
// Results
// =============================================================================

console.log(`\n${MAGENTA}=== Results ===${RESET}`);
console.log(`${passed} passed, ${failed} failed`);

if (failed > 0) process.exit(1);
