#!/usr/bin/env python3
"""AI live test matrix — capability probe, case catalog, intelligent selection.

Pure helpers (no DBus) + thin runner hooks. Cases are tagged by **behaviors**
and **regression ids** so agents run only what current work can break.

See agents/plans/forge-ai-live-test-matrix.md.
"""

from __future__ import annotations

import json
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
BEHAVIORS = frozenset({
    "layout-apply",
    "open-leaf",
    "profile-focus",
    "chrome-map",
    "cold-open",
    "partial-reload",
    "clean-empty",
    "close-focus",
    "mon-claim",
    "dock-open",
    "structure-bind",
    "settle-soft",
    "save-focus",
    "multi-instance",
    "cross-mon-dnd",
})

# Work-area → default behaviors (for --from-work hints)
# Prefer distinctive behaviors so --from-work does not pull the whole catalog.
# (Matching is OR across the set — keep hints tight.)
WORK_HINTS: dict[str, tuple[str, ...]] = {
    "layout-apply": ("layout-apply", "structure-bind"),
    "open-leaf": ("open-leaf", "chrome-map", "settle-soft"),
    "focus": ("profile-focus", "settle-soft"),
    "cold": ("cold-open", ),
    "clean": ("clean-empty", ),
    "close": ("close-focus", ),
    "save": ("save-focus", ),
    "settle": ("settle-soft", ),
    "dock": ("dock-open", "mon-claim"),
    "partial": ("partial-reload", ),
    "multi-instance": ("multi-instance", ),
    "dnd": ("cross-mon-dnd", "structure-bind"),
    "tab-dnd": ("cross-mon-dnd", "structure-bind"),
    "wayland-rc": (
        "layout-apply",
        "open-leaf",
        "partial-reload",
        "settle-soft",
        "close-focus",
        "multi-instance",
        "structure-bind",
        "mon-claim",
    ),
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
    # setup: high-level intents interpreted by runner (before optional layout)
    setup: tuple[str, ...] = ()
    # actions: post-setup intents (focus/close/unfocus); empty → layout profile only
    actions: tuple[str, ...] = ()
    # If False, skip forge layout <profile> (action-only cases).
    run_layout: bool = True
    # checks: high-level intents
    checks: tuple[str, ...] = ()
    notes: str = ""

    def tags(self) -> frozenset[str]:
        t = {
            self.id, self.layer, self.profile, *self.behaviors,
            *self.regressions
        }
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
        regressions=("R005", "R007", "R008", "R011", "R013", "R014"),
        profile="_forge-test-dual",
        setup=("close-chrome", "keep-agent", "keep-ghostty-tiles"),
        checks=(
            "ok",
            "mon0-open-leaf-grok",
            "mon1-open-leaf-youtube",
            "agent-survives",
            "profile-focus-if-set",
        ),
        notes=
        "Never close agent Ghostty. Uses _forge-test-dual (not personal dev).",
    ),
    LiveCase(
        id="L1.left-chrome",
        layer=LAYER_L1,
        title=
        "Left chrome+ghostty, mon1 chrome closed → layout _forge-test-dual",
        behaviors=(
            "layout-apply",
            "partial-reload",
            "open-leaf",
            "chrome-map",
            "structure-bind",
            "mon-claim",
        ),
        regressions=("R005", "R007"),
        profile="_forge-test-dual",
        setup=("close-mon1-chrome", "keep-agent"),
        checks=("ok", "mon0-open-leaf-grok", "mon1-open-leaf-youtube",
                "agent-survives"),
    ),
    LiveCase(
        id="L1.right-ghostty",
        layer=LAYER_L1,
        title="mon0 chrome closed; mon1 ghostty+tabs → layout _forge-test-dual",
        behaviors=(
            "layout-apply",
            "partial-reload",
            "open-leaf",
            "chrome-map",
            "mon-claim",
            "structure-bind",
        ),
        regressions=("R001", "R005", "R011", "R013", "R014"),
        profile="_forge-test-dual",
        setup=("close-mon0-chrome", "keep-agent", "keep-mon1"),
        checks=("ok", "mon0-open-leaf-grok", "mon1-open-leaf-youtube",
                "agent-survives"),
        notes="mon1 ghostty reused, not stolen to mon0.",
    ),
    LiveCase(
        id="L1.t1-nautilus",
        layer=LAYER_L1,
        title="Left ghostty + nautilus → layout _forge-test-nautilus",
        behaviors=("layout-apply", "partial-reload", "structure-bind",
                   "mon-claim"),
        regressions=(),
        profile="_forge-test-nautilus",
        setup=("close-chrome", "keep-agent", "ensure-nautilus"),
        checks=("ok", "agent-survives"),
        notes="Dedicated test profile (not personal t1).",
    ),
    LiveCase(
        id="L2.true-cold-dev",
        layer=LAYER_L2,
        title=
        "True cold (no tiles) → layout _forge-test-dual open leaf + focus",
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
        profile="_forge-test-dual",
        setup=("close-all-tiles", "keep-agent"),
        checks=(
            "ok",
            "mon0-open-leaf-grok",
            "mon1-open-leaf-youtube",
            "agent-survives",
            "profile-focus-if-set",
        ),
        notes=(
            "True cold: Guake/float agent, OR durable Grok leader "
            "(GROK_LEADER_SOCKET) — agent TILE may close; process survives."),
    ),
    LiveCase(
        id="L2.layout-clean",
        layer=LAYER_L2,
        title="Non-empty desk → layout _forge-test-clean empties tiles",
        behaviors=("clean-empty", "layout-apply"),
        regressions=("R009", ),
        requires_true_cold=True,
        profile="_forge-test-clean",
        setup=("ensure-some-tiles", "keep-agent"),
        checks=("ok", "no-tiles-or-only-agent", "agent-survives"),
        notes="Empty test profile closes residuals. Agent must not be a tile.",
    ),
    LiveCase(
        id="L1.settled-rerun",
        layer=LAYER_L1,
        title="Settled desk → layout _forge-test-dual no thrash (focus soft)",
        behaviors=("layout-apply", "profile-focus", "open-leaf",
                   "settle-soft"),
        regressions=("R007", ),
        profile="_forge-test-dual",
        setup=("ensure-dev-shape", "keep-agent"),
        checks=("ok", "mon0-open-leaf-grok", "mon1-open-leaf-youtube",
                "agent-survives"),
        notes="ensure-dev-shape bootstraps via _forge-test-dual when needed.",
    ),
    LiveCase(
        id="L1.close-focus-lft",
        layer=LAYER_L1,
        title=
        "Close focused chrome → focus lands on remaining TILE (LFT/sibling)",
        behaviors=("close-focus", ),
        regressions=(),
        profile="_forge-test-dual",
        setup=("ensure-dev-shape", "keep-agent"),
        actions=("focus-disposable-chrome", "close-focus"),
        run_layout=False,
        checks=("ok", "focus-is-tile", "closed-gone", "agent-survives"),
        notes=
        "FC3: does not re-open closed chrome; desk may need layout after run.",
    ),
    # L1.unfocus abandoned — Ctrl+Super+Esc product surface removed.
    LiveCase(
        id="L1.ghosttys-multi",
        layer=LAYER_L1,
        title=
        "Chrome closed → layout _forge-test-ghosttys dual mon multi-instance",
        behaviors=(
            "layout-apply",
            "partial-reload",
            "multi-instance",
            "structure-bind",
            "mon-claim",
        ),
        regressions=("R010", ),
        profile="_forge-test-ghosttys",
        setup=("close-chrome", "keep-agent", "keep-ghostty-tiles"),
        checks=(
            "ok",
            "dual-ghostty-mons",
            "agent-survives",
        ),
        notes="Test profile multi-instance; not personal ghosttys/dev.",
    ),
    LiveCase(
        id="L1.r012-cross-mon-tab-dnd",
        layer=LAYER_L1,
        title=
        "Cross-mon center tab-join Nautilus → mon0 Ghostty (R012 mid-drag rehome)",
        behaviors=(
            "cross-mon-dnd",
            "structure-bind",
            "partial-reload",
            "mon-claim",
        ),
        regressions=("R012", ),
        profile="_forge-test-ghosttys",
        setup=("close-chrome", "keep-agent", "keep-ghostty-tiles",
               "ensure-nautilus"),
        # After layout: tab Nautilus with mon1 Ghostty, then dnd-drop center onto mon0 Ghostty
        # (synthetic GRAB_TILE + entered-monitor probe via RunSteps dnd-drop).
        actions=("r012-tab-mon1-then-center-join-mon0", ),
        run_layout=True,
        checks=(
            "ok",
            "agent-survives",
            "nautilus-tabbed-with-mon0-ghostty",
        ),
        notes=(
            "R012: mid-drag entered-monitor must not rehome to mon HSPLIT. "
            "L0 unit: bug-r012-grabtile-no-mid-drag-rehome. "
            "Harness uses RunSteps dnd-drop (center + simulateEnteredMonitor). "
            "Optional human smoke: Super-drag Nautilus center onto mon0 Ghostty."
        ),
    ),
    LiveCase(
        id="L1.r015-empty-mon-dnd",
        layer=LAYER_L1,
        title="Empty mon1 drag-drop rehome (R015 snap-back)",
        behaviors=(
            "cross-mon-dnd",
            "structure-bind",
            "mon-claim",
        ),
        regressions=("R015", ),
        profile="_forge-test-ghosttys",
        setup=("close-chrome", "keep-agent", "keep-ghostty-tiles",
               "ensure-nautilus"),
        actions=("r015-empty-mon1-dnd", ),
        run_layout=True,
        checks=(
            "ok",
            "agent-survives",
            "tile-on-mon1",
        ),
        notes=(
            "R015: grab-end over empty mon must rehome (not snap back). "
            "L0 unit: bug-r015-empty-mon-dnd. "
            "Harness: clear mon1 tiles, dnd-drop tile destMonitor=1. "
            "Optional human: drag TILE from mon0 onto empty mon1 work area."
        ),
    ),
    LiveCase(
        id="L1.r021-empty-head-open",
        layer=LAYER_L1,
        title="Open on empty mon1 must not attach left-tree end (R021)",
        behaviors=(
            "dock-open",
            "mon-claim",
            "cross-mon-dnd",
        ),
        regressions=("R021", ),
        profile="_forge-test-ghosttys",
        setup=("close-chrome", "keep-agent", "keep-ghostty-tiles"),
        actions=("r021-empty-head-open-note", ),
        run_layout=True,
        checks=(
            "ok",
            "agent-survives",
        ),
        notes=(
            "R021: pointer/dock on empty dest mon homes there, not after "
            "occupied-mon LFT. L0: lft-mru + open-app-policy + "
            "bug-r021-r024-open-drop-layout. Human: two tiles on left, "
            "open from right dock onto empty right."
        ),
    ),
    LiveCase(
        id="L1.r022-nested-empty-mon-dnd",
        layer=LAYER_L1,
        title="Nested VSPLIT leaf to empty mon1 moves only that leaf (R022)",
        behaviors=(
            "cross-mon-dnd",
            "structure-bind",
            "mon-claim",
        ),
        regressions=("R022", ),
        profile="_forge-test-ghosttys",
        setup=("close-chrome", "keep-agent", "keep-ghostty-tiles",
               "ensure-nautilus"),
        actions=("r022-nested-empty-mon1-dnd", ),
        run_layout=True,
        checks=(
            "ok",
            "agent-survives",
            "tile-on-mon1",
        ),
        notes=(
            "R022: HSPLIT(A, VSPLIT(B,C)) drag C to empty mon1 → only C "
            "moves. L0: bug-r015-empty-mon-dnd nested case. Human: same."
        ),
    ),
    LiveCase(
        id="L1.r023-bottom-nest-hsplit",
        layer=LAYER_L1,
        title="BOTTOM onto MONITOR HSPLIT nests VSPLIT (R023)",
        behaviors=(
            "cross-mon-dnd",
            "structure-bind",
        ),
        regressions=("R023", ),
        profile="_forge-test-ghosttys",
        setup=("close-chrome", "keep-agent", "keep-ghostty-tiles",
               "ensure-nautilus"),
        actions=("r023-bottom-nest-hsplit", ),
        run_layout=True,
        checks=(
            "ok",
            "agent-survives",
        ),
        notes=(
            "R023: BOTTOM on left of 2-wide HSPLIT → HSPLIT(VSPLIT, sibling), "
            "not 3-wide HSPLIT. L0: drag-drop-comprehensive + "
            "bug-r021-r024-open-drop-layout. Human: drop bottom zone."
        ),
    ),
    LiveCase(
        id="L1.r024-first-layout-tiles",
        layer=LAYER_L1,
        title="First layout apply must TILE (not FLOAT geometry) (R024)",
        behaviors=(
            "layout-apply",
            "structure-bind",
        ),
        regressions=("R024", ),
        profile="_forge-test-ghosttys",
        setup=("close-chrome", "keep-agent", "keep-ghostty-tiles"),
        actions=("r024-first-layout-tiles-note", ),
        run_layout=True,
        checks=(
            "ok",
            "agent-survives",
        ),
        notes=(
            "R024: first forge layout must paint TILE slots. Leftover freeze "
            "/ stale render idle must not skip commit. L0: "
            "bug-r021-r024-open-drop-layout R024. Human: layout once after "
            "a drag session; windows must not stay floated."
        ),
    ),
    LiveCase(
        id="L1.r016-noop-workareas",
        layer=LAYER_L1,
        title="No-op monitor re-apply must not thrash tiles (R016)",
        behaviors=(
            "structure-bind",
            "mon-claim",
            "settle-soft",
        ),
        regressions=("R016", ),
        profile="_forge-test-dual",
        setup=("ensure-dev-shape", "keep-agent"),
        actions=("r016-noop-workareas-note", ),
        run_layout=True,
        checks=(
            "ok",
            "agent-survives",
            "mon0-open-leaf-grok",
            "mon1-open-leaf-youtube",
        ),
        notes=(
            "R016: geometry-identical workareas re-apply → no H1 thrash. "
            "L0: workareas-policy + bug-r016-noop-workareas-no-thrash. "
            "No automated Mutter ApplyMonitorsConfig helper yet — after dual "
            "desk settles, operator/harness may fire same-config apply "
            "(gdisplays load when already correct, or D-Bus apply of live "
            "serial). Expect structure/mon homes/focus stable; Mode B "
            "thrash-recover must not count as success. "
            "Action stub records intent until inject path exists."
        ),
    ),
    LiveCase(
        id="L1.r017-gdisplays-scale-retile",
        layer=LAYER_L1,
        title="gdisplays scale/mode change must retile without entered-monitor thrash (R017)",
        behaviors=(
            "structure-bind",
            "mon-claim",
            "settle-soft",
        ),
        regressions=("R017", ),
        profile="_forge-test-dual",
        setup=("ensure-dev-shape", "keep-agent"),
        actions=("r017-gdisplays-scale-retile-note", ),
        run_layout=True,
        checks=(
            "ok",
            "agent-survives",
            "mon0-open-leaf-grok",
            "mon1-open-leaf-youtube",
        ),
        notes=(
            "R017: scale/mode geometry change (e.g. gdisplays load default-no-scale "
            "1.5→1.0) must keep mon homes + tabs; settle = workareas-retile only. "
            "L0: bug-r017-display-geom-change-no-entered-monitor-thrash. "
            "Manual: forge layout <dual profile>, capture topology signature, "
            "gdisplays load default-no-scale, assert structure/mon intact, then "
            "gdisplays load default && forge layout <same>. Do not treat Mode B "
            "as success. No automated ApplyMonitorsConfig inject yet."
        ),
    ),
    LiveCase(
        id="L1.r026-tab-click-adopts-pin",
        layer=LAYER_L1,
        title="After layout, tab-click of a sibling must stay (R026)",
        behaviors=(
            "open-leaf",
            "settle-soft",
            "layout-apply",
        ),
        regressions=("R026", ),
        profile="_forge-test-dual",
        setup=("ensure-dev-shape", "keep-agent"),
        actions=("r026-tab-click-adopts-pin-note", ),
        run_layout=True,
        checks=(
            "ok",
            "agent-survives",
        ),
        notes=(
            "R026: immediately after forge layout, click the non-open tab "
            "(e.g. Chrome while Grok is pinned). It must stay; must not flash "
            "and snap back. Second click must not be required. L0: "
            "action-pipeline R026. 1-mon host: same on the single tab group. "
            "Human: click the other tab right after layout returns."
        ),
    ),
    LiveCase(
        id="L1.r027-chrome-until-ready",
        layer=LAYER_L1,
        title="Apply chrome stays up through focus/soft and blocks clicks (R027)",
        behaviors=(
            "layout-apply",
            "settle-soft",
            "open-leaf",
        ),
        regressions=("R027", ),
        profile="_forge-test-dual",
        setup=("ensure-dev-shape", "keep-agent"),
        actions=("r027-chrome-until-ready-note", ),
        run_layout=True,
        checks=(
            "ok",
            "agent-survives",
        ),
        notes=(
            "R027: loading overlay must cover no-open apply through focus/soft "
            "and eat pointer (no tab click-through). Clears when the command "
            "returns. L0: session-api chrome-show. Human: layout a settled "
            "desk; overlay visible until forge returns; clicks do nothing."
        ),
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
    can_nested: bool = False  # host Wayland → forge nested for JS reload
    can_retest: bool = False  # can_hup or can_nested
    can_true_cold: bool = False
    # Durable leader: agent TILE may close; process survives (reattach after).
    agent_window_optional: bool = False
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
            "canNested": self.can_nested,
            "canRetest": self.can_retest,
            "canTrueCold": self.can_true_cold,
            "agentWindowOptional": self.agent_window_optional,
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
    st = (xdg_session_type if xdg_session_type is not None else
          e.get("XDG_SESSION_TYPE") or "").strip().lower()
    if st in ("x11", "wayland"):
        return st
    wd = wayland_display if wayland_display is not None else e.get(
        "WAYLAND_DISPLAY")
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


def iter_windows_with_mon(forest: Any) -> list[tuple[int, dict[str, Any]]]:
    """Windows with tiling-tree monitor index (tree walk is layout authority)."""
    out: list[tuple[int, dict[str, Any]]] = []

    def walk(n: Any, mon_i: int) -> None:
        if not isinstance(n, dict):
            return
        if str(n.get("nodeType") or "").upper() == "WINDOW":
            out.append((mon_i, n))
            return
        for c in n.get("children") or []:
            walk(c, mon_i)

    if isinstance(forest, dict):
        for i, m in enumerate(forest.get("monitors") or []):
            if not isinstance(m, dict):
                continue
            walk(m, i)
    return out


def _is_chrome_family_wm_class(cls: str) -> bool:
    c = (cls or "").lower()
    return "chrome" in c or "chromium" in c or "brave" in c


def _is_nautilus_wm_class(cls: str) -> bool:
    c = (cls or "").lower()
    return "nautilus" in c or c in ("org.gnome.nautilus",
                                    "org.gnome.Nautilus".lower())


def select_chrome_tile_ids(
    forest: Any,
    *,
    mon_index: Optional[int] = None,
) -> list[str]:
    """
    TILE chrome-family window ids, optionally restricted to a tree monitor index.

    mon_index=None → all monitors (close-chrome).
    mon_index=0|1|… → that mon only (close-monN-chrome).
    """
    ids: list[str] = []
    for mon_i, w in iter_windows_with_mon(forest):
        if mon_index is not None and mon_i != mon_index:
            continue
        if str(w.get("mode") or "").upper() != "TILE":
            continue
        if not _is_chrome_family_wm_class(_wm_class_str(w)):
            continue
        wid = w.get("windowId")
        if wid is None:
            continue
        ids.append(str(wid))
    return ids


def forest_has_nautilus(forest: Any) -> bool:
    for w in iter_windows(forest):
        if _is_nautilus_wm_class(_wm_class_str(w)):
            return True
    return False


def _window_parent_chain_layouts(forest: Any, window_id: Any) -> list[dict[str, Any]]:
    """Walk forest and return parent CON/MONITOR nodes for a window id (rootward)."""
    if not isinstance(forest, dict) or window_id is None:
        return []
    want = str(window_id)
    found: list[dict[str, Any]] = []

    def walk(n: Any, ancestors: list[dict[str, Any]]) -> bool:
        if not isinstance(n, dict):
            return False
        nt = str(n.get("nodeType") or "").upper()
        if nt == "WINDOW" and str(n.get("windowId")) == want:
            found.extend(reversed(ancestors))
            return True
        next_anc = ancestors
        if nt in ("CON", "MONITOR", "WORKSPACE"):
            next_anc = ancestors + [n]
        for c in n.get("children") or []:
            if walk(c, next_anc):
                return True
        return False

    for m in forest.get("monitors") or []:
        if walk(m, []):
            break
    return found


def check_tile_on_mon(forest: Any, mon_index: int = 1) -> tuple[bool, str]:
    """R015: at least one TILE on the given monitor (empty-mon drop landed)."""
    if not isinstance(forest, dict):
        return False, "no forest"
    count = 0
    for mon_i, w in iter_windows_with_mon(forest):
        if mon_i != mon_index:
            continue
        if str(w.get("mode") or "").upper() != "TILE":
            continue
        count += 1
    if count < 1:
        return False, f"no TILE on mon{mon_index}"
    return True, f"{count} TILE(s) on mon{mon_index}"


def check_nautilus_tabbed_with_mon0_ghostty(forest: Any) -> tuple[bool, str]:
    """
    R012: Nautilus and a mon0 Ghostty share a TABBED CON (not mon-level HSPLIT siblings).
    """
    if not isinstance(forest, dict):
        return False, "no forest"
    mons = forest.get("monitors") or []
    if not mons:
        return False, "no monitors"

    nautilus_ids: list[str] = []
    mon0_ghostty_ids: list[str] = []
    for mon_i, w in iter_windows_with_mon(forest):
        if str(w.get("mode") or "").upper() != "TILE":
            continue
        cls = _wm_class_str(w)
        wid = w.get("windowId")
        if wid is None:
            continue
        sid = str(wid)
        if _is_nautilus_wm_class(cls):
            nautilus_ids.append(sid)
        if mon_i == 0 and _is_ghostty_class(cls):
            mon0_ghostty_ids.append(sid)

    if not nautilus_ids:
        return False, "no TILE Nautilus"
    if not mon0_ghostty_ids:
        return False, "no TILE Ghostty on mon0"

    # Same TABBED parent for some nautilus + mon0 ghostty pair.
    for nid in nautilus_ids:
        n_chain = _window_parent_chain_layouts(forest, nid)
        n_tab_parents = [
            p for p in n_chain
            if str(p.get("layout") or "").upper() == "TABBED"
        ]
        if not n_tab_parents:
            continue
        for gid in mon0_ghostty_ids:
            g_chain = _window_parent_chain_layouts(forest, gid)
            g_tab_parents = [
                p for p in g_chain
                if str(p.get("layout") or "").upper() == "TABBED"
            ]
            # Identity: same lastTabFocus group / overlapping child sets via window ids
            # Prefer structural identity: both under a TABBED that contains both ids.
            for tab in n_tab_parents:
                tab_ids = {
                    str(w.get("windowId"))
                    for w in _iter_windows_under(tab)
                    if w.get("windowId") is not None
                }
                if nid in tab_ids and gid in tab_ids:
                    return True, f"TABBED mon0-ish group holds nautilus={nid} ghostty={gid}"
            for tab in g_tab_parents:
                tab_ids = {
                    str(w.get("windowId"))
                    for w in _iter_windows_under(tab)
                    if w.get("windowId") is not None
                }
                if nid in tab_ids and gid in tab_ids:
                    return True, f"TABBED holds nautilus={nid} mon0 ghostty={gid}"

    # Failure detail: mon0 HSPLIT siblings?
    return (
        False,
        f"Nautilus {nautilus_ids} not TABBED with mon0 Ghostty {mon0_ghostty_ids}",
    )


def _iter_windows_under(node: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []

    def walk(n: Any) -> None:
        if not isinstance(n, dict):
            return
        if str(n.get("nodeType") or "").upper() == "WINDOW":
            out.append(n)
            return
        for c in n.get("children") or []:
            walk(c)

    walk(node)
    return out


def forest_looks_like_dev_shape(forest: Any) -> tuple[bool, str]:
    """
    Cheap dual-mon 'dev desk' shape: non-empty mon0/mon1, a TABBED group on each,
    at least one ghostty TILE and one chrome-family TILE.
    """
    if not isinstance(forest, dict):
        return False, "no forest"
    mons = forest.get("monitors") or []
    non_empty = [
        i for i, m in enumerate(mons)
        if isinstance(m, dict) and (m.get("children") or [])
    ]
    if len(non_empty) < 2:
        return False, f"need ≥2 non-empty mons, have {non_empty}"
    tabs = tabbed_groups(forest)
    mons_with_tab = {g.get("monitor") for g in tabs}
    if 0 not in mons_with_tab or 1 not in mons_with_tab:
        return False, f"need TABBED on mon0 and mon1, have {sorted(mons_with_tab)}"
    has_ghostty = False
    has_chrome = False
    for w in iter_windows(forest):
        if str(w.get("mode") or "").upper() != "TILE":
            continue
        cls = _wm_class_str(w)
        if _is_ghostty_class(cls):
            has_ghostty = True
        if _is_chrome_family_wm_class(cls):
            has_chrome = True
    if not has_ghostty:
        return False, "no ghostty TILE"
    if not has_chrome:
        return False, "no chrome TILE"
    return True, "dev-shape ok (tabbed mon0+mon1, ghostty+chrome tiles)"


def forest_has_some_tiles(forest: Any,
                          *,
                          allow_window_ids: Optional[set[str]] = None) -> bool:
    allow = allow_window_ids or set()
    for w in iter_windows(forest):
        if str(w.get("mode") or "").upper() != "TILE":
            continue
        wid = w.get("windowId")
        if wid is not None and str(wid) in allow:
            continue
        return True
    return False


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
        for w in wins if w.get("windowId") is not None
    }
    fid = None
    if isinstance(forest, dict) and forest.get("focusWindowId") is not None:
        fid = str(forest.get("focusWindowId"))
    focused = by_id.get(fid) if prefer_focus and fid else None

    # Guake first: durable agent terminal for true cold even if focus is Chrome.
    guakes = [w for w in wins if _is_guake_class(_wm_class_str(w))]
    if guakes:
        float_g = [
            w for w in guakes if str(w.get("mode") or "").upper() == "FLOAT"
        ]
        pick = float_g[0] if float_g else guakes[0]
        if focused is not None and str(focused.get("windowId")) != str(
                pick.get("windowId")):
            notes.append(f"focus is {_wm_class_str(focused)!r}; agent=guake "
                         f"id={pick.get('windowId')}")
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

    # True cold: Guake/float agent, OR durable Grok leader (process survives
    # agent TILE death — headless/leader mode). Closing all tiles still loses
    # the agent *window*; reattach after L2 (new Ghostty + grok reattach).
    e = env if env is not None else os.environ
    can_true_cold = False
    leader_sock = str(e.get("GROK_LEADER_SOCKET") or "").strip()
    leader_ok = False
    if leader_sock:
        try:
            import stat as _stat

            st = os.stat(leader_sock)
            leader_ok = _stat.S_ISSOCK(st.st_mode)
        except OSError:
            leader_ok = False
    agent_window_optional = False
    if agent_kind == "guake":
        can_true_cold = True
    elif agent_kind == "ghostty" and str(agent_mode or "").upper() == "FLOAT":
        can_true_cold = True
        notes.append("true cold OK: float ghostty")
    elif leader_ok:
        can_true_cold = True
        agent_window_optional = True
        notes.append(
            "true cold OK: durable Grok leader "
            "(agent TILE may close; process survives — reattach after)")
    elif agent_kind == "ghostty":
        notes.append(
            "true cold blocked: tiled ghostty agent would die if all tiles closed"
        )
    else:
        notes.append("true cold blocked: agent terminal not guake/float")

    can_hup = session == "x11"
    # Nested Wayland retest (AT-W1): prefer forge nested over logout on Wayland.
    can_nested = False
    if session == "wayland":
        try:
            from nested_wayland import can_nested_on_host

            can_nested = bool(
                can_nested_on_host(env if env is not None else None))
        except Exception:
            can_nested = False
        if can_nested:
            notes.append(
                "Wayland: no HUP — reload extension via "
                "`forge nested restart` (not logout). Dual-mon live still host desk."
            )
        else:
            notes.append("Wayland: no HUP; nested unavailable — "
                         "`forge nested doctor` or logout once after install")
    elif session == "x11":
        notes.append(
            "X11: reload via HUP (`killall -HUP gnome-shell`). "
            "`forge nested` refuses here (exit 2) — nest is Wayland-host only."
        )

    can_retest = bool(can_hup or can_nested)

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
        can_nested=can_nested,
        can_retest=can_retest,
        can_true_cold=can_true_cold,
        agent_window_optional=agent_window_optional,
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
                skipped=[{
                    "id":
                    "*",
                    "reason":
                    "suite=regression requires --tags R0xx and/or --behaviors",
                }],
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
            skipped.append({
                "id": c.id,
                "reason": f"tags filter {sorted(tag_set)}"
            })
            continue
        if beh and not (beh & set(c.behaviors)):
            skipped.append({
                "id": c.id,
                "reason": f"behaviors filter {sorted(beh)}"
            })
            continue
        # Capability gates
        if c.requires_true_cold:
            if cap is None:
                skipped.append({
                    "id": c.id,
                    "reason": "needs capability probe (true cold)"
                })
                continue
            if not cap.can_true_cold:
                skipped.append({
                    "id":
                    c.id,
                    "reason": (f"true cold blocked (agent={cap.agent_terminal}"
                               f" mode={cap.agent_mode})"),
                })
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
    if w in ("l2", ):
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
            out.append({
                "monitor":
                mon_i,
                "lastTabFocusId":
                n.get("lastTabFocusId"),
                "children": [
                    c for c in (n.get("children") or [])
                    if isinstance(c, dict)
                    and str(c.get("nodeType") or "").upper() == "WINDOW"
                ],
            })
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


def open_leaf_window(group: dict[str, Any]) -> Optional[dict[str, Any]]:
    ltf = group.get("lastTabFocusId")
    if ltf is None:
        return None
    sid = str(ltf)
    for c in group.get("children") or []:
        if str(c.get("windowId")) == sid:
            return c if isinstance(c, dict) else None
    return None


def open_leaf_title(group: dict[str, Any]) -> str:
    w = open_leaf_window(group)
    return window_title(w) if w else ""


def check_mon_open_leaf_contains(
    forest: Any,
    *,
    mon_index: int,
    substring: str,
    require_chrome_family: bool = True,
) -> tuple[bool, str]:
    """
    First TABBED group on mon has open leaf title containing substring.

    require_chrome_family (default True): open leaf must be chrome/PWA so agent
    Ghostty titles containing \"grok\" cannot false-pass mon0-open-leaf-grok.
    """
    groups = [
        g for g in tabbed_groups(forest) if g.get("monitor") == mon_index
    ]
    if not groups:
        return False, f"mon{mon_index}: no TABBED group"
    # first tabbed on that mon (profile mon0 left tab)
    leaf = open_leaf_window(groups[0])
    title = window_title(leaf) if leaf else ""
    if require_chrome_family:
        cls = _wm_class_str(leaf) if leaf else ""
        if not _is_chrome_family_wm_class(cls):
            return (
                False,
                f"mon{mon_index} open leaf class={cls!r} title={title!r} "
                f"(want chrome-family for {substring!r})",
            )
    if substring.casefold() in title.casefold():
        return True, f"mon{mon_index} open leaf {title!r}"
    return False, f"mon{mon_index} open leaf {title!r} missing {substring!r}"


def check_agent_survives(forest: Any,
                         agent_window_id: Optional[str]) -> tuple[bool, str]:
    if not agent_window_id:
        return True, "no agent id tracked"
    ids = {
        str(w.get("windowId"))
        for w in iter_windows(forest) if w.get("windowId") is not None
    }
    if agent_window_id in ids:
        return True, f"agent {agent_window_id} present"
    return False, f"agent {agent_window_id} missing from tree"


def check_dual_ghostty_mons(forest: Any) -> tuple[bool, str]:
    """At least one TILE ghostty on mon0 and mon1 (multi-instance layout)."""
    mon_hits: dict[int, int] = {}
    for mon_i, w in iter_windows_with_mon(forest):
        if str(w.get("mode") or "").upper() != "TILE":
            continue
        if not _is_ghostty_class(_wm_class_str(w)):
            continue
        mon_hits[int(mon_i)] = mon_hits.get(int(mon_i), 0) + 1
    n0 = mon_hits.get(0, 0)
    n1 = mon_hits.get(1, 0)
    if n0 >= 1 and n1 >= 1:
        return True, f"ghostty TILE mon0={n0} mon1={n1}"
    return False, f"need ghostty TILE on mon0 and mon1; have mon0={n0} mon1={n1}"


def check_no_tile_windows(
        forest: Any,
        *,
        allow_window_ids: Optional[set[str]] = None) -> tuple[bool, str]:
    allow = allow_window_ids or set()
    tiles = [
        w for w in iter_windows(forest)
        if str(w.get("mode") or "").upper() == "TILE"
        and str(w.get("windowId")) not in allow
    ]
    if not tiles:
        return True, "no unexpected TILE windows"
    titles = [(w.get("windowId"), window_title(w)[:30]) for w in tiles[:5]]
    return False, f"still tiled: {titles}"


def _window_by_id(forest: Any,
                  window_id: Optional[str]) -> Optional[dict[str, Any]]:
    if not window_id:
        return None
    sid = str(window_id)
    for w in iter_windows(forest):
        if str(w.get("windowId")) == sid:
            return w
    return None


def check_focus_is_tile(forest: Any) -> tuple[bool, str]:
    """Keyboard focus is a TILE window still in the tree."""
    if not isinstance(forest, dict):
        return False, "no forest"
    fid = forest.get("focusWindowId")
    if fid is None:
        return False, "focusWindowId is None"
    w = _window_by_id(forest, str(fid))
    if w is None:
        return False, f"focusWindowId={fid} not in tree"
    mode = str(w.get("mode") or "").upper()
    if mode != "TILE":
        return False, f"focus is {mode or '?'} id={fid} class={_wm_class_str(w)!r}"
    return True, f"focus TILE id={fid} class={_wm_class_str(w)!r}"


def check_no_tile_focus(forest: Any) -> tuple[bool, str]:
    """No TILE holds keyboard focus (unfocus success)."""
    if not isinstance(forest, dict):
        return False, "no forest"
    fid = forest.get("focusWindowId")
    if fid is None:
        return True, "focusWindowId is None"
    w = _window_by_id(forest, str(fid))
    if w is None:
        return True, f"focusWindowId={fid} not a tree window"
    mode = str(w.get("mode") or "").upper()
    if mode == "TILE":
        return False, f"still TILE focus id={fid} class={_wm_class_str(w)!r}"
    return True, f"focus non-tile {mode} id={fid}"


def check_closed_gone(forest: Any,
                      closed_id: Optional[str]) -> tuple[bool, str]:
    if not closed_id:
        return True, "no closed id tracked"
    ids = {
        str(w.get("windowId"))
        for w in iter_windows(forest) if w.get("windowId") is not None
    }
    if str(closed_id) in ids:
        return False, f"closed id {closed_id} still in tree"
    return True, f"closed id {closed_id} gone"


def check_lft_retained(forest: Any,
                       lft_before: Optional[str]) -> tuple[bool, str]:
    """lastTileFocusWindowId still present when we had one (FC2: LFT not cleared)."""
    if not lft_before:
        return True, "no LFT before"
    if not isinstance(forest, dict):
        return False, "no forest"
    lft = forest.get("lastTileFocusWindowId")
    if lft is None:
        return False, f"lastTileFocusWindowId missing (was {lft_before})"
    if str(lft) != str(lft_before):
        w = _window_by_id(forest, str(lft))
        if w is not None and str(w.get("mode") or "").upper() == "TILE":
            return True, f"LFT moved {lft_before}→{lft} (still TILE)"
        return False, f"LFT {lft_before}→{lft}"
    return True, f"LFT retained {lft}"


def evaluate_checks(
    forest: Any,
    checks: Sequence[str],
    *,
    capability: Capability,
    layout_ok: bool = True,
    closed_window_id: Optional[str] = None,
    lft_before: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Run named checks; return list of {check, ok, detail}."""
    results: list[dict[str, Any]] = []
    for name in checks:
        ok = False
        detail = ""
        if name == "ok":
            ok = layout_ok
            detail = "actions/layout ok" if ok else "actions/layout failed"
        elif name == "mon0-open-leaf-grok":
            ok, detail = check_mon_open_leaf_contains(forest,
                                                      mon_index=0,
                                                      substring="Grok")
        elif name == "mon1-open-leaf-youtube":
            ok, detail = check_mon_open_leaf_contains(forest,
                                                      mon_index=1,
                                                      substring="YouTube")
        elif name == "agent-survives":
            ok, detail = check_agent_survives(forest,
                                              capability.agent_window_id)
            if (not ok
                    and getattr(capability, "agent_window_optional", False)):
                ok = True
                detail = (
                    f"agent window optional (leader/true-cold): {detail}")
        elif name == "dual-ghostty-mons":
            ok, detail = check_dual_ghostty_mons(forest)
        elif name == "profile-focus-if-set":
            # Soft: detailed focus is SE8b. Harness records focus id only.
            ok = True
            fid = None
            if isinstance(forest, dict):
                fid = forest.get("focusWindowId")
            detail = f"focusWindowId={fid}"
        elif name == "no-tiles-or-only-agent":
            allow = set()
            if capability.agent_window_id:
                allow.add(capability.agent_window_id)
            ok, detail = check_no_tile_windows(forest, allow_window_ids=allow)
        elif name == "focus-is-tile":
            ok, detail = check_focus_is_tile(forest)
        elif name == "no-tile-focus":
            ok, detail = check_no_tile_focus(forest)
        elif name == "closed-gone":
            ok, detail = check_closed_gone(forest, closed_window_id)
        elif name == "lft-retained":
            ok, detail = check_lft_retained(forest, lft_before)
        elif name == "nautilus-tabbed-with-mon0-ghostty":
            ok, detail = check_nautilus_tabbed_with_mon0_ghostty(forest)
        elif name == "tile-on-mon1":
            ok, detail = check_tile_on_mon(forest, mon_index=1)
        else:
            ok = False
            detail = f"unknown check {name!r}"
        results.append({"check": name, "ok": ok, "detail": detail})
    return results


# --- layout output → metrics (cross-host RC compare) ---

_COUNTS_RE = re.compile(
    r"reused\s+(\d+)\s+opened\s+(\d+)\s+moved\s+(\d+)",
    re.IGNORECASE,
)
_THRASH_RISK_RE = re.compile(r"thrashRisk\s+(\d+)", re.IGNORECASE)
_THRASH_STATE_RE = re.compile(
    r"thrashState\s+(\S+)(?:\s+score=(\d+))?",
    re.IGNORECASE,
)
_HARD_READY_WARN_RE = re.compile(
    r"targets not hard-ready|hard-ready timeout|not hard-ready",
    re.IGNORECASE,
)
_SOFT_TIMEOUT_RE = re.compile(r'"softTimeoutMs"\s*:\s*(\d+)')
_CORRECTIONS_RE = re.compile(r'"corrections"\s*:\s*(\d+)')
_SOFT_SETTLED_RE = re.compile(r'"softSettled"\s*:\s*(true|false)',
                              re.IGNORECASE)
_ELAPSED_RE = re.compile(r'"elapsed_ms"\s*:\s*(\d+)')


def _try_parse_json_blobs(text: str) -> list[dict[str, Any]]:
    """Best-effort: pull top-level JSON objects from mixed layout stdout/stderr."""
    out: list[dict[str, Any]] = []
    if not text:
        return out
    decoder = json.JSONDecoder()
    i = 0
    n = len(text)
    while i < n:
        if text[i] != "{":
            i += 1
            continue
        try:
            obj, end = decoder.raw_decode(text, i)
        except json.JSONDecodeError:
            i += 1
            continue
        if isinstance(obj, dict):
            out.append(obj)
        i = max(end, i + 1)
    return out


def extract_layout_metrics(output: str,
                           *,
                           wall_ms: Optional[int] = None) -> dict[str, Any]:
    """
    Parse forge layout human + optional verbose JSON into compare metrics.

    Namespaced later by env (host/session) in the live report writer.
    """
    text = output or ""
    metrics: dict[str, Any] = {
        "wallMs": wall_ms,
        "counts": {},
        "thrashRisk": None,
        "thrashState": None,
        "thrashScore": None,
        "hardReadyWarnings": 0,
        "hardReadyTimeoutHints": [],
        "softTimeoutMs": None,
        "softSettled": None,
        "softCorrections": None,
        "softResiduals": None,
        "softElapsedMs": None,
        "expectationMisses": 0,
        "delayTimeoutsLikelyOk": 0,
        "hardReadyTimedOutMovingAnyway": 0,
        "applyKeys": [],
    }

    m = _COUNTS_RE.search(text)
    if m:
        metrics["counts"] = {
            "reused": int(m.group(1)),
            "opened": int(m.group(2)),
            "moved": int(m.group(3)),
        }
    m = _THRASH_RISK_RE.search(text)
    if m:
        metrics["thrashRisk"] = int(m.group(1))
    m = _THRASH_STATE_RE.search(text)
    if m:
        metrics["thrashState"] = m.group(1)
        if m.group(2):
            metrics["thrashScore"] = int(m.group(2))

    hard_hits = _HARD_READY_WARN_RE.findall(text)
    metrics["hardReadyWarnings"] = len(hard_hits)
    if re.search(r"not hard-ready \(moving anyway\)", text, re.I):
        metrics["hardReadyTimedOutMovingAnyway"] = len(
            re.findall(r"not hard-ready \(moving anyway\)", text, re.I))

    blobs = _try_parse_json_blobs(text)
    apply: Optional[dict[str, Any]] = None
    for blob in blobs:
        if isinstance(blob.get("apply"), dict):
            apply = blob["apply"]
            break
        # bare apply log
        if "finalFocusSoft" in blob or "followUpSettle" in blob:
            apply = blob
            break
    if apply is not None:
        metrics["applyKeys"] = sorted(str(k) for k in apply.keys())
        soft = apply.get("finalFocusSoft")
        if isinstance(soft, dict):
            if soft.get("softTimeoutMs") is not None:
                metrics["softTimeoutMs"] = int(soft["softTimeoutMs"])
            if soft.get("softSettled") is not None:
                metrics["softSettled"] = bool(soft["softSettled"])
            if soft.get("corrections") is not None:
                metrics["softCorrections"] = int(soft["corrections"])
            residuals = soft.get("residuals")
            if isinstance(residuals, list):
                metrics["softResiduals"] = len(residuals)
                metrics["expectationMisses"] = len(residuals)
            if soft.get("elapsed_ms") is not None:
                metrics["softElapsedMs"] = int(soft["elapsed_ms"])
            # Quiet held after timeout with no residual → delay "timeout" was success.
            if soft.get("softSettled") and int(soft.get("corrections")
                                               or 0) == 0:
                metrics["delayTimeoutsLikelyOk"] = 1
            elif soft.get("softSettled") and int(soft.get("corrections")
                                                 or 0) > 0:
                # Corrected thrash then quiet — still soft success after miss(es).
                metrics["delayTimeoutsLikelyOk"] = 1
        if metrics["softTimeoutMs"] is None and apply.get(
                "finalFocusSoftTimeoutMs") is not None:
            try:
                metrics["softTimeoutMs"] = int(
                    apply["finalFocusSoftTimeoutMs"])
            except (TypeError, ValueError):
                pass
        settle = apply.get("followUpSettle") or apply.get("finalFocusSettle")
        if isinstance(settle, dict) and settle.get("ok") is False:
            metrics["hardReadyWarnings"] = max(metrics["hardReadyWarnings"], 1)
            err = settle.get("error")
            if err:
                metrics["hardReadyTimeoutHints"].append(str(err)[:200])
        flush = apply.get("settleHeuristicsFlush")
        if isinstance(flush, dict):
            metrics["heuristicsFlush"] = {
                k: flush.get(k)
                for k in ("path", "written", "entryCount", "reason")
                if k in flush
            }

    # Fallback soft fields from loose regex if no apply blob
    if metrics["softTimeoutMs"] is None:
        m = _SOFT_TIMEOUT_RE.search(text)
        if m:
            metrics["softTimeoutMs"] = int(m.group(1))
    if metrics["softCorrections"] is None:
        m = _CORRECTIONS_RE.search(text)
        if m:
            metrics["softCorrections"] = int(m.group(1))
    if metrics["softSettled"] is None:
        m = _SOFT_SETTLED_RE.search(text)
        if m:
            metrics["softSettled"] = m.group(1).lower() == "true"
    if metrics["softElapsedMs"] is None:
        m = _ELAPSED_RE.search(text)
        if m:
            metrics["softElapsedMs"] = int(m.group(1))

    return metrics


def build_env_namespace(
    cap: Capability,
    *,
    hostname: Optional[str] = None,
    nested_running: Optional[bool] = None,
    extra: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Stable env label block for RC report compare (host / session / nest)."""
    import socket

    host = hostname or socket.gethostname() or "unknown"
    return {
        "hostname": host,
        "session": cap.session,
        "agentTerminal": cap.agent_terminal,
        "agentMode": cap.agent_mode,
        "canHup": cap.can_hup,
        "canNested": cap.can_nested,
        "canRetest": cap.can_retest,
        "canTrueCold": cap.can_true_cold,
        "extensionOk": cap.extension_ok,
        "extensionVersion": cap.extension_version,
        "nestedGnome": nested_running,
        "nTileWindowsStart": cap.n_tile_windows,
        **(extra or {}),
    }


def default_live_report_path(
    *,
    hostname: Optional[str] = None,
    session: str = "unknown",
    when: Optional[str] = None,
) -> str:
    """agents/test-results/wayland/<host>-<session>-<stamp>.json under repo if found."""
    import socket
    from datetime import datetime, timezone
    from pathlib import Path

    host = hostname or socket.gethostname() or "host"
    stamp = when or datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    # Prefer repo agents/ if cwd or this file lives in a forge tree.
    here = Path(__file__).resolve()
    repo = None
    for p in [Path.cwd(), *here.parents]:
        if (p / "agents").is_dir() and (p / "scripts" / "forge").is_dir():
            repo = p
            break
    base = (repo / "agents" / "test-results" /
            "wayland") if repo else Path("agents/test-results/wayland")
    base.mkdir(parents=True, exist_ok=True)
    return str(base / f"{host}-{session}-{stamp}.json")


def summarize_metrics(case_results: list[dict[str, Any]]) -> dict[str, Any]:
    """Roll up per-case metrics for the report summary block."""
    walls: list[int] = []
    soft_to: list[int] = []
    corrections = 0
    misses = 0
    hard_warns = 0
    delay_ok = 0
    hard_move_anyway = 0
    for r in case_results:
        m = r.get("metrics") or {}
        if not isinstance(m, dict):
            continue
        if m.get("wallMs") is not None:
            try:
                walls.append(int(m["wallMs"]))
            except (TypeError, ValueError):
                pass
        if m.get("softTimeoutMs") is not None:
            try:
                soft_to.append(int(m["softTimeoutMs"]))
            except (TypeError, ValueError):
                pass
        corrections += int(m.get("softCorrections") or 0)
        misses += int(m.get("expectationMisses") or 0)
        hard_warns += int(m.get("hardReadyWarnings") or 0)
        delay_ok += int(m.get("delayTimeoutsLikelyOk") or 0)
        hard_move_anyway += int(m.get("hardReadyTimedOutMovingAnyway") or 0)
    return {
        "casesWithMetrics": sum(1 for r in case_results if r.get("metrics")),
        "wallMsTotal": sum(walls) if walls else None,
        "wallMsMax": max(walls) if walls else None,
        "wallMsAvg": int(sum(walls) / len(walls)) if walls else None,
        "softTimeoutMsMax": max(soft_to) if soft_to else None,
        "softTimeoutMsAvg":
        int(sum(soft_to) / len(soft_to)) if soft_to else None,
        "softCorrectionsTotal": corrections,
        "expectationMissesTotal": misses,
        "hardReadyWarningsTotal": hard_warns,
        "hardReadyTimedOutMovingAnywayTotal": hard_move_anyway,
        "delayTimeoutsLikelyOkTotal": delay_ok,
    }


def format_probe_text(cap: Capability) -> str:
    lines = [
        f"session:          {cap.session}",
        f"agent_terminal:   {cap.agent_terminal}",
        f"agent_window_id:  {cap.agent_window_id or '—'}",
        f"agent_mode:       {cap.agent_mode or '—'}",
        f"agent_wm_class:   {cap.agent_wm_class or '—'}",
        f"can_hup:          {cap.can_hup}",
        f"can_nested:       {cap.can_nested}",
        f"can_retest:       {cap.can_retest}",
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


def format_selection_text(sel: Selection,
                          cap: Optional[Capability] = None) -> str:
    lines = [f"suite: {sel.suite}"]
    if sel.behaviors:
        lines.append(f"behaviors: {', '.join(sorted(sel.behaviors))}")
    if sel.tags:
        lines.append(f"tags: {', '.join(sorted(sel.tags))}")
    if cap is not None:
        lines.append(
            f"capability: session={cap.session} agent={cap.agent_terminal} "
            f"true_cold={cap.can_true_cold}")
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
