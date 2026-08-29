# RuleSet — composition laws on the TOM

**Status:** locked (D080)
**As of:** 2026-08-27
**Glossary words:** still Mark 2
[`mark2.md`](../../../prototypes/container-motion/src/opsets/mark2.md).
This file names the **layer**, not a second vocabulary.

## Decision

A **RuleSet is a real gi-free module** (plus a short section in the OpSet
doc that uses it). It is **not** “just a README.”

A document without one implementation is how Forge `cleanTree` diverged
from proto unary collapse. The prototype exists to catch Forge bugs —
both must call the **same** `settle()`.

OpSets **bind** a RuleSet: they may **extend** it (Mark 2 adds
same-type coerce) or **replace** it (a future pack that does not
unary-collapse). They do not inline a private settle.

## Layers (core → policy)

```text
TOM            Forest + Node fields. No “what happens after a delete.”
Atomics        append / insert / remove / replace / setLayout / setPercent
Composed ops   breakout, wrapNodes, promoteChildren — still no settle
RuleSet        after mutation: restore invariants (order of operations)
OpSet          Move / Join / Launch / Remove — calls atomics + RuleSet
Presenter      paint
Host           Mutter / proto DOM extras
Keybind table  action id → chord  (shared; see keybinds.md)
```

**Core of the app** = TOM + atomics + composed TreeOps. That is the
spine. RuleSet is the **law of how those ops compose**. OpSet is the
**named control surface**.

Atomics may leave a 1-child CON. That is legal **mid-op**. RuleSet
settle makes it illegal **after**.

## The promote example (not a special-case)

User Move/Promote of A out of a 2-child CON:

```text
Given:   Mon1(H(V(A,B),C))
Actions: breakout(A, left)           # composed TreeOp — A becomes sibling of V
Mid:     Mon1(H(A, V(B), C))         # V is unary; atomics allow this
Then:    RuleSet.settle()            # unary collapse: B takes V’s place; V deleted
Expect:  Mon1(H(A,B,C))
```

B is not “also Promoted” as a second user op. Unary collapse is the
RuleSet. Mark 2’s **user** Promote (`{`) is `promoteChildren` (dissolve
the CON) — different word, same glossary: breakout/promote of **one
node** vs promote **children**.

`Delete` (atomic destroy) does **not** settle. Mark 2 `Remove` does.

## Two RuleSets at lift

| Id | Settle order (repeat until stable) | Invariants after |
| --- | --- | --- |
| **core** | prune empty CONs → unary collapse → share repair (D078) | no empty CON; no 1-child CON |
| **mark2** | core + same-type coerce (H/H or V/V → TABBED, not H↔V) + MONITOR max-1 | core + Mark 2 § Invariants |

Mark 2 OpSet **binds `mark2`**. Product Forge binds the same after
adopt. `cleanupStructure` today ≈ **core**. `mark2CleanupUnder` today ≈
**mark2**. Lift those; do not leave a third settle in `tree.cleanTree`.

MONITOR max-1 is a **mark2 RuleSet** post-settle invariant, not an
atomic. Atomics may have `Mon1(A,B)` mid-op. On first adopt, n-child
MONITOR desks wrap once into a CON (migrate), then mark2 settle holds
the invariant.

## Must not live in a RuleSet

- Launch aspect / wrap-TAB floor (OpSet)
- Move wrap-before-cross-mon (OpSet)
- Forest session / `decisions` / `mergeTags` — `aspectTieBreak` is an
  argument (D082)
- Keybinds, Meta, DOM, GObject
- Presenter mapped-vs-open tab paint (D069)

## Code home (P1)

```text
lib/tom/            Forest, atomics, composed (no settle)
lib/session/        OpSet/Host prefs (not TOM)
lib/rulesets/core.js
lib/rulesets/mark2.js   # extends core
```

Proto and Forge import these. Tests for settle live next to the
RuleSet, not in a presenter.

Changing Mark 2 invariants in `mark2.md` ⇒ same-effort `mark2.js`
RuleSet + OpSet + tests (existing FIRM).
