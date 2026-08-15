#!/usr/bin/env python3
"""Attachable one-shot job runner for durable forge CLI mutators (CJ1).

Default UX: start worker in a new session, attach (stream logs + wait).
TTY/SIGHUP death does not kill the worker. See agents/plans/forge-cli-jobs.md.
"""

from __future__ import annotations

import errno
import fcntl
import json
import os
import signal
import sys
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Optional, Sequence, TextIO

# --- paths / schema ---

SCHEMA_VERSION = 1
DEFAULT_JOBS_SUBPATH = Path("forge") / "jobs"
STATUS_FILENAME = "status.json"
PID_FILENAME = "pid"
ARGV_FILENAME = "argv.json"
STDOUT_LOG = "stdout.log"
STDERR_LOG = "stderr.log"
MUTATOR_LOCK = "mutator.lock"

STATUS_PENDING = "pending"
STATUS_RUNNING = "running"
STATUS_OK = "ok"
STATUS_FAILED = "failed"
STATUS_CANCELLED = "cancelled"
STATUS_TIMEOUT = "timeout"

TERMINAL_STATUSES = frozenset(
    {STATUS_OK, STATUS_FAILED, STATUS_CANCELLED, STATUS_TIMEOUT})
ACTIVE_STATUSES = frozenset({STATUS_PENDING, STATUS_RUNNING})

ENV_JOB_ENABLE = "FORGE_JOB"  # "0" disables job wrapper
ENV_JOB_WORKER = "FORGE_JOB_WORKER"  # "1" = already inside worker
ENV_JOB_ID = "FORGE_JOB_ID"
ENV_JOB_DIR = "FORGE_JOB_DIR"
ENV_JOBS_DIR = "FORGE_JOBS_DIR"
ENV_JOB_TIMEOUT = "FORGE_JOB_TIMEOUT"  # whole-job ceiling seconds

# Claim without worker pid older than this is treated as stale (crash mid-spawn).
CLAIM_STALE_SEC = 30.0
DEFAULT_ATTACH_POLL_SEC = 0.05
DEFAULT_JOB_TIMEOUT_SEC = 300.0  # layout-class default ceiling


class JobError(Exception):
    """Base error for job runner."""


class BusyError(JobError):
    """Another mutating job is already active."""

    def __init__(self, job_id: str, message: str = ""):
        self.job_id = job_id
        super().__init__(message or f"mutating job already running: {job_id}")


class JobNotFoundError(JobError):

    def __init__(self, job_id: str):
        self.job_id = job_id
        super().__init__(f"job not found: {job_id}")


# --- path helpers ---


def default_jobs_root(env: Optional[Mapping[str, str]] = None) -> Path:
    """~/.local/share/forge/jobs or $FORGE_JOBS_DIR / $XDG_DATA_HOME override."""
    e = env if env is not None else os.environ
    override = (e.get(ENV_JOBS_DIR) or "").strip()
    if override:
        return Path(override).expanduser()
    xdg = (e.get("XDG_DATA_HOME") or "").strip()
    if xdg:
        return Path(xdg).expanduser() / DEFAULT_JOBS_SUBPATH
    return Path.home() / ".local" / "share" / DEFAULT_JOBS_SUBPATH


def job_dir(jobs_root: Path, job_id: str) -> Path:
    return Path(jobs_root) / str(job_id)


def job_mode_enabled(
    env: Optional[Mapping[str, str]] = None,
    *,
    foreground: bool = False,
) -> bool:
    """False when --foreground, FORGE_JOB=0, or already a job worker."""
    if foreground:
        return False
    e = env if env is not None else os.environ
    if str(e.get(ENV_JOB_WORKER, "")).strip() == "1":
        return False
    raw = str(e.get(ENV_JOB_ENABLE, "1")).strip().lower()
    if raw in ("0", "false", "no", "off"):
        return False
    return True


def is_job_worker(env: Optional[Mapping[str, str]] = None) -> bool:
    """True only for the actual worker process (not nested forge grandchildren).

    Parent sets FORGE_JOB_WORKER=1 + FORGE_JOB_DIR; pid file names this process.
    Nested ``forge`` children inherit the env but have a different pid, so they
    must not call worker_mark_done on the parent's job.
    """
    e = env if env is not None else os.environ
    if str(e.get(ENV_JOB_WORKER, "")).strip() != "1":
        return False
    jdir_raw = (e.get(ENV_JOB_DIR) or "").strip()
    if not jdir_raw:
        return True
    pid = read_pid(Path(jdir_raw))
    if pid is None:
        return True
    return int(pid) == os.getpid()


def parse_job_timeout_sec(
    env: Optional[Mapping[str, str]] = None,
    *,
    default: Optional[float] = DEFAULT_JOB_TIMEOUT_SEC,
) -> Optional[float]:
    e = env if env is not None else os.environ
    raw = (e.get(ENV_JOB_TIMEOUT) or "").strip()
    if not raw:
        return default
    try:
        val = float(raw)
    except ValueError as exc:
        raise JobError(f"invalid {ENV_JOB_TIMEOUT}={raw!r}") from exc
    if val <= 0:
        return None  # no ceiling
    return val


# --- id / status ---


def new_job_id(*,
               now: Optional[float] = None,
               rand: Optional[str] = None) -> str:
    """UTC-ish compact id: YYYYMMDDTHHMMSSZ-<6 hex>."""
    t = time.gmtime(time.time() if now is None else now)
    stamp = time.strftime("%Y%m%dT%H%M%SZ", t)
    suffix = (rand if rand is not None else uuid.uuid4().hex[:6]).lower()
    return f"{stamp}-{suffix}"


def empty_status(
    *,
    job_id: str,
    command: str = "",
    argv: Optional[Sequence[str]] = None,
    timeout_sec: Optional[float] = None,
    now: Optional[float] = None,
) -> dict[str, Any]:
    ts = float(time.time() if now is None else now)
    return {
        "schema": SCHEMA_VERSION,
        "job_id": job_id,
        "status": STATUS_PENDING,
        "command": command or "",
        "argv": list(argv or ()),
        "pid": None,
        "exit_code": None,
        "started_at": ts,
        "finished_at": None,
        "deadline_at": (ts + float(timeout_sec)) if timeout_sec else None,
        "error": None,
    }


def write_json_atomic(path: Path, data: Any) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    text = json.dumps(data, indent=2, sort_keys=True) + "\n"
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def read_json(path: Path) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_status(jdir: Path, status: Mapping[str, Any]) -> None:
    write_json_atomic(Path(jdir) / STATUS_FILENAME, dict(status))


def read_status(jdir: Path) -> dict[str, Any]:
    path = Path(jdir) / STATUS_FILENAME
    if not path.is_file():
        raise JobNotFoundError(Path(jdir).name)
    data = read_json(path)
    if not isinstance(data, dict):
        raise JobError(f"corrupt status: {path}")
    return data


def update_status(jdir: Path, **fields: Any) -> dict[str, Any]:
    st = read_status(jdir)
    st.update(fields)
    write_status(jdir, st)
    return st


def write_pid(jdir: Path, pid: int) -> None:
    Path(jdir).mkdir(parents=True, exist_ok=True)
    (Path(jdir) / PID_FILENAME).write_text(f"{int(pid)}\n", encoding="utf-8")


def read_pid(jdir: Path) -> Optional[int]:
    path = Path(jdir) / PID_FILENAME
    if not path.is_file():
        return None
    raw = path.read_text(encoding="utf-8").strip()
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def write_argv(jdir: Path, argv: Sequence[str]) -> None:
    write_json_atomic(Path(jdir) / ARGV_FILENAME, list(argv))


def mark_terminal(
    jdir: Path,
    status: str,
    *,
    exit_code: Optional[int] = None,
    error: Optional[str] = None,
    now: Optional[float] = None,
) -> dict[str, Any]:
    if status not in TERMINAL_STATUSES:
        raise JobError(f"not a terminal status: {status}")
    st = read_status(jdir)
    if st.get("status") in TERMINAL_STATUSES:
        return st
    ts = float(time.time() if now is None else now)
    st["status"] = status
    st["finished_at"] = ts
    if exit_code is not None:
        st["exit_code"] = int(exit_code)
    elif status == STATUS_OK and st.get("exit_code") is None:
        st["exit_code"] = 0
    if error is not None:
        st["error"] = error
    write_status(jdir, st)
    return st


def status_exit_code(st: Mapping[str, Any]) -> int:
    """Map terminal status to process-style exit code."""
    code = st.get("exit_code")
    if code is not None:
        return int(code)
    status = str(st.get("status") or "")
    if status == STATUS_OK:
        return 0
    if status == STATUS_CANCELLED:
        return 130
    if status == STATUS_TIMEOUT:
        return 124
    return 1


# --- process helpers ---


def pid_alive(pid: Optional[int]) -> bool:
    if pid is None or pid <= 0:
        return False
    try:
        os.kill(int(pid), 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError as exc:
        if exc.errno == errno.ESRCH:
            return False
        if exc.errno == errno.EPERM:
            return True
        raise
    return True


def waitpid_exit_code(pid: int, *, hang: bool = False) -> Optional[int]:
    """Reap child if exited. Returns exit code, or None if still running / not ours.

    Zombies still pass kill(pid,0); callers must reap via waitpid, not only pid_alive.
    """
    flags = 0 if hang else os.WNOHANG
    try:
        wpid, status = os.waitpid(int(pid), flags)
    except ChildProcessError:
        return None
    except OSError as exc:
        if exc.errno == errno.ECHILD:
            return None
        raise
    if wpid == 0:
        return None
    if os.WIFEXITED(status):
        return int(os.WEXITSTATUS(status))
    if os.WIFSIGNALED(status):
        return int(128 + os.WTERMSIG(status))
    return 1


def _preexec_ignore_hup() -> None:
    signal.signal(signal.SIGHUP, signal.SIG_IGN)


# --- mutator single-flight ---


def _lock_path(jobs_root: Path) -> Path:
    return Path(jobs_root) / MUTATOR_LOCK


def _read_lock_payload(path: Path) -> Optional[dict[str, Any]]:
    if not path.is_file():
        return None
    raw = path.read_text(encoding="utf-8").strip()
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # legacy: bare job_id
        return {"job_id": raw, "pid": None}
    if isinstance(data, dict) and data.get("job_id"):
        return data
    return None


def _write_lock_payload(path: Path, payload: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(dict(payload), sort_keys=True) + "\n",
                   encoding="utf-8")
    os.replace(tmp, path)


def holder_is_active(
    jobs_root: Path,
    holder: Mapping[str, Any],
    *,
    now: Optional[float] = None,
    claim_stale_sec: float = CLAIM_STALE_SEC,
) -> bool:
    """True if lock holder still represents a live mutator."""
    job_id = str(holder.get("job_id") or "").strip()
    if not job_id:
        return False
    jdir = job_dir(jobs_root, job_id)
    st: Optional[dict[str, Any]] = None
    if (jdir / STATUS_FILENAME).is_file():
        try:
            st = read_status(jdir)
        except JobError:
            st = None
    if st and str(st.get("status")) in TERMINAL_STATUSES:
        return False
    pid = holder.get("pid")
    if pid is None:
        pid = read_pid(jdir) if jdir.is_dir() else None
    if pid is not None and pid_alive(int(pid)):
        return True
    # No live pid: fresh pending claim may still be mid-spawn
    if st and str(st.get("status")) in ACTIVE_STATUSES:
        started = float(st.get("started_at") or 0)
        ts = float(time.time() if now is None else now)
        if started and (ts - started) < float(claim_stale_sec):
            return True
    return False


def mutator_holder(jobs_root: Path) -> Optional[dict[str, Any]]:
    payload = _read_lock_payload(_lock_path(jobs_root))
    if not payload:
        return None
    if holder_is_active(jobs_root, payload):
        return payload
    return None


def claim_mutator(
    jobs_root: Path,
    job_id: str,
    *,
    now: Optional[float] = None,
) -> None:
    """Claim global mutator slot. Raises BusyError if another job is active."""
    jobs_root = Path(jobs_root)
    jobs_root.mkdir(parents=True, exist_ok=True)
    path = _lock_path(jobs_root)
    with open(path, "a+", encoding="utf-8") as fh:
        fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
        try:
            fh.seek(0)
            raw = fh.read().strip()
            holder = None
            if raw:
                try:
                    holder = json.loads(raw)
                except json.JSONDecodeError:
                    holder = {"job_id": raw, "pid": None}
            if isinstance(holder, dict) and holder.get("job_id"):
                if holder_is_active(jobs_root, holder, now=now):
                    raise BusyError(str(holder["job_id"]))
            payload = {
                "job_id": job_id,
                "pid": None,
                "claimed_at": float(time.time() if now is None else now),
            }
            fh.seek(0)
            fh.truncate()
            fh.write(json.dumps(payload, sort_keys=True) + "\n")
            fh.flush()
            os.fsync(fh.fileno())
        finally:
            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)


def set_mutator_pid(jobs_root: Path, job_id: str, pid: int) -> None:
    path = _lock_path(jobs_root)
    with open(path, "a+", encoding="utf-8") as fh:
        fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
        try:
            fh.seek(0)
            raw = fh.read().strip()
            payload: dict[str, Any] = {"job_id": job_id, "pid": int(pid)}
            if raw:
                try:
                    cur = json.loads(raw)
                    if isinstance(cur, dict) and cur.get("job_id") == job_id:
                        payload = dict(cur)
                        payload["pid"] = int(pid)
                except json.JSONDecodeError:
                    pass
            fh.seek(0)
            fh.truncate()
            fh.write(json.dumps(payload, sort_keys=True) + "\n")
            fh.flush()
        finally:
            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)


def release_mutator(jobs_root: Path, job_id: str) -> bool:
    """Clear lock if it still names this job_id. Returns True if released."""
    path = _lock_path(jobs_root)
    if not path.is_file():
        return False
    with open(path, "a+", encoding="utf-8") as fh:
        fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
        try:
            fh.seek(0)
            raw = fh.read().strip()
            if not raw:
                return False
            try:
                cur = json.loads(raw)
                held = str(cur.get("job_id") or "") if isinstance(cur,
                                                                  dict) else ""
            except json.JSONDecodeError:
                held = raw
            if held != job_id:
                return False
            fh.seek(0)
            fh.truncate()
            fh.flush()
            return True
        finally:
            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)


# --- reaper ---


def reap_stale_jobs(
    jobs_root: Path,
    *,
    now: Optional[float] = None,
) -> list[dict[str, Any]]:
    """Mark dead/timeout active jobs terminal; release their mutator slots."""
    jobs_root = Path(jobs_root)
    results: list[dict[str, Any]] = []
    if not jobs_root.is_dir():
        return results
    ts = float(time.time() if now is None else now)
    for child in sorted(jobs_root.iterdir()):
        if not child.is_dir():
            continue
        if not (child / STATUS_FILENAME).is_file():
            continue
        try:
            st = read_status(child)
        except JobError:
            continue
        status = str(st.get("status") or "")
        if status in TERMINAL_STATUSES:
            continue
        job_id = str(st.get("job_id") or child.name)
        pid = st.get("pid") if st.get("pid") is not None else read_pid(child)
        deadline = st.get("deadline_at")
        action = None
        if deadline is not None and ts >= float(deadline) and pid_alive(pid):
            request_cancel(jobs_root, job_id, sig=signal.SIGTERM)
            # if still alive briefly, escalate is left to attach path; mark timeout if dead soon
            time.sleep(0.05)
            if not pid_alive(pid):
                mark_terminal(
                    child,
                    STATUS_TIMEOUT,
                    exit_code=124,
                    error="job deadline exceeded",
                    now=ts,
                )
                action = "timeout"
            else:
                # still running after signal — leave running; attach enforces hard kill
                action = "timeout_signaled"
        elif not pid_alive(pid) and status in ACTIVE_STATUSES:
            # pending with no pid yet and fresh → skip (mid-spawn)
            if pid is None and status == STATUS_PENDING:
                started = float(st.get("started_at") or 0)
                if started and (ts - started) < CLAIM_STALE_SEC:
                    continue
            mark_terminal(
                child,
                STATUS_FAILED,
                exit_code=1,
                error="worker process gone before terminal status",
                now=ts,
            )
            action = "orphaned"
        if action:
            release_mutator(jobs_root, job_id)
            results.append({"job_id": job_id, "action": action})
    # clear stale lock with no active holder
    holder = _read_lock_payload(_lock_path(jobs_root))
    if holder and not holder_is_active(jobs_root, holder, now=ts):
        release_mutator(jobs_root, str(holder.get("job_id") or ""))
    return results


# --- spawn / attach / cancel ---


@dataclass
class JobHandle:
    job_id: str
    jobs_root: Path
    pid: int
    job_dir: Path

    @property
    def stdout_log(self) -> Path:
        return self.job_dir / STDOUT_LOG

    @property
    def stderr_log(self) -> Path:
        return self.job_dir / STDERR_LOG


def prepare_job_dir(
    jobs_root: Path,
    *,
    job_id: Optional[str] = None,
    command: str = "",
    argv: Optional[Sequence[str]] = None,
    timeout_sec: Optional[float] = None,
    now: Optional[float] = None,
) -> tuple[str, Path, dict[str, Any]]:
    """Create job directory + initial status/argv (no process yet)."""
    jid = job_id or new_job_id(now=now)
    jdir = job_dir(jobs_root, jid)
    jdir.mkdir(parents=True, exist_ok=False)
    st = empty_status(
        job_id=jid,
        command=command,
        argv=argv,
        timeout_sec=timeout_sec,
        now=now,
    )
    write_status(jdir, st)
    if argv is not None:
        write_argv(jdir, argv)
    (jdir / STDOUT_LOG).write_text("", encoding="utf-8")
    (jdir / STDERR_LOG).write_text("", encoding="utf-8")
    return jid, jdir, st


def worker_should_force_color(
    env: Optional[Mapping[str, str]] = None,
    *,
    stream: Optional[TextIO] = None,
) -> bool:
    """
    True when the job worker should emit ANSI into log files.

    Workers have no TTY (stdout/stderr are log files). Color auto then stays
    off and attach streams monochrome text even when the parent terminal is a
    real TTY (e.g. Guake). Force color when the parent session wants it:
    FORGE_COLOR=always, or auto + attach stream is a TTY and NO_COLOR is unset.
    """
    e = env if env is not None else os.environ
    mode = str(e.get("FORGE_COLOR", "auto") or "auto").strip().lower()
    if mode == "never":
        return False
    if mode == "always":
        return True
    if str(e.get("NO_COLOR", "")).strip():
        return False
    s = stream if stream is not None else sys.stdout
    try:
        return bool(s.isatty())
    except Exception:
        return False


def worker_env(
    base: Optional[Mapping[str, str]],
    *,
    job_id: str,
    job_dir_path: Path,
    force_color: Optional[bool] = None,
    color_stream: Optional[TextIO] = None,
) -> dict[str, str]:
    """Env for worker: inherit session, mark worker, force in-process path.

    When the attaching parent wants color (TTY / FORGE_COLOR=always), set
    FORGE_COLOR=always so install.zsh / cli_ansi emit ANSI into the logs that
    attach then displays on the real terminal.
    """
    env = dict(os.environ if base is None else base)
    env[ENV_JOB_WORKER] = "1"
    env[ENV_JOB_ID] = job_id
    env[ENV_JOB_DIR] = str(job_dir_path)
    env[ENV_JOB_ENABLE] = "0"  # never nest job runners
    if force_color is None:
        force_color = worker_should_force_color(env, stream=color_stream)
    if force_color:
        env["FORGE_COLOR"] = "always"
    return env


def spawn_worker(
    worker_argv: Sequence[str],
    *,
    jobs_root: Path,
    command: str = "",
    timeout_sec: Optional[float] = None,
    env: Optional[Mapping[str, str]] = None,
    cwd: Optional[str] = None,
    job_id: Optional[str] = None,
    now: Optional[float] = None,
) -> JobHandle:
    """Claim mutator slot, spawn worker in new session, return handle."""
    import subprocess

    jobs_root = Path(jobs_root)
    argv = [str(a) for a in worker_argv]
    if not argv:
        raise JobError("worker argv is empty")

    # Reap first so a dead lock does not block forever
    reap_stale_jobs(jobs_root, now=now)

    jid, jdir, _st = prepare_job_dir(
        jobs_root,
        job_id=job_id,
        command=command,
        argv=argv,
        timeout_sec=timeout_sec,
        now=now,
    )
    try:
        claim_mutator(jobs_root, jid, now=now)
    except BusyError:
        # best-effort cleanup of empty claim dir
        try:
            for name in (STATUS_FILENAME, ARGV_FILENAME, STDOUT_LOG,
                         STDERR_LOG):
                p = jdir / name
                if p.is_file():
                    p.unlink()
            jdir.rmdir()
        except OSError:
            pass
        raise

    wenv = worker_env(env, job_id=jid, job_dir_path=jdir)
    out_path = jdir / STDOUT_LOG
    err_path = jdir / STDERR_LOG

    out_fh = open(out_path, "a", encoding="utf-8", buffering=1)
    err_fh = open(err_path, "a", encoding="utf-8", buffering=1)
    try:
        proc = subprocess.Popen(
            argv,
            stdin=subprocess.DEVNULL,
            stdout=out_fh,
            stderr=err_fh,
            env=wenv,
            cwd=cwd,
            start_new_session=True,
            preexec_fn=_preexec_ignore_hup,
            close_fds=True,
        )
    except Exception as exc:
        out_fh.close()
        err_fh.close()
        mark_terminal(
            jdir,
            STATUS_FAILED,
            exit_code=1,
            error=f"spawn failed: {exc}",
            now=now,
        )
        release_mutator(jobs_root, jid)
        raise JobError(f"spawn failed: {exc}") from exc
    finally:
        # parent copies; child keeps the FDs
        try:
            out_fh.close()
        except OSError:
            pass
        try:
            err_fh.close()
        except OSError:
            pass

    pid = int(proc.pid)
    write_pid(jdir, pid)
    set_mutator_pid(jobs_root, jid, pid)
    update_status(jdir, status=STATUS_RUNNING, pid=pid)
    return JobHandle(job_id=jid, jobs_root=jobs_root, pid=pid, job_dir=jdir)


def request_cancel(
    jobs_root: Path,
    job_id: str,
    *,
    sig: int = signal.SIGINT,
) -> bool:
    """Send cooperative cancel signal to worker process group. True if signaled."""
    jdir = job_dir(jobs_root, job_id)
    if not (jdir / STATUS_FILENAME).is_file():
        raise JobNotFoundError(job_id)
    st = read_status(jdir)
    if str(st.get("status")) in TERMINAL_STATUSES:
        return False
    pid = st.get("pid") if st.get("pid") is not None else read_pid(jdir)
    if not pid_alive(pid):
        return False
    try:
        os.killpg(int(pid), sig)
    except ProcessLookupError:
        try:
            os.kill(int(pid), sig)
        except ProcessLookupError:
            return False
    except PermissionError:
        try:
            os.kill(int(pid), sig)
        except OSError:
            return False
    return True


def _read_new(path: Path, offset: int) -> tuple[str, int]:
    if not path.is_file():
        return "", offset
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        fh.seek(offset)
        data = fh.read()
        return data, fh.tell()


def finalize_from_wait(
    handle: JobHandle,
    wait_code: int,
    *,
    cancelled: bool = False,
    timed_out: bool = False,
    now: Optional[float] = None,
) -> dict[str, Any]:
    """Write terminal status after waitpid if worker did not already."""
    jdir = handle.job_dir
    try:
        st = read_status(jdir)
    except JobError:
        st = empty_status(job_id=handle.job_id)
    if str(st.get("status")) in TERMINAL_STATUSES:
        release_mutator(handle.jobs_root, handle.job_id)
        return st
    if timed_out:
        st = mark_terminal(
            jdir,
            STATUS_TIMEOUT,
            exit_code=124,
            error="job deadline exceeded",
            now=now,
        )
    elif cancelled:
        # prefer conventional 130; keep worker code if already 130-ish
        code = 130
        if wait_code is not None and int(wait_code) not in (0, ):
            code = int(wait_code) if int(wait_code) >= 128 else 130
        st = mark_terminal(
            jdir,
            STATUS_CANCELLED,
            exit_code=code,
            error="cancelled",
            now=now,
        )
    elif int(wait_code) == 0:
        st = mark_terminal(jdir, STATUS_OK, exit_code=0, now=now)
    else:
        st = mark_terminal(
            jdir,
            STATUS_FAILED,
            exit_code=int(wait_code),
            now=now,
        )
    release_mutator(handle.jobs_root, handle.job_id)
    return st


def attach(
    handle: JobHandle,
    *,
    stream_out: Optional[TextIO] = None,
    stream_err: Optional[TextIO] = None,
    poll_interval: float = DEFAULT_ATTACH_POLL_SEC,
    forward_signals: bool = True,
    now_fn=time.time,
) -> int:
    """Stream worker logs to streams, wait for exit, return exit code."""
    out = stream_out if stream_out is not None else sys.stdout
    err = stream_err if stream_err is not None else sys.stderr
    out_off = 0
    err_off = 0
    cancelled = False
    timed_out = False
    wait_code: Optional[int] = None
    prev_handlers: dict[int, Any] = {}

    def _on_sigint(_signum: int, _frame: Any) -> None:
        nonlocal cancelled
        cancelled = True
        request_cancel(handle.jobs_root, handle.job_id, sig=signal.SIGINT)

    if forward_signals:
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                prev_handlers[sig] = signal.signal(sig, _on_sigint)
            except (ValueError, OSError):
                # not in main thread or unsupported
                pass

    try:
        while True:
            chunk, out_off = _read_new(handle.stdout_log, out_off)
            if chunk:
                out.write(chunk)
                out.flush()
            chunk, err_off = _read_new(handle.stderr_log, err_off)
            if chunk:
                err.write(chunk)
                err.flush()

            # Reap first — zombies still look "alive" to kill(pid, 0)
            reaped = waitpid_exit_code(handle.pid)
            if reaped is not None:
                wait_code = reaped
                break

            try:
                st = read_status(handle.job_dir)
            except JobError:
                st = {}
            if str(st.get("status")) in TERMINAL_STATUSES:
                wait_code = status_exit_code(st)
                # best-effort reap if still our child
                reaped = waitpid_exit_code(handle.pid)
                if reaped is not None:
                    wait_code = reaped
                break

            if not pid_alive(handle.pid):
                # not our child and gone — status file is source of truth
                reaped = waitpid_exit_code(handle.pid)
                if reaped is not None:
                    wait_code = reaped
                break

            deadline = st.get("deadline_at")
            if deadline is not None and float(now_fn()) >= float(deadline):
                timed_out = True
                request_cancel(handle.jobs_root,
                               handle.job_id,
                               sig=signal.SIGTERM)
                deadline_kill_at = float(now_fn()) + 2.0
                while float(now_fn()) < deadline_kill_at:
                    reaped = waitpid_exit_code(handle.pid)
                    if reaped is not None:
                        wait_code = reaped
                        break
                    if not pid_alive(handle.pid):
                        break
                    time.sleep(poll_interval)
                    chunk, out_off = _read_new(handle.stdout_log, out_off)
                    if chunk:
                        out.write(chunk)
                        out.flush()
                if wait_code is None and pid_alive(handle.pid):
                    try:
                        os.killpg(handle.pid, signal.SIGKILL)
                    except OSError:
                        try:
                            os.kill(handle.pid, signal.SIGKILL)
                        except OSError:
                            pass
                    reaped = waitpid_exit_code(handle.pid)
                    if reaped is None:
                        # brief wait after kill
                        for _ in range(50):
                            reaped = waitpid_exit_code(handle.pid)
                            if reaped is not None:
                                break
                            time.sleep(0.02)
                    if reaped is not None:
                        wait_code = reaped
                break

            time.sleep(poll_interval)
    finally:
        for sig, prev in prev_handlers.items():
            try:
                signal.signal(sig, prev)
            except (ValueError, OSError):
                pass

    # drain logs
    for _ in range(20):
        chunk, out_off = _read_new(handle.stdout_log, out_off)
        if chunk:
            out.write(chunk)
            out.flush()
        chunk, err_off = _read_new(handle.stderr_log, err_off)
        if chunk:
            err.write(chunk)
            err.flush()
        if not chunk:
            break
        time.sleep(0.01)

    if wait_code is None:
        reaped = waitpid_exit_code(handle.pid)
        if reaped is not None:
            wait_code = reaped
        else:
            try:
                st = read_status(handle.job_dir)
                if str(st.get("status")) in TERMINAL_STATUSES:
                    return status_exit_code(st)
            except JobError:
                pass
            wait_code = 1

    st = finalize_from_wait(
        handle,
        int(wait_code),
        cancelled=cancelled,
        timed_out=timed_out,
    )
    return status_exit_code(st)


def load_handle(jobs_root: Path, job_id: str) -> JobHandle:
    jdir = job_dir(jobs_root, job_id)
    if not (jdir / STATUS_FILENAME).is_file():
        raise JobNotFoundError(job_id)
    st = read_status(jdir)
    pid = st.get("pid") if st.get("pid") is not None else read_pid(jdir)
    if pid is None:
        raise JobError(f"job {job_id} has no pid")
    return JobHandle(
        job_id=job_id,
        jobs_root=Path(jobs_root),
        pid=int(pid),
        job_dir=jdir,
    )


def run_job(
    worker_argv: Sequence[str],
    *,
    detach: bool = False,
    jobs_root: Optional[Path] = None,
    command: str = "",
    timeout_sec: Optional[float] = None,
    env: Optional[Mapping[str, str]] = None,
    cwd: Optional[str] = None,
    stream_out: Optional[TextIO] = None,
    stream_err: Optional[TextIO] = None,
) -> int:
    """Spawn durable worker. Attach by default; --detach returns 0 after start.

    Prints ``job <id> started`` on detach. Returns worker exit code when attached.
    """
    root = Path(jobs_root) if jobs_root is not None else default_jobs_root(env)
    handle = spawn_worker(
        worker_argv,
        jobs_root=root,
        command=command,
        timeout_sec=timeout_sec,
        env=env,
        cwd=cwd,
    )
    if detach:
        msg = f"job {handle.job_id} started\n"
        out = stream_out if stream_out is not None else sys.stdout
        out.write(msg)
        out.flush()
        return 0
    return attach(
        handle,
        stream_out=stream_out,
        stream_err=stream_err,
    )


def list_jobs(jobs_root: Path) -> list[dict[str, Any]]:
    """Return status dicts for all jobs (newest first by started_at)."""
    jobs_root = Path(jobs_root)
    out: list[dict[str, Any]] = []
    if not jobs_root.is_dir():
        return out
    for child in jobs_root.iterdir():
        if not child.is_dir() or not (child / STATUS_FILENAME).is_file():
            continue
        try:
            out.append(read_status(child))
        except JobError:
            continue
    out.sort(key=lambda s: float(s.get("started_at") or 0), reverse=True)
    return out


# --- worker-side helpers (CJ2 will call from forge entry) ---


def worker_install_signal_policy() -> None:
    """Ignore SIGHUP inside worker (also set via preexec; belt-and-suspenders)."""
    signal.signal(signal.SIGHUP, signal.SIG_IGN)


def worker_mark_done(
    exit_code: int,
    *,
    env: Optional[Mapping[str, str]] = None,
    cancelled: bool = False,
) -> None:
    """If running as job worker, write terminal status + release mutator."""
    e = env if env is not None else os.environ
    if not is_job_worker(e):
        return
    jdir_raw = (e.get(ENV_JOB_DIR) or "").strip()
    job_id = (e.get(ENV_JOB_ID) or "").strip()
    if not jdir_raw or not job_id:
        return
    jdir = Path(jdir_raw)
    if not (jdir / STATUS_FILENAME).is_file():
        return
    if cancelled or exit_code in (130, -signal.SIGINT):
        mark_terminal(jdir, STATUS_CANCELLED, exit_code=130, error="cancelled")
    elif exit_code == 0:
        mark_terminal(jdir, STATUS_OK, exit_code=0)
    else:
        mark_terminal(jdir, STATUS_FAILED, exit_code=int(exit_code))
    root = jdir.parent
    release_mutator(root, job_id)


def maybe_run_as_job(
    worker_argv: Sequence[str],
    *,
    detach: bool = False,
    foreground: bool = False,
    command: str = "",
    timeout_sec: Optional[float] = None,
    env: Optional[Mapping[str, str]] = None,
) -> Optional[int]:
    """If job mode applies, run as job and return exit code; else return None.

    Callers use None to mean “run work in-process” (foreground / disabled).
    """
    e = env if env is not None else os.environ
    if not job_mode_enabled(e, foreground=foreground):
        return None
    root = default_jobs_root(e)
    to = timeout_sec if timeout_sec is not None else parse_job_timeout_sec(e)
    return run_job(
        worker_argv,
        detach=detach,
        jobs_root=root,
        command=command,
        timeout_sec=to,
        env=e,
    )


# --- CLI integration helpers (CJ2) ---

JOB_META_FLAGS = frozenset({"--detach", "--foreground"})

# Whole-job ceilings by command class (seconds). FORGE_JOB_TIMEOUT overrides.
DEFAULT_TIMEOUT_BY_COMMAND: Mapping[str, float] = {
    "layout": 300.0,
    "run": 300.0,
    "run-steps": 300.0,
    "install": 900.0,
    "update": 1200.0,
    "uninstall": 600.0,
    "test": 1800.0,
}


def extract_job_meta_flags(
        argv: Sequence[str]) -> tuple[list[str], bool, bool]:
    """Strip --detach / --foreground from argv. Returns (cleaned, detach, foreground)."""
    detach = False
    foreground = False
    out: list[str] = []
    for a in argv:
        if a == "--detach":
            detach = True
            continue
        if a == "--foreground":
            foreground = True
            continue
        out.append(a)
    if foreground:
        detach = False
    return out, detach, foreground


def is_mutating_job_command(
    command: str,
    *,
    layout_head: str = "",
    dry_run: bool = False,
    test_action: str = "",
) -> bool:
    """True when this forge invocation should use the durable job runner (v1 set)."""
    cmd = (command or "").strip().lower()
    if cmd in ("install", "update", "uninstall", "run", "run-steps"):
        return True
    if cmd == "layout":
        if dry_run:
            return False
        head = (layout_head or "").strip().lower()
        if not head or head in ("list", "show", "help", "-h", "--help",
                                "save"):
            return False
        return True  # apply targets (incl. profile named clean)
    if cmd == "test":
        return (test_action or "").strip().lower() == "run"
    return False


def default_timeout_for_command(
    command: str,
    env: Optional[Mapping[str, str]] = None,
) -> Optional[float]:
    """FORGE_JOB_TIMEOUT if set; else per-command default; None = no ceiling."""
    e = env if env is not None else os.environ
    if (e.get(ENV_JOB_TIMEOUT) or "").strip():
        return parse_job_timeout_sec(e, default=None)
    cmd = (command or "").strip().lower()
    if cmd in DEFAULT_TIMEOUT_BY_COMMAND:
        return float(DEFAULT_TIMEOUT_BY_COMMAND[cmd])
    return DEFAULT_JOB_TIMEOUT_SEC


def forge_worker_argv(
    forge_script: Path | str,
    cleaned_argv: Sequence[str],
    *,
    python: Optional[str] = None,
) -> list[str]:
    """Build Python forge worker argv: interpreter + script + user args (no meta flags).

    Job workers take an opaque argv list: a future Node worker may start with
    ``node`` and a ``cli/*.mjs`` path. ``spawn_worker`` / ``run_job`` never
    prepend an interpreter — callers pass a complete argv. This helper remains
    the production path for Python mutators until that migrates.
    """
    py = python or sys.executable
    return [py, str(forge_script), *[str(a) for a in cleaned_argv]]
