/*
 * Build flips this for debug installs (see Makefile:debug). Kept gi-free so
 * plog-adapter can import it without a cycle through settings.js → Logger.
 */
export let production = true;

/** Vitest / harness only. */
export function setProductionForTests(value) {
  production = !!value;
}
