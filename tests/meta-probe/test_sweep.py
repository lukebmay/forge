#!/usr/bin/env python3
"""Unit tests for delay sweep helpers (no GNOME)."""

from __future__ import annotations

import unittest

from lib.sweep import (
    compare_hypothesis,
    delay_schedule,
    hypothesis_from_two_step,
    isolation_plan,
    isolation_safe_d2,
    joint_near_edge_candidates,
    pad_delay,
    record_last_good_first_fail,
)


class DelayScheduleTests(unittest.TestCase):
    def test_high_to_low(self):
        s = delay_schedule(500, 100, d_min=0)
        self.assertEqual(s[0], 500.0)
        self.assertEqual(s[-1], 0.0)
        self.assertIn(300.0, s)

    def test_step_required(self):
        with self.assertRaises(ValueError):
            delay_schedule(100, 0)


class LastGoodFirstFailTests(unittest.TestCase):
    def test_finds_edge(self):
        # high → low: good until 200, thrash at 100
        pairs = [(500, False), (400, False), (300, False), (200, False), (100, True)]
        r = record_last_good_first_fail(pairs)
        self.assertEqual(r["lastGoodMs"], 200.0)
        self.assertEqual(r["firstFailMs"], 100.0)
        self.assertFalse(r["thrashFree"])

    def test_never_thrash(self):
        pairs = [(300, False), (200, False), (100, False)]
        r = record_last_good_first_fail(pairs)
        self.assertEqual(r["lastGoodMs"], 100.0)
        self.assertIsNone(r["firstFailMs"])
        self.assertTrue(r["thrashFree"])

    def test_immediate_thrash(self):
        pairs = [(2000, True)]
        r = record_last_good_first_fail(pairs)
        self.assertIsNone(r["lastGoodMs"])
        self.assertEqual(r["firstFailMs"], 2000.0)


class HypothesisTests(unittest.TestCase):
    def test_pad(self):
        self.assertEqual(pad_delay(100, pad_ms=50), 150.0)
        self.assertEqual(pad_delay(None, pad_ms=50, floor_ms=2000), 2000.0)

    def test_from_two_step(self):
        h = hypothesis_from_two_step(
            launch_then_monitor_last_good=400,
            launch_then_move_last_good=300,
            pad_ms=100,
        )
        self.assertEqual(h["d1Ms"], 500.0)
        self.assertEqual(h["d2Ms"], 400.0)

    def test_compare(self):
        c = compare_hypothesis({"d1Ms": 500, "d2Ms": 400}, {"d1Ms": 250, "d2Ms": 200})
        self.assertEqual(c["d1Ratio"], 0.5)
        self.assertEqual(c["d2ErrorMs"], -200.0)


class IsolationTests(unittest.TestCase):
    def test_plan_has_phases(self):
        p = isolation_plan(d1_0=1000, d2_0=800, d_step=100, d_min=0)
        self.assertEqual(p["confirm"]["d1Ms"], 1000.0)
        self.assertEqual(p["sweepD2"]["lockMs"], 1000.0)
        self.assertTrue(p["sweepD2"]["scheduleMs"][0] >= 800)

    def test_safe_d2(self):
        self.assertEqual(
            isolation_safe_d2(d2_0=800, last_good_d2=300, pad_ms=50),
            350.0,
        )
        self.assertEqual(
            isolation_safe_d2(d2_0=800, last_good_d2=None, pad_ms=50),
            800.0,
        )

    def test_joint_candidates(self):
        c = joint_near_edge_candidates(
            d1_star=200, d2_star=150, pad_ms=50, step_ms=50, max_steps=2
        )
        self.assertEqual(len(c), 2)
        self.assertEqual(c[0], (250.0, 200.0))


if __name__ == "__main__":
    unittest.main()
