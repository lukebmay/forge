"""Unit tests for keybind_kit path resolution (no live gsettings)."""

from __future__ import annotations

import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

_FORGE_CLI = Path(__file__).resolve().parents[3] / "scripts" / "forge"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

from keybind_kit import (  # noqa: E402
    binding_diffs,
    bindings_equal,
    build_profile_props,
    closest_kit,
    cmd_load,
    cmd_save,
    inspect_live_kit,
    is_reserved_kit_name,
    match_kit_id,
    profile_stem,
    profiles_dir,
    resolve_load_name,
    sanitize_profile_name,
    save_live,
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
        self.assertEqual(sanitize_profile_name("my-kit"), "my-kit")
        self.assertIsNone(sanitize_profile_name("../evil"))
        self.assertIsNone(sanitize_profile_name("has space"))
        self.assertIsNone(sanitize_profile_name(""))

    def test_profile_stem_strips_json(self):
        self.assertEqual(profile_stem("my-kit.json"), "my-kit")
        self.assertEqual(profile_stem("my-kit"), "my-kit")

    def test_reserved_kit_names(self):
        for name in ("vim", "Vim", "safe", "i3", "i3.json"):
            self.assertTrue(is_reserved_kit_name(name), name)
        self.assertFalse(is_reserved_kit_name("my-kit"))
        self.assertFalse(is_reserved_kit_name("vimish"))

    def test_format_strv(self):
        from keybind_kit import format_strv

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
                    "prefs-app-launch": ["<Super>space"],
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
                    "prefs-app-launch": ["<Super>space"],
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


class TestResolveLoadAndSave(unittest.TestCase):
    """load name resolution + reserved save names (no gsettings)."""

    def test_resolve_builtin_kit(self):
        kind, target = resolve_load_name("vim")
        self.assertEqual(kind, "kit")
        self.assertEqual(target, "vim")
        kind, target = resolve_load_name("SAFE")
        self.assertEqual((kind, target), ("kit", "safe"))

    def test_resolve_profile_by_name(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            (d / "my-kit.json").write_text("{}", encoding="utf-8")
            kind, path = resolve_load_name("my-kit", out_dir=d)
            self.assertEqual(kind, "profile")
            self.assertEqual(path, d / "my-kit.json")

    def test_resolve_profile_missing(self):
        with tempfile.TemporaryDirectory() as td:
            with self.assertRaises(FileNotFoundError):
                resolve_load_name("nope", out_dir=Path(td))

    def test_builtin_wins_over_same_named_file(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            (d / "vim.json").write_text("{}", encoding="utf-8")
            kind, target = resolve_load_name("vim", out_dir=d)
            self.assertEqual((kind, target), ("kit", "vim"))

    def test_save_live_rejects_reserved(self):
        with tempfile.TemporaryDirectory() as td:
            with self.assertRaises(ValueError) as cm:
                save_live("vim", out_dir=Path(td))
            self.assertIn("built-in", str(cm.exception).lower())

    def test_save_live_writes_named_json(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            with mock.patch("keybind_kit.load_live_snapshot",
                            return_value={
                                "mod-mask-mouse-tile": "None",
                                "bindings": {
                                    "window-focus-left": ["<Super>h"]
                                },
                            }):
                path = save_live("my-kit", out_dir=d)
            self.assertEqual(path, d / "my-kit.json")
            self.assertTrue(path.is_file())
            import json
            data = json.loads(path.read_text(encoding="utf-8"))
            # GUI/CLI shared shape (no CLI-only note/savedAt).
            self.assertEqual(
                data,
                {
                    "version": 1,
                    "mod-mask-mouse-tile": "None",
                    "bindings": {
                        "window-focus-left": ["<Super>h"]
                    },
                    "name": "my-kit",
                },
            )
            self.assertTrue(path.read_text(encoding="utf-8").endswith("\n"))
            # .json suffix on the name is stripped
            with mock.patch("keybind_kit.load_live_snapshot",
                            return_value={
                                "mod-mask-mouse-tile": "None",
                                "bindings": {},
                            }):
                path2 = save_live("other.json", out_dir=d)
            self.assertEqual(path2, d / "other.json")

    def test_build_profile_props_matches_js_shape(self):
        props = build_profile_props(
            mod_mask="None",
            bindings={"window-focus-left": ["<Super>h"]},
            name="desk",
        )
        self.assertEqual(
            props,
            {
                "version": 1,
                "mod-mask-mouse-tile": "None",
                "bindings": {
                    "window-focus-left": ["<Super>h"]
                },
                "name": "desk",
            },
        )
        self.assertNotIn("savedAt", props)
        self.assertNotIn("note", props)

    def test_cmd_load_kit_no_profile_flag(self):
        args = types.SimpleNamespace(name="vim", dry_run=True, verbose=False)
        with mock.patch("keybind_kit.apply_kit",
                        return_value=({}, ["prefs-app-launch"])) as apply_kit:
            rc = cmd_load(args)
        self.assertEqual(rc, 0)
        apply_kit.assert_called_once_with("vim", dry_run=True)

    def test_cmd_load_profile_by_positional(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            p = d / "desk.json"
            p.write_text('{"bindings":{}}', encoding="utf-8")
            args = types.SimpleNamespace(name="desk",
                                         dry_run=True,
                                         verbose=False)
            with mock.patch("keybind_kit.profiles_dir", return_value=d), \
                    mock.patch(
                        "keybind_kit.apply_profile_file",
                        return_value=["k"],
                    ) as apply_pf:
                rc = cmd_load(args)
            self.assertEqual(rc, 0)
            apply_pf.assert_called_once()
            self.assertEqual(apply_pf.call_args[0][0], p)

    def test_cmd_save_requires_name(self):
        args = types.SimpleNamespace(name=None, dir=None)
        self.assertEqual(cmd_save(args), 1)


if __name__ == "__main__":
    unittest.main()
