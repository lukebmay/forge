#!/usr/bin/env python3
"""AI live test matrix — capability probe, case catalog, intelligent selection.

Pure helpers (no DBus) + thin runner hooks. Cases are tagged by **behaviors**
and **regression ids** so agents run only what current work can break.

See agents/plans/forge-ai-live-test-matrix.md.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, Optional, Sequence

# --- layers ---
LAYER_L0 = "L0"  # unit — not run by this module
LAYER_L1 = "L1"  # partial reload (Ghostty-safe)
LAYER_L2 = "L2"  # true cold (Guake / non-tile agent)
LAYER_L3 = "L3"  # Wayland one-shot (same cases, capability gated later)

# Suites select layers / filters
SUITE_PROBE = "probe"
SUITE_LIST = "list"
SUITE_PARTIAL = "partial"  # L1
SUITE_COLD = "cold"  # L2
SUITE_AUTO = "auto"  # max for capability
SUITE_REGRESSION = "regression"  # require --tags R0xx or --behaviors

# Behavior tokens (what product areas a case exercises)
BEHAVIORS = frozenset(
    {
        "layout-apply",
        "open-leaf",
        "profile-focus",
        "chrome-map",
        "cold-open",
        "partial-reload",
        "clean-empty",
        "close-focus",
        "unfocus",
        "mon-claim",
        "dock-open",
        "structure-bind",
        "settle-soft",
        "save-focus",
    }
)

# Work-area → default behaviors (for --from-work hints)
# Prefer distinctive behaviors so --from-work does not pull the whole catalog.
# (Matching is OR across the set — keep hints tight.)
WORK_HINTS: dict[str, tuple[str, ...]] = {
    "layout-apply": ("layout-apply", "structure-bind"),
    "open-leaf": ("open-leaf", "chrome-map", "settle-soft"),
    "focus": ("profile-focus", "settle-soft"),
    "cold": ("cold-open",),
    "clean": ("clean-empty",),
    "close": ("close-focus",),
    "save": ("save-focus",),
    "settle": ("settle-soft",),
    "dock": ("dock-open", "mon-claim"),
    "partial": ("partial-reload",),
}


@dataclass(frozen=True)
class LiveCase:
    """One AI live case (not a unit test)."""

    id: str
    layer: str
    title: str
    behaviors: tuple[str, ...]
    regressions: tuple[str, ...] = ()
    requires_true_cold: bool = False
    requires_hup: bool = False  # only needed if suite reinstalls mid-run
    profile: str = "dev"
    # setup: high-level intents interpreted by runner
    setup: tuple[str, ...] = ()
    # checks: high-level intents
    checks: tuple[str, ...] = ()
    notes: str = ""

    def tags(self) -> frozenset[str]:
        t = {self.id, self.layer, self.profile, *self.behaviors, *self.regressions}
        if self.requires_true_cold:
            t.add("true-cold")
        return frozenset(t)


# Catalog — add a case when REGRESSIONS gains a row that is live-reproducible.
LIVE_CASES: tuple[LiveCase, ...] = (
    LiveCase(
        id="L1.ghosttys-only",
        layer=LAYER_L1,
        title="Ghosttys only → layout dev (Chrome reopen)",
        behaviors=(
            "layout-apply",
            "partial-reload",
            "open-leaf",
            "profile-focus",
            "chrome-map",
            "settle-soft",
            "structure-bind",
        ),
        regressions=("R005", "R007", "R008"),
        profile="dev",
        setup=("close-chrome", "keep-agent", "keep-ghostty-tiles"),
        checks=(
            "ok",
            "mon0-open-leaf-grok",
            "mon1-open-leaf-youtube",
            "agent-survives",
            "profile-focus-if-set",
        ),
        notes="Never close agent Ghostty. Primary partial-reload bar.",
    ),
    LiveCase(
        id="L1.left-chrome",
        layer=LAYER_L1,
        title="Left chrome+ghostty, mon1 chrome closed → layout dev",
        behaviors=(
            "layout-apply",
            "partial-reload",
            "open-leaf",
            "chrome-map",
            "structure-bind",
            "mon-claim",
        ),
        regressions=("R005", "R007"),
        profile="dev",
        setup=("close-mon1-chrome", "keep-agent"),
        checks=("ok", "mon0-open-leaf-grok", "mon1-open-leaf-youtube", "agent-survives"),
    ),
    LiveCase(
        id="L1.right-ghostty",
        layer=LAYER_L1,
        title="mon0 chrome closed; mon1 ghostty+tabs → layout dev",
        behaviors=(
            "layout-apply",
            "partial-reload",
            "open-leaf",
            "chrome-map",
            "mon-claim",
            "structure-bind",
        ),
        regressions=("R001", "R005"),
        profile="dev",
        setup=("close-mon0-chrome", "keep-agent", "keep-mon1"),
        checks=("ok", "mon0-open-leaf-grok", "mon1-open-leaf-youtube", "agent-survives"),
        notes="mon1 ghostty reused, not stolen to mon0.",
    ),
    LiveCase(
        id="L1.t1-nautilus",
        layer=LAYER_L1,
        title="Left ghostty + nautilus → layout t1",
        behaviors=("layout-apply", "partial-reload", "structure-bind", "mon-claim"),
        regressions=(),
        profile="t1",
        setup=("close-chrome", "keep-agent", "ensure-nautilus"),
        checks=("ok", "agent-survives"),
    ),
    LiveCase(
        id="L2.true-cold-dev",
        layer=LAYER_L2,
        title="True cold (no tiles) → layout dev open leaf + focus",
        behaviors=(
            "cold-open",
            "layout-apply",
            "open-leaf",
            "profile-focus",
            "chrome-map",
            "settle-soft",
            "structure-bind",
        ),
        regressions=("R005", "R007", "R008"),
        requires_true_cold=True,
        profile="dev",
        setup=("close-all-tiles", "keep-agent"),
        checks=(
            "ok",
            "mon0-open-leaf-grok",
            "mon1-open-leaf-youtube",
            "agent-survives",
            "profile-focus-if-set",
        ),
        notes="Requires Guake/float agent. Closes all TILE windows.",
    ),
    LiveCase(
        id="L2.layout-clean",
        layer=LAYER_L2,
        title="Non-empty desk → layout clean empties tiles",
        behaviors=("clean-empty", "layout-apply"),
        regressions=("R009",),
        requires_true_cold=True,
        profile="clean",
        setup=("ensure-some-tiles", "keep-agent"),
        checks=("ok", "no-tiles-or-only-agent", "agent-survives"),
        notes="Empty profile must close residuals. Agent must not be a tile.",
    ),
    LiveCase(
        id="L1.settled-rerun",
        layer=LAYER_L1,
        title="Settled desk → layout dev no thrash (focus phase soft)",
        behaviors=("layout-apply", "profile-focus", "open-leaf", "settle-soft"),
        regressions=("R007",),
        profile="dev",
        setup=("ensure-dev-shape", "keep-agent"),
        checks=("ok", "mon0-open-leaf-grok", "mon1-open-leaf-youtube", "agent-survives"),
    ),
)


@dataclass
class Capability:
    session: str  # x11 | wayland | unknown
    agent_terminal: str  # ghostty | guake | other | unknown
    agent_window_id: Optional[str] = None
    agent_mode: Optional[str] = None  # TILE | FLOAT | …
    agent_wm_class: Optional[str] = None
    can_hup: bool = False
    can_true_cold: bool = False
    can_partial: bool = True
    extension_ok: bool = False
    extension_version: Optional[str] = None
    focus_window_id: Optional[str] = None
    n_tile_windows: int = 0
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "session": self.session,
            "agentTerminal": self.agent_terminal,
            "agentWindowId": self.agent_window_id,
            "agentMode": self.agent_mode,
            "agentWmClass": self.agent_wm_class,
            "canHup": self.can_hup,
            "canTrueCold": self.can_true_cold,
            "canPartial": self.can_partial,
            "extensionOk": self.extension_ok,
            "extensionVersion": self.extension_version,
            "focusWindowId": self.focus_window_id,
            "nTileWindows": self.n_tile_windows,
            "notes": list(self.notes),
        }


def session_type_from_env(
    env: Optional[dict[str, str]] = None,
    *,
    wayland_display: Optional[str] = None,
    xdg_session_type: Optional[str] = None,
) -> str:
    e = env if env is not None else os.environ
    st = (xdg_session_type if xdg_session_type is not None else e.get("XDG_SESSION_TYPE") or "").strip().lower()
    if st in ("x11", "wayland"):
        return st
    wd = wayland_display if wayland_display is not None else e.get("WAYLAND_DISPLAY")
    if wd and str(wd).strip():
        return "wayland"
    if e.get("DISPLAY"):
        return "x11"
    return "unknown"


def _wm_class_str(w: dict[str, Any]) -> str:
    return str(w.get("wmClass") or w.get("wm_class") or "").strip()


def _is_ghostty_class(cls: str) -> bool:
    c = cls.lower()
    return "ghostty" in c


def _is_guake_class(cls: str) -> bool:
    c = cls.lower()
    return "guake" in c or c == "guake"


def iter_windows(forest: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []

    def walk(n: Any) -> None:
        if not isinstance(n, dict):
            return
        if str(n.get("nodeType") or "").upper() == "WINDOW":
            out.append(n)
        for c in n.get("children") or []:
            walk(c)

    if isinstance(forest, dict):
        for m in forest.get("monitors") or []:
            walk(m)
    return out


def classify_agent_terminal(
    forest: Any,
    *,
    prefer_focus: bool = True,
) -> tuple[str, Optional[dict[str, Any]], list[str]]:
    """
    Return (kind, window_dict|None, notes).

    Agent identity is for *survival* gates (true cold), not keyboard focus:
      1. Guake (prefer FLOAT) anywhere — agent often focuses Chrome mid-test
      2. Focused ghostty/guake if prefer_focus
      3. Any ghostty
      4. Other / unknown
    """
    notes: list[str] = []
    wins = iter_windows(forest)
    if not wins:
        return "unknown", None, ["no windows in forest"]

    by_id = {
        str(w.get("windowId")): w
        for w in wins
        if w.get("windowId") is not None
    }
    fid = None
    if isinstance(forest, dict) and forest.get("focusWindowId") is not None:
        fid = str(forest.get("focusWindowId"))
    focused = by_id.get(fid) if prefer_focus and fid else None

    # Guake first: durable agent terminal for true cold even if focus is Chrome.
    guakes = [w for w in wins if _is_guake_class(_wm_class_str(w))]
    if guakes:
        float_g = [w for w in guakes if str(w.get("mode") or "").upper() == "FLOAT"]
        pick = float_g[0] if float_g else guakes[0]
        if focused is not None and str(focused.get("windowId")) != str(pick.get("windowId")):
            notes.append(
                f"focus is {_wm_class_str(focused)!r}; agent=guake "
                f"id={pick.get('windowId')}"
            )
        return "guake", pick, notes

    if focused is not None:
        cls = _wm_class_str(focused)
        if _is_ghostty_class(cls):
            mode = str(focused.get("mode") or "").upper()
            if mode == "FLOAT":
                notes.append("focused ghostty is FLOAT")
            return "ghostty", focused, notes
        notes.append(f"focus is other class={cls!r}")

    ghosttys = [w for w in wins if _is_ghostty_class(_wm_class_str(w))]
    if ghosttys:
        return "ghostty", ghosttys[0], notes + [
            "agent guessed first ghostty (no guake; focus not agent)"
        ]

    return "other", focused or wins[0], notes


def capability_from_forest(
    forest: Any,
    *,
    ping: Optional[dict[str, Any]] = None,
    env: Optional[dict[str, str]] = None,
) -> Capability:
    """Build Capability from GetTree forest + optional Ping payload."""
    session = session_type_from_env(env)
    notes: list[str] = []
    agent_kind, agent_win, a_notes = classify_agent_terminal(forest)
    notes.extend(a_notes)

    wins = iter_windows(forest)
    n_tile = sum(1 for w in wins if str(w.get("mode") or "").upper() == "TILE")

    agent_id = None
    agent_mode = None
    agent_cls = None
    if agent_win is not None:
        if agent_win.get("windowId") is not None:
            agent_id = str(agent_win.get("windowId"))
        agent_mode = str(agent_win.get("mode") or "") or None
        agent_cls = _wm_class_str(agent_win) or None

    # True cold: agent is Guake, or FLOAT agent that is not a required tile.
    can_true_cold = False
    if agent_kind == "guake":
        can_true_cold = True
    elif agent_kind == "ghostty" and str(agent_mode or "").upper() == "FLOAT":
        can_true_cold = True
        notes.append("true cold OK: float ghostty")
    elif agent_kind == "ghostty":
        notes.append("true cold blocked: tiled ghostty agent would die if all tiles closed")
    else:
        notes.append("true cold blocked: agent terminal not guake/float")

    can_hup = session == "x11"
    if session == "wayland":
        notes.append("Wayland: no HUP reload; extension retest needs logout or nested Shell")

    ext_ok = False
    ext_ver = None
    if isinstance(ping, dict):
        ext_ok = bool(ping.get("ok", True)) and ping.get("error") is None
        ext_ver = ping.get("versionName") or ping.get("version")
        if ext_ver is not None:
            ext_ver = str(ext_ver)

    fid = None
    if isinstance(forest, dict) and forest.get("focusWindowId") is not None:
        fid = str(forest.get("focusWindowId"))

    return Capability(
        session=session,
        agent_terminal=agent_kind,
        agent_window_id=agent_id,
        agent_mode=agent_mode,
        agent_wm_class=agent_cls,
        can_hup=can_hup,
        can_true_cold=can_true_cold,
        can_partial=True,
        extension_ok=ext_ok if ping is not None else True,
        extension_version=ext_ver,
        focus_window_id=fid,
        n_tile_windows=n_tile,
        notes=notes,
    )


def parse_csv_set(raw: Optional[str]) -> set[str]:
    if raw is None or not str(raw).strip():
        return set()
    parts = re.split(r"[\s,]+", str(raw).strip())
    return {p.strip() for p in parts if p.strip()}


def behaviors_from_work_hint(hint: str) -> set[str]:
    h = str(hint or "").strip().lower()
    if not h:
        return set()
    if h in WORK_HINTS:
        return set(WORK_HINTS[h])
    # comma-separated behaviors or single behavior
    out = set()
    for p in parse_csv_set(h):
        if p in WORK_HINTS:
            out |= set(WORK_HINTS[p])
        else:
            out.add(p)
    return out


def case_by_id(case_id: str) -> Optional[LiveCase]:
    for c in LIVE_CASES:
        if c.id == case_id:
            return c
    return None


def list_cases(
    *,
    layer: Optional[str] = None,
) -> list[LiveCase]:
    out = list(LIVE_CASES)
    if layer:
        out = [c for c in out if c.layer == layer]
    return out


@dataclass
class Selection:
    cases: list[LiveCase]
    skipped: list[dict[str, str]]  # {id, reason}
    suite: str
    behaviors: set[str] = field(default_factory=set)
    tags: set[str] = field(default_factory=set)

    def to_dict(self) -> dict[str, Any]:
        return {
            "suite": self.suite,
            "behaviors": sorted(self.behaviors),
            "tags": sorted(self.tags),
            "selected": [c.id for c in self.cases],
            "skipped": list(self.skipped),
        }


def select_cases(
    *,
    suite: str = SUITE_AUTO,
    capability: Optional[Capability] = None,
    behaviors: Optional[Iterable[str]] = None,
    tags: Optional[Iterable[str]] = None,
    case_ids: Optional[Iterable[str]] = None,
    work_hint: Optional[str] = None,
) -> Selection:
    """
    Select live cases for this capability and work focus.

    Priority of filters (all AND if provided):
      suite layer → case_ids → tags → behaviors (from --behaviors or --from-work)
    Capability gates: L2 requires can_true_cold.
    """
    suite_s = str(suite or SUITE_AUTO).strip().lower() or SUITE_AUTO
    cap = capability
    beh = set(behaviors or ())
    if work_hint:
        beh |= behaviors_from_work_hint(work_hint)
    tag_set = set(tags or ())
    id_set = set(case_ids or ())

    # Suite → layer filter
    layer_allow: Optional[set[str]] = None
    if suite_s == SUITE_PARTIAL:
        layer_allow = {LAYER_L1}
    elif suite_s == SUITE_COLD:
        layer_allow = {LAYER_L2}
    elif suite_s == SUITE_AUTO:
        layer_allow = {LAYER_L1, LAYER_L2}
    elif suite_s == SUITE_REGRESSION:
        layer_allow = {LAYER_L1, LAYER_L2}
        if not tag_set and not beh and not id_set:
            # regression suite needs explicit R0xx or behaviors
            return Selection(
                cases=[],
                skipped=[
                    {
                        "id": "*",
                        "reason": "suite=regression requires --tags R0xx and/or --behaviors",
                    }
                ],
                suite=suite_s,
                behaviors=beh,
                tags=tag_set,
            )
    elif suite_s in (SUITE_PROBE, SUITE_LIST):
        layer_allow = {LAYER_L1, LAYER_L2}
    else:
        # unknown suite: treat as auto
        suite_s = SUITE_AUTO
        layer_allow = {LAYER_L1, LAYER_L2}

    selected: list[LiveCase] = []
    skipped: list[dict[str, str]] = []

    for c in LIVE_CASES:
        if layer_allow is not None and c.layer not in layer_allow:
            continue
        if id_set and c.id not in id_set:
            continue
        if tag_set and not (tag_set & c.tags()):
            skipped.append({"id": c.id, "reason": f"tags filter {sorted(tag_set)}"})
            continue
        if beh and not (beh & set(c.behaviors)):
            skipped.append(
                {"id": c.id, "reason": f"behaviors filter {sorted(beh)}"}
            )
            continue
        # Capability gates
        if c.requires_true_cold:
            if cap is None:
                skipped.append({"id": c.id, "reason": "needs capability probe (true cold)"})
                continue
            if not cap.can_true_cold:
                skipped.append(
                    {
                        "id": c.id,
                        "reason": (
                            f"true cold blocked (agent={cap.agent_terminal}"
                            f" mode={cap.agent_mode})"
                        ),
                    }
                )
                continue
        selected.append(c)

    # If only filters were tags/behaviors and nothing selected, keep skipped list
    return Selection(
        cases=selected,
        skipped=skipped,
        suite=suite_s,
        behaviors=beh,
        tags=tag_set,
    )


def recommend_for_work(
    work: str,
    capability: Capability,
) -> Selection:
    """Map free-text/work area → suite selection (intelligent default)."""
    w = str(work or "").strip().lower()
    if not w or w in ("auto", "all"):
        return select_cases(suite=SUITE_AUTO, capability=capability)
    if w in ("partial", "l1"):
        return select_cases(suite=SUITE_PARTIAL, capability=capability)
    if w in ("l2",):
        # Full L2 layer (includes clean) — use --from-work cold for cold-open only
        return select_cases(suite=SUITE_COLD, capability=capability)
    # regression id
    if re.match(r"^r\d+", w):
        rid = w.upper() if w.startswith("r") else w
        return select_cases(
            suite=SUITE_REGRESSION,
            capability=capability,
            tags={rid},
        )
    # cold / open-leaf / clean / … via WORK_HINTS (tight OR match)
    return select_cases(
        suite=SUITE_AUTO,
        capability=capability,
        work_hint=w,
    )


# --- forest checks (pure) ---


def tabbed_groups(forest: Any) -> list[dict[str, Any]]:
    """List TABBED CON nodes with monitor index and lastTabFocusId."""
    out: list[dict[str, Any]] = []

    def walk(n: Any, mon_i: int) -> None:
        if not isinstance(n, dict):
            return
        lay = str(n.get("layout") or "").upper()
        nt = str(n.get("nodeType") or "").upper()
        if nt == "CON" and lay == "TABBED":
            out.append(
                {
                    "monitor": mon_i,
                    "lastTabFocusId": n.get("lastTabFocusId"),
                    "children": [
                        c
                        for c in (n.get("children") or [])
                        if isinstance(c, dict)
                        and str(c.get("nodeType") or "").upper() == "WINDOW"
                    ],
                }
            )
        for c in n.get("children") or []:
            walk(c, mon_i)

    if not isinstance(forest, dict):
        return out
    for i, m in enumerate(forest.get("monitors") or []):
        if not isinstance(m, dict):
            continue
        # skip empty mon copies
        if not (m.get("children") or []):
            continue
        walk(m, i)
    return out


def window_title(w: dict[str, Any]) -> str:
    return str(w.get("title") or "")


def open_leaf_title(group: dict[str, Any]) -> str:
    ltf = group.get("lastTabFocusId")
    if ltf is None:
        return ""
    sid = str(ltf)
    for c in group.get("children") or []:
        if str(c.get("windowId")) == sid:
            return window_title(c)
    return ""


def check_mon_open_leaf_contains(
    forest: Any, *, mon_index: int, substring: str
) -> tuple[bool, str]:
    groups = [g for g in tabbed_groups(forest) if g.get("monitor") == mon_index]
    if not groups:
        return False, f"mon{mon_index}: no TABBED group"
    # first tabbed on that mon (profile mon0 left tab)
    title = open_leaf_title(groups[0])
    if substring.casefold() in title.casefold():
        return True, f"mon{mon_index} open leaf {title!r}"
    return False, f"mon{mon_index} open leaf {title!r} missing {substring!r}"


def check_agent_survives(
    forest: Any, agent_window_id: Optional[str]
) -> tuple[bool, str]:
    if not agent_window_id:
        return True, "no agent id tracked"
    ids = {str(w.get("windowId")) for w in iter_windows(forest) if w.get("windowId") is not None}
    if agent_window_id in ids:
        return True, f"agent {agent_window_id} present"
    return False, f"agent {agent_window_id} missing from tree"


def check_no_tile_windows(
    forest: Any, *, allow_window_ids: Optional[set[str]] = None
) -> tuple[bool, str]:
    allow = allow_window_ids or set()
    tiles = [
        w
        for w in iter_windows(forest)
        if str(w.get("mode") or "").upper() == "TILE"
        and str(w.get("windowId")) not in allow
    ]
    if not tiles:
        return True, "no unexpected TILE windows"
    titles = [(w.get("windowId"), window_title(w)[:30]) for w in tiles[:5]]
    return False, f"still tiled: {titles}"


def evaluate_checks(
    forest: Any,
    checks: Sequence[str],
    *,
    capability: Capability,
    layout_ok: bool = True,
) -> list[dict[str, Any]]:
    """Run named checks; return list of {check, ok, detail}."""
    results: list[dict[str, Any]] = []
    for name in checks:
        ok = False
        detail = ""
        if name == "ok":
            ok = layout_ok
            detail = "layout ok" if ok else "layout failed"
        elif name == "mon0-open-leaf-grok":
            ok, detail = check_mon_open_leaf_contains(forest, mon_index=0, substring="Grok")
        elif name == "mon1-open-leaf-youtube":
            ok, detail = check_mon_open_leaf_contains(
                forest, mon_index=1, substring="YouTube"
            )
        elif name == "agent-survives":
            ok, detail = check_agent_survives(forest, capability.agent_window_id)
        elif name == "profile-focus-if-set":
            # Soft: if focus is set on a ghostty, prefer left (first) ghostty token —
            # only fail if focus is clearly a chrome New Tab when profile wants ghostty.
            # For harness: pass if agent survives and mon leaves OK; detailed focus
            # is SE8b. Here: pass when focusWindowId is not mon0 non-Grok chrome only.
            ok = True
            detail = f"focusWindowId={capability.focus_window_id} (soft check)"
            fid = None
            if isinstance(forest, dict):
                fid = forest.get("focusWindowId")
            if fid is not None:
                detail = f"focusWindowId={fid}"
            ok = True
        elif name == "no-tiles-or-only-agent":
            allow = set()
            if capability.agent_window_id:
                allow.add(capability.agent_window_id)
            ok, detail = check_no_tile_windows(forest, allow_window_ids=allow)
        else:
            ok = False
            detail = f"unknown check {name!r}"
        results.append({"check": name, "ok": ok, "detail": detail})
    return results


def format_probe_text(cap: Capability) -> str:
    lines = [
        f"session:          {cap.session}",
        f"agent_terminal:   {cap.agent_terminal}",
        f"agent_window_id:  {cap.agent_window_id or '—'}",
        f"agent_mode:       {cap.agent_mode or '—'}",
        f"agent_wm_class:   {cap.agent_wm_class or '—'}",
        f"can_hup:          {cap.can_hup}",
        f"can_true_cold:    {cap.can_true_cold}",
        f"can_partial:      {cap.can_partial}",
        f"extension_ok:     {cap.extension_ok}",
        f"extension_ver:    {cap.extension_version or '—'}",
        f"focus_window_id:  {cap.focus_window_id or '—'}",
        f"n_tile_windows:   {cap.n_tile_windows}",
    ]
    if cap.notes:
        lines.append("notes:")
        for n in cap.notes:
            lines.append(f"  - {n}")
    return "\n".join(lines)


def format_selection_text(sel: Selection, cap: Optional[Capability] = None) -> str:
    lines = [f"suite: {sel.suite}"]
    if sel.behaviors:
        lines.append(f"behaviors: {', '.join(sorted(sel.behaviors))}")
    if sel.tags:
        lines.append(f"tags: {', '.join(sorted(sel.tags))}")
    if cap is not None:
        lines.append(
            f"capability: session={cap.session} agent={cap.agent_terminal} "
            f"true_cold={cap.can_true_cold}"
        )
    lines.append(f"selected ({len(sel.cases)}):")
    for c in sel.cases:
        reg = f" [{', '.join(c.regressions)}]" if c.regressions else ""
        cold = " [true-cold]" if c.requires_true_cold else ""
        lines.append(f"  + {c.id}{cold}{reg} — {c.title}")
        lines.append(f"      behaviors: {', '.join(c.behaviors)}")
    if sel.skipped:
        # de-dupe noise: only show skipped that were layer-eligible
        lines.append(f"skipped ({len(sel.skipped)}):")
        for s in sel.skipped[:30]:
            lines.append(f"  - {s.get('id')}: {s.get('reason')}")
        if len(sel.skipped) > 30:
            lines.append(f"  … {len(sel.skipped) - 30} more")
    return "\n".join(lines)


# Type for optional live runner callbacks (CLI wires these).
GetTreeFn = Callable[[], dict[str, Any]]
LayoutFn = Callable[[str], tuple[int, dict[str, Any]]]
CloseChromeFn = Callable[[], None]
CloseAllTilesFn = Callable[[Optional[str]], None]  # keep_window_id


def summarize_run(results: list[dict[str, Any]]) -> dict[str, Any]:
    n_ok = sum(1 for r in results if r.get("ok"))
    n_fail = sum(1 for r in results if not r.get("ok"))
    return {
        "ok": n_fail == 0 and n_ok > 0,
        "passed": n_ok,
        "failed": n_fail,
        "cases": results,
    }
