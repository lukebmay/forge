# Plan: Pure layout settle / low-jump rehome

**Status:** draft — **D0 discussion only** (no implement yet)  
**Priority:** P1 (after daily-driver LF6 works; polish jumpiness)  
**Updated:** 2026-07-29  
**Base:** this tree (`lukebmay/forge`)  
**Related:** [forge-layout-reliability.md](./forge-layout-reliability.md) (LF1–LF6 shipped; **keep current open-then-stable-rehome for now**)

### Session note

Plan opened after LF6 **worked live** on black, but apply still feels jumpy.
Product keeps LF6 behavior until a purer design lands. First task = discussion.

---

## Why

Apps (especially **Ghostty**) can **reposition themselves after open** — multi-instance,
PlaceNext races, Meta `move_to_monitor`, GTK single-instance history, self-placement.
Layout reconcile that **moves while the app is still thrashing** loses the mon fight
or thrashing wins until a later settle.

**LF6 fixed correctness** by:

1. Open all missing apps  
2. Wait for a **whole GetTree fingerprint** to be stable  
3. Then residual replan + batch rehome (+ optional belt)

**Cost:** visible jumpiness — windows land “wrong” briefly, then snap to profile
positions after a quiet period. Acceptable short-term; not the long-term product bar.

---

## Lessons from layout-reliability (notes to preserve)

### Symptom arc (black, dual 4K, X11, Shell 46)

Host `dev` bare array:

```text
mon0: tab(google-chrome, Grok) | ghostty
mon1: ghostty | tab(YouTube, Gmail, Google Voice)
```

Repros that failed until LF6:

| Repro | Fail mode |
| --- | --- |
| Close left Ghostty + chrome → `forge layout dev` | New Ghostty wrong mon / mon thrash |
| Close left chrome + right Ghostty → `forge layout dev` | **Two Ghosttys on mon0**, none on mon1 |
| Install with Chrome focused | Open leaf/focus became Grok (SI1 — deferred focus-update) |
| Dock open second Ghostty on mon1 | Untiled / float-looking until drag (OP2) |

### What we tried (and what stuck)

| Slice | Idea | Outcome |
| --- | --- | --- |
| **LF1** | Two-pass mon claim; mon ensure only placement mons; residual pins; survivor `active` | Unit OK; live mon still wrong |
| **LF2** | Tab click = raise→focus→activate + chrome restack | Tab focus regressed less |
| **LF3** | PlaceNext reverse-DNS class stem; residual moves before fail-on-still-open | Unit OK; live mon still wrong |
| **LF4** | Ghostty open without stock `--gtk-single-instance=true` desktop | Necessary but not sufficient |
| **LF5** | Per-window **TILE settle** before residual Move | Still raced Ghostty self-move |
| **LF6** | Open all → **whole-tree stable** → rehome batch | **Live correct**; jumpy |
| **SI1** | Install = exact tree snapshot; sync lastTabFocus from Mutter focus at save | Separate path (not layout profiles) |
| **OP2** | Dock appId normalize; firstRender always place | Dock second tile fixed |

### Hard lessons

1. **App self-placement is real** — waiting for “window exists” or even “TILE” is not
   enough if Meta/app rehomes after Forge places.
2. **Stock Ghostty desktop forces single-instance** — layout must not rely on
   `gio launch` of that desktop for multi-mon opens.
3. **Residual abort on missing roles** skipped mon moves — always apply structure
   for claimed windows; fail missing opens after.
4. **Chrome title lag** (`New Tab` vs `title~= Google Chrome`) needs launch
   `role_pins` for residual claim.
5. **Bare profiles have no `active`** — survivor open-leaf when companions rejoin.
6. **Install ≠ layout** — session-layout snapshot only; never profile reconcile on install.
7. **Jumpiness is the remaining UX debt** of correctness-first settle.

---

## Goals (long-term)

1. **Correct mon + structure** without long “wrong then snap” phases.
2. **Minimize jumpiness** — fewer full-desk reshuffles; prefer place-right-once.
3. **App-aware settle** without hardcoding only Ghostty in core forever.
4. Clear model: **place-at-map** vs **rehome-after-stable** vs **serial per role**.

## Non-goals (for D0)

- Implementing settle sugar or serial apply in this task.
- Changing LF6 live path until discussion locks a design.
- Replacing layout profiles / bare-array sugar.

---

## Design ideas to discuss (D0)

### A. Per-app settle times (layout sugar)

Optional profile field (names provisional):

```json
{
  "settleTimes": {
    "ghostty": 1500,
    "com.mitchellh.ghostty": 1500
  }
}
```

| Question | Notes |
| --- | --- |
| Key matching | Stem / reverse-DNS / role id / open.app — same as match sugar? |
| Scope | After open only, or also after any Move? |
| Interaction with tree fingerprint | Max(app settles) after last open, then stable, then rehome? Or per-window delay before that window may be moved? |
| Defaults | Built-in defaults for known thrashers vs require explicit config |
| Host vs profile | Global settings vs per layout file |

**Intent:** apps that thrash for ~1–2s get a declared quiet window without
lengthening settle for well-behaved apps.

### B. Batch vs serial operations

| Mode | Meaning | Pros | Cons |
| --- | --- | --- | --- |
| **Batch rehome (LF6)** | Open all → stable → one residual plan → many Moves | Fewer replan races; simpler plan | Desk-wide snap; jumpiness |
| **Serial per open** | Open one → settle that app → rehome that role → next | Smaller jumps; mon placement per app | Slower; earlier opens can thrash later; plan drift |
| **Serial per mon** | Open mon0 gaps → settle → rehome mon0 → mon1 | Limits cross-mon thrash | Still jumpy within mon |
| **Place-at-map only** | Strong PlaceNext / dock sticky; residual only if wrong | Minimal rehome | Hard for self-moving apps |
| **Hybrid** | PlaceNext + per-app settle delay + **targeted** residual moves only for wrong mon | Less full-tree rewrite | Need good wrong-mon detection |

**D0 must recommend** a default product path (likely hybrid) and when batch is still required (cold empty desk, thrash Mode B).

### C. Purer settle signals

Beyond GetTree fingerprint (id/mode/mon/path/layout):

- Wait for **no Meta configure** for N ms (extension-side settle token)
- Wait for **frame rect stable** (include rect in fingerprint carefully — resize noise)
- Extension DBus `WaitSettled` / per-window ready after first tile geometry
- Suppress soft-rehome / open-app policy during layout apply shield

### D. Jumpiness budget

Define success as e.g.:

- No wrong-mon visible for &gt; X ms after open completes  
- At most one structure rewrite per mon per apply  
- No full-desk equalize if only one role opened  

---

## Task queue

| ID | Task | Status |
| --- | --- | --- |
| **D0** | [forge-layout-settle-pure_d0-discussion](../tasks/forge-layout-settle-pure_d0-discussion.md) | **next** — discussion + further planning only |

No implementation tasks until D0 produces an agreed approach (user lock).

---

## Out of scope for this plan file’s first task

Coding, schema changes, live thrash experiments that rewrite the LF6 path.
