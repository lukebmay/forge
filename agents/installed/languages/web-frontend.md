# Web frontend (stack-agnostic)

**Precedence:** project design system, a11y policy, bundler/framework docs, and in-repo lint/format configs override this file.

Related: `html.md`, `css.md`, `javascript.md`, `typescript.md`, `react.md`.

## Principles

- **Users first:** clarity, speed, accessibility over clever UI
- **Progressive enhancement:** core content usable without perfect JS when feasible
- **Least power:** HTML/CSS before JS; browser APIs before heavy libraries
- **Predictable UI:** obvious navigation, stable layout, clear loading/error/empty states
- **Performance budgets:** ship less JS/CSS; measure LCP/INP/CLS when changing UX

## Structure

- Separate **content**, **presentation**, and **behavior** enough that each can change without thrashing the others
- Colocate feature UI when the app is feature-sliced; shared primitives in a design-system folder when the project has one
- Keep routing, data fetching, and view logic boundaries explicit

## Accessibility

- Semantic HTML first; ARIA only to fill gaps
- Keyboard: all interactive controls reachable and operable
- Focus visible; don’t trap focus without escape
- Contrast and text sizing: respect system/user preferences when cheap
- Images: meaningful `alt` (or empty alt for pure decoration)
- Forms: labels, errors tied to fields, don’t rely on color alone

## State & data (client)

- Local state by default; lift only when sharing requires it
- Server/cache state separate from ephemeral UI state when the app has that split
- Optimistic UI only with clear rollback on failure
- Never trust the client for authorization — enforce on the server

## Security (browser)

- Escape/encode untrusted content; avoid `innerHTML`///`dangerouslySetInnerHTML` unless sanitized
- CSRF, cookie flags, and auth flows: follow backend contract
- Don’t store long-lived secrets in `localStorage` / frontend bundles
- Dependencies: prefer maintained packages; audit when adding weight

## UX defaults

- Fast feedback on actions; disable or debounce double-submit
- Prefer skeleton/placeholder over layout jump
- Respect `prefers-reduced-motion` for non-essential animation
- Mobile: touch targets, viewport, no hover-only critical paths
