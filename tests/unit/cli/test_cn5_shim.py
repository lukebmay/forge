#!/usr/bin/env python3
"""Thin shim tests: forge focus/get/settings → Node exec (CN5)."""

from __future__ import annotations

import sys
import unittest
from importlib.machinery import SourceFileLoader
from pathlib import Path
from unittest import mock

_REPO = Path(__file__).resolve().parents[3]
_FORGE_CLI = _REPO / "scripts" / "forge"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

forge = SourceFileLoader(
    "forge_cli_main_cn5",
    str(_FORGE_CLI / "forge"),
).load_module()


class Cn5Shim(unittest.TestCase):
    def test_cmd_focus_execs_node(self):
        with mock.patch.object(
            forge, "exec_cli", side_effect=SystemExit(0)
        ) as ex:
            with mock.patch.object(
                forge.sys, "argv", ["forge", "focus", "wm:foo", "--first"]
            ):
                with self.assertRaises(SystemExit) as ctx:
                    forge.cmd_focus(None, mock.Mock())
        self.assertEqual(ctx.exception.code, 0)
        ex.assert_called_once_with("focus.mjs", ["wm:foo", "--first"])

    def test_cmd_swap_execs_node(self):
        with mock.patch.object(
            forge, "exec_cli", side_effect=SystemExit(0)
        ) as ex:
            with mock.patch.object(
                forge.sys, "argv", ["forge", "swap", "a", "b"]
            ):
                with self.assertRaises(SystemExit) as ctx:
                    forge.cmd_swap(None, mock.Mock())
        self.assertEqual(ctx.exception.code, 0)
        ex.assert_called_once_with("swap.mjs", ["a", "b"])

    def test_cmd_move_execs_node(self):
        with mock.patch.object(
            forge, "exec_cli", side_effect=SystemExit(0)
        ) as ex:
            with mock.patch.object(
                forge.sys, "argv", ["forge", "move", "t", "d", "--first"]
            ):
                with self.assertRaises(SystemExit) as ctx:
                    forge.cmd_move(None, mock.Mock())
        self.assertEqual(ctx.exception.code, 0)
        ex.assert_called_once_with("move.mjs", ["t", "d", "--first"])

    def test_cmd_get_execs_node(self):
        with mock.patch.object(
            forge, "exec_cli", side_effect=SystemExit(0)
        ) as ex:
            with mock.patch.object(
                forge.sys,
                "argv",
                ["forge", "get", "tiling-mode-enabled"],
            ):
                with self.assertRaises(SystemExit) as ctx:
                    forge.cmd_get(None, mock.Mock())
        self.assertEqual(ctx.exception.code, 0)
        ex.assert_called_once_with("get.mjs", ["tiling-mode-enabled"])

    def test_cmd_set_execs_node(self):
        with mock.patch.object(
            forge, "exec_cli", side_effect=SystemExit(0)
        ) as ex:
            with mock.patch.object(
                forge.sys,
                "argv",
                ["forge", "set", "tiling-mode-enabled", "true"],
            ):
                with self.assertRaises(SystemExit) as ctx:
                    forge.cmd_set(None, mock.Mock())
        self.assertEqual(ctx.exception.code, 0)
        ex.assert_called_once_with(
            "set.mjs", ["tiling-mode-enabled", "true"]
        )

    def test_cmd_settings_execs_node(self):
        with mock.patch.object(
            forge, "exec_cli", side_effect=SystemExit(0)
        ) as ex:
            with mock.patch.object(
                forge.sys,
                "argv",
                ["forge", "settings", "save", "myname"],
            ):
                with self.assertRaises(SystemExit) as ctx:
                    forge.cmd_settings(None, mock.Mock())
        self.assertEqual(ctx.exception.code, 0)
        ex.assert_called_once_with("settings.mjs", ["save", "myname"])

    def test_cn5_cmds_in_no_dbus(self):
        for name in (
            "focus",
            "swap",
            "move",
            "get",
            "set",
            "settings",
        ):
            self.assertIn(name, forge._NO_DBUS_COMMANDS)


if __name__ == "__main__":
    unittest.main()
