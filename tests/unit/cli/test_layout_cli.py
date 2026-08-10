#!/usr/bin/env python3
"""Unit tests for scripts/forge/layout_cli.py (WS2 grammar + preflight)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

_REPO = Path(__file__).resolve().parents[3]
_FORGE_CLI = _REPO / "scripts" / "forge"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

from layout_cli import (  # noqa: E402
    MODE_SEQUENTIAL,
    MODE_STATIC,
    LayoutParseError,
    bind_layout_targets,
    classify_layout_args,
    format_candidate_line,
    n_workspaces_from_forest,
    parse_layout_arg,
    preflight_layout_run,
    validate_layout_name,
    window_candidate_counts,
)


class TestValidateLayoutName(unittest.TestCase):

    def test_ok(self):
        self.assertEqual(validate_layout_name("dev"), "dev")
        self.assertEqual(validate_layout_name("  vinyl-graphics  "),
                         "vinyl-graphics")

    def test_colon_at_reserved(self):
        with self.assertRaisesRegex(LayoutParseError, r"':' or '@'"):
            validate_layout_name("foo:bar")
        with self.assertRaisesRegex(LayoutParseError, r"':' or '@'"):
            validate_layout_name("foo@1")

    def test_invalid_chars(self):
        with self.assertRaisesRegex(LayoutParseError, "invalid profile name"):
            validate_layout_name("has space")


class TestParseLayoutArg(unittest.TestCase):

    def test_bare(self):
        a = parse_layout_arg("dev")
        self.assertEqual(a.name, "dev")
        self.assertIsNone(a.workspace_1based)
        self.assertEqual(a.form, "bare")
        self.assertEqual(a.raw, "dev")

    def test_colon(self):
        a = parse_layout_arg("1:foo")
        self.assertEqual(a.name, "foo")
        self.assertEqual(a.workspace_1based, 1)
        self.assertEqual(a.form, "colon")

    def test_colon_higher(self):
        a = parse_layout_arg("4:baz")
        self.assertEqual(a.name, "baz")
        self.assertEqual(a.workspace_1based, 4)
        self.assertEqual(a.form, "colon")

    def test_at(self):
        a = parse_layout_arg("bar@2")
        self.assertEqual(a.name, "bar")
        self.assertEqual(a.workspace_1based, 2)
        self.assertEqual(a.form, "at")

    def test_invalid_w_zero(self):
        with self.assertRaisesRegex(LayoutParseError, "workspace 0"):
            parse_layout_arg("0:foo")
        with self.assertRaisesRegex(LayoutParseError, "workspace 0"):
            parse_layout_arg("foo@0")

    def test_invalid_near_colon(self):
        with self.assertRaisesRegex(LayoutParseError,
                                    "invalid workspace form"):
            parse_layout_arg("x:foo")

    def test_invalid_near_at(self):
        with self.assertRaisesRegex(LayoutParseError,
                                    "invalid workspace form"):
            parse_layout_arg("foo@x")


class TestClassifyLayoutArgs(unittest.TestCase):

    def test_sequential_single(self):
        mode, args = classify_layout_args(["dev"])
        self.assertEqual(mode, MODE_SEQUENTIAL)
        self.assertEqual(len(args), 1)
        self.assertEqual(args[0].name, "dev")

    def test_sequential_multi(self):
        mode, args = classify_layout_args(["vinyl-graphics", "video-edit"])
        self.assertEqual(mode, MODE_SEQUENTIAL)
        self.assertEqual([a.name for a in args],
                         ["vinyl-graphics", "video-edit"])

    def test_static_colon(self):
        mode, args = classify_layout_args(["1:foo", "2:bar", "4:baz"])
        self.assertEqual(mode, MODE_STATIC)
        self.assertEqual(
            [(a.workspace_1based, a.name) for a in args],
            [(1, "foo"), (2, "bar"), (4, "baz")],
        )

    def test_static_at(self):
        mode, args = classify_layout_args(["foo@1", "bar@2"])
        self.assertEqual(mode, MODE_STATIC)
        self.assertEqual(
            [(a.name, a.workspace_1based) for a in args],
            [("foo", 1), ("bar", 2)],
        )

    def test_static_mixed_forms_ok(self):
        """W:name and name@W may mix; both are numbered (static)."""
        mode, args = classify_layout_args(["1:foo", "bar@2"])
        self.assertEqual(mode, MODE_STATIC)
        self.assertEqual(len(args), 2)

    def test_mixed_bare_and_numbered_error(self):
        with self.assertRaisesRegex(LayoutParseError, "cannot mix"):
            classify_layout_args(["dev", "3:vinyl"])
        with self.assertRaisesRegex(LayoutParseError, "cannot mix"):
            classify_layout_args(["1:foo", "video-edit"])

    def test_empty(self):
        with self.assertRaisesRegex(LayoutParseError, "at least one"):
            classify_layout_args([])


class TestBindLayoutTargets(unittest.TestCase):

    def test_sequential_from_current(self):
        mode, args = classify_layout_args(["a", "b", "c"])
        targets = bind_layout_targets(mode,
                                      args,
                                      current_0based=1,
                                      n_workspaces=4)
        self.assertEqual(
            [(t.name, t.workspace_0based, t.workspace_1based)
             for t in targets],
            [("a", 1, 2), ("b", 2, 3), ("c", 3, 4)],
        )

    def test_sequential_too_few_workspaces(self):
        mode, args = classify_layout_args(["a", "b", "c"])
        with self.assertRaisesRegex(LayoutParseError,
                                    r"need 3 workspaces from current \(2\)"):
            bind_layout_targets(mode, args, current_0based=1, n_workspaces=2)

    def test_static_in_range(self):
        mode, args = classify_layout_args(["1:foo", "2:bar", "4:baz"])
        targets = bind_layout_targets(mode,
                                      args,
                                      current_0based=0,
                                      n_workspaces=4)
        self.assertEqual(
            [(t.name, t.workspace_0based) for t in targets],
            [("foo", 0), ("bar", 1), ("baz", 3)],
        )

    def test_static_out_of_range(self):
        mode, args = classify_layout_args(["5:foo"])
        with self.assertRaisesRegex(
                LayoutParseError, r"workspace 5 out of range \(session has 4"):
            bind_layout_targets(mode, args, current_0based=1, n_workspaces=4)

    def test_static_zero_parsed_earlier(self):
        with self.assertRaises(LayoutParseError):
            classify_layout_args(["0:foo"])


class TestNWorkspacesFromForest(unittest.TestCase):

    def test_meta(self):
        self.assertEqual(
            n_workspaces_from_forest({
                "nWorkspaces": 4,
                "monitors": []
            }), 4)

    def test_from_mon_ids(self):
        forest = {
            "monitors": [
                {
                    "id": "mo0ws0",
                    "nodeType": "MONITOR"
                },
                {
                    "id": "mo1ws0",
                    "nodeType": "MONITOR"
                },
                {
                    "id": "mo0ws2",
                    "nodeType": "MONITOR"
                },
            ]
        }
        self.assertEqual(n_workspaces_from_forest(forest), 3)

    def test_missing(self):
        self.assertIsNone(n_workspaces_from_forest({}))
        self.assertIsNone(n_workspaces_from_forest({"monitors": []}))


class TestPreflightLayoutRun(unittest.TestCase):

    def test_full_ok_with_resolve(self):

        def resolve(name: str):
            return {"found": True, "name": name, "path": f"/{name}.json"}

        mode, targets, resolved = preflight_layout_run(
            ["dev", "other"],
            current_0based=0,
            n_workspaces=3,
            resolve_name=resolve,
        )
        self.assertEqual(mode, MODE_SEQUENTIAL)
        self.assertEqual([t.workspace_0based for t in targets], [0, 1])
        self.assertEqual(len(resolved), 2)

    def test_profile_missing(self):

        def resolve(name: str):
            return {
                "found":
                False,
                "candidates": [
                    f"/layout/hosts/black/{name}.json",
                    f"/layout/common/{name}.json",
                ],
            }

        with self.assertRaisesRegex(LayoutParseError,
                                    r"profile 'missing' not found"):
            preflight_layout_run(
                ["missing"],
                current_0based=0,
                n_workspaces=2,
                resolve_name=resolve,
            )

    def test_mixed_no_partial(self):
        with self.assertRaisesRegex(LayoutParseError, "cannot mix"):
            preflight_layout_run(
                ["dev", "3:vinyl"],
                current_0based=0,
                n_workspaces=4,
                resolve_name=lambda n: {
                    "found": True,
                    "name": n
                },
            )


class TestCandidateCounts(unittest.TestCase):

    def _forest(self):
        # Two mon roots on different workspaces with one window each
        return {
            "nWorkspaces":
            2,
            "activeWorkspace":
            0,
            "monitors": [
                {
                    "id":
                    "mo0ws0",
                    "nodeType":
                    "MONITOR",
                    "children": [{
                        "nodeType": "WINDOW",
                        "windowId": 1,
                        "wmClass": "A",
                        "path": "mo0ws0/0",
                    }],
                },
                {
                    "id":
                    "mo0ws1",
                    "nodeType":
                    "MONITOR",
                    "children": [{
                        "nodeType": "WINDOW",
                        "windowId": 2,
                        "wmClass": "B",
                        "path": "mo0ws1/0",
                    }],
                },
            ],
        }

    def test_counts(self):
        forest = self._forest()
        on, ignored = window_candidate_counts(forest, 0)
        self.assertEqual(on, 1)
        self.assertEqual(ignored, 1)
        on1, ignored1 = window_candidate_counts(forest, 1)
        self.assertEqual(on1, 1)
        self.assertEqual(ignored1, 1)

    def test_format_line(self):
        s = format_candidate_line(2, 5, 8, is_current=True)
        self.assertEqual(
            s, "candidates: 5 on ws2 (ignored 8 on other workspaces)")
        s2 = format_candidate_line(1, 3, 0)
        self.assertEqual(s2, "candidates: 3 on ws1")


if __name__ == "__main__":
    unittest.main()
