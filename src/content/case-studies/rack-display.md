---
title: "rack-display: a face for the cluster"
summary: A small screen in the rack with a face whose expression follows the cluster's health, an iPhone widget that shows the same face, and the public status feed behind this website.
order: 3
date: October 2026
stack: [Prometheus, Alertmanager, Canvas, Node.js, a Chromium kiosk pod]
---

## Why a face

Grafana is where I go to debug. It's not something I glance at from across the room, and a 1280 × 400 strip of screen is too cramped for useful dashboards anyway. I wanted the rack to tell me how it's doing the way a person would: calm when things are fine, worried when a backup fails, dizzy when a pod is crash-looping.

So the screen shows two eyes and a mouth. Swipe, and it shows the numbers behind the mood: per-node CPU and temperature, PoE power per port, site checks, certificate expiry, backup jobs.

## From metrics to a mood

The page queries Prometheus and Alertmanager every 30 seconds through a read-only nginx proxy. One file of plain JavaScript turns the results into a list of **events**, each with a priority:

| Priority | Event | Face |
|---|---|---|
| 100 | A pod is crash-looping | X eyes, open mouth |
| 95 | A node is down | One eye shut, frown |
| 90 | A site is down, or a certificate expires within a week | Wide eyes |
| 80 | A backup failed | Worried brows, sweat drop |
| 75 | A Flux sync failed | Annoyed |
| 35 | A backup is running | Focused, eyeing a parcel |
| 30 | Flux is reconciling | Looking up, thinking |
| none | All good | Calm, blinking, glancing around |

The highest-priority event drives the face, and the rest show as small chips in the corner. Every expression is a set of numbers (eye height, lid angle, mouth curve) that eases toward its target, so any expression can blend into any other.

A few details made it feel right:

- **Silences count.** Alerts come from Alertmanager, so if I silence a known problem, the face calms down too. A face that's permanently worried gets ignored, the same as a noisy alert channel.
- **It sleeps at night.** From 11 pm to 7 am it dims and dozes. Background work like the nightly backups shows faintly, as if it's dreaming about them. Anything that needs attention still wakes it.
- **Breathing follows load.** The face bobs gently, faster when the cluster is busy. It also drifts slowly so the panel doesn't burn in.
- **Missing data is visible, not silent.** If Prometheus is unreachable, the face looks lost. Any metric source that's missing shows as a dash rather than a zero.

## Getting it onto the screen

The screen is driven by a Pi in the same cluster, so the kiosk is just another Kubernetes Deployment: a small Debian image running the cage Wayland compositor and Chromium in kiosk mode. It's pinned to the node wired to the screen and given access to the GPU and touch input. Everything ships through the same Flux image automation as the rest of the cluster.

Getting it running on real hardware turned up four problems:

- **Mounted upside down.** The cables only reach with the panel flipped, so the kiosk rotates its output in the compositor rather than in CSS. Rotating the picture doesn't rotate touch, so a calibration rule on the node flips touch to match. Without it, every swipe went the wrong way.
- **Software rendering.** The GPU's render device belongs to a different group ID on the node than inside the image, so the compositor quietly fell back to the CPU. The container now joins whatever groups own the devices it's given.
- **Touch lost on replug.** Device hotplug events are delivered per network namespace, so a pod never heard the touch screen come back. The kiosk now uses the node's network.
- **Not enough power.** A Pi 5 on a PoE HAT caps its USB ports at 600 mA, too little for the screen. A bootloader setting tells the Pi it has a 5 A supply, and so far the node hasn't reported any undervoltage.

One service had no Prometheus exporter that runs on ARM, so I wrote a small one.

## Off the screen: a widget and this website

Once the face worked, I wanted it on my phone. A small Node.js service runs the **same** event logic server-side and serves only the face's state, behind a bearer token, to an iPhone widget written for Scriptable. It works on the Lock Screen too.

That service also feeds this website. Its public endpoint is built from an **allowlist**: node names, up or down, CPU, temperature, a fixed status phrase, and this site's uptime. Tests check that nothing else leaks: no hostnames, IP addresses, namespaces, or pod, alert or certificate names. nginx caches it for 30 seconds and Cloudflare caches it again, so public traffic never adds load to Prometheus.

The uptime figure on the front page is counted deliberately. The check runs inside the cluster, so a full outage shows up as missing checks rather than failed ones. I count missing checks as downtime and round down, so the number never claims more uptime than the site actually had.

## What I'd take to work

The pieces here are small, but the habits carry over: one source of truth for state logic, shared by every surface that shows it; status that respects silences, so attention goes where it's needed; and an explicit allowlist with tests at every point where internal data becomes public.

The code is on GitHub at [0xJMart/rack-display](https://github.com/0xJMart/rack-display).
