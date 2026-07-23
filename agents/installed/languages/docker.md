# Docker

**Precedence:** project `Dockerfile*`, Compose files, registry policy, and org security baselines override this file.

## Images

- Prefer small, pinned bases (`:version` or digest); avoid `:latest` in prod
- Multi-stage builds; ship only runtime needs
- Non-root user in final image when practical
- One process per container (sidecar pattern for extras)
- `COPY` minimal context; use `.dockerignore`
- Don’t bake secrets into layers; use build secrets / runtime env

## Containers

- Read-only root FS when the app allows it
- Drop capabilities; no `--privileged` unless unavoidable and reviewed
- Explicit published ports; don’t expose admin interfaces broadly
- Resource limits (CPU/memory) in compose/k8s/swarm as available
- Healthchecks that match real readiness

## Compose

- Declarative services/networks/volumes; named volumes for durable data
- Env files for non-secret config; secrets mechanism for secrets
- Pin image tags the same way as Dockerfiles

## Local vs prod

- Dev convenience must not become prod defaults (bind-mount whole FS, host network, privileged)
- Same image artifact through environments when CD allows it

## Tools

- `docker`, `docker compose`; rootless/podman-compatible syntax when the project uses it
