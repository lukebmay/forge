#!/usr/bin/env python3
"""Unit tests for thrash detection (no GNOME)."""

from __future__ import annotations

import unittest

from lib.settle import SettleResult
from lib.thrash import (
    DEFAULT_MAX_HARD_RESETS,
    DEFAULT_WAIT_FACTOR,
    is_thrash,
    is_thrash_from_settle,
    thrash_config_from_dict,
    trial_is_thrash,
)


def _ok_settle(**kw) -> SettleResult:
    base = dict(
        settled=True,
        reason="hard_stable_duration",
        wait_ms=3100,
        check_interval_ms=100,
        settle_duration_ms=3000,
        stable_ms=3000,
        check_count=30,
        hard_reset_count=2,
        soft_count=0,
        agreement_count=28,
        time_to_first_agreement_ms=100,
        time_to_last_hard_ms=200,
        time_to_settled_ms=3100,
        checks=[],
        disagreement_counts={},
    )
    base.update(kw)
    return SettleResult(**base)


class ThrashDetectTests(unittest.TestCase):

    def test_settled_clean(self):
        thrash, reason = is_thrash(
            settled=True,
            hard_reset_count=1,
            wait_ms=3200,
            settle_duration_ms=3000,
        )
        self.assertFalse(thrash)
        self.assertEqual(reason, "")

    def test_settle_fail(self):
        thrash, reason = is_thrash(settled=False,
                                   wait_ms=5000,
                                   settle_duration_ms=3000)
        self.assertTrue(thrash)
        self.assertEqual(reason, "settle_fail")

    def test_excess_hard_resets(self):
        thrash, reason = is_thrash(
            settled=True,
            hard_reset_count=DEFAULT_MAX_HARD_RESETS + 1,
            wait_ms=3000,
            settle_duration_ms=3000,
        )
        self.assertTrue(thrash)
        self.assertIn("excess_hard_resets", reason)

    def test_wait_factor(self):
        duration = 3000.0
        thrash, reason = is_thrash(
            settled=True,
            hard_reset_count=0,
            wait_ms=duration * DEFAULT_WAIT_FACTOR + 1,
            settle_duration_ms=duration,
            wait_factor=DEFAULT_WAIT_FACTOR,
        )
        self.assertTrue(thrash)
        self.assertIn("wait_exceeds_factor", reason)

    def test_config_from_dict(self):
        c = thrash_config_from_dict({"maxHardResets": 5, "waitFactor": 3})
        self.assertEqual(c["maxHardResets"], 5)
        self.assertEqual(c["waitFactor"], 3.0)

    def test_from_settle_result(self):
        thrash, _ = is_thrash_from_settle(_ok_settle())
        self.assertFalse(thrash)
        thrash, reason = is_thrash_from_settle(_ok_settle(settled=False))
        self.assertTrue(thrash)
        self.assertEqual(reason, "settle_fail")

    def test_from_settle_dict(self):
        thrash, _ = is_thrash_from_settle({
            "settled": True,
            "hardResetCount": 0,
            "waitMs": 3000,
            "settleDurationMs": 3000
        })
        self.assertFalse(thrash)

    def test_none_settle(self):
        thrash, reason = is_thrash_from_settle(None)
        self.assertTrue(thrash)
        self.assertEqual(reason, "settle_missing")

    def test_trial(self):
        thrash, _ = trial_is_thrash({
            "ok": True,
            "settle": {
                "settled": True,
                "hardResetCount": 0,
                "waitMs": 3000,
                "settleDurationMs": 3000,
            },
        })
        self.assertFalse(thrash)
        thrash, reason = trial_is_thrash({
            "ok": False,
            "settle": {
                "settled": False
            }
        })
        self.assertTrue(thrash)

    def test_skipped_not_thrash(self):
        thrash, reason = trial_is_thrash({
            "ok": True,
            "skipped": True,
            "skipReason": "single_monitor",
            "settle": {}
        })
        self.assertFalse(thrash)
        self.assertEqual(reason, "")


if __name__ == "__main__":
    unittest.main()
