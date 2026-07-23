# QEMU / KVM

**Precedence:** host virt stack (libvirt/virt-manager), org image pipeline, and security policy override this file.

## When

Full VMs, kernel/firmware work, multi-OS testing, workloads that need a real machine boundary (not just a container).

## Practice

- Prefer **KVM** acceleration on Linux hosts when available
- libvirt XML/virsh or virt-manager as the project does — avoid one-off qemu CLI flags undocumented in the repo
- Images: qcow2 sparseness; don’t commit large disks; document base image source/checksum
- Networking: user-mode for throwaway; bridge/macvtap only with clear host impact
- Snapshots/checkpoints: know they are not a substitute for guest-level backups
- Shared folders: security boundary is weak — treat as semi-trusted

## Safety

- Never run untrusted images with host devices passed through without review
- PCI/USB passthrough: exclusive access and IOMMU groups matter
- Secrets for cloud-init/SSH: inject at provision time, not into golden images when avoidable

## Tools

- `qemu-system-*`, `qemu-img`, `virsh`, `virt-install`, cloud-init as applicable
