# Kubernetes

**Precedence:** cluster policies (PSS/PSA, NetworkPolicy), Helm/Kustomize layout, and platform docs override this file.

## Workloads

- Declarative manifests; no snowflake `kubectl edit` as the source of truth
- Requests **and** limits; sensible probes (`readiness` ≠ `liveness`)
- ≥1 replica for user-facing services when HA is expected; PDBs for voluntary disruption
- Config via ConfigMap/Secret; never commit raw secrets
- Prefer immutable tags/digests for production images

## Safety

- Run as non-root; readOnlyRootFilesystem when possible; drop caps
- NetworkPolicy default-deny where the platform supports it
- RBAC least privilege for service accounts and humans
- Don’t mount service account tokens if unused

## Rollout

- Rolling updates with capacity awareness; tested rollback
- Migrations: job/init patterns that don’t race the new app version
- ResourceQuota/LimitRange: stay within namespace budgets

## Observability

- Structured logs to stdout/stderr; metrics/traces via the cluster standard
- Events and `kubectl describe` for crashloop diagnosis before rewriting app code

## Tools

- `kubectl`, Helm/Kustomize/Jsonnet as the repo already uses
