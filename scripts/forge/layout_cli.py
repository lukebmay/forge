#!/usr/bin/env python3
"""Pure CLI grammar for forge layout multi-target args (WS2). No DBus."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Callable, Optional

# Layout profile names (no : or @ — reserved for workspace targeting).
_NAME_RE = re.compile(r"^[A-Za-z0-9_-]+$")
_COLON_RE = re.compile(r"^(\d+):(.+)$")
_AT_RE = re.compile(r"^(.+)@(\d+)$")

MODE_SEQUENTIAL = "sequential"
MODE_STATIC = "static"


class LayoutParseError(ValueError):
    """User-facing multi-line parse/preflight error (message already shaped)."""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


@dataclass(frozen=True)
class LayoutArg:
    """One parsed argv token before workspace binding."""

    name: str
    workspace_1based: Optional[int]  # None = bare (sequential)
    raw: str
    form: str  # "bare" | "colon" | "at"


@dataclass(frozen=True)
class LayoutTarget:
    """Bound target after preflight (0-based Meta workspace)."""

    name: str
    workspace_0based: int
    workspace_1based: int
    raw: str


def validate_layout_name(name: str) -> str:
    """
    Normalize a bare profile name. Rejects ':' and '@' with reserved message.
    """
    if not name or not isinstance(name, str):
        raise LayoutParseError("profile name required")
    name = name.strip()
    if not name:
        raise LayoutParseError("profile name required")
    if ":" in name or "@" in name:
        raise LayoutParseError(
            "name must not contain ':' or '@' (reserved for workspace targeting)"
        )
    if not _NAME_RE.match(name):
        raise LayoutParseError("invalid profile name (use A-Za-z0-9_-)")
    return name


def parse_layout_arg(token: str) -> LayoutArg:
    """
    Parse one layout argv token into name + optional 1-based workspace.

    Forms:
      bare      name
      colon     N:name   (N is 1-based workspace)
      at        name@N
    """
    if token is None or not isinstance(token, str):
        raise LayoutParseError("empty layout argument")
    raw = token.strip()
    if not raw:
        raise LayoutParseError("empty layout argument")

    m = _COLON_RE.match(raw)
    if m:
        w = int(m.group(1))
        name = m.group(2)
        if w < 1:
            raise LayoutParseError(
                f"workspace {w} out of range (workspace indexes are 1-based)\n"
                f"  got: {raw!r}\n"
                f"  hint: use N:name with N ≥ 1")
        try:
            name = validate_layout_name(name)
        except LayoutParseError as e:
            raise LayoutParseError(f"{e.message}\n  got: {raw!r}") from None
        return LayoutArg(name=name, workspace_1based=w, raw=raw, form="colon")

    m = _AT_RE.match(raw)
    if m:
        name = m.group(1)
        w = int(m.group(2))
        if w < 1:
            raise LayoutParseError(
                f"workspace {w} out of range (workspace indexes are 1-based)\n"
                f"  got: {raw!r}\n"
                f"  hint: use name@N with N ≥ 1")
        try:
            name = validate_layout_name(name)
        except LayoutParseError as e:
            raise LayoutParseError(f"{e.message}\n  got: {raw!r}") from None
        return LayoutArg(name=name, workspace_1based=w, raw=raw, form="at")

    # Bare name — or near-miss forms for better errors
    if ":" in raw:
        raise LayoutParseError(
            f"invalid workspace form {raw!r} (want N:name with N ≥ 1)\n"
            f"  hint: use 1:foo or foo@1, or bare name for current")
    if "@" in raw:
        raise LayoutParseError(
            f"invalid workspace form {raw!r} (want name@N with N ≥ 1)\n"
            f"  hint: use foo@1 or 1:foo, or bare name for current")
    try:
        name = validate_layout_name(raw)
    except LayoutParseError as e:
        raise LayoutParseError(f"{e.message}\n  got: {raw!r}") from None
    return LayoutArg(name=name, workspace_1based=None, raw=raw, form="bare")


def classify_layout_args(tokens: list[str]) -> tuple[str, list[LayoutArg]]:
    """
    Parse all tokens and classify exclusive mode.

    Returns (MODE_SEQUENTIAL | MODE_STATIC, args).
    Mixed bare + numbered → LayoutParseError (apply nothing).
    """
    if not tokens:
        raise LayoutParseError(
            "need at least one layout name\n"
            "  hint: forge layout <name> | forge layout help")
    args = [parse_layout_arg(t) for t in tokens]
    bare = [a for a in args if a.form == "bare"]
    numbered = [a for a in args if a.form != "bare"]
    if bare and numbered:
        b0 = bare[0]
        n0 = numbered[0]
        raise LayoutParseError(
            "cannot mix sequential names and numbered workspaces\n"
            f"  got: bare {b0.raw!r} and {n0.raw!r}\n"
            "  hint: use only bare names (from current) or only N:name / name@N"
        )
    if numbered:
        return MODE_STATIC, args
    return MODE_SEQUENTIAL, args


def bind_layout_targets(
    mode: str,
    args: list[LayoutArg],
    *,
    current_0based: int,
    n_workspaces: int,
) -> list[LayoutTarget]:
    """
    Bind each arg to a 0-based workspace. Preflight range; raise if span fails.
    """
    if not args:
        raise LayoutParseError("need at least one layout name")
    try:
        n_ws = int(n_workspaces)
    except (TypeError, ValueError):
        n_ws = 0
    if n_ws < 1:
        raise LayoutParseError(
            "cannot determine workspace count (session has no workspaces)\n"
            "  hint: ensure GetTree reports nWorkspaces, or use a forest with mon ids"
        )
    try:
        cur = int(current_0based)
    except (TypeError, ValueError):
        cur = 0
    if cur < 0:
        cur = 0
    # Clamp display of current for hints when meta is odd; range checks still use n_ws
    cur_1 = cur + 1

    if mode == MODE_SEQUENTIAL:
        n = len(args)
        last = cur + n - 1
        if last >= n_ws:
            raise LayoutParseError(
                f"need {n} workspaces from current ({cur_1}) for sequential apply; "
                f"session has {n_ws}\n"
                f"  hint: open more workspaces, or use static form (1:foo 2:bar)"
            )
        if cur >= n_ws:
            raise LayoutParseError(
                f"workspace {cur_1} out of range (session has {n_ws} workspaces)\n"
                f"  hint: use 1..{n_ws}, or bare name for current (now: {cur_1})"
            )
        out: list[LayoutTarget] = []
        for i, a in enumerate(args):
            w0 = cur + i
            out.append(
                LayoutTarget(
                    name=a.name,
                    workspace_0based=w0,
                    workspace_1based=w0 + 1,
                    raw=a.raw,
                ))
        return out

    if mode != MODE_STATIC:
        raise LayoutParseError(f"unknown layout mode {mode!r}")

    out = []
    for a in args:
        w1 = int(a.workspace_1based or 0)
        if w1 < 1 or w1 > n_ws:
            raise LayoutParseError(
                f"workspace {w1} out of range (session has {n_ws} workspaces)\n"
                f"  hint: use 1..{n_ws}, or bare name for current (now: {cur_1})"
            )
        out.append(
            LayoutTarget(
                name=a.name,
                workspace_0based=w1 - 1,
                workspace_1based=w1,
                raw=a.raw,
            ))
    return out


def n_workspaces_from_forest(forest: Any) -> Optional[int]:
    """
    Session workspace count from GetTree meta, else max mon ws index + 1.

    Returns None when neither meta nor parseable mon ids are available.
    """
    if not isinstance(forest, dict):
        return None
    raw = forest.get("nWorkspaces")
    if raw is not None:
        try:
            n = int(raw)
            if n >= 1:
                return n
        except (TypeError, ValueError):
            pass
    # Fallback: unique workspaces from monitor ids (moNwsW)
    try:
        from layout_plan import monitor_workspace_index
    except ImportError:
        monitor_workspace_index = None  # type: ignore[assignment]
    mons = forest.get("monitors")
    if not isinstance(mons, list) or monitor_workspace_index is None:
        return None
    wss: set[int] = set()
    for m in mons:
        if not isinstance(m, dict):
            continue
        idx = monitor_workspace_index(m)
        if idx is not None and idx >= 0:
            wss.add(idx)
    if not wss:
        return None
    return max(wss) + 1


def window_candidate_counts(forest: Any,
                            workspace_0based: int) -> tuple[int, int]:
    """
    (on_workspace, ignored_other) window counts for dry-run messaging.
    """
    try:
        from layout_plan import collect_windows
    except ImportError:
        return 0, 0
    all_w = collect_windows(forest)
    on_w = collect_windows(forest, workspace=workspace_0based)
    on_n = len(on_w)
    ignored = max(0, len(all_w) - on_n)
    return on_n, ignored


def format_candidate_line(workspace_1based: int,
                          on_ws: int,
                          ignored: int,
                          *,
                          is_current: bool = False) -> str:
    """Human dry-run candidate line (1-based workspace). is_current unused (ws line)."""
    del is_current  # kept for call-site stability; "(current)" is on workspace line
    if ignored:
        return (f"candidates: {on_ws} on ws{workspace_1based} "
                f"(ignored {ignored} on other workspaces)")
    return f"candidates: {on_ws} on ws{workspace_1based}"


def preflight_layout_run(
    tokens: list[str],
    *,
    current_0based: int,
    n_workspaces: int,
    resolve_name: Optional[Callable[[str], Any]] = None,
) -> tuple[str, list[LayoutTarget], list[Any]]:
    """
    Full preflight: parse mode, bind workspaces, optional profile resolve.

    resolve_name(name) → truthy found object, or falsy / raise.
    When resolve_name returns a mapping with found=False, error with candidates.

    Returns (mode, targets, resolved_list) where resolved_list aligns with
    targets when resolve_name is given, else [].
    """
    mode, args = classify_layout_args(tokens)
    targets = bind_layout_targets(
        mode,
        args,
        current_0based=current_0based,
        n_workspaces=n_workspaces,
    )
    resolved_list: list[Any] = []
    if resolve_name is not None:
        for t in targets:
            try:
                r = resolve_name(t.name)
            except ValueError as e:
                raise LayoutParseError(
                    f"profile {t.name!r} not found\n  {e}\n  hint: forge layout list"
                ) from None
            if isinstance(r, dict) and not r.get("found"):
                cands = r.get("candidates") or []
                looked = ""
                if cands:
                    # Prefer host path fragment for humans
                    first = str(cands[0])
                    looked = f"\n  looked in: {first}"
                    if len(cands) > 1:
                        looked += " …"
                raise LayoutParseError(
                    f"profile {t.name!r} not found{looked}\n  hint: forge layout list"
                )
            if r is None or r is False:
                raise LayoutParseError(
                    f"profile {t.name!r} not found\n  hint: forge layout list")
            resolved_list.append(r)
    return mode, targets, resolved_list
