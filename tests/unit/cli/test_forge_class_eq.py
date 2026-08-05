#!/usr/bin/env python3
"""W2: forge CLI _class_eq Chrome family sugar (layout wait)."""

from __future__ import annotations

import unittest
from importlib.machinery import SourceFileLoader
from pathlib import Path

_REPO = Path(__file__).resolve().parents[3]
_FORGE = _REPO / "scripts" / "forge" / "forge"

forge = SourceFileLoader("forge_cli_class_eq", str(_FORGE)).load_module()
_class_eq = forge._class_eq


class TestForgeClassEq(unittest.TestCase):
    def test_casefold_and_stem(self):
        self.assertTrue(_class_eq("Google-chrome", "google-chrome"))
        self.assertTrue(_class_eq("ghostty", "com.mitchellh.ghostty"))
        self.assertFalse(_class_eq("A", "B"))
        self.assertFalse(_class_eq(None, "A"))

    def test_chrome_browser_matches_pwa_and_crx(self):
        self.assertTrue(_class_eq("Google-chrome", "chrome-ggjoabcdef-Default"))
        self.assertTrue(_class_eq("google-chrome", "chrome-ggjoabcdef-Default"))
        self.assertTrue(_class_eq("Chromium", "chrome-ggjoabcdef-Default"))
        self.assertTrue(_class_eq("chromium", "crx_abc123"))
        self.assertTrue(_class_eq("google-chrome-stable", "crx_xyz"))
        self.assertTrue(_class_eq("chrome-aaa-Default", "Google-chrome"))
        self.assertTrue(_class_eq("Google-chrome", "Google-chrome"))
        self.assertTrue(_class_eq("Google-chrome", "Chromium"))

    def test_distinct_pwas_do_not_match(self):
        self.assertFalse(_class_eq("chrome-aaa-Default", "chrome-bbb-Default"))
        self.assertFalse(_class_eq("chrome-ggjoabcdef-Default", "chrome-otherid-Default"))
        self.assertFalse(_class_eq("crx_a", "crx_b"))
        self.assertFalse(_class_eq("crx_abc123", "chrome-aaa-Default"))
        self.assertTrue(_class_eq("chrome-aaa-Default", "chrome-aaa-Default"))
        self.assertTrue(_class_eq("crx_a", "crx_a"))

    def test_same_pwa_crx_matches_chrome_default(self):
        self.assertTrue(
            _class_eq(
                "crx_agimnkijcaahngcdmfeangaknmldooml",
                "chrome-agimnkijcaahngcdmfeangaknmldooml-Default",
            )
        )
        self.assertTrue(
            _class_eq(
                "chrome-ggjocahimgaohmigbfhghnlfcnjemagj-Default",
                "crx_ggjocahimgaohmigbfhghnlfcnjemagj",
            )
        )

    def test_non_chrome_does_not_match_pwa(self):
        self.assertFalse(_class_eq("firefox", "chrome-ggjo-Default"))
        self.assertFalse(_class_eq("ghostty", "crx_abc"))


if __name__ == "__main__":
    unittest.main()
