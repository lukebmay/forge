#!/usr/bin/env python3
"""Unit tests for result helpers / suite merge / namespace."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from lib.results import (
    apply_suite,
    deep_merge,
    namespace_dir,
    session_type_label,
    settle_to_dict,
    write_run,
)


class SessionLabelTests(unittest.TestCase):
    def test_wayland(self):
        self.assertEqual(session_type_label("wayland"), "wayland")

    def test_x11(self):
        self.assertEqual(session_type_label("x11"), "x11")


class SuiteMergeTests(unittest.TestCase):
    def test_deep_merge(self):
        a = {"settle": {"agreeCount": 5, "quietMs": 500}, "samples": 10}
        b = {"settle": {"agreeCount": 3}, "cooldownMs": 500}
        m = deep_merge(a, b)
        self.assertEqual(m["settle"]["agreeCount"], 3)
        self.assertEqual(m["settle"]["quietMs"], 500)
        self.assertEqual(m["cooldownMs"], 500)

    def test_apply_suite_full(self):
        cfg = {
            "samples": 10,
            "settle": {"agreeCount": 5},
            "suites": {
                "full-suite": {
                    "phase": "full-suite",
                    "settle": {"agreeCount": 3},
                    "cooldownMs": 500,
                }
            },
        }
        out = apply_suite(cfg, "full-suite")
        self.assertEqual(out["suite"], "full-suite")
        self.assertEqual(out["phase"], "full-suite")
        self.assertEqual(out["settle"]["agreeCount"], 3)
        self.assertEqual(out["cooldownMs"], 500)


class SettleDetailTests(unittest.TestCase):
    def test_summary_strips_events(self):
        class S:
            settled = True
            reason = "quiet_agreement"
            wait_ms = 9000.0
            quiet_ms_used = 500.0
            agree_count_used = 3
            agreement_interval_ms = 2000.0
            agreement_reached = 3
            verify_mode = "dense"
            verification_count = 100
            event_count = 5
            relevant_event_count = 4
            first_event_ms = 10.0
            last_event_ms = 20.0
            time_to_quiet_ms = 20.0
            time_to_settled_ms = 9000.0
            counts_by_signal = {"size-changed": 1}
            inter_event_deltas_ms = [1.0]
            verifications = [
                {"agreementTick": False, "waitMs": 1},
                {"agreementTick": True, "waitMs": 2000},
            ]
            events = [{"signal": "size-changed"}]

        d = settle_to_dict(S(), detail="summary")
        self.assertNotIn("events", d)
        self.assertEqual(len(d["verifications"]), 1)
        self.assertEqual(d["recordDetail"], "summary")
        self.assertEqual(d["timeToQuietMs"], 20.0)

    def test_full_keeps_events(self):
        d = settle_to_dict(
            {
                "settled": True,
                "events": [1],
                "verifications": [{"agreementTick": False}, {"agreementTick": True}],
            },
            detail="full",
        )
        self.assertEqual(d["events"], [1])
        self.assertEqual(len(d["verifications"]), 2)
        self.assertEqual(d["recordDetail"], "full")


class NamespaceWriteTests(unittest.TestCase):
    def test_namespace_dir(self):
        p = namespace_dir(Path("/tmp/r"), host="black", session="wayland", suite="full-suite")
        self.assertEqual(p, Path("/tmp/r/black/wayland/full-suite"))

    def test_write_run_layout(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            out = namespace_dir(root, host="black", session="x11", suite="calibration")
            doc = {
                "phase": "calibration",
                "suite": "calibration",
                "namespace": {
                    "host": "black",
                    "session": "x11",
                    "suite": "calibration",
                },
                "host": {"host": "black", "sessionType": "x11"},
                "trials": [],
            }
            path = write_run(doc, out, latest=True, results_root=root)
            self.assertTrue(path.is_file())
            self.assertIn("black/x11/calibration", str(path))
            self.assertTrue((out / "latest.json").exists())
            self.assertTrue((root / "latest.json").exists())
            self.assertTrue((root / "black" / "x11" / "latest.json").exists())
            loaded = json.loads(path.read_text())
            self.assertEqual(loaded["namespace"]["session"], "x11")


if __name__ == "__main__":
    unittest.main()
