# ADR: New dependency releases wait 14 days, except security fixes

**Date:** 2026-10-18
**Status:** Active
**Supersedes:** N/A

---

## Decision

A new release of any dependency (an npm package or a GitHub Action) is taken only once it is at least 14 days old. Dependabot enforces this with `cooldown: default-days: 14`, and the same rule applies to changes made by hand. Security fixes are exempt. Dependabot alerts and security updates are switched on for the repository, and GitHub's cooldown doesn't delay them.

## Context

Zod 4.6.7 was merged in the register PR six days after its release. It has no known issues: no advisories, it isn't deprecated, and it is signed with build provenance. But the case showed that nothing stopped a days-old release from coming in.

Supply-chain attacks on npm usually work by publishing a hijacked version of a popular package. Such releases are typically caught and pulled within days. Taking releases only after a waiting period avoids most of them, at the cost of getting fixes later.

When the rule was added, Dependabot alerts and security updates were off for the repository, so the security-fix exemption had nothing behind it. They were switched on at the same time.

## Alternatives considered

- **No waiting period:**
  - Why not: any release, including a hijacked one, can arrive the day it's published.
- **A shorter wait (3–7 days):**
  - Why not: GitHub's default cooldown is 3 days. Some hijacked releases have stayed up for about a week, so 14 days gives a safer margin.
- **Downgrade Zod 4.6.7 to 4.6.5 to match the rule:**
  - Why not: 4.6.7 has passed every available check, and it is a patch release on 4.6.5. The rule applies from now on.
- **A 14-day wait for version updates, with security fixes exempt:**
  - **Chosen:** it blocks the common attack and still lets urgent fixes through.

## Reasoning

**The wait targets the common failure:**
- A hijacked release usually gets pulled within days, so a 14-day wait means the project almost never installs one.

**The rule covers the whole dependency tree:**
- `npm install --before <date>` limits the dependencies a package pulls in as well as the package itself. That matters because a hijacked release usually arrives through one of those.

**Security fixes are not slowed down:**
- Dependabot security updates bypass the cooldown. A fix made by hand for a known vulnerability affecting the project may skip the wait.

## Trade-offs accepted

**Bug fixes and features arrive two weeks later:**
- Accepted: the project's dependencies are few, and none is urgent outside security.

**The rule for changes made by hand relies on discipline:**
- `npm install` without `--before` ignores the rule.
- Accepted: the command is written in root `CLAUDE.md`, and review checks dependency changes. A CI check can be added later if needed.

## Implications

**Enables:**
- Lower supply-chain risk, with a clear rule for both people and agents.

**Prevents or complicates:**
- Taking a brand-new release needs a stated reason: a security fix that affects the project.

---

## References

- [Dependabot `cooldown` option](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference)
- `.github/dependabot.yml`
- [TypeScript 7 with Oxlint ADR](./2026-10-17-typescript-7-with-oxlint.md): the TypeScript and `oxlint-tsgolint` pair is still grouped and upgraded together.
