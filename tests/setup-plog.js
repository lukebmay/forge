/*
 * Bind Node plog runtime after gi:// mocks (setup.js). Keep out of setup.js so
 * plog-adapter is not imported before those mocks register.
 */
import { createNodeRuntime } from "../third_party/pansi/plog-runtime-node.js";
import { setPlogRuntime } from "../lib/shared/plog-adapter.js";
import { setProductionForTests } from "../lib/shared/production.js";

// Unit tests default to !production (asserts always on). Prod no longer forces logs OFF.
setProductionForTests(false);
setPlogRuntime(createNodeRuntime);
