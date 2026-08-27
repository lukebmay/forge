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
| Mark 2 | [prototypes/container-motion/src/opsets/mark2.md](../prototypes/container-motion/src/opsets/mark2.md) | `src/opsets/mark2.mjs` |

**Changing an OpSet design doc without updating that OpSet, its tests, and
shorthand/UI in the same effort is a bug.** Do not “clarify later.” Do not
leave handoffs using the old words.

TOM kernel rules (ROOT / WS / MONITOR / unary collapse / breakout = promote)
live in that OpSet doc plus `agents/design.md` § Tiling Object Model. Do not
invent a second glossary in PRIORITY or session notes.

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
