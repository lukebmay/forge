# meta-probe results layout

Machine-local analytics (**gitignored** except this README / `.gitignore`).

## Namespace (required)

```text
results/
  <host>/
    <session>/          # wayland | x11
      <suite>/          # calibration | full-suite | pilot | strict
        run-<phase>-<UTC>.json
        latest.json     → last run in this suite
      latest.json       → last run for this host×session
  latest.json           → last run overall
```

Examples:

| Path | Meaning |
| --- | --- |
| `black/wayland/calibration/` | First-pass knob discovery on black Wayland |
| `black/wayland/full-suite/` | Science matrix n=10 on black Wayland |
| `black/x11/full-suite/` | Same matrix on black X11 (do not mix when comparing) |
| `gray/wayland/calibration/` | Recalibrate knobs on slower laptop |

Driver sets this automatically from `--host`, `XDG_SESSION_TYPE` (or `--session`), and `--suite`.

## Suites

| Suite | Purpose |
| --- | --- |
| `calibration` | Strict settle (agreeCount=5), n=2, small app set — discover floor |
| `full-suite` | Tuned knobs after calibration (black Wayland: agreeCount=3) |
| `pilot` | Staged smoke (nautilus → ghostty → inkscape) |
| `strict` | Original conservative knobs if thrash appears |

## Comparing hosts / sessions

Copy trees or individual JSON between machines. Compare only same suite knobs when
judging settle quality; always label host + session + suite in prose.

```bash
python3 analyze.py results/black/wayland/full-suite/latest.json
python3 analyze.py results/black/wayland/full-suite/latest.json \
  --compare results/black/x11/full-suite/latest.json
```
