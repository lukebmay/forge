#!/usr/bin/env python3
"""Unit tests for host-aware layout profile resolve (WR2)."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

_REPO = Path(__file__).resolve().parents[3]
_FORGE_CLI = _REPO / "scripts" / "forge"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

from layout_lib import (  # noqa: E402
    SOURCE_COMMON,
    SOURCE_ENV_PATH,
    SOURCE_HOST,
    SOURCE_HOST_DIR,
    SOURCE_NOT_FOUND,
    SOURCE_XDG,
    host_profiles_only,
    list_profiles_resolved,
    resolve_host,
    resolve_profile,
)


def _write(path: Path, obj: dict | None = None) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = obj if obj is not None else {"version": 1, "steps": []}
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


class TestResolveHost(unittest.TestCase):

    def test_forge_host_env(self):
        self.assertEqual(resolve_host({"FORGE_HOST": "black"}), "black")
        self.assertEqual(resolve_host({"FORGE_HOST": "  green  "}), "green")

    def test_hostname_short(self):
        with patch("layout_lib.socket.gethostname", return_value="black.lan"):
            self.assertEqual(resolve_host({}), "black")

    def test_empty_forge_host_falls_back(self):
        with patch("layout_lib.socket.gethostname", return_value="box"):
            self.assertEqual(resolve_host({"FORGE_HOST": "  "}), "box")


class TestResolveProfile(unittest.TestCase):

    def test_xdg_only_when_no_env(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            xdg = _write(
                root / "layout" / "dev.json",
                {
                    "version": 1,
                    "description": "xdg",
                    "steps": []
                },
            )
            r = resolve_profile("dev", config_root=root, env={})
            self.assertTrue(r["found"])
            self.assertEqual(r["source"], SOURCE_XDG)
            self.assertEqual(r["path"], xdg)
            self.assertIn(str(xdg), r["candidates"])

    def test_host_file_wins_over_common_and_xdg(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            wdir = root / "wdir"
            host_p = _write(
                wdir / "hosts" / "black" / "dev.json",
                {
                    "version": 1,
                    "description": "host",
                    "steps": []
                },
            )
            _write(
                wdir / "common" / "dev.json",
                {
                    "version": 1,
                    "description": "common",
                    "steps": []
                },
            )
            _write(
                root / "xdg" / "layout" / "dev.json",
                {
                    "version": 1,
                    "description": "xdg",
                    "steps": []
                },
            )
            env = {"FORGE_LAYOUT_DIR": str(wdir), "FORGE_HOST": "black"}
            r = resolve_profile("dev", config_root=root / "xdg", env=env)
            self.assertTrue(r["found"])
            self.assertEqual(r["source"], SOURCE_HOST)
            self.assertEqual(r["path"], host_p)
            self.assertEqual(r["host"], "black")

    def test_common_wins_over_xdg_when_no_host(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            wdir = root / "wdir"
            common = _write(
                wdir / "common" / "dev.json",
                {
                    "version": 1,
                    "description": "common",
                    "steps": []
                },
            )
            _write(
                root / "xdg" / "layout" / "dev.json",
                {
                    "version": 1,
                    "description": "xdg",
                    "steps": []
                },
            )
            env = {"FORGE_LAYOUT_DIR": str(wdir), "FORGE_HOST": "black"}
            r = resolve_profile("dev", config_root=root / "xdg", env=env)
            self.assertTrue(r["found"])
            self.assertEqual(r["source"], SOURCE_COMMON)
            self.assertEqual(r["path"], common)

    def test_host_dir_profile_json(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            wdir = root / "wdir"
            host_dir = _write(
                wdir / "hosts" / "black" / "dev" / "profile.json",
                {
                    "version": 1,
                    "description": "host-dir",
                    "steps": []
                },
            )
            env = {"FORGE_LAYOUT_DIR": str(wdir), "FORGE_HOST": "black"}
            r = resolve_profile("dev", config_root=root / "xdg", env=env)
            self.assertTrue(r["found"])
            self.assertEqual(r["source"], SOURCE_HOST_DIR)
            self.assertEqual(r["path"], host_dir)

    def test_host_file_beats_host_dir(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            wdir = root / "wdir"
            host_file = _write(wdir / "hosts" / "black" / "dev.json")
            _write(wdir / "hosts" / "black" / "dev" / "profile.json")
            env = {"FORGE_LAYOUT_DIR": str(wdir), "FORGE_HOST": "black"}
            r = resolve_profile("dev", config_root=root, env=env)
            self.assertEqual(r["source"], SOURCE_HOST)
            self.assertEqual(r["path"], host_file)

    def test_forge_host_overrides_hostname(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            wdir = root / "wdir"
            green = _write(wdir / "hosts" / "green" / "dev.json")
            _write(wdir / "hosts" / "black" / "dev.json")
            with patch("layout_lib.socket.gethostname", return_value="black"):
                r = resolve_profile(
                    "dev",
                    config_root=root,
                    env={
                        "FORGE_LAYOUT_DIR": str(wdir),
                        "FORGE_HOST": "green"
                    },
                )
            self.assertEqual(r["host"], "green")
            self.assertEqual(r["path"], green)
            self.assertEqual(r["source"], SOURCE_HOST)

    def test_forge_layout_path_stem_match(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            special = _write(
                root / "elsewhere" / "dev.json",
                {
                    "version": 1,
                    "description": "path",
                    "steps": []
                },
            )
            _write(root / "wdir" / "common" / "dev.json")
            env = {
                "FORGE_LAYOUT_PATH": str(special),
                "FORGE_LAYOUT_DIR": str(root / "wdir"),
                "FORGE_HOST": "black",
            }
            r = resolve_profile("dev", config_root=root / "xdg", env=env)
            self.assertEqual(r["source"], SOURCE_ENV_PATH)
            self.assertEqual(r["path"], special)

    def test_forge_layout_path_stem_mismatch_continues(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            other = _write(root / "elsewhere" / "other.json")
            xdg = _write(root / "layout" / "dev.json")
            env = {"FORGE_LAYOUT_PATH": str(other)}
            r = resolve_profile("dev", config_root=root, env=env)
            self.assertEqual(r["source"], SOURCE_XDG)
            self.assertEqual(r["path"], xdg)

    def test_forge_layout_path_missing_file_continues(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            xdg = _write(root / "layout" / "dev.json")
            env = {"FORGE_LAYOUT_PATH": str(root / "nope" / "dev.json")}
            r = resolve_profile("dev", config_root=root, env=env)
            self.assertEqual(r["source"], SOURCE_XDG)
            self.assertEqual(r["path"], xdg)

    def test_layout_dir_env_param(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            wdir = root / "wdir"
            host_p = _write(wdir / "hosts" / "black" / "dev.json")
            r = resolve_profile(
                "dev",
                config_root=root,
                layout_dir_env=wdir,
                env={"FORGE_HOST": "black"},
            )
            self.assertEqual(r["path"], host_p)
            self.assertEqual(r["source"], SOURCE_HOST)

    def test_not_found(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            r = resolve_profile("missing",
                                config_root=root,
                                env={"FORGE_HOST": "h"})
            self.assertFalse(r["found"])
            self.assertIsNone(r["path"])
            self.assertEqual(r["source"], SOURCE_NOT_FOUND)
            self.assertEqual(r["name"], "missing")

    def test_invalid_name(self):
        with self.assertRaises(ValueError):
            resolve_profile("../etc", env={})
        with self.assertRaises(ValueError):
            resolve_profile("has space", env={})
        with self.assertRaises(ValueError):
            resolve_profile("", env={})

    def test_no_layout_dir_skips_host_common(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            # Would win if DIR set — must be ignored
            _write(root / "fake" / "hosts" / "black" / "dev.json")
            xdg = _write(root / "layout" / "dev.json")
            r = resolve_profile("dev",
                                config_root=root,
                                env={"FORGE_HOST": "black"})
            self.assertEqual(r["source"], SOURCE_XDG)
            self.assertEqual(r["path"], xdg)


class TestListProfilesResolved(unittest.TestCase):

    def test_union_with_source_tags(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            wdir = root / "wdir"
            xdg_root = root / "xdg"
            _write(
                wdir / "hosts" / "black" / "dev.json",
                {
                    "version": 1,
                    "description": "host-dev",
                    "steps": []
                },
            )
            _write(
                wdir / "common" / "shared.json",
                {
                    "version": 1,
                    "description": "common-shared",
                    "steps": []
                },
            )
            # same name in common + host → host wins
            _write(wdir / "common" / "dev.json")
            _write(
                xdg_root / "layout" / "local.json",
                {
                    "version": 1,
                    "description": "xdg-local",
                    "steps": []
                },
            )
            # xdg only for name only on xdg
            env = {"FORGE_LAYOUT_DIR": str(wdir), "FORGE_HOST": "black"}
            listed = list_profiles_resolved(config_root=xdg_root, env=env)
            by_name = {e["name"]: e for e in listed}
            self.assertEqual(set(by_name), {"dev", "shared", "local"})
            self.assertEqual(by_name["dev"]["source"], SOURCE_HOST)
            self.assertEqual(by_name["dev"]["description"], "host-dev")
            self.assertEqual(by_name["shared"]["source"], SOURCE_COMMON)
            self.assertEqual(by_name["local"]["source"], SOURCE_XDG)
            self.assertEqual(by_name["local"]["host"], "black")

    def test_host_dir_form_listed(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            wdir = root / "wdir"
            _write(wdir / "hosts" / "black" / "rec" / "profile.json")
            listed = list_profiles_resolved(
                config_root=root / "empty",
                env={
                    "FORGE_LAYOUT_DIR": str(wdir),
                    "FORGE_HOST": "black"
                },
            )
            self.assertEqual(len(listed), 1)
            self.assertEqual(listed[0]["name"], "rec")
            self.assertEqual(listed[0]["source"], SOURCE_HOST_DIR)

    def test_xdg_only_when_no_env(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            _write(root / "layout" / "a.json")
            listed = list_profiles_resolved(config_root=root, env={})
            self.assertEqual(len(listed), 1)
            self.assertEqual(listed[0]["source"], SOURCE_XDG)
            self.assertEqual(listed[0]["name"], "a")

    def test_xdg_hosts_listed_without_forge_layout_dir(self):
        """Save writes hosts/<host>/ under XDG when env unset — list must see it."""
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            host_p = _write(
                root / "layout" / "hosts" / "black" / "dev.json",
                {
                    "version": 1,
                    "description": "from-save",
                    "steps": []
                },
            )
            listed = list_profiles_resolved(config_root=root,
                                            env={"FORGE_HOST": "black"})
            self.assertEqual(len(listed), 1)
            self.assertEqual(listed[0]["name"], "dev")
            self.assertEqual(listed[0]["source"], SOURCE_HOST)
            self.assertEqual(listed[0]["path"], str(host_p))
            self.assertEqual(listed[0]["description"], "from-save")
            r = resolve_profile("dev",
                                config_root=root,
                                env={"FORGE_HOST": "black"})
            self.assertTrue(r["found"])
            self.assertEqual(r["source"], SOURCE_HOST)
            self.assertEqual(r["path"], host_p)

    def test_list_host_only_without_forge_layout_dir(self):
        """CLI list path: tree root = XDG layout; host filter drops common/flat."""
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            layout = root / "layout"
            _write(
                layout / "hosts" / "black" / "dev.json",
                {
                    "version": 1,
                    "description": "host-desk",
                    "steps": []
                },
            )
            _write(
                layout / "common" / "shared.json",
                {
                    "version": 1,
                    "description": "common-desk",
                    "steps": []
                },
            )
            _write(
                layout / "flat.json",
                {
                    "version": 1,
                    "description": "flat-desk",
                    "steps": []
                },
            )
            env = {"FORGE_HOST": "black"}
            all_listed = list_profiles_resolved(config_root=root, env=env)
            self.assertEqual({e["name"]
                              for e in all_listed}, {"dev", "shared", "flat"})
            host_only = host_profiles_only(all_listed)
            self.assertEqual([e["name"] for e in host_only], ["dev"])
            self.assertEqual(host_only[0]["description"], "host-desk")
            # resolve still finds common when asked by name
            r = resolve_profile("shared", config_root=root, env=env)
            self.assertTrue(r["found"])
            self.assertEqual(r["source"], SOURCE_COMMON)

    def test_forge_layout_dir_env_wins_for_list(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            wdir = root / "shellrc-layout"
            _write(
                wdir / "hosts" / "black" / "dev.json",
                {
                    "version": 1,
                    "description": "env-host",
                    "steps": []
                },
            )
            _write(
                root / "layout" / "hosts" / "black" / "dev.json",
                {
                    "version": 1,
                    "description": "xdg-host",
                    "steps": []
                },
            )
            env = {"FORGE_LAYOUT_DIR": str(wdir), "FORGE_HOST": "black"}
            listed = list_profiles_resolved(config_root=root, env=env)
            self.assertEqual(len(listed), 1)
            self.assertEqual(listed[0]["description"], "env-host")
            self.assertEqual(listed[0]["source"], SOURCE_HOST)

    def test_invalid_names_skipped_in_list(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            _write(root / "layout" / "good.json")
            bad = root / "layout" / "has space.json"
            bad.write_text("{}", encoding="utf-8")
            listed = list_profiles_resolved(config_root=root, env={})
            self.assertEqual([e["name"] for e in listed], ["good"])


if __name__ == "__main__":
    unittest.main()
