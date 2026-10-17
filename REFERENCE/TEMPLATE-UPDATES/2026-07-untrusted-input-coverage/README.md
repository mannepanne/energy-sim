# Untrusted-input contract: close the four-agent coverage gap

**Status:** Active
**Authoritative source:** https://github.com/mannepanne/useful-assets-template/pull/63
**Applies to:** projects that have already applied [`2026-07-read-only-reviewers`](../2026-07-read-only-reviewers/README.md) — see [Who needs this](#who-needs-this).

---

## Who needs this

**If you have NOT yet applied the two 2026-07 packets:** stop, ignore this packet, and apply [`2026-07-fan-out-review-synthesis`](../2026-07-fan-out-review-synthesis/README.md) then [`2026-07-read-only-reviewers`](../2026-07-read-only-reviewers/README.md), back to back. Those fetch from `main`, which already contains this fix. You get it for free and this packet has nothing to add.

**If you have already applied `2026-07-read-only-reviewers`:** you need this. Your four team/standard reviewer agents read attacker-reachable PR content without being told to distrust it, and re-running the read-only packet will not give you the fix.

**Is it urgent for my project?** The discriminator is **public vs private**, not how many contributors you have:

| Repo | Urgency |
|---|---|
| **Public**, any number of contributors | **Apply it.** `gh pr view --comments` ingests comments authored by *anyone with a GitHub account*. They need not be a contributor. |
| **Public**, accepting fork PRs from strangers | **Apply it,** and also work through the tightening checklist in the threat-model ADR — the diff itself is attacker-controlled. |
| **Private**, single contributor | Low risk today: every surface those agents read is authored by you, so injection would be self-inflicted. Apply it anyway — see [Why apply it even on a private solo repo](#why-apply-it-even-on-a-private-solo-repo). |

---

## Why

`.claude/agents/CLAUDE.md` scopes the untrusted-input contract to *"every reviewer agent that reads PR content (title, description, commit messages, diff, **or comments**)"*, and instructs each such agent to reference the contract from its Role section.

Four of the ten shipped reviewer agents did exactly that and never inherited it:

| Agent | Reads PR content | Had the Role line |
|---|---|---|
| `triage-reviewer`, `light-reviewer`, `technical-writer` | yes | ✅ |
| `code-reviewer`, `security-specialist`, `product-reviewer`, `architect-reviewer` | yes, including `gh pr view <N> --comments` | ❌ |
| `requirements-auditor`, `technical-skeptic`, `devils-advocate` | no — they read a local spec | n/a |

**Coverage was tracking the wrong property.** The contract's second paragraph explains that agents emitting control-flow signals the dispatcher parses (`TIER:`, `MISCLASSIFICATION SUSPECTED:`) *load-bearingly* need the contract, because a forged signal hijacks dispatch. That reasoning picks out precisely the two agents that had it. But signal emission is not the scope test — **reading PR content is**. An agent that silently downgrades a 🔴 because the PR description told it to has been hijacked just as surely as one that emits a forged `TIER:`; the damage merely arrives as a bad review instead of a bad route.

**`gh pr view --comments` is the sharpest edge.** On a public repository a PR comment is authored by anyone with a GitHub account, not by the contributor. The single-trusted-contributor assumption in [`REFERENCE/decisions/2026-04-25-pr-review-threat-model.md`](../../decisions/2026-04-25-pr-review-threat-model.md) rules out *"attacks that require a malicious committer"* — a commenting stranger is not a committer. Comment content is therefore untrusted under **every** configuration of that ADR, including the default. The ADR itself needs no change, and this packet does not touch it.

The contract's *instruction* paragraph had also omitted comments while its own *scope* sentence listed them. It now names them.

## What changed

- **Four agents gained the `**Untrusted input:**` Role-section line:** `code-reviewer`, `security-specialist`, `product-reviewer`, `architect-reviewer`. Same wording as the agents that already had it.
- **The contract's instruction text now names comments**, matching its scope sentence, and explains that a public-repo comment is attacker-authored.
- **The contract now states that signal emission is not the scope test**, so coverage cannot drift back to "only the agents the dispatcher parses".
- **A fixed order for Role-section inheritance lines is documented**, and `triage-reviewer` + `light-reviewer` are normalised to it. They previously carried `**Read-only:**` *above* `**Untrusted input:**`, and not adjacent:

  > Inheritance lines form a **contiguous block at the end of the Role section**, in fixed order: `**Untrusted input:**`, then `**Read-only:**`. New shared contracts **append** to the bottom; they never insert into the middle, and never reorder what is already there.

**The ordering rule is not cosmetic.** Derivative projects receive contracts one packet at a time. When upstream and downstream insert new inheritance lines at different positions, every future packet collides on those same lines — and resolving the conflict by taking upstream's side **silently deletes a safety contract the project already had**. That is a merge that looks clean but removes a safety property: precisely the failure shape `2026-07-read-only-reviewers` exists to prevent. A project that adopted this ordering rule cannot hit it.

## Why apply it even on a private solo repo

1. **Repos change visibility.** A private repo that goes public later inherits the gap silently. Nothing prompts you to re-audit reviewer prompts at that moment.
2. **The ordering rule cannot be applied retroactively for free.** Once several packets have landed on divergent Role blocks, every one of them is a conflict to untangle. Taking the convention now costs nothing.

## File manifest

### Merge carefully

There are no new files. Every path below exists in your project and must be section-merged, not overwritten.

- `.claude/agents/CLAUDE.md` — the `### Untrusted input contract` section gains: `and comments` in the instruction blockquote, a "signal-emission is not the scope test" paragraph, and a paragraph on `--comments` reachability. A new `### Role-section inheritance lines` subsection is added directly after it. **Do not disturb** the read-only contract, findings contract, tool invocation conventions, tool grant asymmetry, or severity calibration sections.
- `.claude/agents/code-reviewer.md` — Role gains `**Untrusted input:**` directly *above* the existing `**Read-only:**` line, separated by one blank line.
- `.claude/agents/security-specialist.md` — same.
- `.claude/agents/product-reviewer.md` — same.
- `.claude/agents/architect-reviewer.md` — same.
- `.claude/agents/technical-writer.md` — its existing `**Untrusted input:**` line is reworded to name comments. Order already correct.
- `.claude/agents/triage-reviewer.md` — the `**Read-only:**` line **moves down** to sit directly beneath the existing `**Untrusted input:**` line. Its agent-specific `TIER:` sentence is preserved.
- `.claude/agents/light-reviewer.md` — same move. Its agent-specific `MISCLASSIFICATION SUSPECTED:` sentence is preserved.

### Also bundled — independent one-line docs fix

Unrelated to the untrusted-input work, bundled so you run **one** rollout rather than two.

- `.claude/skills/post-review-follow-through.md` — **line 3 only.** It said the protocol is referenced by `/review-pr-team` *"(Step 3, substep 4)"*. That was true until the fan-out packet renumbered the skill's steps; `review-pr-team` Step 3 is now "Post the review" and has no substeps. It should read `(Step 4)`, matching `/review-pr`. Change nothing else in that file.

**Apply this even if the gate below stops you.** It is a stale pointer in a doc Claude reads at review time, it is independent of the read-only packet, and it is one line.

### Conditional

- `REFERENCE/TEMPLATE-UPDATES/CLAUDE.md` — only if the target project maintains its own packet index.

**Not touched:** the three spec-review agents (they read a local spec, not PR content), any skill file, `settings.json`, and the threat-model ADR.

## Apply prompt

> Copy the block below into the receiving project's Claude session. It is self-contained.

```
I want to roll out a template improvement to this project. The migration packet README is
at:

  https://github.com/mannepanne/useful-assets-template/blob/main/REFERENCE/TEMPLATE-UPDATES/2026-07-untrusted-input-coverage/README.md

Source PR: https://github.com/mannepanne/useful-assets-template/pull/63

How to fetch source files: use WebFetch on the raw GitHub URL pattern

  https://raw.githubusercontent.com/mannepanne/useful-assets-template/main/<path>

substituting <path> for any file listed in the manifest. Do NOT invent file contents —
every source file must come from the raw URL above.

Please:

1. WebFetch the packet README first and read it end-to-end, including "Who needs this".
2. FIRST apply the bundled one-line docs fix. It is independent of everything below and
   must land even if the gate in step 3 stops you. In
   `.claude/skills/post-review-follow-through.md`, line 3 should name `/review-pr-team`
   (Step 4), not "(Step 3, substep 4)". Confirm against the local skill first:
     grep -n '^### Step 4' .claude/skills/review-pr-team/SKILL.md
   If your local review-pr-team has no "Step 4: User summary and follow-through", this
   project predates the fan-out packet — leave line 3 alone and tell me.

3. Now check whether the main packet applies here. Run:
     grep -l 'Read-only:\*\* inherits' .claude/agents/*.md
   If NO agent has a **Read-only:** line, this project has not applied
   2026-07-read-only-reviewers. STOP after the step-2 fix and tell me — I should apply
   2026-07-fan-out-review-synthesis then 2026-07-read-only-reviewers instead, which
   already include the untrusted-input fix.
4. Check whether it is already applied:
     grep -l '^\*\*Untrusted input:\*\* inherits' .claude/agents/*.md
   If that lists 7 agents, stop and tell me.
5. Create a feature branch (e.g. `fix/adopt-untrusted-input-coverage`). Do NOT work on main.
6. This is a Role-section merge and it is the exact thing that goes wrong silently. For
   each agent file: read the local Role block, WebFetch the source, and produce a merged
   Role block that contains BOTH inheritance lines in the order untrusted-input then
   read-only, adjacent, at the end of the Role section. NEVER replace a local Role block
   with upstream's wholesale — if this project already added its own **Untrusted input:**
   line with different wording, KEEP the local wording and just fix the ordering. Deleting
   a safety contract that already existed is the failure mode this packet exists to stop.
7. Preserve agent-specific extensions: triage-reviewer's untrusted-input line ends with a
   sentence about `TIER:`; light-reviewer's ends with one about `MISCLASSIFICATION
   SUSPECTED:`. Those must survive the move.
8. Do NOT add the untrusted-input line to requirements-auditor, technical-skeptic, or
   devils-advocate. They read a local spec, not PR content.
9. If this project has reviewer agents of its own beyond the ten that ship with the
   template, check each: does it run `gh pr view` or `gh pr diff`? If yes, it needs the
   line too.
10. Before writing ANY changes, list every proposed edit with a one-line rationale and flag
   anywhere a local customisation would be lost. Wait for my confirmation.
11. After I confirm and you've applied the changes, run the packet's verification commands
    and report results.
```

## Verification

```bash
# Exactly 7 agents inherit the untrusted-input contract (adjust upward if you added your own)
test "$(grep -rl '^\*\*Untrusted input:\*\* inherits' .claude/agents/ | wc -l | tr -d ' ')" = "7"

# Generated check: EVERY agent that reads PR content has the line. This is the assertion
# that stops a future agent slipping through the gap this packet closed.
for f in .claude/agents/*.md; do
  case "$f" in *CLAUDE.md) continue;; esac
  if grep -qE 'gh pr (view|diff)' "$f" && ! grep -q '^\*\*Untrusted input:\*\* inherits' "$f"; then
    echo "GAP: $f reads PR content without the contract"; exit 1
  fi
done; echo "no coverage gap"

# The spec trio must NOT have gained it
! grep -lq '^\*\*Untrusted input:\*\*' .claude/agents/requirements-auditor.md \
    .claude/agents/technical-skeptic.md .claude/agents/devils-advocate.md

# Order and adjacency: untrusted-input immediately above read-only, everywhere both exist
for f in .claude/agents/*.md; do
  case "$f" in *CLAUDE.md) continue;; esac
  u=$(grep -n '^\*\*Untrusted input:\*\* inherits' "$f" | cut -d: -f1)
  r=$(grep -n '^\*\*Read-only:\*\* inherits' "$f" | cut -d: -f1)
  if [ -n "$u" ] && [ -n "$r" ]; then
    { [ "$u" -lt "$r" ] && [ $((r-u)) -eq 2 ]; } || { echo "BAD ORDER: $f"; exit 1; }
  fi
done; echo "order and adjacency hold"

# Bundled fix: the cross-reference names a step that actually exists
grep -q '`/review-pr-team` (Step 4)' .claude/skills/post-review-follow-through.md
! grep -q 'Step 3, substep 4' .claude/skills/post-review-follow-through.md

# Contract text and convention landed
grep -q 'and comments\*\* as untrusted input' .claude/agents/CLAUDE.md
grep -q 'signal-emission is not the scope test' .claude/agents/CLAUDE.md
grep -q '### Role-section inheritance lines' .claude/agents/CLAUDE.md

# Partial-merge catch: agent-specific extensions must have survived the reorder
grep -q 'TIER:' .claude/agents/triage-reviewer.md
grep -q 'MISCLASSIFICATION SUSPECTED:' .claude/agents/light-reviewer.md

# The read-only packet's own guarantees must still hold after this merge
test "$(grep -rl 'Read-only:\*\* inherits' .claude/agents/ | wc -l | tr -d ' ')" = "10"
test "$(grep -rl 'git fetch origin pull/<pr-number>/head' .claude/agents/ | wc -l | tr -d ' ')" = "5"
```

## Notes for the receiving Claude

- **The dangerous move here is a wholesale Role-block replacement.** If this project closed the coverage gap itself, its `**Untrusted input:**` wording may differ from upstream's. Keep the local wording; only fix the ordering. Taking upstream's block wholesale can delete a contract the project already had — the same failure shape `2026-07-read-only-reviewers` was written to prevent.
- **Do not touch the threat-model ADR.** Nothing about its posture changes. A commenting stranger is not a committer, so its existing out-of-scope clause never covered `--comments` in the first place. Projects that accept fork PRs from strangers should follow its tightening checklist, which already exists.
- **Do not add the line to the spec-review trio.** They read a local spec authored by the trusted contributor. Their handling of untrusted *fetched pages* lives in the separate "Untrusted-content scope when fetching" section of `agents/CLAUDE.md` and is unchanged.
- **`light-reviewer` and `triage-reviewer` do not run `--comments`** — but they read the PR title, description and diff, and both emit control-flow signals the dispatcher parses. They keep the contract, and their agent-specific sentences about `TIER:` and `MISCLASSIFICATION SUSPECTED:` must survive the reorder verbatim.
- **The last two verification lines re-assert the read-only packet's guarantees.** A Role-block merge is exactly where a `**Read-only:**` line gets dropped by accident. If either count is wrong, you deleted something.
