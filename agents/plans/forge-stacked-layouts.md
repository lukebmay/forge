# Plan: STACKED layouts as a supported product path

**Status:** Queued (next major after layout rename + mon order)  
**Updated:** 2026-07-28

## Why

Daily-driver work intentionally preferred **TABBED** over **STACKED** (stack-off
default, DnD → tab). Some users still want i3-style stacked containers. Stacks
should be a deliberate, documented mode — not half-broken residue.

## Goals (draft)

1. **On by default or clear opt-in** — decide product default vs gsettings flag.
2. **Layout profiles** can express `stacked` cells (tiles sugar + ensure).
3. **Keybinds / DnD / chrome** behave predictably for STACKED (not only TABBED).
4. **No thrash** with mon order, soft rehome, or session restore.
5. Docs: when to use stacked vs tabbed.

## Non-goals (v1)

- Replacing tabbed as Luke’s personal default on black.
- Full i3 feature parity for every stack edge case.

## Entry points

| Area | Notes |
| --- | --- |
| gsettings | `stacked-tiling-mode-enabled` (exists) |
| layout plan | `ensure_layout` already knows stacked modes |
| decoration | stack chrome vs tab chrome |
| daily-driver T0 | stack-off was intentional — revisit |

## Next task

Spike: inventory current STACKED support gaps (keybind, DnD, layout sugar,
session) → task breakdown. Do not implement until spike accepted.

## Related

- [forge-daily-driver](./forge-daily-driver.md) T0 stack-off
- [docs/user/layout.md](../../docs/user/layout.md)
