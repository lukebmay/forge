"""Log-contract helpers for nest / e2e hunts (JSONL tape).

Assert stable grep tokens agents use with ``forge log --grep``, not full
transcripts or ANSI pretty. Prefer pairing with a state oracle in the test.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Iterable, List, Optional, Sequence


def nest_forge_log_paths(
    config_home: Optional[str] = None,
) -> tuple[Optional[Path], Optional[Path]]:
    """Resolve nest ``forge.log`` + sibling ``forge.jsonl`` from FORGE_CONFIG_HOME.

    Nest Shell sets ``FORGE_CONFIG_HOME=<session>/forge-config``; plog puts the
    human tape at the parent dir (``<session>/forge.log``).
    """
    raw = (
        config_home if config_home is not None else os.environ.get("FORGE_CONFIG_HOME") or ""
    ).strip()
    if not raw:
        # Host tip fallback (non-nest).
        xdg = (os.environ.get("XDG_STATE_HOME") or "").strip()
        base = Path(xdg) if xdg else Path.home() / ".local" / "state"
        log = base / "forge" / "forge.log"
        return log, log.with_suffix(".jsonl")
    cfg = Path(raw)
    log = cfg.parent / "forge.log"
    return log, log.with_suffix(".jsonl")


def read_jsonl_texts(jsonl_path: Path, *, max_lines: int = 5000) -> List[str]:
    """Return ``text`` fields from the last ``max_lines`` JSONL records."""
    if not jsonl_path.is_file():
        return []
    try:
        raw = jsonl_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    lines = raw.splitlines()
    if len(lines) > max_lines:
        lines = lines[-max_lines:]
    out: List[str] = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        text = obj.get("text")
        if isinstance(text, str):
            out.append(text)
    return out


def texts_matching(texts: Sequence[str], token: str) -> List[str]:
    return [t for t in texts if token in t]


def wait_for_log_token(
    token: str,
    *,
    jsonl_path: Optional[Path] = None,
    timeout: float = 5.0,
    poll: float = 0.1,
    since_texts: Optional[Sequence[str]] = None,
) -> str:
    """Block until a JSONL ``text`` contains ``token``. Return the first match.

    If ``since_texts`` is provided, only lines after that snapshot count
    (compare by identity of the joined tail — caller should pass a copy of
    texts collected before the action).
    """
    path = jsonl_path
    if path is None:
        _log, path = nest_forge_log_paths()
    if path is None:
        raise AssertionError("no forge.jsonl path (set FORGE_CONFIG_HOME in nest)")

    baseline = list(since_texts) if since_texts is not None else None
    deadline = time.monotonic() + timeout
    last: List[str] = []
    while time.monotonic() < deadline:
        last = read_jsonl_texts(path)
        candidates = last
        if baseline is not None:
            # New lines only: drop a prefix equal to baseline length when it matches.
            if len(last) >= len(baseline) and last[: len(baseline)] == list(baseline):
                candidates = last[len(baseline) :]
            else:
                # File truncated / rotated — search full tape.
                candidates = last
        hits = texts_matching(candidates, token)
        if hits:
            return hits[0]
        time.sleep(poll)

    sample = " | ".join(last[-5:]) if last else "(empty jsonl)"
    raise AssertionError(
        f"log-contract: token {token!r} not in {path} within {timeout}s; tail={sample}"
    )


def assert_log_tokens(
    tokens: Iterable[str],
    *,
    jsonl_path: Optional[Path] = None,
    since_texts: Optional[Sequence[str]] = None,
) -> None:
    """Assert each token appears at least once (optionally only in new lines)."""
    path = jsonl_path
    if path is None:
        _log, path = nest_forge_log_paths()
    if path is None or not path.is_file():
        raise AssertionError(f"log-contract: missing jsonl at {path}")
    texts = read_jsonl_texts(path)
    if (
        since_texts is not None
        and len(texts) >= len(since_texts)
        and texts[: len(since_texts)] == list(since_texts)
    ):
        texts = texts[len(since_texts) :]
    missing = [t for t in tokens if not texts_matching(texts, t)]
    if missing:
        sample = " | ".join(texts[-8:]) if texts else "(no texts)"
        raise AssertionError(f"log-contract missing {missing} in {path}; tail={sample}")
