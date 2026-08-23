---
title: Documentation
read_when: Writing design docs, DECISIONS, user docs, or choosing where “why” lives
order: 60
---

# Documentation

## Where “why” lives

| Doc | Role |
| --- | --- |
| `docs/DESIGN.md` | Architecture narrative |
| `docs/DECISIONS.md` | Compact decision log (retro source) |
| `agents/HANDOFF.md` / plan·task notes | Cold-continue (complete + succinct) |
| `agents/plans/` · `agents/tasks/` | Execution |
| Source comments | Minimal *why* only — `comments.md` |

Put in DESIGN/DECISIONS when a future reader would ask *why*. Keep volatile checklists out.

## DECISIONS.md shape

| ID | Date | Topic | Imp | Status | Decision | Why |
| --- | --- | --- | --- | --- | --- | --- |
| D001 | YYYY-MM-DD | deploy | P0 | active | … | one line |

Imp: P0 architecture/security · P1 product default · P2 implementation · P3 note.  
Status: active | superseded | rejected.

When shipping a non-obvious choice, add/update a DECISIONS row (and DESIGN if narrative changed).

### Precedence (FIRM)

**Newest design meeting / DECISIONS row for a topic wins.** Supersede older
rows in place (`Status=superseded` + new ID); do not silently edit history.
Accepted meeting locks and plan “Status: Accepted” sections outrank older plan
draft prose on the same question. Full rule: catalog **`general.md`** § Design
decisions.

## Hygiene

- Short titled sections in DESIGN
- Update or delete stale claims when code changes
- No secrets or real credentials
