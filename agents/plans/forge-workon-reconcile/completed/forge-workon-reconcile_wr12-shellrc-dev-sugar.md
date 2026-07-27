# WR12 — shellrc black `dev` profile → tiles sugar

**Plan:** [forge-workon-reconcile.md](../plans/forge-workon-reconcile.md)  
**Status:** Done (A/B AGREE 2026-07-27; shellrc uncommitted)  
**Depends on:** **WR10** (normalize must accept sugar)  
**Priority:** P1 — third slice (real daily profile)  
**Repo:** **shellrc** (`~/dev/me/shellrc`), not forge git root  

## Goal

Rewrite `configs/forge/workon/hosts/black/dev.json` to the compact `tiles`
authoring form while preserving the same desk intent. Update shellrc
workon README so humans see sugar first.

## Current intent (preserve)

| Slot | Apps |
| --- | --- |
| mon0 left tab | Google Chrome (main), Grok PWA |
| mon0 right | Ghostty |
| mon1 left | Ghostty |
| mon1 right tab | YouTube, Gmail, Google Voice PWAs |

Rich **match** rules (Chrome title / PWA title~=) must survive — use string
cells only where match is safe; use **rich object cells** for Chrome/PWAs
so idempotent reuse does not regress.

## Suggested shape (illustrative)

```json
{
  "description": "Dual-mon morning on black",
  "tiles": {
    "mon0": [
      [
        {
          "id": "chrome-luke",
          "match": { "class": "Google-chrome", "title": "Google Chrome" },
          "open": { "app": "google-chrome", "wmClass": "Google-chrome", "timeout": 25000 }
        },
        {
          "id": "grok",
          "match": { "class": "Google-chrome", "title~=": "Grok" },
          "open": { "app": "Grok", "wmClass": "Google-chrome", "timeout": 25000 }
        }
      ],
      {
        "id": "ghostty-left",
        "match": { "class": "com.mitchellh.ghostty" },
        "open": { "app": "ghostty", "timeout": 15000 }
      }
    ],
    "mon1": [
      {
        "id": "ghostty-right",
        "match": { "class": "com.mitchellh.ghostty" },
        "open": { "app": "ghostty", "timeout": 15000 }
      },
      [
        { "id": "youtube", "match": { "class": "Google-chrome", "title~=": "YouTube" }, "open": { "app": "YouTube", "wmClass": "Google-chrome", "timeout": 25000 } },
        { "id": "gmail", "match": { "class": "Google-chrome", "title~=": "Gmail" }, "open": { "app": "Gmail", "wmClass": "Google-chrome", "timeout": 25000 } },
        { "id": "voice", "match": { "class": "Google-chrome", "title~=": "Voice" }, "open": { "app": "Google Voice", "wmClass": "Google-chrome", "timeout": 25000 } }
      ]
    ]
  }
}
```

(Adjust to whatever WR10 final cell schema is; keep match quality.)

## Acceptance

1. `forge workon show dev` / `--dry-run` resolves shellrc file and plans
   equivalent role set (same six roles / slots).  
2. README in shellrc `configs/forge/workon/` documents sugar happy path +
   rich cells for PWAs.  
3. No forge-side hardcoding of black/dev apps.  
4. Commit in **shellrc** repo (separate from forge).

## Non-goals

- Changing displays/gdisplays wiring  
- WR9 env auto-export (optional follow-up)

## Session note

**WR12 implement (Task Force A, 2026-07-27).** Shellrc only; no forge product code.

| Path | Change |
| --- | --- |
| `shellrc/.../hosts/black/dev.json` | Full IR → compact `tiles` sugar; rich cells for Chrome/PWAs + Ghostty ids |
| `shellrc/.../workon/README.md` | Sugar happy path first; rich-cell guidance for PWAs |

**Validate** (`validate_reconcile_profile`): roles
`chrome-luke, grok, ghostty-left, ghostty-right, youtube, gmail, voice`
(same seven as pre-WR12); slots
`mon0.s0, mon0.s0, mon0.ghostty-left, mon1.ghostty-right, mon1.s0×3`;
layout mon0 hsplit tabbed[chrome,grok]|ghostty · mon1 hsplit
ghostty|tabbed[yt,gmail,voice]; marginal coexist; overflow mon0.overflow.

**Commit:** left **uncommitted** in shellrc (orchestrator: no commit unless user says commit).

**B AGREE.** Slot names auto `s0` vs old left-tab/comms — equivalent intent.
Next: **WR13** docs.
