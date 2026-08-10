#!/usr/bin/env python3
"""Unit tests for result helpers."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from lib.results import (
    apply_suite,
    atomic_write_json,
    checkpoint_run,
    deep_merge,
    namespace_dir,
    run_output_path,
    settle_to_dict,
    write_per_app_enabled,
    write_run,
)
from lib.settle import SettleResult


class SuiteMergeTests(unittest.TestCase):

    def test_deep_merge(self):
        m = deep_merge({"settle": {"a": 1, "b": 2}}, {"settle": {"b": 9}})
        self.assertEqual(m["settle"]["a"], 1)
        self.assertEqual(m["settle"]["b"], 9)

    def test_apply_suite(self):
        cfg = {
            "samples": 5,
            "suites": {
                "full-suite": {
                    "phase": "full-suite",
                    "samples": 5
                }
            },
        }
        out = apply_suite(cfg, "full-suite")
        self.assertEqual(out["suite"], "full-suite")
        self.assertEqual(out["samples"], 5)


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
            checks=[{
                "tMs": 50,
                "out": "agreement"
            }],
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
            out = namespace_dir(root,
                                host="black",
                                session="wayland",
                                suite="full-suite")
            doc = {
                "phase": "full-suite",
                "suite": "full-suite",
                "namespace": {
                    "host": "black",
                    "session": "wayland",
                    "suite": "full-suite",
                },
                "host": {
                    "host": "black",
                    "sessionType": "wayland"
                },
                "trials": [],
            }
            path = write_run(doc, out, latest=True, results_root=root)
            self.assertTrue(path.is_file())
            self.assertIn("black/wayland/full-suite", str(path))
            json.loads(path.read_text())

    def test_atomic_and_checkpoint(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            out = namespace_dir(root,
                                host="black",
                                session="wayland",
                                suite="full-suite")
            doc = {
                "phase": "full-suite",
                "suite": "full-suite",
                "namespace": {
                    "host": "black",
                    "session": "wayland",
                    "suite": "full-suite",
                },
                "host": {
                    "host": "black",
                    "sessionType": "wayland"
                },
                "trials": [{
                    "appId": "a"
                }],
            }
            path = run_output_path(out, doc, ts="20260807T000000Z")
            atomic_write_json(path, doc)
            self.assertTrue(path.is_file())
            doc["trials"].append({"appId": "b"})
            checkpoint_run(doc, path, results_root=root, update_latest=False)
            data = json.loads(path.read_text())
            self.assertEqual(len(data["trials"]), 2)
            self.assertIn("checkpointAt", data)
            self.assertFalse((out / "latest.json").exists())
            write_run(doc, out, latest=True, results_root=root, path=path)
            self.assertTrue((out / "latest.json").exists())

    def test_write_per_app_flag(self):
        self.assertTrue(
            write_per_app_enabled({"output": {
                "writePerApp": True
            }}))
        self.assertFalse(
            write_per_app_enabled({"output": {
                "writeOnlyAtEnd": True
            }}))
        self.assertTrue(write_per_app_enabled({"output": {}}))


if __name__ == "__main__":
    unittest.main()
