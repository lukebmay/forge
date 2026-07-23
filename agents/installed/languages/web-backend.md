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

- Stable contracts; version or expand carefully (don’t break clients silently)
- Consistent error shape; safe messages to clients, detail in logs
- Pagination/filtering/sorting as first-class when lists can grow
- Authn then authz on every protected route; never “hidden” URL security
- Prefer clear resource models over kitchen-sink endpoints

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

## Ops handoff

- 12-factor style config when it fits
- Stateless app processes behind the load balancer when horizontal scale is a goal
- Runbooks over tribal knowledge for deploy/rollback
