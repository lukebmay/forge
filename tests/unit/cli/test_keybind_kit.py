"""Unit tests for keybind_kit path resolution (no live gsettings)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

_FORGE_CLI = Path(__file__).resolve().parents[3] / "scripts" / "forge"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

from keybind_kit import (  # noqa: E402
    format_strv,
    profiles_dir,
    sanitize_profile_name,
)


class TestKeybindKitPaths(unittest.TestCase):

    def test_profiles_dir_env(self):
        env = {"FORGE_KEYBIND_PROFILES_DIR": "/tmp/kbd-profiles"}
        self.assertEqual(profiles_dir(env), Path("/tmp/kbd-profiles"))

    def test_profiles_dir_env_trim(self):
        env = {"FORGE_KEYBIND_PROFILES_DIR": "  /tmp/kbd  "}
        self.assertEqual(profiles_dir(env), Path("/tmp/kbd"))

    def test_profiles_dir_empty_env_falls_back_xdg(self):
        # HOME may not affect Path.home() if already resolved — only check non-env path shape
        d = profiles_dir({"FORGE_KEYBIND_PROFILES_DIR": ""})
        self.assertTrue(str(d).endswith("keybinding-profiles"))
        self.assertIn("forge", str(d))

    def test_sanitize_profile_name(self):
        self.assertEqual(sanitize_profile_name("backup-before-vim-20260728"),
                         "backup-before-vim-20260728")
        self.assertIsNone(sanitize_profile_name("../evil"))
        self.assertIsNone(sanitize_profile_name("has space"))
        self.assertIsNone(sanitize_profile_name(""))

    def test_format_strv(self):
        self.assertEqual(format_strv([]), "@as []")
        self.assertEqual(format_strv(["<Super>h"]), "['<Super>h']")
        self.assertEqual(
            format_strv(["<Super>h", "<Super>Left"]),
            "['<Super>h', '<Super>Left']",
        )


if __name__ == "__main__":
    unittest.main()
