# Podman

**Precedence:** project Containerfiles, quadlets/systemd units, and rootless policies override this file.

Docker-compatible mental model: also read `agents/languages/docker.md` for image hygiene.

## Differences that matter

- Often **daemonless** and **rootless** by default — prefer that posture
- CLI largely Docker-like (`podman build/run/compose`); don’t assume every Docker flag/plugin exists
- Pods group containers (k8s-like) without a full cluster when useful
- SELinux labeling on volumes matters on Fedora/RHEL — use correct `:Z`/`:z` only when needed

## Practice

- Same image hygiene as Docker: pin bases, multi-stage, non-root, no secrets in layers
- Prefer quadlet/systemd for long-running local/server services over ad-hoc shells
- Rootless networking/ports: know unprivileged port limits and pasta/slirp4netns behavior
- `podman generate kube` / play kube when bridging to k8s manifests helps the project

## Tools

- `podman`, `podman-compose` / `podman compose`, buildah/skopeo when already in use
