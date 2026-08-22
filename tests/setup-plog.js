/*
 * Bind Node plog runtime after gi:// mocks (setup.js). Keep out of setup.js so
 * plog-adapter is not imported before those mocks register.
 */
import { createNodeRuntime } from "../third_party/pansi/plog-runtime-node.js";
import { setPlogRuntime } from "../lib/shared/plog-adapter.js";
import { setProductionForTests } from "../lib/shared/production.js";

// Unit tests expect logging; production builds keep production=true.
setProductionForTests(false);
setPlogRuntime(createNodeRuntime);
