# forge-layout-settle-contract_se0-design-lock — SE0 design lock + D019

**Status:** done  
**Plan:** forge-layout-settle-contract  
**Branch:** plan/forge-layout-cold-topology  
**Blocker:** (none)  
**Updated:** 2026-08-09

## Goal

Lock SE0 knobs (D1–D10 defaults) and write DECISIONS D019; point settle-learning at settle-contract.

## Acceptance

- [x] D019 in `docs/DECISIONS.md`
- [x] Defaults D1–D10 treated locked for implement (no open design thrash)
- [x] settle-learning plan status → implement via settle-contract

## Context for the next agent

- D019 active: hard Meta ready + soft expectations (file heuristics) + post-settled verify once; focus steal = thrash correct.
- Path: `~/.config/forge/config/settle-heuristics.json` v1.
- Hard 5s; soft clamp focus 3s / geom 5s; floor focus 400ms; rolling N=10; pad +25%; learning trial min(10s, clamp×2).
- Next was SE1 (store) — landed same session.

## Session note

**2026-08-09:** D019 already on branch from prior session; SE0 closed by codifying defaults into SE1 module constants. No operator contest of D1–D10.
