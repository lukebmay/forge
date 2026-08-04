# Plan: Desktop keybinds (manage GNOME chords, own only Forge)

**Status:** ready / draft tasks  
**Updated:** 2026-08-04  
**Branch:** `plan/forge-desktop-keybinds` (create from master when starting; or fold P0 into containers branch if tiny)  
**Kind:** Product + prefs UX  
**Depends on:** existing `gnome-overrides.js`, `keybind-conflicts.js`, prefs Keyboard page  

### Session note (overwrite)

**2026-08-04** — **KB0 shipped** (kit-aware GNOME lock). Next: KB1 (open GNOME Keyboard).

- Safe: screensaver `Super+L` + `Super+Delete`; Vim/i3: `Super+Delete` only  
- Wired: enable (infer from focus-right), prefs kit apply, `forge keybind apply`  
- Unit tests in `gnome-overrides.test.js`  
- **Next:** KB1 when this plan is next in PRIORITY (after Wayland + S3)

---

## Why this plan exists

Users should not juggle **Forge prefs**, **GNOME Settings → Keyboard**, and **silent enable() overrides** with no story.

| Principle | Detail |
| --- | --- |
| **Own** | Forge tiling actions only (focus/move/split/tab/selection/…) |
| **Manage (not own)** | Curated **desktop** actions via GNOME GSettings (lock, close, maximize, half-tile, …) |
| **Safe is safe** | Install/Safe kit: **do not steal bare Super+** except a deliberate lock story |
| **One control plane** | Forge Keyboard tab is the hub; full GNOME map is **one click** away |
| **No GNOME Keyboard clone** | Curated collision list only — not every media-keys/shell binding |

---

## Product locks (do not re-litigate without human)

1. **Forge never implements lock/DPMS/close/maximize.** Only writes chords (or opens GNOME UI).  
2. **Safe kit:** keep Ubuntu **Super+L** as lock; **also** offer **Super+Delete** as lock (dual-bind GNOME `screensaver`). Do **not** free Super+L for Safe.  
3. **Vim / i3 kits:** GNOME lock = **Super+Delete only** so **Super+L** is free for focus-right.  
4. **Enable overrides** that clear half-tile / maximize / minimize stay **collision-driven**; surface them as managed desktop rows + restore-on-disable (already partial).  
5. **Conflict on Forge bind:** warn if chord hits GNOME; offer **clear GNOME chord** / **move GNOME action to another chord** / **cancel** — not silent steal without notice.  
6. **Out of scope:** full GNOME Keyboard replacement, arbitrary schema browser, Wayland vs X11 lock ownership (already settled: GNOME owns behavior).

---

## Priority order (relative to other Forge work)

| Order | Work | Why this rank |
| ---: | --- | --- |
| **1** | **Wayland thrash + selection smoke** | Operator session switch; validates soft-rehome on compositor blank; short; unblocks “daily driver on both sessions” |
| **2** | **Container selection finish** (S3 kit binds → S5 live QA) | Active product mid-wave; S2 done; discoverability without S3 is weak |
| **3** | **This plan — KB0 first** (Safe kit-aware lock) | Small, fixes wrong “Safe steals Super+L”; unblocks honest Safe story |
| **4** | **This plan — KB1–KB4** (UI hub, conflict offer, kit desktop presets, docs) | After S3 so Keyboard tab work doesn’t collide with selection chords mid-wave |

**Rule:** If the operator is **on Wayland**, do (1) before coding S3/KB. If still on **X11** and not switching, S3 can proceed; KB0 can ship as a small slice anytime after thrash is trusted on X11 (already is).

---

## Current baseline (code)

| Piece | Path | Today |
| --- | --- | --- |
| Enable overrides | `lib/shared/gnome-overrides.js` | Always sets `screensaver` → Super+Delete only (steals Super+L for **all** kits) |
| Host pin | `scripts/forge/host-defaults.conf` | Same Super+Delete; clears Forge `prefs-lock-screen` |
| Conflict scan | `lib/shared/keybind-conflicts.js` + prefs Keyboard | Detects Forge vs GNOME; **no** “clear/move GNOME?” offer |
| Prefs Keyboard | `lib/prefs/keyboard.js` | Kits + Forge rows; notes GNOME Settings is separate |
| Soft-rehome | `soft-rehome.js` | Independent; thrash OK under GNOME lock on X11 |

---

## Task table

| ID | Task | Status | Acceptance (summary) |
| --- | --- | --- | --- |
| **KB0** | Kit-aware GNOME lock chords | **done** | Safe: Super+L + Super+Delete; Vim/i3: Super+Delete only; enable + kit apply + CLI; unit tests; docs |
| **KB1** | Open GNOME Keyboard from Forge | draft | Button on Keyboard prefs: launch GNOME Settings Shortcuts (or best-effort `gnome-control-center keyboard` / panel URI); works on Ubuntu 24; docs one-liner |
| **KB2** | Conflict offer when binding Forge chord | draft | On capture/save that collides with GNOME: dialog **Cancel** / **Clear GNOME binding** / **Keep both (warn)**; optional “rebind GNOME action…” later; pure helper testable without GTK where possible |
| **KB3** | Desktop shortcuts section (curated manage list) | draft | Prefs group: lock, close, maximize, half-tile L/R, minimize, message-tray — edit writes GNOME GSettings; restore-on-disable; not a full catalog |
| **KB4** | Kit desktop presets + notify | draft | Apply Safe/Vim/i3 updates curated desktop chords; install/prefs banner or row: “Forge changes these Ubuntu shortcuts…” with link to docs |

Optional later (not required for plan done):

| ID | Task | Status |
| --- | --- | --- |
| KB5 | Move GNOME action to alternate chord wizard | optional |
| KB6 | CLI `forge keybind desktop …` | optional |

---

## KB0 detail (first implement slice)

### Safe

```text
org.gnome.settings-daemon.plugins.media-keys screensaver
  = ['<Super>l', '<Super>Delete']   # keep Ubuntu Super+L; add Super+Delete
```

### Vim / i3

```text
screensaver = ['<Super>Delete']     # free Super+L for focus-right
```

### Wiring

- On **enable**: if no kit applied yet, treat as **Safe** (schema default).  
- On **applyKit(safe|vim|i3)**: update screensaver (and document any other kit desktop deltas).  
- On **disable**: restore saved originals (existing override machinery).  
- Host-defaults: prefer Safe dual-bind for black install unless host pins Vim.

### Tests

- Unit: pure function `desktopLockAccelsForKit(kitId) → string[]`  
- Unit: enable/apply reconcile does not leave Super+L stolen on Safe  
- Docs: keybindings.md “Desktop shortcuts Forge manages”

---

## KB1 detail (GNOME Keyboard button)

- Prefs Keyboard page: row **Open GNOME keyboard shortcuts**  
- Best-effort launch (try in order):  
  - `gnome-control-center keyboard`  
  - or Settings portal / `x-scheme-handler` for GNOME Settings  
- Failure: toast with manual path “Settings → Keyboard → View and Customize Shortcuts”  
- Does **not** replace conflict UX — escape hatch for everything else

---

## KB2 detail (conflict offer)

When user sets a Forge accel that matches a scanned GNOME binding:

1. Show conflict: Forge action X vs GNOME action Y (label + schema/key if useful).  
2. Choices:  
   - **Cancel** — leave Forge binding unchanged  
   - **Clear GNOME shortcut** — set that GNOME key’s strv without this accel (manage, not own)  
   - **Keep both** — rare; warn both may fire / fight (default **off** or secondary)  
3. Do **not** auto-clear GNOME without confirm.  
4. Reuse `keybind-conflicts.js` external list.

---

## UX sketch (Keyboard prefs)

```text
[ Kits: Safe | Vim | i3 | … ]
[ Open GNOME keyboard shortcuts… ]   ← KB1

Conflicts: …
  Super+l — Forge focus-right vs GNOME Lock  [Resolve…]  ← KB2

── Desktop (GNOME) ──                         ← KB3
  Lock screen     [ Super+L ] [ Super+Delete ] …
  Close window    [ Super+q ]
  …

── Forge ──
  Focus right     [ Super+l ] …
```

---

## Out of scope (creep fence)

- Cloning all of GNOME Keyboard  
- Implementing lock/DPMS/close in Forge  
- Per-app custom shortcuts  
- Wayland-specific lock action (behavior stays GNOME)

---

## Success

| Done when |
| --- |
| Safe install keeps Super+L lock; Super+Delete also locks |
| Vim/i3 free Super+L; lock on Super+Delete |
| Keyboard prefs opens GNOME shortcuts in one click |
| Binding a conflicting Forge chord offers clear GNOME / cancel |
| Curated desktop list is editable and restore-on-disable |
| Docs list every Ubuntu shortcut Forge changes by default |

---

## Related

- [forge-container-selection.md](./forge-container-selection.md) — S3 Super+p may need conflict scan vs GNOME  
- Soft-rehome thrash (containers branch) — lock path is GNOME-owned; independent of this plan  
- `docs/user/keybindings.md` — update as slices ship  
