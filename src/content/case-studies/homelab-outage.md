---
title: Bringing my homelab back after 36 days down
summary: A power blip took out my NAS's storage array and, with it, most of my cluster. Nothing told me for five weeks. This is what broke, how I brought it back, and what I changed so it can't happen quietly again.
order: 1
date: October 2026
stack: [k0s, Flux, Unraid, Sealed Secrets, restic, Prometheus]
---

## Summary

Around August 29 a power event rebooted my Unraid NAS and the four Raspberry Pis that run my Kubernetes cluster. The cluster came back. The NAS's storage array did not: auto-start was off, and one of its two parity disks had failed. With no array there were no NFS shares, so every workload that stored data on the NAS sat waiting for volumes that would never mount: Nextcloud and its database, the media server, and more.

I found out on October 4, about 36 days later. Nothing had alerted me, because Alertmanager was routing every alert to a null receiver.

| | |
|---|---|
| **Duration** | ~36 days (late August to October 4) |
| **Impact** | File sync, photos, media, and single sign-on down; password manager admin unreachable |
| **Data loss** | None. Every volume was intact once the array started |
| **Detected by** | Me, trying to use it |

## What actually broke

It looked like one outage. It was really six problems stacked up, most of them years of small shortcuts:

1. **The array didn't auto-start after power loss.** Auto-start was off, and parity disk 1 had been disabled with 28 grown defects.
2. **Volumes pointed at a path the NAS doesn't export.** Fifteen NFS PersistentVolumes used the cache-pool path instead of the user-share path. They would have failed on any remount, not just this one.
3. **Single sign-on had already been dead for about six months.** Bitnami removed its public images, Keycloak's image pull failed, and oauth2-proxy crash-looped behind it.
4. **An open-ended Helm chart range.** Nextcloud's chart was pinned to `>=` a version, so a reconcile pulled a chart two Nextcloud majors ahead. Nextcloud refused the skip, which was the safe outcome, but it didn't start.
5. **`latest` image tags with `IfNotPresent`.** Nodes kept running whatever `latest` meant when they first pulled it. My password manager was a year behind its clients and failed every login.
6. **No alerting.** Prometheus was collecting everything. Alertmanager sent all of it to `null`.

Number 6 is the real root cause. Everything else is the kind of thing that breaks; not knowing for five weeks is the failure.

## Recovery

I worked through it in one long session, backing up before every step that touched data.

- **Started the array safely.** The first start attempt through Unraid's command interface crashed its management daemon because a required form field was missing. Nothing had mounted, so nothing was damaged. I restarted the daemon and started the array with the full set of fields. Parity 2 still protected the data.
- **Fixed the 15 volumes.** NFS PersistentVolumes are immutable, so each one had to be deleted and recreated with the right path, with Flux paused so it wouldn't fight me. One gotcha cost me a re-do: I resumed Flux before it had fetched my fix, and it re-applied the old revision. My deploy script now refuses to resume until Flux's artifact matches the commit.
- **Stepped Nextcloud up one major at a time,** after a database dump, and pinned the chart to an exact version.
- **Brought Keycloak back** on archived images first, then later moved it to the official chart and image so I'm no longer depending on a vendor's goodwill.
- **Pinned every image tag** that was on `latest`.

## Making it impossible to miss next time

Getting it running took a day. Making sure I'd hear about the next one took the rest of the week:

- **Alerts to email.** Alertmanager now emails anything critical plus every backup problem. I tested it end to end, and on the first day it correctly fired for the dead parity disk.
- **A dead man's switch.** Alertmanager's always-firing Watchdog alert pings an external service every five minutes. If the cluster goes quiet for any reason, including losing power, I get told from outside my network. The NAS pings it separately.
- **NAS monitoring.** The NAS exports its array and disk state to Prometheus, with alerts for a stopped array, a disabled disk, disk errors, and a full cache.
- **Backups that I've actually restored.** Nightly database dumps, a nightly etcd snapshot of the cluster, and an encrypted off-site copy to S3 Glacier Instant Retrieval with restic, about $3 a month for roughly 790 GB. Then I ran a restore drill. Ninety-three sample files came back byte-identical by SHA-256, and every database restored into a scratch instance with matching row counts.
- **Secrets out of Git.** Plaintext Secrets moved to Sealed Secrets, and anything that had ever been exposed was rotated.
- **Upgrades I'd been avoiding.** Kubernetes went from 1.32 to 1.34, one minor version at a time.

## What I took from it

- **Monitoring you don't route anywhere is decoration.** The data to catch this on day one was already in Prometheus.
- **Unpinned versions are deferred outages.** Three of the six problems were "whatever the latest version is today".
- **A backup you haven't restored is a hope.** The drill found two gotchas that would have bitten me during a real restore.
- **Write it down as you go.** I kept a running changelog and runbook in my notes. It's why this write-up exists, and why the next recovery will be faster.

## How I worked

I did the recovery with Claude Code as a pair. The useful part was setting it up to be safe on infrastructure I care about: scripted runbooks for status checks, deploys, and backups, and a pre-command hook that blocks the operations that can destroy data. That includes the bad array-start command, deleting namespaces or local volumes, and force-pushing the GitOps repo. When the hook blocks something, it has to ask me. That mix of automation and guardrails is the same thing I'd want from any tool with production access.
