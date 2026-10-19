# resume-site

My resume site at [joe-martinez.com](https://joe-martinez.com): a static Astro page plus an interactive
three.js model of my homelab rack. The model's LEDs and the face on its screen follow the real
Raspberry Pi cluster. The site itself is served from that cluster.

- `src/data/resume.yaml`: all resume content. The home page, `/resume` and `resume.pdf` render from it
- `src/scene/`: the 3D rack (React Three Fiber). `rack.ts` is the hardware layout; `face.ts` is the
  [rack-display](https://github.com/0xJMart/rack-display) face drawn into the screen texture
- `/api/status`: proxied by nginx to rack-display's sanitized `/public/status` (no hostnames, IPs or app names)
- `scripts/render.mjs`: renders `resume.pdf`, the no-WebGL poster and the OG image after a build

## Develop

```sh
npm install
npm run dev            # http://localhost:4321/?mock for demo data cycling through every face
npm run check
npm run build && (npx astro preview &) && npm run render
```

Without `?mock` and with no `/api/status`, the rack shows its offline state.

## Deploy

GitHub Actions builds the site, renders the PDF/images, and pushes an arm64 nginx image to
`ghcr.io/0xjmart/resume-site` tagged `main-<run>-<sha>`. Flux image automation in the (private)
Homelab repo rolls it out.
