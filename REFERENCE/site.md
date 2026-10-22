# The site

**When to read this:** Building, previewing or deploying the website, changing its headers, or moving the engine into the browser.

**Related documents:**
- [ADR: Next.js static export on a Cloudflare Worker](./decisions/2026-10-22-nextjs-static-export-on-workers.md): why it's built this way
- [engine.md](./engine.md): the engine the site runs
- [environment-setup.md](./environment-setup.md#deploying-the-site): the Cloudflare credentials
- [Phase 3 spec](../SPECIFICATIONS/03-website-beta-launch.md): what the site will do

---

## What exists

The site is the stack spike's hello-world: one page that runs the engine's central values for the reference house (a 1930s semi in London) on the price cap, in a module web worker, and shows each setup's running cost and carbon. The form, results, provenance and content pages follow in later phase 3 PRs.

## Layout

```
site/
  pages/index.tsx         The page: fetches the data, starts the worker, shows the table
  pages/_document.tsx     The HTML shell: language, noindex, the no-JavaScript message
  src/centralRun.ts       The engine call, framework-free and tested in Node
  src/engine.worker.ts    The module worker: receives the data, posts back the rows or an error
  public/_headers         Security headers for every response
  scripts/copy-data.ts    Copies the register and weather snapshot into public/data/ before a build
  scripts/payload.ts      Measures the first load against the 350 KB budget
  next.config.ts          Static export; externalDir so webpack compiles ../src
  wrangler.jsonc          The beta Worker and the staging Worker
```

`site/` is an npm workspace with its own `tsconfig.json` (DOM and WebWorker libraries, bundler resolution, JSX). The root `npm run typecheck`, `npm run lint` and `npm test` cover it. The site imports the engine from `../src`, and the engine never imports from the site.

## How a page gets its numbers

1. The page fetches `/data/register.json` and `/data/pvgis-tmy-london.json`.
2. It posts both to the worker, so the worker never fetches them again.
3. The worker calls `centralOnCap`, which builds the accessor, reads the inputs and runs the four setups on the cap.
4. The worker posts back `{ ok: true, rows }`, or `{ ok: false, message }`. The page shows the message as text.

The browser gets the register as plain JSON and never loads Zod: the register is validated in CI, and the site imports only the schema's types.

## Commands

| Command | What it does |
| --- | --- |
| `npm run site:build` | Copies the data in and builds the static export into `site/out/` (`next build --webpack`) |
| `npm run site:payload` | Prints each file's gzip and Brotli size and fails if the first load is over 350 KB gzipped |
| `npm run preview -w site` | Serves `site/out/` on `http://localhost:8787` with `wrangler dev`, headers included |
| `npm run deploy:staging -w site` | Deploys to the staging Worker (needs the Cloudflare credentials) |
| `npm run deploy -w site` | Deploys the beta (needs the Cloudflare credentials) |

Set `NEXT_TELEMETRY_DISABLED=1` and `WRANGLER_SEND_METRICS=false` to turn off Next.js's and Wrangler's anonymous usage reports. CI sets both.

## Building

Next.js builds with webpack, not Turbopack, because webpack's Pages Router output has no inline scripts (see the ADR). `next build` type-checks with the repository's TypeScript 7. The committed `site/tsconfig.json` holds the values Next.js requires, so a build doesn't rewrite it.

The register and the weather snapshot are copied into `site/public/data/` at build time. That folder is gitignored; `data/` stays the one committed source.

## Headers and the content security policy

`site/public/_headers` applies to every response. Cloudflare's static assets read it and don't serve it. The policy:
- allows scripts only from the site and `static.cloudflareinsights.com`;
- allows requests only to the site and `cloudflareinsights.com`;
- allows the module worker from the site (`worker-src 'self'`);
- allows no inline scripts or styles, no frames and no plugins.

Inline `<script>` or `<style>` tags would break the page. Put styles in files.

Every page also carries `noindex`, as a meta tag and as an `X-Robots-Tag` header, until the launch PR removes both.

## Serving and deploying

The Worker has no script: Workers static assets serve `site/out/`, send `404.html` for unknown paths, and compress with Brotli or gzip.

`.github/workflows/deploy.yml` deploys:
- **pull requests** from this repository to the staging Worker, `energy-sim-staging`;
- **pushes to `main`** to the beta, `energy-sim`.

Both live on the account's `*.workers.dev` subdomain. The workflow does nothing until the repository variable `CLOUDFLARE_DEPLOY` is `true`; set-up is in [environment-setup.md](./environment-setup.md#deploying-the-site).

## Payload

On 22 October 2026 the first load was 207 KB gzipped (164 KB Brotli), against 350 KB. The largest parts were React (68 KB), Next.js's runtime (41 KB), the weather snapshot (62 KB), the register (26 KB) and the engine in the worker chunk (11 KB). CI runs `npm run site:payload` after the build.
