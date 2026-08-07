#!/usr/bin/env python3
"""Unit tests for result helpers."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from lib.results import apply_suite, deep_merge, namespace_dir, settle_to_dict, write_run
from lib.settle import SettleResult


class SuiteMergeTests(unittest.TestCase):
    def test_deep_merge(self):
        m = deep_merge({"settle": {"a": 1, "b": 2}}, {"settle": {"b": 9}})
        self.assertEqual(m["settle"]["a"], 1)
        self.assertEqual(m["settle"]["b"], 9)

    def test_apply_suite(self):
        cfg = {
            "samples": 10,
            "suites": {"full-suite": {"phase": "full-suite", "samples": 10}},
        }
        out = apply_suite(cfg, "full-suite")
        self.assertEqual(out["suite"], "full-suite")


class SettleDictTests(unittest.TestCase):
    def test_from_result(self):
        r = SettleResult(
            settled=True,
            reason="hard_stable_duration",
            wait_ms=3000,
            check_interval_ms=50,
            settle_duration_ms=3000,
            stable_ms=3000,
            check_count=2,
            hard_reset_count=0,
            soft_count=1,
            agreement_count=1,
            time_to_first_agreement_ms=50,
            time_to_last_hard_ms=None,
            time_to_settled_ms=3000,
            checks=[{"tMs": 50, "out": "agreement"}],
            disagreement_counts={"agreement": 1},
        )
        d = settle_to_dict(r)
        self.assertTrue(d["settled"])
        self.assertEqual(d["checks"][0]["out"], "agreement")
        self.assertNotIn("verifications", d)


class NamespaceWriteTests(unittest.TestCase):
    def test_write(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            out = namespace_dir(root, host="black", session="wayland", suite="full-suite")
            doc = {
                "phase": "full-suite",
                "suite": "full-suite",
                "namespace": {
                    "host": "black",
                    "session": "wayland",
                    "suite": "full-suite",
                },
                "host": {"host": "black", "sessionType": "wayland"},
                "trials": [],
            }
            path = write_run(doc, out, latest=True, results_root=root)
            self.assertTrue(path.is_file())
            self.assertIn("black/wayland/full-suite", str(path))
            json.loads(path.read_text())


if __name__ == "__main__":
    unittest.main()
