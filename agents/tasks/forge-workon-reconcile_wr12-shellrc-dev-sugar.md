# WR12 — shellrc black `dev` profile → tiles sugar

**Plan:** [forge-workon-reconcile.md](../plans/forge-workon-reconcile.md)  
**Status:** Ready  
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

(empty — fill after implement)
