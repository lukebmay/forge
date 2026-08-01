# REST / HTTP JSON APIs

**Precedence:** OpenAPI/spec files, project `docs/DESIGN.md`, and security policy override this file.

Related: `web-backend.md`, `web-frontend.md`, `typescript.md`, `security.md`, `testing.md`.

## Default style (GUIDELINE)

Prefer **resource-oriented HTTP + JSON** (“REST-ish”) for deployable services:

- Stable URLs and methods clients can curl  
- Easy reverse proxies and multi-language consumers  
- OpenAPI (or equivalent) as the surface grows  

### Commands vs resources

| Kind | Use |
| --- | --- |
| **Resources** | Reads and simple CRUD (`GET /offerings`, `GET /health`) |
| **Commands** | Multi-step or multi-document workflows (`POST /exam/submit`, `POST /auth/login`) |

**FIRM intent:** clients must **not** orchestrate multi-document consistency with several POSTs. One server command owns the transaction (DB txn, or filestore temp+rename, etc.). Partial client sagas are a bad abstraction, not a REST inevitability.

## Contract shape (GUIDELINE)

- Consistent success/error envelopes (project-wide).  
- Safe client messages; detail in logs.  
- Explicit authn then authz on protected routes.  
- Idempotency keys on critical POSTs when retries matter.  
- Version or expand wire formats deliberately; pair with document `schemaVersion` when payloads are durable.

## Share schemas between client and server (GUIDELINE — strong)

**Agree: share as much isomorphic contract as possible** so types and validation cannot drift.

| Share (e.g. `packages/shared`) | Do **not** share |
| --- | --- |
| Request/response types | React components, DOM, Vite-only code |
| JSON Schema / Zod / equivalent validators | Node `fs`, server secrets, ORM models |
| Error codes, permission string constants | Browser storage helpers |
| Pure migrators / grade pure functions | Framework route wiring |

### Techniques (pick what fits the stack)

1. **`packages/shared` (or `packages/contracts`)** — TypeScript types + runtime validators; both apps depend on it.  
2. **JSON Schema** as source of truth → types generated or hand-kept next to schema.  
3. **OpenAPI** as source of truth → generate client types and optionally server stubs.  
4. **Single validator module** imported by API middleware and (when useful) client pre-checks.

**FIRM:** never put client-only libraries on the server dependency path, or server-only I/O into shared packages. Shared code must stay **isomorphic** (or clearly split `shared/server` vs `shared/browser` if needed).

## Validation (GUIDELINE)

- Validate untrusted input at the HTTP edge with the **same** schema the client believes in.  
- Re-check domain invariants inside the command (authz, ownership, deadlines).  
- Do not trust client scores, clocks, or role claims for authorization.

## Errors & observability

- Stable machine `code` + human `error` string.  
- Structured logs on command boundaries (see backend observability notes).  
- Never log secrets or full credentials.

## Testing APIs (GUIDELINE)

- Unit: parsers, authz, pure handlers.  
- Integration: critical commands only (auth, submit, config write) once shape is locked — see `testing.md`.
