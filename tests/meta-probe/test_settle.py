#!/usr/bin/env python3
"""Unit tests for agreement settle (no GNOME)."""

from __future__ import annotations

import unittest

from lib.settle import (
    DisagreementCatalog,
    SettleResult,
    classify_check,
    derive_knobs_from_calibration,
    match_window,
    settle_config_from_dict,
    snapshot_field_diffs,
)


class MatchTests(unittest.TestCase):

    def test_wm_class(self):
        snap = {"wmClass": "com.mitchellh.ghostty", "title": "x"}
        self.assertTrue(
            match_window(snap, {"wmClass": "com.mitchellh.ghostty"}))
        self.assertFalse(match_window(snap, {"wmClass": "google-chrome"}))


class ClassifyTests(unittest.TestCase):

    def test_hard_size_resets(self):
        cat = DisagreementCatalog()
        out, sev, _ = classify_check(
            events=[{
                "signal": "size-changed",
                "windowId": 1
            }],
            window_id=1,
            prev_snap={"frame": {
                "x": 0,
                "y": 0,
                "width": 100,
                "height": 100
            }},
            curr_snap={"frame": {
                "x": 0,
                "y": 0,
                "width": 200,
                "height": 100
            }},
            catalog=cat,
        )
        self.assertEqual(sev, "hard")
        self.assertTrue(out.startswith("d_") or out == "d_size")

    def test_soft_title_no_hard(self):
        cat = DisagreementCatalog()
        out, sev, _ = classify_check(
            events=[{
                "signal": "notify::title",
                "windowId": 1
            }],
            window_id=1,
            prev_snap={
                "title": "a",
                "frame": {
                    "x": 0,
                    "y": 0,
                    "width": 1,
                    "height": 1
                }
            },
            curr_snap={
                "title": "b",
                "frame": {
                    "x": 0,
                    "y": 0,
                    "width": 1,
                    "height": 1
                }
            },
            catalog=cat,
        )
        self.assertEqual(sev, "soft")
        self.assertTrue(out.startswith("s_"))

    def test_snapshot_frame_is_soft_v1(self):
        """Snapshot thrash without hard event → soft (no timer reset)."""
        cat = DisagreementCatalog()
        out, sev, _ = classify_check(
            events=[],
            window_id=1,
            prev_snap={"frame": {
                "x": 0,
                "y": 0,
                "width": 100,
                "height": 100
            }},
            curr_snap={
                "frame": {
                    "x": 10,
                    "y": 0,
                    "width": 100,
                    "height": 100
                }
            },
            catalog=cat,
        )
        self.assertEqual(sev, "soft")
        self.assertIn("snap", out)

    def test_agreement(self):
        cat = DisagreementCatalog()
        snap = {
            "frame": {
                "x": 0,
                "y": 0,
                "width": 1,
                "height": 1
            },
            "title": "t",
            "monitor": 0,
        }
        out, sev, _ = classify_check(
            events=[],
            window_id=1,
            prev_snap=snap,
            curr_snap=dict(snap),
            catalog=cat,
        )
        self.assertEqual(out, "agreement")
        self.assertEqual(sev, "agreement")

    def test_unknown_signal_mints_catalog(self):
        cat = DisagreementCatalog()
        out, sev, _ = classify_check(
            events=[{
                "signal": "notify::weird-prop",
                "windowId": 1
            }],
            window_id=1,
            prev_snap=None,
            curr_snap=None,
            catalog=cat,
        )
        self.assertEqual(sev, "hard")
        self.assertIn(out, cat.entries)
        self.assertTrue(cat.entries[out].get("auto")
                        or out.startswith("d_auto_"))


class DeriveTests(unittest.TestCase):

    def test_slow_thrash_raises_duration(self):
        r = SettleResult(
            settled=True,
            reason="hard_stable_duration",
            wait_ms=8000,
            check_interval_ms=50,
            settle_duration_ms=10000,
            stable_ms=3000,
            check_count=100,
            hard_reset_count=20,
            soft_count=5,
            agreement_count=40,
            time_to_first_agreement_ms=100,
            time_to_last_hard_ms=5000,
            time_to_settled_ms=8000,
            checks=[],
            disagreement_counts={},
        )
        d = derive_knobs_from_calibration(r,
                                          prev_duration_ms=3000,
                                          prev_interval_ms=100)
        self.assertGreaterEqual(d["settleDurationMs"], 3000)

    def test_clean_raises_interval(self):
        r = SettleResult(
            settled=True,
            reason="hard_stable_duration",
            wait_ms=3100,
            check_interval_ms=50,
            settle_duration_ms=10000,
            stable_ms=3000,
            check_count=60,
            hard_reset_count=1,
            soft_count=2,
            agreement_count=50,
            time_to_first_agreement_ms=50,
            time_to_last_hard_ms=100,
            time_to_settled_ms=3100,
            checks=[],
            disagreement_counts={},
        )
        d = derive_knobs_from_calibration(r,
                                          prev_duration_ms=3000,
                                          prev_interval_ms=50)
        self.assertGreaterEqual(d["checkIntervalMs"], 50)


class ConfigPhaseTests(unittest.TestCase):

    def test_bootstrap_duration(self):
        cfg = settle_config_from_dict(
            {
                "settleDurationMs": 3000,
                "checkIntervalMs": 100,
                "bootstrapSettleDurationMs": 10000,
                "bootstrapCheckIntervalMs": 50,
            },
            phase="bootstrap",
        )
        self.assertEqual(cfg.settle_duration_ms, 10000)
        self.assertEqual(cfg.check_interval_ms, 50)


class DiffTests(unittest.TestCase):

    def test_frame_diff(self):
        a = {"frame": {"x": 0, "y": 0, "width": 1, "height": 1}}
        b = {"frame": {"x": 1, "y": 0, "width": 1, "height": 1}}
        self.assertEqual(snapshot_field_diffs(a, b), ["frame"])


if __name__ == "__main__":
    unittest.main()
