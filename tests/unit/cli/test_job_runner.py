#!/usr/bin/env python3
"""Unit tests for scripts/forge/job_runner.py (CJ1)."""

from __future__ import annotations

import io
import os
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

_REPO = Path(__file__).resolve().parents[3]
_FORGE_CLI = _REPO / "scripts" / "forge"
if str(_FORGE_CLI) not in sys.path:
    sys.path.insert(0, str(_FORGE_CLI))

from job_runner import (  # noqa: E402
    STATUS_CANCELLED,
    STATUS_FAILED,
    STATUS_OK,
    STATUS_PENDING,
    STATUS_RUNNING,
    STATUS_TIMEOUT,
    BusyError,
    attach,
    claim_mutator,
    default_jobs_root,
    default_timeout_for_command,
    extract_job_meta_flags,
    finalize_from_wait,
    forge_worker_argv,
    holder_is_active,
    is_job_worker,
    is_mutating_job_command,
    job_mode_enabled,
    list_jobs,
    load_handle,
    mark_terminal,
    mutator_holder,
    new_job_id,
    parse_job_timeout_sec,
    pid_alive,
    prepare_job_dir,
    read_status,
    reap_stale_jobs,
    release_mutator,
    request_cancel,
    run_job,
    set_mutator_pid,
    spawn_worker,
    status_exit_code,
    update_status,
    worker_env,
    worker_mark_done,
    worker_should_force_color,
    write_pid,
)


class JobModeFlags(unittest.TestCase):

    def test_job_mode_enabled_defaults(self):
        self.assertTrue(job_mode_enabled({}))
        self.assertTrue(job_mode_enabled({"FORGE_JOB": "1"}))

    def test_job_mode_disabled(self):
        self.assertFalse(job_mode_enabled({}, foreground=True))
        self.assertFalse(job_mode_enabled({"FORGE_JOB": "0"}))
        self.assertFalse(job_mode_enabled({"FORGE_JOB": "false"}))
        self.assertFalse(job_mode_enabled({"FORGE_JOB_WORKER": "1"}))

    def test_is_job_worker(self):
        self.assertFalse(is_job_worker({}))
        self.assertTrue(is_job_worker({"FORGE_JOB_WORKER": "1"}))

    def test_parse_timeout(self):
        self.assertEqual(parse_job_timeout_sec({}), 300.0)
        self.assertEqual(parse_job_timeout_sec({"FORGE_JOB_TIMEOUT": "90"}),
                         90.0)
        self.assertIsNone(parse_job_timeout_sec({"FORGE_JOB_TIMEOUT": "0"}))

    def test_default_jobs_root_override(self):
        p = default_jobs_root({"FORGE_JOBS_DIR": "/tmp/forge-jobs-test"})
        self.assertEqual(p, Path("/tmp/forge-jobs-test"))


class StatusMachine(unittest.TestCase):

    def test_new_job_id_shape(self):
        jid = new_job_id(now=0, rand="abcdef")
        self.assertTrue(jid.startswith("19700101T000000Z-"))
        self.assertTrue(jid.endswith("abcdef"))

    def test_prepare_and_terminal(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            jid, jdir, st = prepare_job_dir(root,
                                            job_id="j1",
                                            command="layout",
                                            argv=["forge", "layout", "dev"])
            self.assertEqual(jid, "j1")
            self.assertEqual(st["status"], STATUS_PENDING)
            self.assertEqual(read_status(jdir)["command"], "layout")
            mark_terminal(jdir, STATUS_OK, exit_code=0)
            st2 = read_status(jdir)
            self.assertEqual(st2["status"], STATUS_OK)
            self.assertEqual(status_exit_code(st2), 0)
            # second mark is no-op
            mark_terminal(jdir, STATUS_FAILED, exit_code=1)
            self.assertEqual(read_status(jdir)["status"], STATUS_OK)

    def test_status_exit_code_defaults(self):
        self.assertEqual(status_exit_code({"status": STATUS_OK}), 0)
        self.assertEqual(status_exit_code({"status": STATUS_CANCELLED}), 130)
        self.assertEqual(status_exit_code({"status": STATUS_TIMEOUT}), 124)
        self.assertEqual(status_exit_code({"status": STATUS_FAILED}), 1)


class MutatorLock(unittest.TestCase):

    def test_claim_and_busy(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            jid, jdir, _ = prepare_job_dir(root, job_id="a", command="layout")
            write_pid(jdir, os.getpid())
            update_status(jdir, status=STATUS_RUNNING, pid=os.getpid())
            claim_mutator(root, "a")
            set_mutator_pid(root, "a", os.getpid())
            holder = mutator_holder(root)
            self.assertIsNotNone(holder)
            self.assertEqual(holder["job_id"], "a")
            with self.assertRaises(BusyError) as ctx:
                claim_mutator(root, "b")
            self.assertEqual(ctx.exception.job_id, "a")
            release_mutator(root, "a")
            mark_terminal(jdir, STATUS_OK, exit_code=0)
            # after release + terminal, new claim works
            claim_mutator(root, "b")
            release_mutator(root, "b")

    def test_stale_claim_allows_takeover(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            jid, jdir, _ = prepare_job_dir(root,
                                           job_id="dead",
                                           command="layout",
                                           now=time.time() - 120)
            update_status(jdir, status=STATUS_RUNNING, pid=999999999)
            write_pid(jdir, 999999999)
            claim_mutator(root, "dead", now=time.time() - 120)
            set_mutator_pid(root, "dead", 999999999)
            # dead pid → not active
            self.assertFalse(
                holder_is_active(root, {
                    "job_id": "dead",
                    "pid": 999999999
                }))
            claim_mutator(root, "fresh")
            release_mutator(root, "fresh")


class Reaper(unittest.TestCase):

    def test_reap_orphaned_worker(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            jid, jdir, _ = prepare_job_dir(root,
                                           job_id="orph",
                                           command="layout")
            write_pid(jdir, 999999998)
            update_status(jdir, status=STATUS_RUNNING, pid=999999998)
            claim_mutator(root, "orph")
            set_mutator_pid(root, "orph", 999999998)
            results = reap_stale_jobs(root)
            self.assertTrue(any(r["job_id"] == "orph" for r in results))
            self.assertEqual(read_status(jdir)["status"], STATUS_FAILED)
            self.assertIsNone(mutator_holder(root))


class SpawnAttach(unittest.TestCase):

    def _py_worker(self, body: str) -> list[str]:
        return [sys.executable, "-c", body]

    def test_attach_streams_and_exit_code(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            code = ("import sys\n"
                    "print('hello-out', flush=True)\n"
                    "print('hello-err', file=sys.stderr, flush=True)\n"
                    "sys.exit(7)\n")
            handle = spawn_worker(
                self._py_worker(code),
                jobs_root=root,
                command="test",
                timeout_sec=30,
            )
            out = io.StringIO()
            err = io.StringIO()
            rc = attach(handle,
                        stream_out=out,
                        stream_err=err,
                        forward_signals=False)
            self.assertEqual(rc, 7)
            self.assertIn("hello-out", out.getvalue())
            self.assertIn("hello-err", err.getvalue())
            st = read_status(handle.job_dir)
            self.assertEqual(st["status"], STATUS_FAILED)
            self.assertEqual(st["exit_code"], 7)
            self.assertIsNone(mutator_holder(root))

    def test_run_job_ok(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            code = "print('ok', flush=True)\n"
            out = io.StringIO()
            rc = run_job(
                self._py_worker(code),
                jobs_root=root,
                command="test",
                timeout_sec=30,
                stream_out=out,
                stream_err=io.StringIO(),
            )
            self.assertEqual(rc, 0)
            self.assertIn("ok", out.getvalue())
            jobs = list_jobs(root)
            self.assertEqual(len(jobs), 1)
            self.assertEqual(jobs[0]["status"], STATUS_OK)

    def test_detach_returns_immediately(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            marker = Path(tmp) / "done.txt"
            code = ("import time, pathlib\n"
                    "time.sleep(0.4)\n"
                    f"pathlib.Path({str(marker)!r}).write_text('1')\n")
            out = io.StringIO()
            t0 = time.time()
            rc = run_job(
                self._py_worker(code),
                detach=True,
                jobs_root=root,
                command="test",
                timeout_sec=30,
                stream_out=out,
            )
            elapsed = time.time() - t0
            self.assertEqual(rc, 0)
            self.assertLess(elapsed, 0.35)
            self.assertIn("job ", out.getvalue())
            self.assertIn(" started", out.getvalue())
            # wait for worker
            for _ in range(50):
                if marker.is_file():
                    break
                time.sleep(0.05)
            self.assertTrue(marker.is_file())
            # finalize status (worker is plain python — parent must reap via attach or reaper)
            jobs = list_jobs(root)
            self.assertEqual(len(jobs), 1)
            handle = load_handle(root, jobs[0]["job_id"])
            # wait until dead then finalize
            for _ in range(50):
                if not pid_alive(handle.pid):
                    break
                time.sleep(0.05)
            finalize_from_wait(handle, 0)
            self.assertEqual(read_status(handle.job_dir)["status"], STATUS_OK)

    def test_worker_survives_sighup(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            marker = Path(tmp) / "after-hup.txt"
            code = ("import time, pathlib, signal\n"
                    "signal.signal(signal.SIGHUP, signal.SIG_IGN)\n"
                    "time.sleep(0.35)\n"
                    f"pathlib.Path({str(marker)!r}).write_text('survived')\n")
            handle = spawn_worker(
                self._py_worker(code),
                jobs_root=root,
                command="test",
                timeout_sec=30,
            )
            time.sleep(0.05)
            os.kill(handle.pid, signal.SIGHUP)
            for _ in range(40):
                if marker.is_file():
                    break
                time.sleep(0.05)
            self.assertTrue(marker.is_file(),
                            "worker should ignore SIGHUP and finish")
            self.assertEqual(marker.read_text(), "survived")
            # reap
            for _ in range(40):
                if not pid_alive(handle.pid):
                    break
                time.sleep(0.05)
            rc = attach(handle,
                        stream_out=io.StringIO(),
                        stream_err=io.StringIO(),
                        forward_signals=False)
            self.assertEqual(rc, 0)

    def test_parent_death_worker_continues(self):
        """Simulate attach parent exit: worker keeps running (detached path)."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            marker = Path(tmp) / "late.txt"
            code = ("import time, pathlib\n"
                    "time.sleep(0.5)\n"
                    f"pathlib.Path({str(marker)!r}).write_text('done')\n")
            # outer process spawns job then exits without waiting (like TTY death after detach)
            launcher = (
                "import sys, time\n"
                f"sys.path.insert(0, {str(_FORGE_CLI)!r})\n"
                "from job_runner import spawn_worker\n"
                f"h = spawn_worker({self._py_worker(code)!r}, jobs_root={str(root)!r}, "
                "command='test', timeout_sec=30)\n"
                "print(h.job_id, h.pid, flush=True)\n"
                # exit immediately — worker must outlive us
            )
            proc = subprocess.run(
                [sys.executable, "-c", launcher],
                capture_output=True,
                text=True,
                check=True,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr)
            parts = proc.stdout.strip().split()
            self.assertEqual(len(parts), 2)
            job_id, pid_s = parts
            # launcher process already exited; worker must still finish the marker
            for _ in range(40):
                if marker.is_file():
                    break
                time.sleep(0.05)
            self.assertTrue(marker.is_file())
            self.assertEqual(marker.read_text(), "done")
            self.assertTrue((root / job_id / "status.json").is_file())
            # worker may still be reaped by init; marker is the survival proof
            _ = pid_s

    def test_cooperative_cancel(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            code = ("import time, signal, sys\n"
                    "def _h(s, f):\n"
                    "    sys.exit(130)\n"
                    "signal.signal(signal.SIGINT, _h)\n"
                    "time.sleep(10)\n")
            handle = spawn_worker(
                self._py_worker(code),
                jobs_root=root,
                command="test",
                timeout_sec=30,
            )
            time.sleep(0.1)
            self.assertTrue(
                request_cancel(root, handle.job_id, sig=signal.SIGINT))
            out = io.StringIO()
            rc = attach(handle,
                        stream_out=out,
                        stream_err=io.StringIO(),
                        forward_signals=False)
            # 130 from worker exit, or cancelled mapping
            self.assertIn(rc, (130, 1))
            st = read_status(handle.job_dir)
            self.assertIn(st["status"], (STATUS_CANCELLED, STATUS_FAILED))

    def test_single_flight_blocks_second_spawn(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            code = "import time\ntime.sleep(0.8)\n"
            h1 = spawn_worker(
                self._py_worker(code),
                jobs_root=root,
                command="test",
                timeout_sec=30,
            )
            with self.assertRaises(BusyError):
                spawn_worker(
                    self._py_worker("print(1)"),
                    jobs_root=root,
                    command="test",
                    timeout_sec=30,
                )
            attach(h1,
                   stream_out=io.StringIO(),
                   stream_err=io.StringIO(),
                   forward_signals=False)
            # after first finishes, second works
            h2 = spawn_worker(
                self._py_worker("print(1)"),
                jobs_root=root,
                command="test",
                timeout_sec=30,
            )
            rc = attach(h2,
                        stream_out=io.StringIO(),
                        stream_err=io.StringIO(),
                        forward_signals=False)
            self.assertEqual(rc, 0)

    def test_worker_env_disables_nesting(self):
        env = worker_env({
            "FORGE_JOB": "1",
            "DISPLAY": ":0"
        },
                         job_id="x",
                         job_dir_path=Path("/tmp/x"),
                         force_color=False)
        self.assertEqual(env["FORGE_JOB_WORKER"], "1")
        self.assertEqual(env["FORGE_JOB"], "0")
        self.assertEqual(env["FORGE_JOB_ID"], "x")
        self.assertEqual(env["DISPLAY"], ":0")
        self.assertFalse(job_mode_enabled(env))

    def test_worker_env_forces_color_for_tty_attach(self):
        env = worker_env(
            {"FORGE_JOB": "1", "DISPLAY": ":0"},
            job_id="x",
            job_dir_path=Path("/tmp/x"),
            force_color=True,
        )
        self.assertEqual(env["FORGE_COLOR"], "always")

    def test_worker_env_respects_color_never(self):
        env = worker_env(
            {"FORGE_JOB": "1", "FORGE_COLOR": "never"},
            job_id="x",
            job_dir_path=Path("/tmp/x"),
            force_color=None,
            color_stream=io.StringIO(),  # not a TTY
        )
        self.assertEqual(env.get("FORGE_COLOR"), "never")
        self.assertFalse(
            worker_should_force_color({"FORGE_COLOR": "never"},
                                      stream=io.StringIO()))

    def test_worker_should_force_color_auto_tty(self):
        class _Tty:
            def isatty(self):
                return True

        self.assertTrue(
            worker_should_force_color({"FORGE_COLOR": "auto"}, stream=_Tty()))
        self.assertFalse(
            worker_should_force_color({
                "FORGE_COLOR": "auto",
                "NO_COLOR": "1"
            },
                                      stream=_Tty()))
        self.assertFalse(
            worker_should_force_color({"FORGE_COLOR": "auto"},
                                      stream=io.StringIO()))

    def test_worker_mark_done(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            jid, jdir, _ = prepare_job_dir(root, job_id="w1", command="layout")
            write_pid(jdir, os.getpid())
            update_status(jdir, status=STATUS_RUNNING, pid=os.getpid())
            claim_mutator(root, "w1")
            set_mutator_pid(root, "w1", os.getpid())
            env = {
                "FORGE_JOB_WORKER": "1",
                "FORGE_JOB_ID": "w1",
                "FORGE_JOB_DIR": str(jdir),
            }
            worker_mark_done(0, env=env)
            self.assertEqual(read_status(jdir)["status"], STATUS_OK)
            self.assertIsNone(mutator_holder(root))


class AttachTimeout(unittest.TestCase):

    def test_deadline_marks_timeout(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            code = "import time\ntime.sleep(5)\n"
            handle = spawn_worker(
                [sys.executable, "-c", code],
                jobs_root=root,
                command="test",
                timeout_sec=0.2,
            )
            rc = attach(
                handle,
                stream_out=io.StringIO(),
                stream_err=io.StringIO(),
                forward_signals=False,
            )
            self.assertEqual(rc, 124)
            st = read_status(handle.job_dir)
            self.assertEqual(st["status"], STATUS_TIMEOUT)


class CliHelpers(unittest.TestCase):

    def test_extract_job_meta_flags(self):
        cleaned, det, fg = extract_job_meta_flags(
            ["layout", "dev", "--detach", "--verbose"])
        self.assertEqual(cleaned, ["layout", "dev", "--verbose"])
        self.assertTrue(det)
        self.assertFalse(fg)
        cleaned, det, fg = extract_job_meta_flags(
            ["--foreground", "layout", "dev", "--detach"])
        self.assertEqual(cleaned, ["layout", "dev"])
        self.assertFalse(det)  # foreground wins
        self.assertTrue(fg)

    def test_is_mutating_job_command(self):
        self.assertTrue(is_mutating_job_command("layout", layout_head="dev"))
        self.assertTrue(is_mutating_job_command("layout", layout_head="clean"))
        self.assertFalse(is_mutating_job_command("layout", layout_head="list"))
        self.assertFalse(is_mutating_job_command("layout", layout_head="show"))
        self.assertFalse(is_mutating_job_command("layout", layout_head="save"))
        self.assertFalse(
            is_mutating_job_command("layout", layout_head="dev", dry_run=True))
        self.assertTrue(is_mutating_job_command("install"))
        self.assertTrue(is_mutating_job_command("run"))
        self.assertTrue(is_mutating_job_command("test", test_action="run"))
        self.assertFalse(is_mutating_job_command("test", test_action="plan"))
        self.assertFalse(is_mutating_job_command("ping"))
        self.assertFalse(is_mutating_job_command("tree"))

    def test_default_timeout_for_command(self):
        self.assertEqual(default_timeout_for_command("layout", env={}), 300.0)
        self.assertEqual(default_timeout_for_command("install", env={}), 900.0)
        self.assertEqual(
            default_timeout_for_command("layout",
                                        env={"FORGE_JOB_TIMEOUT": "42"}),
            42.0,
        )

    def test_forge_worker_argv(self):
        argv = forge_worker_argv("/path/forge", ["layout", "dev"],
                                 python="/usr/bin/python3")
        self.assertEqual(argv,
                         ["/usr/bin/python3", "/path/forge", "layout", "dev"])

    def test_is_job_worker_pid_scoped(self):
        with tempfile.TemporaryDirectory() as tmp:
            jdir = Path(tmp)
            write_pid(jdir, os.getpid())
            env = {
                "FORGE_JOB_WORKER": "1",
                "FORGE_JOB_DIR": str(jdir),
            }
            self.assertTrue(is_job_worker(env))
            write_pid(jdir, os.getpid() + 99999)
            self.assertFalse(is_job_worker(env))


class JobsCli(unittest.TestCase):

    def test_jobs_list_status_log_cancel(self):
        forge = _FORGE_CLI / "forge"
        with tempfile.TemporaryDirectory() as tmp:
            env = os.environ.copy()
            env["FORGE_JOBS_DIR"] = tmp
            # create a finished job via run_job
            rc = run_job(
                [sys.executable, "-c", "print('log-line', flush=True)"],
                jobs_root=Path(tmp),
                command="smoke",
                timeout_sec=30,
                stream_out=io.StringIO(),
                stream_err=io.StringIO(),
            )
            self.assertEqual(rc, 0)
            jobs = list_jobs(Path(tmp))
            self.assertEqual(len(jobs), 1)
            jid = jobs[0]["job_id"]

            list_p = subprocess.run(
                [sys.executable, str(forge), "jobs"],
                capture_output=True,
                text=True,
                env=env,
                timeout=15,
            )
            self.assertEqual(list_p.returncode, 0, list_p.stderr)
            self.assertIn(jid, list_p.stdout)

            st_p = subprocess.run(
                [sys.executable,
                 str(forge), "jobs", "status", jid],
                capture_output=True,
                text=True,
                env=env,
                timeout=15,
            )
            self.assertEqual(st_p.returncode, 0, st_p.stderr)
            self.assertIn('"status"', st_p.stdout)

            log_p = subprocess.run(
                [sys.executable,
                 str(forge), "jobs", "log", jid],
                capture_output=True,
                text=True,
                env=env,
                timeout=15,
            )
            self.assertEqual(log_p.returncode, 0, log_p.stderr)
            self.assertIn("log-line", log_p.stdout)

            # already terminal
            can_p = subprocess.run(
                [sys.executable,
                 str(forge), "jobs", "cancel", jid],
                capture_output=True,
                text=True,
                env=env,
                timeout=15,
            )
            self.assertEqual(can_p.returncode, 0, can_p.stderr)
            self.assertIn("already", can_p.stdout.lower())

    def test_jobs_prefix_resolve(self):
        forge = _FORGE_CLI / "forge"
        with tempfile.TemporaryDirectory() as tmp:
            env = os.environ.copy()
            env["FORGE_JOBS_DIR"] = tmp
            run_job(
                [sys.executable, "-c", "pass"],
                jobs_root=Path(tmp),
                command="smoke",
                timeout_sec=30,
                stream_out=io.StringIO(),
                stream_err=io.StringIO(),
            )
            jid = list_jobs(Path(tmp))[0]["job_id"]
            prefix = jid[:12]
            st_p = subprocess.run(
                [sys.executable,
                 str(forge), "jobs", "status", prefix],
                capture_output=True,
                text=True,
                env=env,
                timeout=15,
            )
            self.assertEqual(st_p.returncode, 0, st_p.stderr)
            self.assertIn(jid, st_p.stdout)


class WireSmoke(unittest.TestCase):
    """End-to-end: real forge entry under job runner."""

    def test_forge_layout_list_stays_foreground(self):
        forge = _FORGE_CLI / "forge"
        env = os.environ.copy()
        env["FORGE_JOB"] = "1"
        with tempfile.TemporaryDirectory() as tmp:
            env["FORGE_JOBS_DIR"] = tmp
            subprocess.run(
                [sys.executable, str(forge), "layout", "list"],
                capture_output=True,
                text=True,
                env=env,
                timeout=30,
            )
            jobs = [p for p in Path(tmp).iterdir()
                    if p.is_dir()] if Path(tmp).is_dir() else []
            self.assertEqual(jobs, [],
                             f"layout list should not spawn jobs: {jobs}")

    def test_forge_as_job_worker_marks_done(self):
        """Spawn forge --version as a durable worker; status ends ok."""
        forge = _FORGE_CLI / "forge"
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            out = io.StringIO()
            err = io.StringIO()
            rc = run_job(
                [sys.executable, str(forge), "--version"],
                jobs_root=root,
                command="version-smoke",
                timeout_sec=30,
                stream_out=out,
                stream_err=err,
            )
            self.assertEqual(rc, 0, err.getvalue())
            self.assertIn("forge", out.getvalue().lower())
            jobs = list_jobs(root)
            self.assertEqual(len(jobs), 1)
            self.assertEqual(jobs[0]["status"], STATUS_OK)

    def test_parent_forge_layout_apply_spawns_job(self):
        """forge layout <missing> still goes through job runner (fails inside worker)."""
        forge = _FORGE_CLI / "forge"
        with tempfile.TemporaryDirectory() as tmp:
            env = os.environ.copy()
            env["FORGE_JOBS_DIR"] = tmp
            # Force-enable jobs; missing profile fails after worker starts
            env.pop("FORGE_JOB", None)
            proc = subprocess.run(
                [
                    sys.executable,
                    str(forge),
                    "layout",
                    "__cj2_no_such_profile__",
                ],
                capture_output=True,
                text=True,
                env=env,
                timeout=60,
            )
            self.assertNotEqual(proc.returncode, 0)
            jobs = [p for p in Path(tmp).iterdir() if p.is_dir()]
            self.assertEqual(len(jobs), 1, f"expected one job dir, got {jobs}")
            st = read_status(jobs[0])
            self.assertIn(st["status"],
                          (STATUS_FAILED, STATUS_OK, STATUS_CANCELLED))
            # Worker should have finished (not left running)
            self.assertIn(
                st["status"],
                (STATUS_FAILED, STATUS_OK, STATUS_CANCELLED, STATUS_TIMEOUT))


if __name__ == "__main__":
    unittest.main()
