# Web backend (stack-agnostic)

**Precedence:** service architecture docs, API specs, security policy, and in-repo frameworks override this file.

Related: language guides, `postgres.md` / other DB notes, `docker.md`.

## Principles

- **Correctness & safety** over cleverness
- **Explicit boundaries:** HTTP/API, domain logic, persistence, external I/O
- **Fail closed:** deny by default; validate all untrusted input
- **Idempotency** for retries and payment-like operations where required
- **Observable:** structured logs, metrics, traces on the paths you change

## API design

- Default **HTTP + JSON** resources; use **command POSTs** for multi-document workflows — see `rest-api.md`
- **Share** isomorphic types/schemas/validators with the client (`packages/shared` etc.); never share client-only or server-only code across that boundary
- Stable contracts; version or expand carefully (don’t break clients silently)
- Consistent error shape; safe messages to clients, detail in logs
- Pagination/filtering/sorting as first-class when lists can grow
- Authn then authz on every protected route; never “hidden” URL security
- Prefer clear resource models over kitchen-sink endpoints; one server command owns consistency

## Trust & validation

- Validate at the edge (schema/types); re-check invariants in domain logic
- Parameterize all DB queries; no string-built SQL with user data
- SSRF/path traversal/file upload: allowlists, size limits, isolated storage
- Secrets only from env/secret managers — never commit

## Data & consistency

- Transactions for multi-step writes that must succeed together
- Choose consistency level deliberately (strong vs eventual); document it
- Migrations: expand/contract safe when zero-downtime matters
- Background jobs: durable queue, retry with backoff, dead-letter visibility

## Reliability

- Timeouts on outbound calls; bounded retries; circuit-break when appropriate
- Graceful shutdown: drain in-flight work
- Health/readiness separate from “process is up”
- Feature flags/config: fail safe if config missing

## Performance

- Measure before optimizing; index for real query patterns
- Avoid N+1; batch when the data layer supports it
- Cache with explicit TTL/invalidation — not “forever” by accident
- Cheap handlers stay cheap; push heavy work to async workers

## Logging & debugging (GUIDELINE)

- Prefer **structured logs** (JSON lines) early; filesystem sink is fine before a UI
- Levels: debug/info/warn/error; default info in prod; debug opt-in
- Correlate requests with a request/trace id when the service is multi-step
- Never log secrets, passwords, tokens, or full auth headers
- First-class logging before large feature surface area; UI log browser can wait
- Pick a maintained logger (e.g. pino in Node) over ad-hoc `console.log` soup — see project DECISIONS for the chosen lib

## Ops handoff

- 12-factor style config when it fits
- Stateless app processes behind the load balancer when horizontal scale is a goal
- Runbooks over tribal knowledge for deploy/rollback
