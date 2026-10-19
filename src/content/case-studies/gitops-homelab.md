---
title: A GitOps cluster on four Raspberry Pis
summary: Four Raspberry Pi 5s, one Git repository, and no kubectl apply. How the cluster is put together, and the two problems that taught me the most about running it.
order: 2
date: October 2026
stack: [k0s, Flux, Traefik, Keycloak, CloudNativePG, Prometheus]
---

## The setup

| | |
|---|---|
| **Nodes** | 4 × Raspberry Pi 5 (4 cores, 8 GB, NVMe boot), powered over PoE from one switch at about 5 W each |
| **Kubernetes** | k0s 1.34; one node is both controller and worker |
| **Delivery** | Flux, from a single private repository. 26 Flux Kustomizations, about 80 running pods |
| **Storage** | Each Pi's NVMe through local-path, plus NFS from an Unraid NAS for anything large |
| **Day-to-day load** | 2–5% CPU across the cluster. It's sized for learning, not for load |

Everything the cluster runs is in Git. The root of the repository lists one Flux Kustomization per component, with dependencies between them, so cert-manager and Traefik come up before the apps that need them. Pruning is on everywhere, so deleting something from the repository deletes it from the cluster.

## How a request gets in

MetalLB hands out a LAN address to Traefik, the ingress controller. cert-manager gets certificates from Let's Encrypt through Cloudflare DNS challenges, so nothing has to be reachable from the internet to get one. Anything with an admin page sits behind oauth2-proxy and Keycloak, so one login covers the apps that support single sign-on and protects the ones that don't. For remote access I use the Tailscale operator rather than opening more ports.

## Secrets, versions and images

- **Secrets** are Sealed Secrets: encrypted in the repository, decrypted only by the controller in the cluster. The controller's keys are backed up off the cluster, because losing them means re-creating every secret.
- **Chart versions and image tags are pinned.** That's a rule I learned the hard way (see [the outage write-up](/work/homelab-outage)).
- **My own images update themselves.** CI tags every build with a run number, Flux's image automation picks the newest, commits the change to the repository, and applies it. This site deploys that way.

## Data and backups

Databases live on the Pis' NVMe: Postgres through the CloudNativePG operator, plus MariaDB for Nextcloud. Bulk data lives on the NAS. Every night a set of Kubernetes CronJobs dumps the databases, snapshots the cluster's etcd, and pushes an encrypted copy to S3 with restic. Alerts fire if a backup fails or goes stale, and I've done a full restore drill into scratch databases to prove the copies are usable.

## Two problems worth telling

### Volumes that went stale on their own

Every so often the media server's library looked empty and Nextcloud lost its data directory, both with `Stale file handle` errors. Other pods using the same NFS share were fine.

The difference was how they mounted it. The broken pods mounted a sub-folder of the share (`subPath`); the healthy ones mounted the share root. On Unraid, a folder's inode, and so its NFS file handle, comes from whichever disk the folder first exists on. With the SSD cache enabled, new writes created the folder on the SSD, the nightly mover later moved it to the hard disks, and the folder's handle changed underneath every pod that held it. Pods that look things up by name from the share root never notice; pods holding a sub-folder handle do.

The fix was to keep those shares on a single disk with no cache, then prove it. I recreated the trigger by writing new folders through two apps, and watched the inodes stay put and both mounts stay valid. The rule I wrote down: **any share mounted by sub-path must live on exactly one disk.**

### Right-sizing from metrics, and getting it wrong once

The Pis only have four cores, so I set resource requests from a week of Prometheus data rather than guessing. Request is about the 95th percentile, the memory limit is 1.5 to 2 times the peak, and there are no CPU limits, because on small nodes they mostly just throttle startup. Removing them alone fixed Keycloak's slow boots.

My first pass overestimated some workloads by 10×. I'd taken each pod's 95th percentile and then the maximum across pods, and a day of drains and upgrades had left lots of short-lived pods whose "p95" was mostly their startup spike. Aggregating per workload first, then taking the percentile over time, gave sensible numbers.

It also caused a short incident. A setup sidecar that runs once at startup got killed for memory, because steady-state metrics never saw its one-off spike, and Nextcloud was unavailable for about eight minutes. Init-style containers now get generous limits regardless of what the graphs say.

## What's next

The cluster is the base for an ML platform: object storage and MLflow, Argo Workflows for pipelines, then a GPU node for model serving with vLLM, traced and evaluated with Arize Phoenix. The rack has three empty units for exactly that.
