---
title: Documentation (forge extension)
read_when: Writing design docs, design CHANGELOG, user docs, OpSet rules, or tiling vocabulary
order: 60
---

# Documentation (forge extension)

**Base:** follow [`agents/installed/documentation.md`](./installed/documentation.md).
On conflict, **this extension wins**.

## OpSet design docs (FIRM)

Each tiling OpSet has one design document. That file is the source of
truth for the OpSet’s words, tree shape, invariants, and SurfaceOps.

| OpSet | Design doc | Code |
| --- | --- | --- |
| Mark 2 | [prototypes/container-motion/src/opsets/mark2.md](../prototypes/container-motion/src/opsets/mark2.md) | OpSet `lib/opsets/mark2.js` · RuleSet `lib/rulesets/mark2.js` |

**Changing an OpSet design doc without updating that OpSet, its tests, and
shorthand/UI in the same effort is a bug.** Do not “clarify later.” Do not
leave handoffs using the old words.

**Where laws live (do not mix):**

| What | Home |
| --- | --- |
| Spine kinds, atomics | TOM (`lib/tom/`, design.md § TOM). Envelope META + FLOATS + TILES (D087) |
| FLOAT windows | **FLOATS** bag — not under a MONITOR (D087) |
| Spread | TILES leftover percent (`userSized === false`, D089). Not FLOAT. Not *share* (the number) |
| Settle order, unary collapse, MONITOR max-1 after settle | **RuleSet** (`lib/rulesets/`, [ruleset.md](plans/forge-firm-abstractions/ruleset.md)); Mark 2 lists invariants in `mark2.md` |
| Move / Join / Launch / words | OpSet doc (`mark2.md`) |
| Move / Join / Launch implementation | **OpSet** (`lib/opsets/`, D084) |
| Session prefs (`edgeMove`, tags, peelModel) | **Session bag** (`lib/session/`, D082) — not Forest fields |
| MONITOR workarea | **World bag** (`lib/world/`, D083) — not Node.geom |
| Cross-mon neighbor / edge / sibling-axis | **World** (`lib/world/neighbors.js`, D084) — tie-break string |
| Slot AABB (`paneRect` / wrap min) | **Presenter** (`lib/presenter/`, D083) — not TOM sizing |
| Shared chords (action ids) | [keybinds.md](plans/forge-firm-abstractions/keybinds.md) — **kernel** table |
| Adapter key overlays | **KeybindAdapterGnome** / **KeybindAdapterWebView** (D088). WebView `Super+a`/`q`; Gnome `Super+q` = quit |
| Platform chords | Those adapters map kernel ∪ overlay (D085) |
| Native window / paint | **ForgeAdapterGnome** / **ForgeAdapterWebView** (D085) — not TOM |
| T6 snapshot / H1 majority resolve | **Epochs** (`lib/epochs/`, D086) — `windowId`; not Meta |

Do not invent a second glossary in PRIORITY or session notes. Unary
collapse is RuleSet, not a second meaning of Promote.

## One word, one meaning (FIRM)

Handoffs, plans, and reviews must use the OpSet glossary. If a sentence
still works after swapping two domain words (promote vs unary collapse,
parent container vs MONITOR, wrap vs join), it is too vague — rewrite with
a Given / Actions / Expect tree.

Forbidden as the only explanation of a tree change:

- “the child inherits the slot”
- “host”
- “promote” meaning both “one node moves up one level” and “delete a CON”
- new nicknames for ops the glossary already named

Worked tree beats paraphrase:

```text
Given:   Mon1(H(V(A,B),C))
Actions: Select(A); Move(left)
Expect:  Mon1(H(A,B,C))
```
