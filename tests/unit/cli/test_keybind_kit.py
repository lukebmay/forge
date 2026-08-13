"""Unit tests for keybind_kit path resolution (no live gsettings)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

_FORGE_CLI = Path(__file__).resolve().parents[3] / "scripts" / "forge"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

from keybind_kit import (  # noqa: E402
    binding_diffs,
    bindings_equal,
    closest_kit,
    format_strv,
    inspect_live_kit,
    match_kit_id,
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


class TestKitMatch(unittest.TestCase):
    """Pure match/diff — no gsettings / node."""

    KEYS = ("prefs-app-launch", "window-swap-last-active")

    def _kits(self):
        return {
            "vim": {
                "mod-mask-mouse-tile": "None",
                "keys": list(self.KEYS),
                "bindings": {
                    "prefs-app-launch": ["<Super>Return"],
                    "window-swap-last-active": ["<Super>Tab"],
                },
            },
            "safe": {
                "mod-mask-mouse-tile": "None",
                "keys": list(self.KEYS),
                "bindings": {
                    "prefs-app-launch": ["<Ctrl><Shift><Super>Return"],
                    "window-swap-last-active": ["<Ctrl><Super>Return"],
                },
            },
            "i3": {
                "mod-mask-mouse-tile": "None",
                "keys": list(self.KEYS),
                "bindings": {
                    "prefs-app-launch": ["<Super>Return"],
                    "window-swap-last-active": ["<Super>Tab"],
                },
            },
        }

    def test_bindings_equal_order_sensitive(self):
        a = {"prefs-app-launch": ["<Super>Return"]}
        b = {"prefs-app-launch": ["<Super>Return"]}
        self.assertTrue(bindings_equal(a, b, keys=self.KEYS))
        self.assertFalse(
            bindings_equal(
                {"prefs-app-launch": ["<Super>Return", "<Super>e"]},
                {"prefs-app-launch": ["<Super>e", "<Super>Return"]},
                keys=("prefs-app-launch", ),
            ))

    def test_match_kit_id_vim(self):
        kits = self._kits()
        snap = {
            "mod-mask-mouse-tile": "None",
            "bindings": dict(kits["vim"]["bindings"]),
        }
        self.assertEqual(match_kit_id(snap, kits), "vim")

    def test_old_vim_swap_last_is_custom(self):
        kits = self._kits()
        snap = {
            "mod-mask-mouse-tile": "None",
            "bindings": {
                "prefs-app-launch": ["<Ctrl><Shift><Super>Return"],
                "window-swap-last-active": ["<Super>Return"],
            },
        }
        self.assertEqual(match_kit_id(snap, kits), "custom")
        closest, diffs = closest_kit(snap, kits)
        self.assertIn(closest, ("vim", "safe", "i3"))
        self.assertGreaterEqual(len(diffs), 1)
        keys = {d["key"] for d in diffs}
        self.assertIn("window-swap-last-active", keys)

    def test_inspect_live_kit_accepts_snap(self):
        kits = self._kits()
        snap = {
            "mod-mask-mouse-tile": "None",
            "bindings": dict(kits["safe"]["bindings"]),
        }
        info = inspect_live_kit(snap=snap, kits=kits)
        self.assertEqual(info["matched"], "safe")
        self.assertEqual(info["diffCount"], 0)
        self.assertIn("--kit=vim", info["hint"])

    def test_binding_diffs_lists_both_sides(self):
        diffs = binding_diffs(
            {"prefs-app-launch": ["<Super>Return"]},
            {"prefs-app-launch": ["<Super>Tab"]},
            keys=("prefs-app-launch", ),
        )
        self.assertEqual(len(diffs), 1)
        self.assertEqual(diffs[0]["kit"], ["<Super>Return"])
        self.assertEqual(diffs[0]["live"], ["<Super>Tab"])


if __name__ == "__main__":
    unittest.main()
