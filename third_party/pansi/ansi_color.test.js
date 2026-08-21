#!/usr/bin/env node

/**
 * Unit tests for util/js/ansi_color.js contract.
 */

import assert from "node:assert/strict";
import {
  ANSI_COLOR_VERSION,
  colorCodes,
  colorEnabled,
  color_codes,
  resolveColorMode,
} from "./ansi_color.js";

let testNum = 0;
let passed = 0;
let failed = 0;

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const MAGENTA = "\x1b[35m";
const RESET = "\x1b[0m";

function check(desc, fn) {
  testNum++;
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    console.log(`${RED}✗ FAIL${RESET}  ${desc}`);
    console.log(`  ${err.message}`);
  }
}

console.log(`${MAGENTA}=== ansi_color.js ===${RESET}\n`);

check("version pinned", () => {
  assert.equal(ANSI_COLOR_VERSION, "1.0.0");
});

check("cli always beats NO_COLOR", () => {
  assert.equal(resolveColorMode("always", { env: { NO_COLOR: "1" } }), "always");
});

check("cli never beats FORCE_COLOR", () => {
  assert.equal(resolveColorMode("never", { env: { FORCE_COLOR: "1" } }), "never");
});

check("NO_COLOR beats force", () => {
  assert.equal(resolveColorMode(null, { env: { NO_COLOR: "1", FORCE_COLOR: "1" } }), "never");
});

check("FORCE_COLOR=1 → always", () => {
  assert.equal(resolveColorMode(null, { env: { FORCE_COLOR: "1" } }), "always");
});

check("CLICOLOR_FORCE=yes → always", () => {
  assert.equal(resolveColorMode(null, { env: { CLICOLOR_FORCE: "yes" } }), "always");
});

check("FORCE_COLOR=0 → auto", () => {
  assert.equal(resolveColorMode(null, { env: { FORCE_COLOR: "0" } }), "auto");
});

check("empty NO_COLOR ignored", () => {
  assert.equal(resolveColorMode(null, { env: { NO_COLOR: "" } }), "auto");
});

check("cli auto falls through to NO_COLOR", () => {
  assert.equal(resolveColorMode("auto", { env: { NO_COLOR: "1" } }), "never");
});

check("COLOR=always", () => {
  assert.equal(resolveColorMode(null, { env: { COLOR: "always" } }), "always");
});

check("P_COLOR tool key", () => {
  assert.equal(
    resolveColorMode(null, {
      env: { P_COLOR: "never" },
      toolColorKeys: ["P_COLOR"],
    }),
    "never"
  );
});

const tty = { isTTY: true };
const pipe = { isTTY: false };

check("auto tty → on", () => {
  assert.equal(colorEnabled(tty, { cliMode: "auto", env: {} }), true);
});

check("auto pipe → off", () => {
  assert.equal(colorEnabled(pipe, { cliMode: "auto", env: {} }), false);
});

check("FORCE_COLOR on pipe → on", () => {
  assert.equal(colorEnabled(pipe, { cliMode: "auto", env: { FORCE_COLOR: "1" } }), true);
});

check("CLICOLOR_FORCE on pipe → on", () => {
  assert.equal(colorEnabled(pipe, { cliMode: "auto", env: { CLICOLOR_FORCE: "1" } }), true);
});

check("NO_COLOR on tty → off", () => {
  assert.equal(colorEnabled(tty, { cliMode: "auto", env: { NO_COLOR: "1" } }), false);
});

check("always on pipe → on", () => {
  assert.equal(colorEnabled(pipe, { cliMode: "always", env: {} }), true);
});

check("never on tty → off", () => {
  assert.equal(colorEnabled(tty, { cliMode: "never", env: {} }), false);
});

const ON = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

check("codes when enabled", () => {
  const c = colorCodes(null, { enabled: true });
  for (const [k, v] of Object.entries(ON)) {
    assert.equal(c[k], v, k);
  }
});

check("codes empty when disabled", () => {
  const c = colorCodes(null, { enabled: false });
  for (const k of Object.keys(ON)) {
    assert.equal(c[k], "", k);
  }
});

check("codes follow enablement", () => {
  assert.equal(colorCodes(pipe, { cliMode: "auto", env: {} }).red, "");
  assert.equal(colorCodes(pipe, { cliMode: "auto", env: { FORCE_COLOR: "1" } }).red, ON.red);
  assert.equal(colorCodes(tty, { cliMode: "auto", env: { NO_COLOR: "1" } }).red, "");
});

check("color_codes snake_case alias", () => {
  assert.equal(color_codes, colorCodes);
});

console.log("");
console.log(`${MAGENTA}=== SUMMARY ===${RESET}`);
console.log(`Total tests run : ${testNum}`);
console.log(`Passed          : ${GREEN}${passed}${RESET}`);
console.log(`Failed          : ${RED}${failed}${RESET}`);
console.log("");

if (failed === 0) {
  console.log(`${GREEN}All tests passed ✓${RESET}`);
  process.exit(0);
} else {
  console.log(`${RED}${failed} test(s) failed.${RESET}`);
  process.exit(failed);
}
