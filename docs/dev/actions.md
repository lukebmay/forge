# Action pipeline — stages and formulas

How Forge turns user/sensor events into tree mutations, Meta placement, and chrome.
See [architecture.md](architecture.md) for subsystems and [rendering.md](rendering.md)
for the `renderTree` body order. Plan: [forge-action-pipeline](../../agents/plans/forge-action-pipeline.md).

**Invariant:** focus never full-applies the forest; structure changes issue **one**
layout commit per gesture.

---

## Stages

| ID | Name | Effect | Meta geometry? |
| --- | --- | --- | --- |
| **M** | Mutate | Tree topology / percent / mode / lastTabFocus data | No |
| **C** | Commit | Full layout apply via `renderTree` idle body | Yes (all TILE) |
| **Cq** | Commit-queued | `requestLayout(reason)` → debounced **C** | Yes (later) |
| **Cf** | Commit-force | `renderTree(reason, true)` (unfreeze if needed) | Yes (soon) |
| **F** | FocusChrome | TABBED/STACKED: `lastTabFocus`, ε sibling reassert, raise leaf | Selective `move` |
| **Dfocus** | DecoFocus | Restack **one** group strip (`updateDecorationLayout` scope focus) | No |
| **Dfull** | DecoFull | Hide/show eligible strips on all monitors | No |
| **B** | Borders | `updateBorderLayout` (TILE rings from tree **slot**) | No |
| **P** | Pointer/LFT | `movePointerWith` + last-focused-tile MRU | No |
| **A** | Attach | `tree.attachNode` for next open | No |
| **V** | Verify | Meta frame/mon ↔ slot (usually auto after **C**) | Read |
| **Z** | Freeze | `_freezeRender` mutes apply mid-grab / RunSteps batch | — |

### Commit body (**C**) — load-bearing order

```text
pruneDeadWindows → processFloats → fullscreen float demote
  → tree.render (slots + move) → handleMaximizeOnSingle
  → Dfull + B → last-good snapshot / session save
  → requestVerify("post-render")
```

### Composition rules

1. **Focus never runs C** (Wayland Chrome reflow; cross-mon thrash).
2. **Structure → exactly one C** per user gesture (queued or force).
3. After **C**, call **F**/Dfocus only if open tab leaf must settle (not a second C).
4. **Geometry sensors:** forge-caused or TILE in-slot → **B only**; external → **Cq**+**V**.
5. **Raise multi-path is intentional** (fullscreen demote, Wayland pin, tab strip Z).
   Documented in DESIGN § Raise / restack — do not invent a single `raiseWindow()`.

### Chrome scope chooser

```text
One group strip after raise?     → Dfocus
Layout / workspace / max-fs?     → Dfull
Focus ring only?                 → B
Full commit already running?     → C includes Dfull+B; stop
```

---

## Formulas

### FocusChanged

**Entries:** Meta `focus`, keyboard Focus / FocusNext / FocusPrev, DBus Focus,
tab click, focus-on-hover, post-overview.

```text
gate deferred open → (activate already done by entry)
  → F → Dfocus → B → P → A
```

**API target:** `wm.afterFocus(node, { source, forcePointer })` — **only** implementation.

| Entry | Notes |
| --- | --- |
| Meta focus | `afterFocus` (may idle-coalesce; must be idempotent) |
| Keyboard / DBus | Activate then `afterFocus` (or rely on Meta if proven equivalent; prefer explicit) |
| Tab click | `revealGroupChild({ keyboard: true })` (focus+activate inside; Dfocus last) |
| Hover | Meta path only |

**Show in group (D025):** `wm.revealGroupChild(node, { keyboard, pin })` —
write LTF → pin or adopt live pin (R026) → `reassertNodeToSlot` (R025) →
raise → `settleTabFocus`; keyboard → focus + activate + `afterFocus`.
Restack is last (R032). Not a second C. Do not invent `raiseWindow()`.

**Forbidden:** `renderTree("focus")`, **Dfull**, reassert other monitors’
tab groups, reassert from `afterFocus`.

---

### StructureChanged

**Entries:** Move, Swap, Split, layout toggles, float toggle, merge, drag-drop end,
DBus Move/Swap/Layout, RunSteps residual ops.

```text
M → exactly one C (Cf if interactive; else Cq)
  → optional settleTabFocus (F [+ Dfocus+B if strip buried])
  → P if focus stayed on moved window
```

**Forbidden:** two full commits for one gesture without a documented reason.

---

### SizeOnlyChanged

**Entries:** expand/shrink, golden ratio, resize grab end, WindowResetSizes.

```text
M (percents) → one C
```

---

### OpenApp

```text
Admit (track, sensors, sticky mon)
  → quiet (catalog / dock)
  → M (attach / insert percent)
  → Cq ("window-create")  // Cf if frozen
  → V (auto)
```

**LayoutBatch:** deferred hidden admits → map quiet → residual **M → one C → V**
(`Cq` via layout-controller when present; `Cf` if frozen / no controller).

---

### ExternalGeometry

```text
forge-caused or TILE in-slot  → B only
grab live                     → live resize/move handlers (no C mid-grab)
covering max/fs               → B + Dfull or next C
else external drift           → V only (unsettled; no Cq forest re-apply)
```

---

### Recovery / workspace

| Event | Recipe |
| --- | --- |
| active workspace / add-remove | track + Dfull as needed + **C** |
| window home reconcile | M rehome + **C** |
| monitor-recovery / workareas | M rehome + forest restore + **C** + LFT |
| session restore | M strict forest + raise settle + **C** + shield |
| minimize | M + **C** |
| fullscreen changed | **C** (demote inside body) |
| float toggle | M + optional float move + **Cf** |

---

## Target helpers

```text
afterFocus(node, opts)      // FocusChanged body; idempotent
commitLayout(reason, opts)  // Cq or Cf
settleTabFocus(node)        // post-structure tab open leaf without 2nd C
```

`settleTabFocus` is **chrome** (F+Dfocus+B). It is **not** D019
wait-for-quiet. Job → API: [contracts.md](contracts.md).

---

## Agent checklist

When changing focus, layout, decoration, or borders:

1. Which **action class**?
2. Stage change or one-off? Prefer stage.
3. Update **all entries** of that class (Meta / cmd / DBus / tab / CLI).
4. Does this reintroduce **C** or **Dfull** on focus? **Stop.**
5. Unit-test the formula (spy stages), not only one entry.

---

## Anti-patterns

| Do not | Why |
| --- | --- |
| Full `renderTree` on every focus | Chrome/Wayland reflow; cross-mon thrash |
| Hide-all decorations on focus | Other mon tab strip flash |
| Second `renderTree` for “tab settle” after Move | Double apply; use settleTabFocus |
| Forge size-changed → full deco layout | Amplifies every `move` |
| One global raise helper for FS demote + tab + Wayland pin | Different contracts (CA6) |
