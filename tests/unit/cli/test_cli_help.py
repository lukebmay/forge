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


if __name__ == "__main__":
    unittest.main()
