#!/usr/bin/env python3
"""Unit tests for extension state parsing (no GNOME required)."""

from __future__ import annotations

import unittest

from lib.ext_state import classify_extension, parse_info_enabled, parse_list_enabled

GNOME46_ACTIVE = """\
forge@jmmaranan.com
  Name: Forge
  Enabled: Yes
  State: ACTIVE
"""

GNOME46_INACTIVE = """\
forge@jmmaranan.com
  Name: Forge
  Enabled: No
  State: INACTIVE
"""

LEGACY_ENABLED = """\
  State: ENABLED
"""

LEGACY_DISABLED = """\
  State: DISABLED
"""


class ParseInfoTests(unittest.TestCase):

    def test_gnome46_active(self):
        self.assertIs(parse_info_enabled(GNOME46_ACTIVE), True)

    def test_gnome46_inactive(self):
        self.assertIs(parse_info_enabled(GNOME46_INACTIVE), False)

    def test_legacy_state_enabled(self):
        self.assertIs(parse_info_enabled(LEGACY_ENABLED), True)

    def test_legacy_state_disabled(self):
        self.assertIs(parse_info_enabled(LEGACY_DISABLED), False)

    def test_enabled_yes_beats_confusing_state(self):
        # regression: old prep matched state:.*enabled only — missed ACTIVE
        text = "  Enabled: Yes\n  State: ACTIVE\n"
        self.assertIs(parse_info_enabled(text), True)
        # State ACTIVE alone (no Enabled line)
        self.assertIs(parse_info_enabled("  State: ACTIVE\n"), True)

    def test_unknown(self):
        self.assertIsNone(parse_info_enabled("Name: Foo\n"))


class ListEnabledTests(unittest.TestCase):

    def test_list(self):
        text = "a@x\nforge@jmmaranan.com\nb@y\n"
        self.assertTrue(parse_list_enabled(text, "forge@jmmaranan.com"))
        self.assertFalse(parse_list_enabled(text, "missing@x"))


class ClassifyTests(unittest.TestCase):

    def test_info_active(self):
        self.assertEqual(classify_extension(info_text=GNOME46_ACTIVE),
                         "enabled")

    def test_info_inactive(self):
        self.assertEqual(classify_extension(info_text=GNOME46_INACTIVE),
                         "disabled")

    def test_missing(self):
        self.assertEqual(classify_extension(info_missing=True), "missing")

    def test_list_fallback(self):
        self.assertEqual(
            classify_extension(
                info_text="Name: only\n",
                list_enabled_text="forge@jmmaranan.com\n",
                uuid="forge@jmmaranan.com",
            ),
            "enabled",
        )


if __name__ == "__main__":
    unittest.main()
