# ADR: Next.js static export, built with webpack, served by a Cloudflare Worker

**Date:** 2026-10-22
**Status:** Proposed (awaiting Magnus's confirmation, as the phase 3 spec requires)
**Supersedes:** N/A

---

## Decision

The site is a Next.js static export using the **Pages Router**, built with **webpack** (`next build --webpack`), not Turbopack. It lives in `site/` as an npm workspace. A Cloudflare Worker with static assets and no script of its own serves `site/out/`. Headers, including the content security policy, come from `site/public/_headers`.

The engine runs in the browser in a module web worker. The site imports it from `../src` and stays the only place that knows about the framework.

The content security policy allows scripts only from the site itself and Cloudflare Web Analytics, with no `'unsafe-inline'` and no hashes:

```
default-src 'none'; script-src 'self' https://static.cloudflareinsights.com;
connect-src 'self' https://cloudflareinsights.com; worker-src 'self'; img-src 'self';
style-src 'self'; font-src 'self'; manifest-src 'self'; base-uri 'none';
form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests
```

The Vite with React fallback is not needed.

## Context

The phase 3 spec chose Next.js with a static export, with Vite and React as the fallback. It asked a spike to prove five checks before feature work starts. The spike ran on Next.js 16.4.0, React 19.3.0 and Wrangler 4.148.0, on 22 October 2026.

1. **TypeScript 7.** Passed. Next.js 16.4 recognises TypeScript 7 and runs its native `tsc` for the build's type check. A planted type error failed the build. On the first build Next.js rewrote `site/tsconfig.json`, setting `jsx` to `react-jsx` and `esModuleInterop` to true, and adding `allowJs`, `incremental` and `exclude`. The committed tsconfig now holds those values, so later builds leave it alone. The repository keeps one TypeScript version, and the TypeScript 7 ADR stands.
2. **Imports and the worker.** Passed. With `experimental.externalDir`, webpack compiles the engine from `../src` with its `.ts` import extensions. `new Worker(new URL('../src/engine.worker.ts', import.meta.url), { type: 'module' })` becomes a separate 34 KB chunk. In headless Chromium, against `wrangler dev`, the worker ran the four setups on the cap in about 80 ms. The values match the phase 2 report at display rounding.
3. **Security policy.** Passed locally. With the Pages Router and webpack, the exported HTML has no inline script that runs. `__NEXT_DATA__` is a JSON block, which browsers never execute, so the policy needs no `'unsafe-inline'` and no hashes. Chromium loaded the page and ran the worker under the policy with no violations. The securityheaders.com grade needs the deployed address; see "Still to confirm".
4. **Deploys.** Set up, not yet run. `site/wrangler.jsonc` defines the beta Worker (`energy-sim`) and a staging Worker (`energy-sim-staging`). `.github/workflows/deploy.yml` deploys pull requests to staging and `main` to the beta. It stays off until the Cloudflare credentials exist. `wrangler deploy --dry-run` passes for both.
5. **Payload.** Passed. The home page's first load is 207 KB gzipped (164 KB Brotli), against a 350 KB budget. That covers the HTML, every script chunk including the worker, the register (26 KB) and the weather snapshot (62 KB). CI fails above the budget (`npm run site:payload`).

## Alternatives considered

- **Turbopack, Next.js 16's default builder:**
  - Why not: with the Pages Router it puts one inline bootstrap script in each page, which lists that build's chunk names. The policy would need a hash recomputed into `_headers` on every build. It built and ran, with a similar payload (215 KB gzipped), so it remains an option if webpack support is dropped.
- **The App Router:**
  - Why not: it injects several inline scripts per page for the React Server Components payload. A static export can't use per-request nonces, so the policy would need `'unsafe-inline'` or many hashes.
- **Vite with React (the agreed fallback):**
  - Why not: Next.js passed checks 1 and 3, which were the conditions for switching.
- **A Worker script that adds headers:**
  - Why not: Workers static assets apply `_headers` themselves, so the Worker needs no code. A script can be added later if headers need logic.

## Reasoning

**The strictest policy with the least machinery:**
- `script-src 'self'` with no hashes or nonces can't drift out of step with a build.
- Nothing has to post-process the export.

**The engine stays framework-free:**
- The site's engine call (`site/src/centralRun.ts`) is a plain module that Vitest tests in Node. The worker is a thin relay around it.

**One TypeScript:**
- Next.js uses the repository's pinned TypeScript 7, so there's no second compiler version to keep in step.

## Trade-offs accepted

**webpack, not Turbopack:**
- Next.js now treats Turbopack as the default, and webpack builds need the `--webpack` flag.
- Accepted: webpack is still supported in Next.js 16. If it's dropped, the Turbopack route above (with a build-time hash) is known to work.

**The Pages Router:**
- New Next.js features land in the App Router first.
- Accepted: the site is a handful of static pages with no server, which is what the Pages Router does well.

**`experimental.externalDir`:**
- The flag lets webpack compile files outside `site/`. It is marked experimental.
- Accepted: the alternative is moving the engine into a package, which can follow if the flag goes away.

**Wrangler's local server has a known `sharp` advisory:**
- `npm audit` reports a high-severity advisory in `sharp`, which Wrangler's local server (Miniflare) uses for image bindings. The fix is in Wrangler 4.149.0, released a few hours inside the 14-day window.
- Accepted: it affects only the local development server, which this site uses without images. Dependabot's security update, which the wait doesn't delay, will bring the fix.

## Still to confirm

- The first deploy to `*.workers.dev` from the workflow, once Magnus adds the Cloudflare credentials.
- The securityheaders.com grade on the deployed address. The headers are the set that grades A+ (a policy, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy`).

## Implications

**Enables:**
- Feature PRs (form, results, provenance) can build on a working page, worker and policy.
- The launch PR's Playwright checks can run against `wrangler dev`, which serves the same headers as production.

**Prevents/complicates:**
- Inline `<style>` or `<script>` tags break the policy. Styles must be in files: Tailwind's build output is a stylesheet, which fits.
- Cloudflare Web Analytics is added by hand as a script tag loading from `static.cloudflareinsights.com`, with no inline configuration.

---

## References

- [Phase 3 spec](../../SPECIFICATIONS/03-website-beta-launch.md): the five spike checks
- [REFERENCE/site.md](../site.md): how the site is built, served and deployed
- [ADR: TypeScript 7 with Oxlint](./2026-10-17-typescript-7-with-oxlint.md)
- [ADR: client-side, build-time snapshots](./2026-10-17-client-side-build-time-snapshots.md)
- Configuration: `site/next.config.ts`, `site/wrangler.jsonc`, `site/public/_headers`, `.github/workflows/deploy.yml`
