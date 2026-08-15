#!/usr/bin/env python3
"""Thin shim tests: forge launch/run/run-steps → Node exec (CN6)."""

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
    "forge_cli_main_cn6",
    str(_FORGE_CLI / "forge"),
).load_module()


class Cn6Shim(unittest.TestCase):
    def test_cmd_launch_execs_node(self):
        with mock.patch.object(
            forge, "exec_cli", side_effect=SystemExit(0)
        ) as ex:
            with mock.patch.object(
                forge.sys,
                "argv",
                ["forge", "launch", "nautilus", "--no-wait"],
            ):
                with self.assertRaises(SystemExit) as ctx:
                    forge.cmd_launch(None, mock.Mock())
        self.assertEqual(ctx.exception.code, 0)
        ex.assert_called_once_with(
            "launch.mjs", ["nautilus", "--no-wait"]
        )

    def test_cmd_run_execs_node(self):
        with mock.patch.object(
            forge, "exec_cli", side_effect=SystemExit(0)
        ) as ex:
            with mock.patch.object(
                forge.sys, "argv", ["forge", "run", "/tmp/steps.json"]
            ):
                with self.assertRaises(SystemExit) as ctx:
                    forge.cmd_run(None, mock.Mock())
        self.assertEqual(ctx.exception.code, 0)
        ex.assert_called_once_with("run.mjs", ["/tmp/steps.json"])

    def test_cmd_run_steps_execs_node(self):
        with mock.patch.object(
            forge, "exec_cli", side_effect=SystemExit(0)
        ) as ex:
            with mock.patch.object(
                forge.sys,
                "argv",
                ["forge", "run-steps", '[{"op":"ping"}]'],
            ):
                with self.assertRaises(SystemExit) as ctx:
                    forge.cmd_run_steps(None, mock.Mock())
        self.assertEqual(ctx.exception.code, 0)
        ex.assert_called_once_with(
            "run-steps.mjs", ['[{"op":"ping"}]']
        )

    def test_cn6_cmds_in_no_dbus(self):
        for name in ("launch", "run", "run-steps"):
            self.assertIn(name, forge._NO_DBUS_COMMANDS)

    def test_layout_partition_still_works(self):
        chunks = forge._partition_mixed_steps_layout(
            [
                {"op": "set", "key": "a", "value": 1},
                {"op": "launch", "app": "x"},
                {"op": "focus", "selector": "class:X"},
            ]
        )
        self.assertEqual(
            [(c["kind"], len(c["steps"])) for c in chunks],
            [("extension", 1), ("cli", 1), ("extension", 1)],
        )


if __name__ == "__main__":
    unittest.main()
