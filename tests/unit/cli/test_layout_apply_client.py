#!/usr/bin/env python3
"""Unit tests for scripts/forge/layout_apply_client.py (AL8 thin client)."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

_REPO = Path(__file__).resolve().parents[3]
_FORGE_CLI = _REPO / "scripts" / "forge"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

from layout_apply_client import (  # noqa: E402
    APPLY_LAYOUT_MIN_API,
    build_apply_layout_request,
    done_exit_code,
    format_progress_line,
    host_job_id_from_env,
    parse_json_obj,
    ping_supports_apply_layout,
    run_apply_layout_client,
    terminal_from_snapshot,
    write_job_apply_id,
)
from job_runner import (  # noqa: E402
    ENV_JOB_DIR,
    ENV_JOB_ID,
    ENV_JOB_WORKER,
    prepare_job_dir,
    read_status,
)


class TestPingDetect(unittest.TestCase):
    def test_api_10(self):
        self.assertTrue(ping_supports_apply_layout({"apiVersion": 10}))
        self.assertTrue(ping_supports_apply_layout({"apiVersion": "10"}))

    def test_too_old(self):
        self.assertFalse(ping_supports_apply_layout({"apiVersion": 9}))
        self.assertFalse(ping_supports_apply_layout({}))
        self.assertFalse(ping_supports_apply_layout(None))

    def test_min_constant(self):
        self.assertEqual(APPLY_LAYOUT_MIN_API, 10)


class TestBuildRequest(unittest.TestCase):
    def test_defaults(self):
        req = build_apply_layout_request(profile={"roles": []}, name="ghosttys")
        self.assertEqual(req["profile"], {"roles": []})
        self.assertEqual(req["name"], "ghosttys")
        self.assertEqual(req["workspace"], 0)
        self.assertNotIn("hostJobId", req)
        self.assertEqual(
            req["flags"],
            {
                "clean": True,
                "keepOthers": False,
                "safe": False,
                "forceClose": False,
                "waitTreeStable": False,
            },
        )

    def test_flags_and_job(self):
        req = build_apply_layout_request(
            profile={"tiles": []},
            name="t",
            host_job_id="job-1",
            workspace=2,
            flags={
                "clean": False,
                "keepOthers": True,
                "safe": True,
                "forceClose": True,
                "waitTreeStable": True,
            },
        )
        self.assertEqual(req["hostJobId"], "job-1")
        self.assertEqual(req["workspace"], 2)
        self.assertTrue(req["flags"]["keepOthers"])
        self.assertFalse(req["flags"]["clean"])


class TestProgressAndDone(unittest.TestCase):
    def test_format_message(self):
        line = format_progress_line(
            {
                "applyId": "a",
                "phase": "open",
                "event": "info",
                "message": "open pinned 1/1",
            }
        )
        self.assertEqual(line, "  open pinned 1/1")

    def test_format_phase_only(self):
        self.assertEqual(
            format_progress_line({"phase": "skeleton", "event": "enter"}),
            "  skeleton  enter skeleton",
        )

    def test_terminal(self):
        self.assertIsNone(terminal_from_snapshot({"live": True, "phase": "open"}))
        term = {"applyId": "a", "ok": True, "phase": "verify"}
        self.assertEqual(
            terminal_from_snapshot({"live": False, "terminal": term}),
            term,
        )

    def test_done_exit(self):
        self.assertEqual(done_exit_code({"ok": True, "phase": "verify"}), 0)
        self.assertEqual(done_exit_code({"ok": False, "code": "cancel"}), 130)
        self.assertEqual(done_exit_code({"ok": False, "phase": "open"}), 1)

    def test_parse_json_obj(self):
        self.assertEqual(parse_json_obj('{"ok": true}'), {"ok": True})
        self.assertEqual(parse_json_obj({"ok": True}), {"ok": True})


class TestRunClient(unittest.TestCase):
    def _run(self, *, apply_ret, snaps, cancel_ret=None, sleep_raises=None, verbose=True):
        lines: list[str] = []
        apply_ids: list[str] = []
        gets: list[str] = []
        cancels: list[str] = []
        snap_i = {"n": 0}

        def apply_fn(_req: str) -> dict:
            return dict(apply_ret)

        def get_fn(apply_id: str) -> dict:
            gets.append(apply_id)
            i = snap_i["n"]
            snap_i["n"] = i + 1
            return dict(snaps[min(i, len(snaps) - 1)])

        def cancel_fn(apply_id: str) -> dict:
            cancels.append(apply_id)
            return dict(cancel_ret or {"ok": True})

        def sleep_fn(_s: float) -> None:
            if sleep_raises is not None:
                raise sleep_raises

        clock = {"t": 0.0}

        def now_fn() -> float:
            clock["t"] += 0.01
            return clock["t"]

        rc, done = run_apply_layout_client(
            request={"profile": {"roles": []}, "name": "t"},
            apply_fn=apply_fn,
            get_fn=get_fn,
            cancel_fn=cancel_fn,
            print_fn=lambda *a: lines.append(" ".join(str(x) for x in a)),
            write_apply_id_fn=apply_ids.append,
            poll_interval_s=0.0,
            timeout_s=5.0,
            sleep_fn=sleep_fn,
            now_fn=now_fn,
            verbose=verbose,
        )
        return rc, done, lines, apply_ids, gets, cancels

    def test_ok_streams_phases_and_writes_id(self):
        rc, done, lines, ids, gets, cancels = self._run(
            apply_ret={
                "ok": True,
                "applyId": "al-1",
                "started": True,
                "phase": "skeleton",
            },
            snaps=[
                {"ok": True, "live": True, "applyId": "al-1", "phase": "open"},
                {
                    "ok": True,
                    "live": False,
                    "applyId": "al-1",
                    "phase": "verify",
                    "terminal": {"applyId": "al-1", "ok": True, "phase": "verify"},
                },
            ],
            verbose=True,
        )
        self.assertEqual(rc, 0)
        self.assertTrue(done and done.get("ok") is True)
        self.assertEqual(ids, ["al-1"])
        self.assertEqual(cancels, [])
        self.assertTrue(gets)
        joined = "\n".join(lines)
        self.assertIn("applyId  al-1", joined)
        self.assertIn("skeleton", joined)
        self.assertIn("  ok", joined)

    def test_ok_quiet_hides_phase_trace(self):
        rc, done, lines, ids, _gets, _cancels = self._run(
            apply_ret={
                "ok": True,
                "applyId": "al-1",
                "started": True,
                "phase": "skeleton",
            },
            snaps=[
                {
                    "ok": True,
                    "live": False,
                    "applyId": "al-1",
                    "phase": "verify",
                    "terminal": {"applyId": "al-1", "ok": True, "phase": "verify"},
                },
            ],
            verbose=False,
        )
        self.assertEqual(rc, 0)
        self.assertTrue(done and done.get("ok") is True)
        self.assertEqual(ids, ["al-1"])
        joined = "\n".join(lines)
        self.assertNotIn("applyId", joined)
        self.assertNotIn("skeleton", joined)
        self.assertNotIn("  ok", joined)
        self.assertEqual(lines, [])

    def test_busy(self):
        rc, _done, lines, ids, _g, _c = self._run(
            apply_ret={
                "ok": False,
                "code": "busy",
                "error": "apply already running",
                "applyId": "al-live",
            },
            snaps=[],
        )
        self.assertEqual(rc, 1)
        self.assertEqual(ids, [])
        self.assertIn("already running", "\n".join(lines))
        self.assertIn("al-live", "\n".join(lines))

    def test_immediate_reject(self):
        rc, _done, lines, ids, _g, _c = self._run(
            apply_ret={"ok": False, "error": "window manager not ready"},
            snaps=[],
        )
        self.assertEqual(rc, 1)
        self.assertEqual(ids, [])
        self.assertIn("window manager not ready", "\n".join(lines))

    def test_done_fail_names_phase(self):
        rc, done, lines, _ids, _g, _c = self._run(
            apply_ret={
                "ok": True,
                "applyId": "al-2",
                "started": True,
                "phase": "open",
            },
            snaps=[
                {
                    "ok": True,
                    "live": False,
                    "terminal": {
                        "applyId": "al-2",
                        "ok": False,
                        "phase": "open",
                        "error": "roles still missing",
                    },
                }
            ],
        )
        self.assertEqual(rc, 1)
        self.assertEqual(done.get("phase"), "open")
        self.assertIn("phase=open", "\n".join(lines))
        self.assertIn("roles still missing", "\n".join(lines))

    def test_interrupt_cancels(self):
        rc, done, lines, _ids, _g, cancels = self._run(
            apply_ret={
                "ok": True,
                "applyId": "al-3",
                "started": True,
                "phase": "skeleton",
            },
            snaps=[{"ok": True, "live": True, "applyId": "al-3", "phase": "open"}],
            sleep_raises=KeyboardInterrupt(),
        )
        self.assertEqual(rc, 130)
        self.assertEqual(cancels, ["al-3"])
        self.assertIn("cancel requested", "\n".join(lines))
        self.assertEqual(done.get("code"), "cancel")

    def test_timeout_cancels(self):
        lines: list[str] = []
        cancels: list[str] = []
        clock = {"t": 0.0}

        def now_fn() -> float:
            clock["t"] += 10.0
            return clock["t"]

        rc, done = run_apply_layout_client(
            request={"profile": {}},
            apply_fn=lambda _r: {
                "ok": True,
                "applyId": "al-t",
                "started": True,
                "phase": "soft",
            },
            get_fn=lambda _i: {"ok": True, "live": True, "phase": "soft"},
            cancel_fn=lambda i: cancels.append(i) or {"ok": True},
            print_fn=lambda *a: lines.append(" ".join(str(x) for x in a)),
            poll_interval_s=0.0,
            timeout_s=5.0,
            sleep_fn=lambda _s: None,
            now_fn=now_fn,
        )
        self.assertEqual(rc, 124)
        self.assertEqual(cancels, ["al-t"])
        self.assertIn("timeout", "\n".join(lines))
        self.assertEqual(done.get("code"), "timeout")


class TestWriteJobApplyId(unittest.TestCase):
    def test_writes_status(self):
        with tempfile.TemporaryDirectory() as tmp:
            _jid, jdir, _st = prepare_job_dir(
                Path(tmp), job_id="j1", command="layout"
            )
            env = {
                ENV_JOB_WORKER: "1",
                ENV_JOB_DIR: str(jdir),
                ENV_JOB_ID: "j1",
            }
            write_job_apply_id("al-xyz", env=env)
            st = read_status(jdir)
            self.assertEqual(st.get("applyId"), "al-xyz")

    def test_noop_when_not_worker(self):
        write_job_apply_id("al-xyz", env={})

    def test_host_job_id(self):
        self.assertEqual(host_job_id_from_env({ENV_JOB_ID: "abc"}), "abc")
        self.assertIsNone(host_job_id_from_env({}))


class TestForgeApplyLayoutShim(unittest.TestCase):
    """cmd path: default uses ApplyLayout; LEGACY stays off this module."""

    def test_method_in_args(self):
        from importlib.machinery import SourceFileLoader

        forge = SourceFileLoader(
            "forge_cli_main_al8",
            str(_FORGE_CLI / "forge"),
        ).load_module()
        self.assertEqual(forge._METHOD_IN_ARGS.get("ApplyLayout"), 1)
        self.assertEqual(forge._METHOD_IN_ARGS.get("GetLayoutApply"), 1)
        self.assertEqual(forge._METHOD_IN_ARGS.get("CancelLayoutApply"), 1)

    def test_apply_layout_helper_streams(self):
        from importlib.machinery import SourceFileLoader

        forge = SourceFileLoader(
            "forge_cli_main_al8b",
            str(_FORGE_CLI / "forge"),
        ).load_module()

        def fake_call(_backend, method, *args):
            if method == "ApplyLayout":
                req = json.loads(args[0])
                self.assertEqual(req["name"], "ghosttys")
                self.assertIn("profile", req)
                return json.dumps(
                    {
                        "ok": True,
                        "applyId": "al-live",
                        "started": True,
                        "phase": "skeleton",
                    }
                )
            if method == "GetLayoutApply":
                return json.dumps(
                    {
                        "ok": True,
                        "live": False,
                        "applyId": "al-live",
                        "phase": "verify",
                        "terminal": {
                            "applyId": "al-live",
                            "ok": True,
                            "phase": "verify",
                        },
                    }
                )
            raise AssertionError(method)

        lines: list[str] = []
        resolved = {
            "name": "ghosttys",
            "path": "/tmp/_forge-test-ghosttys.json",
            "source": "host",
            "host": "forgetest",
        }
        with mock.patch.object(forge, "call_method", side_effect=fake_call):
            with mock.patch.object(forge, "_eprint", side_effect=lambda *a: lines.append(" ".join(str(x) for x in a))):
                rc = forge._layout_run_reconcile_apply_layout(
                    "gdbus",
                    resolved,
                    {"roles": []},
                    name="ghosttys",
                    workspace=0,
                    clean=True,
                    keep_others=False,
                    force_close=False,
                    safe=False,
                    verbose=False,
                    wait_tree_stable=False,
                )
        self.assertEqual(rc, 0)
        joined = "\n".join(lines)
        self.assertEqual(joined.strip(), "forge layout: ok")
        self.assertNotIn("ApplyLayout", joined)
        self.assertNotIn("al-live", joined)
        self.assertNotIn("skeleton", joined)


if __name__ == "__main__":
    unittest.main()
