#!/usr/bin/env python3
"""Unit tests for settle pure helpers (no GNOME required)."""

from __future__ import annotations

import unittest

from lib.settle import SettleConfig, match_window, summarize_events, verify_mode_for_sample


class MatchTests(unittest.TestCase):
    def test_wm_class(self):
        snap = {"wmClass": "com.mitchellh.ghostty", "title": "x"}
        self.assertTrue(match_window(snap, {"wmClass": "com.mitchellh.ghostty"}))
        self.assertFalse(match_window(snap, {"wmClass": "google-chrome"}))

    def test_title_contains(self):
        snap = {
            "wmClass": "chrome-ggjocahimgaohmigbfhghnlfcnjemagj-Default",
            "title": "Grok - chat",
        }
        self.assertTrue(
            match_window(
                snap,
                {
                    "wmClass": "chrome-ggjocahimgaohmigbfhghnlfcnjemagj-Default",
                    "titleContains": "Grok",
                },
            )
        )


class SettleTests(unittest.TestCase):
    def test_summarize_counts(self):
        cfg = SettleConfig()
        events = [
            {"seq": 1, "monoMs": 100, "signal": "size-changed", "windowId": 5},
            {"seq": 2, "monoMs": 150, "signal": "size-changed", "windowId": 5},
            {"seq": 3, "monoMs": 200, "signal": "position-changed", "windowId": 5},
            {"seq": 4, "monoMs": 210, "signal": "size-changed", "windowId": 9},
        ]
        res = summarize_events(
            events,
            cfg,
            t0_mono=100,
            window_id=5,
            settled=True,
            reason="quiet_agreement",
            wait_ms=10000,
            agreement_reached=5,
            verify_mode="dense",
            verifications=[{"waitMs": 1}],
        )
        self.assertEqual(res.relevant_event_count, 3)
        self.assertEqual(res.counts_by_signal["size-changed"], 2)
        self.assertEqual(res.verify_mode, "dense")
        self.assertEqual(res.verification_count, 1)

    def test_verify_mode_split(self):
        config = {
            "settle": {
                "quietMs": 500,
                "agreeCount": 5,
                "agreementIntervalMs": 2000,
                "maxWaitMs": 120000,
                "verifyModes": {
                    "dense": {"samples": [0, 1, 2, 3, 4], "pollMs": 50},
                    "sparse": {"samples": [5, 6, 7, 8, 9], "pollMs": 2000},
                },
            }
        }
        n0, c0 = verify_mode_for_sample(config, 0)
        n5, c5 = verify_mode_for_sample(config, 5)
        self.assertEqual(n0, "dense")
        self.assertEqual(c0.poll_ms, 50)
        self.assertEqual(n5, "sparse")
        self.assertEqual(c5.poll_ms, 2000)
        self.assertEqual(c0.agree_count, 5)
        self.assertEqual(c0.agreement_interval_ms, 2000)


if __name__ == "__main__":
    unittest.main()
