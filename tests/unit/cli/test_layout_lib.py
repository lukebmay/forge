#!/usr/bin/env python3
"""Unit tests for scripts/forge/layout_lib.py (FC5 pure helpers)."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

_REPO = Path(__file__).resolve().parents[3]
_FORGE_CLI = _REPO / "scripts" / "forge"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

from layout_lib import (  # noqa: E402
    SOURCE_COMMON,
    SOURCE_ENV_PATH,
    SOURCE_HOST,
    SOURCE_HOST_DIR,
    SOURCE_XDG,
    extract_steps_and_stop,
    format_profile_list_line,
    format_profile_list_table,
    format_short_path,
    host_profiles_only,
    launch_fields_from_step,
    layout_dir,
    list_profiles,
    load_profile_file,
    partition_mixed_steps,
    profile_path,
    validate_profile,
)


class TestProfilePath(unittest.TestCase):

    def test_name_ok(self):
        p = profile_path("dev", config_root=Path("/tmp/forge-cfg"))
        self.assertEqual(p, Path("/tmp/forge-cfg/layout/dev.json"))

    def test_invalid_name(self):
        with self.assertRaises(ValueError):
            profile_path("../etc")
        with self.assertRaises(ValueError):
            profile_path("has space")

    def test_name_rejects_colon_and_at(self):
        with self.assertRaisesRegex(ValueError, r"':' or '@'"):
            profile_path("foo:bar")
        with self.assertRaisesRegex(ValueError, r"':' or '@'"):
            profile_path("foo@1")


class TestValidateProfile(unittest.TestCase):

    def test_minimal(self):
        p = validate_profile({"version": 1, "steps": []})
        self.assertEqual(p["version"], 1)
        self.assertTrue(p["stopOnError"])
        self.assertEqual(p["steps"], [])

    def test_missing_version(self):
        with self.assertRaisesRegex(ValueError, "version required"):
            validate_profile({"steps": []})

    def test_bad_version(self):
        with self.assertRaisesRegex(ValueError, "unsupported profile version"):
            validate_profile({"version": 2, "steps": []})

    def test_missing_steps(self):
        with self.assertRaisesRegex(ValueError, "steps required"):
            validate_profile({"version": 1})

    def test_steps_not_array(self):
        with self.assertRaisesRegex(ValueError, "steps must be an array"):
            validate_profile({"version": 1, "steps": {}})

    def test_unknown_op(self):
        with self.assertRaisesRegex(ValueError, "unknown op"):
            validate_profile({"version": 1, "steps": [{"op": "teleport"}]})

    def test_phase1_layout_ops_accepted(self):
        p = validate_profile({
            "version":
            1,
            "steps": [
                {
                    "op": "layout-cycle",
                    "axis": "group"
                },
                {
                    "op": "merge-group",
                    "selector": "focus",
                    "with": "id:2"
                },
                {
                    "op": "float",
                    "selector": "focus",
                    "scope": "window"
                },
                {
                    "op": "order",
                    "windowIds": ["id:1", "id:2"]
                },
            ],
        })
        self.assertEqual(len(p["steps"]), 4)

    def test_launch_requires_app(self):
        with self.assertRaisesRegex(ValueError, "launch requires app"):
            validate_profile({"version": 1, "steps": [{"op": "launch"}]})

    def test_wait_requires_ms(self):
        with self.assertRaisesRegex(ValueError, "wait requires ms"):
            validate_profile({"version": 1, "steps": [{"op": "wait"}]})

    def test_wait_window_requires_class(self):
        with self.assertRaisesRegex(ValueError,
                                    "wait-window requires wmClass"):
            validate_profile({"version": 1, "steps": [{"op": "wait-window"}]})

    def test_full_ok(self):
        p = validate_profile({
            "version":
            1,
            "description":
            "blurb",
            "displays":
            "rec",
            "settings":
            "daily",
            "stopOnError":
            False,
            "steps": [
                {
                    "op": "launch",
                    "app": "ghostty",
                    "monitor": "0"
                },
                {
                    "op": "wait",
                    "ms": 100
                },
                {
                    "op": "wait-window",
                    "wmClass": "X"
                },
                {
                    "op": "focus",
                    "selector": "class:X"
                },
            ],
        })
        self.assertEqual(p["displays"], "rec")
        self.assertEqual(p["settings"], "daily")
        self.assertFalse(p["stopOnError"])
        self.assertEqual(len(p["steps"]), 4)

    def test_string_version_1_ok(self):
        p = validate_profile({"version": "1", "steps": []})
        self.assertEqual(p["version"], 1)


class TestPartitionMixedSteps(unittest.TestCase):

    def test_empty(self):
        self.assertEqual(partition_mixed_steps([]), [])
        self.assertEqual(partition_mixed_steps(None), [])

    def test_extension_only(self):
        steps = [{
            "op": "focus",
            "selector": "focus"
        }, {
            "op": "layout",
            "mode": "tabbed"
        }]
        chunks = partition_mixed_steps(steps)
        self.assertEqual(len(chunks), 1)
        self.assertEqual(chunks[0]["kind"], "extension")
        self.assertEqual(len(chunks[0]["steps"]), 2)

    def test_cli_only(self):
        steps = [{"op": "launch", "app": "x"}, {"op": "wait", "ms": 1}]
        chunks = partition_mixed_steps(steps)
        self.assertEqual(len(chunks), 1)
        self.assertEqual(chunks[0]["kind"], "cli")

    def test_mixed_mirrors_js(self):
        steps = [
            {
                "op": "set",
                "key": "a",
                "value": 1
            },
            {
                "op": "launch",
                "app": "x"
            },
            {
                "op": "wait-window",
                "wmClass": "X"
            },
            {
                "op": "focus",
                "selector": "class:X"
            },
            {
                "op": "layout",
                "mode": "tabbed"
            },
        ]
        chunks = partition_mixed_steps(steps)
        self.assertEqual(
            [(c["kind"], len(c["steps"])) for c in chunks],
            [("extension", 1), ("cli", 2), ("extension", 2)],
        )

    def test_action_alias(self):
        chunks = partition_mixed_steps([{"action": "launch", "app": "x"}])
        self.assertEqual(chunks[0]["kind"], "cli")


class TestExtractAndLaunchFields(unittest.TestCase):

    def test_extract_array(self):
        steps, soe = extract_steps_and_stop([{"op": "ping"}])
        self.assertTrue(soe)
        self.assertEqual(len(steps), 1)

    def test_extract_object(self):
        steps, soe = extract_steps_and_stop({
            "steps": [],
            "stopOnError": False
        })
        self.assertFalse(soe)
        self.assertEqual(steps, [])

    def test_launch_fields(self):
        f = launch_fields_from_step({
            "op": "launch",
            "app": "ghostty",
            "monitor": 1,
            "treePath": "mo0ws0",
            "wmClass": "Ghostty",
            "timeout": 5000,
            "noWait": True,
            "first": True,
        })
        self.assertEqual(f["app"], "ghostty")
        self.assertEqual(f["monitor"], 1)
        self.assertEqual(f["tree_path"], "mo0ws0")
        self.assertEqual(f["wm_class"], "Ghostty")
        self.assertEqual(f["timeout"], 5000)
        self.assertTrue(f["no_wait"])
        self.assertTrue(f["first"])


class TestListLoadProfiles(unittest.TestCase):

    def test_list_and_load(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            d = layout_dir(root)
            d.mkdir(parents=True)
            body = {
                "version": 1,
                "description": "hello",
                "steps": [{
                    "op": "ping"
                }],
            }
            (d / "dev.json").write_text(json.dumps(body), encoding="utf-8")
            (d / "other.json").write_text(json.dumps({
                "version": 1,
                "steps": []
            }),
                                          encoding="utf-8")
            listed = list_profiles(root)
            names = [x["name"] for x in listed]
            self.assertEqual(names, ["dev", "other"])
            self.assertEqual(listed[0].get("description"), "hello")

            data = load_profile_file(d / "dev.json")
            p = validate_profile(data)
            self.assertEqual(p["description"], "hello")

    def test_bare_array_file(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            d = layout_dir(root)
            d.mkdir(parents=True)
            body = [["ghostty"], ["firefox", "code"]]
            (d / "bare.json").write_text(json.dumps(body), encoding="utf-8")
            data = load_profile_file(d / "bare.json")
            self.assertIsInstance(data, list)
            self.assertEqual(data[0], ["ghostty"])

    def test_list_auto_description_when_missing(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            d = layout_dir(root)
            d.mkdir(parents=True)
            body = [
                [{
                    "tab": ["google-chrome", "Grok"]
                }, "ghostty"],
                ["ghostty", {
                    "tab": ["YouTube", "Gmail", "Google Voice"]
                }],
            ]
            (d / "bare.json").write_text(json.dumps(body), encoding="utf-8")
            listed = list_profiles(root)
            self.assertEqual(len(listed), 1)
            self.assertEqual(
                listed[0].get("description"),
                "mon0 (hsplit): tabgroup, ghostty. mon1 (hsplit): ghostty, tabgroup.",
            )

    def test_list_prefers_stored_description(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            d = layout_dir(root)
            d.mkdir(parents=True)
            body = {
                "description": "My custom",
                "tiles": {
                    "mon0": ["ghostty", "firefox"]
                },
            }
            (d / "x.json").write_text(json.dumps(body), encoding="utf-8")
            listed = list_profiles(root)
            self.assertEqual(listed[0].get("description"), "My custom")

    def test_reject_scalar_json(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "bad.json"
            p.write_text('"just-a-string"', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "object or array"):
                load_profile_file(p)

    def test_missing_file(self):
        with self.assertRaises(FileNotFoundError):
            load_profile_file("/tmp/does-not-exist-forge-workon-xyz.json")


class TestFormatShortPath(unittest.TestCase):

    def test_short_unchanged(self):
        self.assertEqual(format_short_path("/tmp/dev.json"), "/tmp/dev.json")

    def test_home_tilde(self):
        home = str(Path.home())
        got = format_short_path(f"{home}/.config/forge/layout/dev.json")
        self.assertTrue(got.startswith("~/.config/"), got)

    def test_long_ellipsis_at_slash(self):
        long = ("/home/user/dev/me/shellrc/configs/forge/layout/"
                "hosts/black/dev.json")
        got = format_short_path(long, max_len=28)
        self.assertTrue(got.startswith("…/"), got)
        self.assertIn("hosts/black/dev.json", got)
        self.assertLessEqual(len(got), 28)

    def test_default_keeps_host_tail(self):
        long = ("/home/user/dev/me/shellrc/configs/forge/layout/"
                "hosts/black/dev.json")
        got = format_short_path(long)
        self.assertEqual(got, "…/forge/layout/hosts/black/dev.json")

    def test_list_line_name_desc(self):
        line = format_profile_list_line(
            {
                "name": "dev",
                "description": "Dual-mon morning layout on black workstation",
            },
            desc_max=12,
        )
        self.assertTrue(line.startswith("dev  Dual-mon"), line)
        self.assertIn("…", line)

    def test_list_table_two_columns(self):
        table = format_profile_list_table(
            [
                {
                    "name": "dev",
                    "description": "Dual-mon desk"
                },
                {
                    "name": "code",
                    "description": "Editor + term"
                },
            ],
            color=False,
        )
        lines = table.splitlines()
        self.assertEqual(lines[0].split(), ["Name", "Description"])
        self.assertIn("dev", lines[1])
        self.assertIn("Dual-mon desk", lines[1])
        self.assertIn("code", lines[2])
        self.assertIn("Editor + term", lines[2])
        # Name column padded to widest name
        self.assertTrue(lines[1].startswith("dev "))
        # Exactly two header columns (Name + Description)
        self.assertEqual(len(lines[0].split()), 2)
        # No source/path columns in header
        self.assertNotIn("source", lines[0].lower())
        self.assertNotIn("path", lines[0].lower())

    def test_list_table_empty_and_missing_desc(self):
        empty = format_profile_list_table([], color=False)
        self.assertEqual(empty.splitlines()[0].split(),
                         ["Name", "Description"])
        self.assertEqual(len(empty.splitlines()), 1)
        one = format_profile_list_table(
            [{
                "name": "solo"
            }],
            color=False,
        )
        self.assertIn("solo", one.splitlines()[1])
        self.assertTrue(one.splitlines()[1].startswith("solo"))

    def test_host_profiles_only_filters(self):
        rows = [
            {
                "name": "dev",
                "source": SOURCE_HOST
            },
            {
                "name": "nested",
                "source": SOURCE_HOST_DIR
            },
            {
                "name": "shared",
                "source": SOURCE_COMMON
            },
            {
                "name": "flat",
                "source": SOURCE_XDG
            },
            {
                "name": "oneshot",
                "source": SOURCE_ENV_PATH
            },
        ]
        got = host_profiles_only(rows)
        self.assertEqual([r["name"] for r in got], ["dev", "nested"])
        self.assertEqual(
            {r["source"]
             for r in got},
            {SOURCE_HOST, SOURCE_HOST_DIR},
        )


if __name__ == "__main__":
    unittest.main()
