#!/usr/bin/env python3
"""Settle heuristics store (SE1/SE9) — pure helpers for hard/soft settle timeouts.

File-backed rolling residual latencies per (host, class, process, residual).
No DBus / process spawn. Schema v1: ~/.config/forge/config/settle-heuristics.json
Bump SCHEMA_VERSION to invalidate; wipe with reset_heuristics_file / forge thrash.

See docs/DECISIONS.md D019 and agents/plans/forge-layout-settle-contract.md.
"""

from __future__ import annotations

import json
import os
import socket
import tempfile
from pathlib import Path
from typing import Any, Mapping, MutableMapping, Optional, Sequence

# --- schema / defaults (SE0 lock; SE9 invalidate/reset) ---

# Bump when entry shape or soft/hard timeout *semantics* change so on-disk
# samples are not reused. load_store treats other versions as empty.
SCHEMA_VERSION = 1
HEURISTICS_FILENAME = "settle-heuristics.json"
DEFAULT_CONFIG_ROOT = Path.home() / ".config" / "forge"
# Nest client_env sets this to <nest_state>/forge-config (CLI isolation; D022/N1).
CONFIG_HOME_ENV = "FORGE_CONFIG_HOME"

HARD_TIMEOUT_MS = 5000
ROLLING_N = 10
PAD = 1.25
LEARNING_TRIAL_SOFT_CAP_MS = 10000

# residual kind → soft floor / clamp (ms)
SOFT_FLOOR_MS: Mapping[str, int] = {
    "focus": 400,
    # geom: match open-default quiet; zero-residual trials do not collapse to 0
    "geom": 200,
}
SOFT_CLAMP_MS: Mapping[str, int] = {
    "focus": 3000,
    "geom": 5000,
}
# Post-move first-ever observe window (full learning trial cap is too long for apply).
GEOM_FIRST_EVER_OBSERVE_MS = 500

PROCESS_KINDS = frozenset({"open", "move", "focus-phase"})
RESIDUAL_KINDS = frozenset({"focus", "geom"})

_KEY_SEP = "|"


def resolve_config_root(
    config_root: Optional[Path] = None,
    env: Optional[Mapping[str, str]] = None,
) -> Path:
    """Forge config root: explicit path, else FORGE_CONFIG_HOME, else ~/.config/forge."""
    if config_root is not None:
        return Path(config_root)
    e = env if env is not None else os.environ
    raw = e.get(CONFIG_HOME_ENV) if e is not None else None
    if raw is not None and str(raw).strip():
        return Path(str(raw).strip()).expanduser()
    return DEFAULT_CONFIG_ROOT


def config_dir(
    config_root: Optional[Path] = None,
    env: Optional[Mapping[str, str]] = None,
) -> Path:
    return resolve_config_root(config_root, env) / "config"


def heuristics_path(
    config_root: Optional[Path] = None,
    env: Optional[Mapping[str, str]] = None,
) -> Path:
    """Resolve settle-heuristics.json under forge config (no existence check)."""
    return config_dir(config_root, env) / HEURISTICS_FILENAME


def normalize_class(wm_class: Any) -> str:
    """Trim + lower-case app class / app id for keys (no titles/roles)."""
    if wm_class is None:
        return ""
    return str(wm_class).strip().lower()


def resolve_host(
    env: Optional[Mapping[str, str]] = None,
    *,
    hostname: Optional[str] = None,
) -> str:
    """FORGE_HOST if set, else short hostname (strip domain)."""
    e = env if env is not None else os.environ
    raw = e.get("FORGE_HOST")
    if raw is not None and str(raw).strip():
        return str(raw).strip().lower()
    name = hostname if hostname is not None else socket.gethostname()
    short = str(name).split(".", 1)[0].strip().lower()
    return short or "unknown"


def make_key(
    host: Any,
    wm_class: Any,
    process_kind: Any,
    residual_kind: Any,
) -> str:
    """Stable entry key: host|class|processKind|residualKind."""
    h = str(host or "").strip().lower() or "unknown"
    c = normalize_class(wm_class) or "unknown"
    pk = str(process_kind or "").strip().lower() or "unknown"
    rk = str(residual_kind or "").strip().lower() or "unknown"
    return _KEY_SEP.join((h, c, pk, rk))


def parse_key(key: str) -> dict[str, str]:
    """Split a make_key result; missing parts → empty strings."""
    parts = str(key or "").split(_KEY_SEP)
    while len(parts) < 4:
        parts.append("")
    return {
        "host": parts[0],
        "class": parts[1],
        "processKind": parts[2],
        "residualKind": parts[3],
    }


def empty_store() -> dict[str, Any]:
    return {
        "version": SCHEMA_VERSION,
        "entries": {},
    }


def empty_entry(
    *,
    host: str = "",
    wm_class: str = "",
    process_kind: str = "",
    residual_kind: str = "",
) -> dict[str, Any]:
    return {
        "host": str(host or ""),
        "class": normalize_class(wm_class),
        "processKind": str(process_kind or "").strip().lower(),
        "residualKind": str(residual_kind or "").strip().lower(),
        "latenciesMs": [],
        "trialCount": 0,
        "zeroResidualCount": 0,
    }


def soft_floor_ms(residual_kind: Any) -> int:
    rk = str(residual_kind or "").strip().lower()
    return int(SOFT_FLOOR_MS.get(rk, 0))


def soft_clamp_ms(residual_kind: Any) -> int:
    rk = str(residual_kind or "").strip().lower()
    return int(SOFT_CLAMP_MS.get(rk, HARD_TIMEOUT_MS))


def learning_trial_soft_cap_ms(residual_kind: Any) -> int:
    """First-ever class: min(10s, soft_clamp * 2)."""
    clamp = soft_clamp_ms(residual_kind)
    return int(min(LEARNING_TRIAL_SOFT_CAP_MS, max(0, clamp * 2)))


def is_first_ever(entry: Any) -> bool:
    """True when missing/empty entry has never been tried."""
    if not isinstance(entry, dict):
        return True
    try:
        return int(entry.get("trialCount") or 0) <= 0
    except (TypeError, ValueError):
        return True


def _nonneg_int(value: Any, default: int = 0) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return default
    return n if n >= 0 else default


def _latency_int(value: Any) -> Optional[int]:
    """Non-negative int latency ms, or None if invalid (match JS finite filter)."""
    if isinstance(value, bool):
        return None
    try:
        fv = float(value)
    except (TypeError, ValueError):
        return None
    if fv != fv or fv in (float("inf"), float("-inf")):  # NaN / ±
        return None
    if fv < 0:
        return None
    return int(fv)  # toward zero for positive (match JS Math.trunc)


def last_rolling_latencies(values: Any, n: int = ROLLING_N) -> list[int]:
    """Last N non-negative finite int latencies (ms); skip invalid."""
    if not isinstance(values, Sequence) or isinstance(values, (str, bytes)):
        return []
    out: list[int] = []
    for v in values:
        ms = _latency_int(v)
        if ms is not None:
            out.append(ms)
    lim = int(n) if isinstance(
        n, (int, float)) and not isinstance(n, bool) else ROLLING_N
    if lim > 0 and len(out) > lim:
        return out[-lim:]
    return out


def soft_timeout_from_latencies(
    latencies: Any,
    *,
    pad: float = PAD,
    floor: int = 0,
    clamp: Optional[int] = None,
) -> int:
    """
    Shared soft-timeout formula (L6 kernel).

    Empty after filter → floor; else int(min(clamp, max(floor, max*pad))).
    Floors/clamps and first-ever policy stay outside this helper.
    """
    p = pad if isinstance(
        pad, (int, float)) and not isinstance(pad, bool) and pad > 0 else PAD
    try:
        fl = int(floor)
    except (TypeError, ValueError):
        fl = 0
    if fl < 0:
        fl = 0
    if clamp is None:
        cl = 2**31 - 1
    else:
        try:
            cl = int(clamp)
        except (TypeError, ValueError, OverflowError):
            cl = 2**31 - 1
        if cl < 0:
            cl = 0

    samples: list[int] = []
    if isinstance(latencies,
                  Sequence) and not isinstance(latencies, (str, bytes)):
        for v in latencies:
            ms = _latency_int(v)
            if ms is not None:
                samples.append(ms)

    if not samples:
        return fl

    raw = max(samples) * float(p)
    return int(min(cl, max(fl, raw)))


def residual_latencies(entry: Any, *, n: int = ROLLING_N) -> list[int]:
    """Last N residual-positive latencies (ms); ignore non-finite / negative."""
    if not isinstance(entry, dict):
        return []
    return last_rolling_latencies(entry.get("latenciesMs"), n)


def soft_timeout_ms(
    entry: Any,
    residual_kind: Any = None,
    *,
    pad: float = PAD,
    rolling_n: int = ROLLING_N,
    floor: Optional[int] = None,
    clamp: Optional[int] = None,
) -> int:
    """
    Soft expectation wait from an entry (or empty).

    - first-ever (trialCount==0): learning trial cap
    - residual-positive samples: max(last N) * pad, floored and clamped
    - trials with only zero residual: floor (do not collapse history to 0)
    """
    rk = residual_kind
    if rk is None and isinstance(entry, dict):
        rk = entry.get("residualKind")
    rk_s = str(rk or "focus").strip().lower() or "focus"

    fl = soft_floor_ms(rk_s) if floor is None else max(0, int(floor))
    cl = soft_clamp_ms(rk_s) if clamp is None else max(0, int(clamp))
    p = pad if isinstance(pad, (int, float)) and pad > 0 else PAD

    if is_first_ever(entry):
        # first-ever uses learning cap, still at least floor
        cap = learning_trial_soft_cap_ms(rk_s)
        return int(min(max(fl, cap), max(cl, cap)))

    lats = residual_latencies(entry, n=rolling_n)
    return soft_timeout_from_latencies(lats, pad=p, floor=fl, clamp=cl)


def record_trial(
    entry: MutableMapping[str, Any],
    *,
    had_residual: bool,
    latency_ms: Optional[int] = None,
    rolling_n: int = ROLLING_N,
) -> dict[str, Any]:
    """
    Mutate entry with one trial outcome. Residual-positive pushes latency;
    zero-residual increments zeroResidualCount only (never writes 0 latency).
    """
    entry["trialCount"] = _nonneg_int(entry.get("trialCount"), 0) + 1
    if not had_residual:
        entry["zeroResidualCount"] = _nonneg_int(
            entry.get("zeroResidualCount"), 0) + 1
        return dict(entry)

    ms = _nonneg_int(latency_ms, 0)
    lats = residual_latencies(entry, n=0)  # all, then trim
    lats.append(ms)
    n = rolling_n if rolling_n > 0 else ROLLING_N
    entry["latenciesMs"] = lats[-n:]
    return dict(entry)


def get_or_create_entry(
    store: MutableMapping[str, Any],
    key: str,
    *,
    host: str = "",
    wm_class: str = "",
    process_kind: str = "",
    residual_kind: str = "",
) -> dict[str, Any]:
    """Return mutable entry for key; create empty if missing."""
    entries = store.setdefault("entries", {})
    if not isinstance(entries, dict):
        store["entries"] = {}
        entries = store["entries"]
    existing = entries.get(key)
    if isinstance(existing, dict):
        return existing
    meta = parse_key(key)
    ent = empty_entry(
        host=host or meta["host"],
        wm_class=wm_class or meta["class"],
        process_kind=process_kind or meta["processKind"],
        residual_kind=residual_kind or meta["residualKind"],
    )
    entries[key] = ent
    return ent


def soft_timeout_for_key(
    store: Any,
    key: str,
    *,
    residual_kind: Optional[str] = None,
) -> int:
    """Lookup soft timeout; missing entry → first-ever learning trial."""
    entries: Any = {}
    if isinstance(store, dict):
        raw = store.get("entries")
        if isinstance(raw, dict):
            entries = raw
    entry = entries.get(key) if key else None
    rk = residual_kind
    if rk is None:
        rk = parse_key(key).get("residualKind") or "focus"
    return soft_timeout_ms(entry if isinstance(entry, dict) else None, rk)


def schema_version_ok(version: Any) -> bool:
    """True when file/store version matches SCHEMA_VERSION."""
    try:
        return int(version) == SCHEMA_VERSION
    except (TypeError, ValueError):
        return False


def store_file_status(path: Any = None) -> dict[str, Any]:
    """
    Inspect on-disk heuristics without treating invalid data as product entries.

    Returns path, exists, valid, version, schemaVersion, entryCount, reason.
    Does not rewrite the file.
    """
    p = Path(path) if path is not None else heuristics_path()
    out: dict[str, Any] = {
        "path": str(p),
        "exists": False,
        "valid": False,
        "version": None,
        "schemaVersion": SCHEMA_VERSION,
        "entryCount": 0,
        "reason": "missing",
    }
    if not p.is_file():
        return out
    out["exists"] = True
    try:
        text = p.read_text(encoding="utf-8")
        data = json.loads(text)
    except (OSError, UnicodeError, json.JSONDecodeError, TypeError):
        out["reason"] = "unreadable"
        return out
    if not isinstance(data, dict):
        out["reason"] = "not-object"
        return out
    ver = data.get("version")
    out["version"] = ver
    if not schema_version_ok(ver):
        out["reason"] = "schema-mismatch"
        return out
    entries = data.get("entries")
    if not isinstance(entries, dict):
        entries = {}
    out["valid"] = True
    out["entryCount"] = sum(1 for k, v in entries.items()
                            if isinstance(k, str) and isinstance(v, dict))
    out["reason"] = "ok"
    return out


def reset_heuristics_file(path: Any = None,
                          *,
                          unlink: bool = False) -> dict[str, Any]:
    """
    Wipe settle heuristics on disk (SE9 operator reset).

    Default: write empty valid schema (version + empty entries).
    unlink=True: remove the file if present (next layout recreates on flush).

    Also clears the process default HeuristicsSession so a later load in this
    process does not keep stale RAM samples.
    """
    p = Path(path) if path is not None else heuristics_path()
    existed = p.is_file()
    prior = store_file_status(p) if existed else None
    try:
        if unlink:
            if existed:
                p.unlink()
            action = "removed" if existed else "missing"
        else:
            save_store(p, empty_store())
            action = "written"
    except OSError as e:
        return {
            "ok": False,
            "path": str(p),
            "action": "error",
            "error": str(e),
            "schemaVersion": SCHEMA_VERSION,
            "prior": prior,
        }
    # Drop process session so next ensure_loaded re-reads (or empty).
    reset_default_session()
    return {
        "ok": True,
        "path": str(p),
        "action": action,
        "existed": existed,
        "schemaVersion": SCHEMA_VERSION,
        "version": SCHEMA_VERSION if action == "written" else None,
        "prior": prior,
    }


def load_store(path: Any) -> dict[str, Any]:
    """
    Read heuristics JSON. Missing/unreadable/bad schema → empty store.
    version mismatch → empty (SE9: bump SCHEMA_VERSION to invalidate on disk).
    Does not rewrite invalid files; use reset_heuristics_file to wipe.
    """
    p = Path(path) if path is not None else heuristics_path()
    try:
        if not p.is_file():
            return empty_store()
        text = p.read_text(encoding="utf-8")
        data = json.loads(text)
    except (OSError, UnicodeError, json.JSONDecodeError, TypeError):
        return empty_store()
    if not isinstance(data, dict):
        return empty_store()
    if not schema_version_ok(data.get("version")):
        return empty_store()
    entries = data.get("entries")
    if not isinstance(entries, dict):
        entries = {}
    # shallow normalize known entries
    clean: dict[str, Any] = {}
    for k, v in entries.items():
        if not isinstance(k, str) or not isinstance(v, dict):
            continue
        meta = parse_key(k)
        ent = empty_entry(
            host=str(v.get("host") or meta["host"]),
            wm_class=str(v.get("class") or meta["class"]),
            process_kind=str(v.get("processKind") or meta["processKind"]),
            residual_kind=str(v.get("residualKind") or meta["residualKind"]),
        )
        ent["trialCount"] = _nonneg_int(v.get("trialCount"), 0)
        ent["zeroResidualCount"] = _nonneg_int(v.get("zeroResidualCount"), 0)
        ent["latenciesMs"] = residual_latencies(v, n=ROLLING_N)
        clean[k] = ent
    return {"version": SCHEMA_VERSION, "entries": clean}


def save_store(path: Any, store: Mapping[str, Any]) -> None:
    """Atomic write of store JSON (creates parent dirs)."""
    p = Path(path) if path is not None else heuristics_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": SCHEMA_VERSION,
        "entries": {},
    }
    raw_entries = store.get("entries") if isinstance(store, Mapping) else None
    if isinstance(raw_entries, dict):
        for k, v in raw_entries.items():
            if not isinstance(k, str) or not isinstance(v, dict):
                continue
            payload["entries"][k] = {
                "host": str(v.get("host") or ""),
                "class": normalize_class(v.get("class")),
                "processKind": str(v.get("processKind") or "").strip().lower(),
                "residualKind": str(v.get("residualKind")
                                    or "").strip().lower(),
                "latenciesMs": residual_latencies(v, n=ROLLING_N),
                "trialCount": _nonneg_int(v.get("trialCount"), 0),
                "zeroResidualCount": _nonneg_int(v.get("zeroResidualCount"),
                                                 0),
            }
    data = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    fd, tmp_name = tempfile.mkstemp(
        prefix=".settle-heuristics.",
        suffix=".tmp",
        dir=str(p.parent),
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_name, p)
    except Exception:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def record_and_soft_timeout(
    store: MutableMapping[str, Any],
    *,
    host: Any,
    wm_class: Any,
    process_kind: Any,
    residual_kind: Any,
    had_residual: bool,
    latency_ms: Optional[int] = None,
) -> tuple[dict[str, Any], int]:
    """
    Ensure entry, optionally record a completed trial, return (entry, soft_timeout_ms).

    When only querying timeout before a trial, call soft_timeout_for_key instead.
    This helper records then recomputes timeout (for end-of-command persist path).
    """
    key = make_key(host, wm_class, process_kind, residual_kind)
    entry = get_or_create_entry(
        store,
        key,
        host=str(host or ""),
        wm_class=normalize_class(wm_class),
        process_kind=str(process_kind or "").strip().lower(),
        residual_kind=str(residual_kind or "").strip().lower(),
    )
    record_trial(entry, had_residual=had_residual, latency_ms=latency_ms)
    timeout = soft_timeout_ms(entry, residual_kind)
    return entry, timeout


# --- process session: load once, accumulate, flush at top-level ---


class HeuristicsSession:
    """In-memory settle store for one process / top-level CLI command.

    Load once on first use. Trials accumulate in RAM (rolling last-N per key).
    Write only via flush() when dirty — call from top-level ops, not subroutines.
    """

    def __init__(self, path: Any = None) -> None:
        self._path = Path(path) if path is not None else None
        self._store: Optional[dict[str, Any]] = None
        self._dirty = False

    @property
    def path(self) -> Path:
        return self._path if self._path is not None else heuristics_path()

    def is_loaded(self) -> bool:
        return self._store is not None

    def is_dirty(self) -> bool:
        return self._dirty

    def ensure_loaded(self) -> dict[str, Any]:
        if self._store is None:
            try:
                self._store = load_store(self.path)
            except Exception:
                self._store = empty_store()
            self._dirty = False
        return self._store

    def store(self) -> dict[str, Any]:
        return self.ensure_loaded()

    def soft_timeout(
        self,
        host: Any,
        wm_class: Any,
        process_kind: Any,
        residual_kind: Any,
    ) -> int:
        st = self.ensure_loaded()
        key = make_key(host, wm_class, process_kind, residual_kind)
        return soft_timeout_for_key(st, key, residual_kind=residual_kind)

    def record(
        self,
        *,
        host: Any,
        wm_class: Any,
        process_kind: Any,
        residual_kind: Any,
        had_residual: bool,
        latency_ms: Optional[int] = None,
    ) -> dict[str, Any]:
        st = self.ensure_loaded()
        key = make_key(host, wm_class, process_kind, residual_kind)
        entry = get_or_create_entry(
            st,
            key,
            host=str(host or ""),
            wm_class=normalize_class(wm_class),
            process_kind=str(process_kind or "").strip().lower(),
            residual_kind=str(residual_kind or "").strip().lower(),
        )
        record_trial(entry, had_residual=had_residual, latency_ms=latency_ms)
        self._dirty = True
        return entry

    def flush(self) -> dict[str, Any]:
        """Atomic write if dirty. No-op when clean or never loaded."""
        if self._store is None:
            return {"persist": "skipped", "reason": "not-loaded"}
        if not self._dirty:
            return {"persist": "skipped", "reason": "clean"}
        try:
            save_store(self.path, self._store)
            self._dirty = False
            return {"persist": "ok"}
        except OSError as e:
            return {"persist": "error", "persistError": str(e)}

    def reset(self) -> None:
        """Drop memory (tests / recovery). Next ensure_loaded re-reads disk."""
        self._store = None
        self._dirty = False


_default_session: Optional[HeuristicsSession] = None


def default_session() -> HeuristicsSession:
    """Process-wide session. One load; flush at top-level command end."""
    global _default_session
    if _default_session is None:
        _default_session = HeuristicsSession()
    return _default_session


def reset_default_session() -> None:
    """Clear process session (tests)."""
    global _default_session
    if _default_session is not None:
        _default_session.reset()
    _default_session = None
