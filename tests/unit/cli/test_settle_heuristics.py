#!/usr/bin/env python3
"""Unit tests for scripts/forge/settle_heuristics.py (SE1 pure store)."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

_REPO = Path(__file__).resolve().parents[3]
_FORGE_CLI = _REPO / "scripts" / "forge"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

from settle_heuristics import (  # noqa: E402
    HARD_TIMEOUT_MS,
    PAD,
    ROLLING_N,
    SCHEMA_VERSION,
    HeuristicsSession,
    default_session,
    empty_entry,
    empty_store,
    get_or_create_entry,
    heuristics_path,
    is_first_ever,
    learning_trial_soft_cap_ms,
    load_store,
    make_key,
    normalize_class,
    parse_key,
    record_and_soft_timeout,
    record_trial,
    residual_latencies,
    reset_default_session,
    reset_heuristics_file,
    resolve_host,
    save_store,
    schema_version_ok,
    soft_clamp_ms,
    soft_floor_ms,
    soft_timeout_for_key,
    soft_timeout_ms,
    store_file_status,
)


class NormalizeAndKeys(unittest.TestCase):
    def test_normalize_class(self):
        self.assertEqual(normalize_class("  Google-chrome  "), "google-chrome")
        self.assertEqual(normalize_class(None), "")
        self.assertEqual(normalize_class(42), "42")

    def test_make_key_stable(self):
        k = make_key("Black", "com.mitchellh.Ghostty", "Focus-Phase", "Focus")
        self.assertEqual(k, "black|com.mitchellh.ghostty|focus-phase|focus")
        self.assertEqual(parse_key(k)["class"], "com.mitchellh.ghostty")

    def test_resolve_host_env(self):
        self.assertEqual(resolve_host({"FORGE_HOST": "Desk"}, hostname="other"), "desk")
        self.assertEqual(resolve_host({}, hostname="black.local"), "black")


class SoftTimeoutMath(unittest.TestCase):
    def test_floors_and_clamps(self):
        self.assertEqual(soft_floor_ms("focus"), 400)
        self.assertEqual(soft_floor_ms("geom"), 200)
        self.assertEqual(soft_clamp_ms("focus"), 3000)
        self.assertEqual(soft_clamp_ms("geom"), 5000)
        self.assertEqual(learning_trial_soft_cap_ms("focus"), 6000)  # min(10s, 3s*2)
        self.assertEqual(learning_trial_soft_cap_ms("geom"), 10000)  # min(10s, 5s*2)

    def test_first_ever_learning_trial(self):
        self.assertTrue(is_first_ever(None))
        self.assertTrue(is_first_ever({}))
        self.assertTrue(is_first_ever({"trialCount": 0}))
        t = soft_timeout_ms(None, "focus")
        self.assertEqual(t, learning_trial_soft_cap_ms("focus"))
        self.assertGreaterEqual(t, soft_floor_ms("focus"))

    def test_zero_residual_only_uses_floor(self):
        ent = empty_entry(residual_kind="focus")
        for _ in range(3):
            record_trial(ent, had_residual=False)
        self.assertEqual(ent["trialCount"], 3)
        self.assertEqual(ent["zeroResidualCount"], 3)
        self.assertEqual(ent["latenciesMs"], [])
        self.assertEqual(soft_timeout_ms(ent, "focus"), soft_floor_ms("focus"))

    def test_rolling_max_pad_clamp(self):
        ent = empty_entry(residual_kind="focus")
        # seed one trial so not first-ever
        record_trial(ent, had_residual=True, latency_ms=100)
        # large residual
        record_trial(ent, had_residual=True, latency_ms=2000)
        # max=2000 * 1.25 = 2500, floor 400, clamp 3000 → 2500
        self.assertEqual(soft_timeout_ms(ent, "focus"), int(2000 * PAD))

    def test_clamp_caps_outlier(self):
        ent = empty_entry(residual_kind="focus")
        record_trial(ent, had_residual=True, latency_ms=10_000)
        self.assertEqual(soft_timeout_ms(ent, "focus"), soft_clamp_ms("focus"))

    def test_rolling_keeps_last_n(self):
        ent = empty_entry(residual_kind="focus")
        for i in range(ROLLING_N + 5):
            record_trial(ent, had_residual=True, latency_ms=i * 10)
        lats = residual_latencies(ent)
        self.assertEqual(len(lats), ROLLING_N)
        self.assertEqual(lats[0], 5 * 10)
        self.assertEqual(lats[-1], (ROLLING_N + 4) * 10)

    def test_zero_residual_does_not_push_zero_latency(self):
        ent = empty_entry(residual_kind="focus")
        record_trial(ent, had_residual=True, latency_ms=800)
        record_trial(ent, had_residual=False)
        self.assertEqual(ent["latenciesMs"], [800])
        self.assertEqual(ent["zeroResidualCount"], 1)


class StoreIo(unittest.TestCase):
    def test_heuristics_path(self):
        root = Path("/tmp/forge-test-root")
        self.assertEqual(
            heuristics_path(root),
            root / "config" / "settle-heuristics.json",
        )

    def test_roundtrip(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "config" / "settle-heuristics.json"
            store = empty_store()
            key = make_key("black", "google-chrome", "focus-phase", "focus")
            get_or_create_entry(
                store,
                key,
                host="black",
                wm_class="google-chrome",
                process_kind="focus-phase",
                residual_kind="focus",
            )
            record_and_soft_timeout(
                store,
                host="black",
                wm_class="google-chrome",
                process_kind="focus-phase",
                residual_kind="focus",
                had_residual=True,
                latency_ms=500,
            )
            save_store(path, store)
            loaded = load_store(path)
            self.assertEqual(loaded["version"], SCHEMA_VERSION)
            self.assertIn(key, loaded["entries"])
            self.assertEqual(loaded["entries"][key]["latenciesMs"], [500])
            self.assertEqual(
                soft_timeout_for_key(loaded, key),
                soft_timeout_ms(loaded["entries"][key], "focus"),
            )

    def test_missing_file_empty(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "missing.json"
            self.assertEqual(load_store(path), empty_store())

    def test_bad_version_empty(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "bad.json"
            path.write_text(json.dumps({"version": 99, "entries": {"x": {}}}), encoding="utf-8")
            self.assertEqual(load_store(path), empty_store())
            # SE9: invalid file stays on disk until operator reset
            self.assertTrue(path.is_file())
            st = store_file_status(path)
            self.assertFalse(st["valid"])
            self.assertEqual(st["reason"], "schema-mismatch")
            self.assertEqual(st["version"], 99)
            self.assertEqual(st["schemaVersion"], SCHEMA_VERSION)

    def test_corrupt_json_empty(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "bad.json"
            path.write_text("{not json", encoding="utf-8")
            self.assertEqual(load_store(path), empty_store())

    def test_soft_timeout_for_missing_key_is_first_ever(self):
        t = soft_timeout_for_key(empty_store(), make_key("h", "c", "focus-phase", "focus"))
        self.assertEqual(t, learning_trial_soft_cap_ms("focus"))

    def test_no_personal_role_in_key(self):
        # keys are host|class|process|residual — never desk role names
        k = make_key("black", "google-chrome", "focus-phase", "focus")
        self.assertNotIn("grok", k)
        self.assertNotIn("chrome-left", k)
        parts = parse_key(k)
        self.assertEqual(set(parts.keys()), {"host", "class", "processKind", "residualKind"})

    def test_schema_version_ok(self):
        self.assertTrue(schema_version_ok(SCHEMA_VERSION))
        self.assertTrue(schema_version_ok(str(SCHEMA_VERSION)))
        self.assertFalse(schema_version_ok(SCHEMA_VERSION + 1))
        self.assertFalse(schema_version_ok(None))
        self.assertFalse(schema_version_ok("nope"))

    def test_store_file_status_missing_and_ok(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "config" / "settle-heuristics.json"
            missing = store_file_status(path)
            self.assertFalse(missing["exists"])
            self.assertEqual(missing["reason"], "missing")
            store = empty_store()
            key = make_key("black", "ghostty", "move", "geom")
            get_or_create_entry(
                store,
                key,
                host="black",
                wm_class="ghostty",
                process_kind="move",
                residual_kind="geom",
            )
            save_store(path, store)
            ok = store_file_status(path)
            self.assertTrue(ok["exists"])
            self.assertTrue(ok["valid"])
            self.assertEqual(ok["reason"], "ok")
            self.assertEqual(ok["entryCount"], 1)
            self.assertEqual(ok["version"], SCHEMA_VERSION)

    def test_reset_heuristics_write_empty(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "config" / "settle-heuristics.json"
            store = empty_store()
            key = make_key("black", "google-chrome", "focus-phase", "focus")
            get_or_create_entry(
                store,
                key,
                host="black",
                wm_class="google-chrome",
                process_kind="focus-phase",
                residual_kind="focus",
            )
            record_and_soft_timeout(
                store,
                host="black",
                wm_class="google-chrome",
                process_kind="focus-phase",
                residual_kind="focus",
                had_residual=True,
                latency_ms=900,
            )
            save_store(path, store)
            # Session holds stale data until reset clears it
            sess = HeuristicsSession(path)
            self.assertGreater(sess.soft_timeout("black", "google-chrome", "focus-phase", "focus"), 0)
            result = reset_heuristics_file(path)
            self.assertTrue(result["ok"])
            self.assertEqual(result["action"], "written")
            self.assertTrue(result["existed"])
            loaded = load_store(path)
            self.assertEqual(loaded["entries"], {})
            self.assertEqual(loaded["version"], SCHEMA_VERSION)
            st = store_file_status(path)
            self.assertTrue(st["valid"])
            self.assertEqual(st["entryCount"], 0)

    def test_reset_heuristics_unlink(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "config" / "settle-heuristics.json"
            save_store(path, empty_store())
            self.assertTrue(path.is_file())
            result = reset_heuristics_file(path, unlink=True)
            self.assertTrue(result["ok"])
            self.assertEqual(result["action"], "removed")
            self.assertFalse(path.is_file())
            # Missing file is ok
            again = reset_heuristics_file(path, unlink=True)
            self.assertTrue(again["ok"])
            self.assertEqual(again["action"], "missing")


class Constants(unittest.TestCase):
    def test_hard_timeout_locked(self):
        self.assertEqual(HARD_TIMEOUT_MS, 5000)


class HeuristicsSessionTests(unittest.TestCase):
    def tearDown(self):
        reset_default_session()

    def test_load_once_record_flush_once(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "config" / "settle-heuristics.json"
            path.parent.mkdir(parents=True)
            sess = HeuristicsSession(path)
            self.assertFalse(sess.is_loaded())
            t0 = sess.soft_timeout("black", "ghostty", "move", "geom")
            self.assertTrue(sess.is_loaded())
            self.assertFalse(sess.is_dirty())
            self.assertEqual(t0, learning_trial_soft_cap_ms("geom"))
            # No write until flush after dirty record
            self.assertFalse(path.is_file())
            sess.record(
                host="black",
                wm_class="ghostty",
                process_kind="move",
                residual_kind="geom",
                had_residual=True,
                latency_ms=300,
            )
            self.assertTrue(sess.is_dirty())
            self.assertFalse(path.is_file())
            info = sess.flush()
            self.assertEqual(info["persist"], "ok")
            self.assertFalse(sess.is_dirty())
            self.assertTrue(path.is_file())
            # Clean flush is no-op
            self.assertEqual(sess.flush()["persist"], "skipped")
            # Second load sees data
            sess2 = HeuristicsSession(path)
            self.assertEqual(
                sess2.soft_timeout("black", "ghostty", "move", "geom"),
                int(300 * PAD),
            )

    def test_default_session_singleton(self):
        reset_default_session()
        a = default_session()
        b = default_session()
        self.assertIs(a, b)


if __name__ == "__main__":
    unittest.main()
