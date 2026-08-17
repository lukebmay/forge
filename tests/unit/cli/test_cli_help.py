#!/usr/bin/env python3
"""Unit tests for forge / forge layout human help."""

from __future__ import annotations

import io
import sys
import unittest
from pathlib import Path

_REPO = Path(__file__).resolve().parents[3]
_FORGE_CLI = _REPO / "scripts" / "forge"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

import cli_ansi  # noqa: E402
import cli_help  # noqa: E402


class ForgeHelpLaunchApp(unittest.TestCase):
    def setUp(self):
        cli_ansi.set_color_mode("never")

    def tearDown(self):
        cli_ansi.set_color_mode("auto")

    def test_help_documents_launch_app_set_with_guake_toggle(self):
        buf = io.StringIO()
        cli_help.print_forge_help(stream=buf)
        text = buf.getvalue()
        self.assertIn("Launch app", text)
        self.assertIn("forge set launch-app-command 'guake -t'", text)
        self.assertIn("forge get launch-app-command", text)
        self.assertIn("Empty opens GNOME Run a Command", text)

    def test_help_has_no_test_or_nested_command_row(self):
        buf = io.StringIO()
        cli_help.print_forge_help(stream=buf)
        text = buf.getvalue()
        self.assertNotIn("live matrix", text)
        self.assertNotIn("nested Wayland", text)
        # Commands table must not list test / nested as product verbs.
        rows = []
        in_cmds = False
        for line in text.splitlines():
            if line.strip() == "Commands":
                in_cmds = True
                continue
            if in_cmds and line.strip() == "Quick start":
                break
            if in_cmds:
                rows.append(line)
        joined = "\n".join(rows)
        self.assertNotRegex(joined, r"\btest\b")
        self.assertNotRegex(joined, r"\bnested\b")


class ForgeTestHelp(unittest.TestCase):
    def setUp(self):
        cli_ansi.set_color_mode("never")

    def tearDown(self):
        cli_ansi.set_color_mode("auto")

    def test_forge_test_help_lists_nested_and_live_only(self):
        import test_cli

        buf = io.StringIO()
        test_cli.print_forge_test_help(stream=buf)
        text = buf.getvalue()
        self.assertIn("forge-test", text)
        self.assertIn("nested", text)
        self.assertIn("live", text)
        self.assertIn("./scripts/forge/forge-test", text)
        self.assertIn("--with-test-cli", text)


if __name__ == "__main__":
    unittest.main()
