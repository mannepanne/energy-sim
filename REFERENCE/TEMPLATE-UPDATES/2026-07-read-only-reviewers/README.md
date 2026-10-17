# Read-only reviewers: a review can never move your working branch

**Status:** Active
**Authoritative source:** https://github.com/mannepanne/useful-assets-template/pull/58
**Prerequisite:** [`2026-07-fan-out-review-synthesis`](../2026-07-fan-out-review-synthesis/README.md) must be applied first — see [Ordering](#ordering) below.

---

## Ordering

**Apply `2026-07-fan-out-review-synthesis` before this packet, back to back in one sitting.**

Two of this packet's three skill edits anchor on steps that packet introduces: `review-pr-team` Step 1 (*"Issue all four `Agent` calls in a single message"*) and `review-spec` Step 2 (*"Issue all three `Agent` calls…"*). In a pre-fan-out project those steps still read `Create Agent Team`, and there are no `Agent` spawn calls to attach `isolation: "worktree"` to. Only the `/review-pr` triage/light/standard spawns would land.

Do not stop between the two packets. The source files on `main` already contain both changes, so a fan-out-only rollout pulls in skill files that reference `#read-only-contract` and pass `isolation: "worktree"` before this packet has created the contract or corrected the agents.

**If reviews are running today and you must triage:** this packet's *agent* edits — the read-only contract, the corrected step 4, the `git show FETCH_HEAD:` recipe — apply cleanly to a pre-fan-out project on their own, and they are the part that stops the work-losing bug. The worktree isolation layer is what needs fan-out first. Applying the agent edits alone is a legitimate emergency stop; just come back and do both packets properly.

---

## Why

A downstream project ran `/review-pr`. The `code-reviewer` agent ran `git checkout` in the shared working tree to see the PR's files, silently moving the operator off the branch they were working on. Two subsequent commits landed somewhere unintended and nearly missed the PR. The operator caught it by hand.

**The root cause was not a missing prohibition — it was a contradiction in the agent definitions.** Four PR-review agents said *"Read full file context where needed using the Read tool"*, justified by *"this ensures you see the LATEST committed state of all files"*. But the `Read` tool reads the **working tree**, not the PR. When the working tree is not sitting on the PR head, `Read` returns whatever branch the operator happens to be on — so the justification is false, and an agent that notices the mismatch between the diff it fetched and the files it read will reach for `git checkout` to reconcile them. The agents were pushed toward the footgun by their own instructions.

Meanwhile `.claude/agents/CLAUDE.md` already prescribed `git show <branch>:<path>` for branch/revision files. The agents had drifted from a read-only convention that already existed.

**Why permissions don't save you.** The template doesn't allowlist `git checkout` or `gh pr checkout`, so under default permissions the command prompts. It ran *silently* downstream — meaning that project runs in a permissive mode (`bypassPermissions` / `dontAsk`) or has broadened its git allowlist. If your project does either, the permission layer is not protecting you.

This packet fixes the cause (the contradiction) and adds a containment wall (worktree isolation), so a reviewer *cannot* move your branch even in a permissive session. Blast radius of the bug is lost work, not cosmetics — apply this one.

Full reasoning, alternatives, trade-offs: `REFERENCE/decisions/2026-07-09-read-only-reviewer-agents.md` (included).

## What changed

- **A read-only contract** added to `.claude/agents/CLAUDE.md`, inherited by all ten reviewer agents the same way the untrusted-input contract is. Forbids `git checkout`, `gh pr checkout`, `git switch`, `stash`, `restore`, `reset`, `merge`, `rebase` — anything that moves `HEAD` or writes a branch.
- **The correct read recipe** is now codified. To see a file as it exists on the PR branch, without checking it out:
  ```bash
  gh pr diff <N>                     # the change itself
  git fetch origin pull/<N>/head     # brings PR head into FETCH_HEAD; moves no branch
  git show FETCH_HEAD:<path>         # full file as of the PR head
  ```
  `git fetch origin pull/<N>/head` writes only `FETCH_HEAD` and object data. It is already covered by the `Bash(git fetch *)` allowlist entry, so it stays silent.
- **Step 4 corrected** in `code-reviewer`, `security-specialist`, `product-reviewer`, `architect-reviewer` (the "Read full file context using the Read tool" bullet) and `technical-writer` (its "Check Actual Documentation Files" variant). The false *"this ensures you see the LATEST committed state"* justification is rewritten in all five.
- **`Read` is no longer the default** for reviewer agents. The tool-invocation table now branches: `git show FETCH_HEAD:<path>` for files the PR changed, `Read` only for files it didn't (`CLAUDE.md`, specs, convention docs).
- **Worktree isolation.** `/review-pr` (triage, light, standard spawns) and `/review-pr-team` (all four spawns) now pass `isolation: "worktree"` to every `Agent` call. Sub-second per agent, auto-removed because reviewers change nothing.
- **`/review-spec` deliberately does NOT get worktree isolation.** Its reviewers read a spec file in the operator's working tree, on the operator's branch — sometimes one not yet committed anywhere. A worktree would isolate them from the artefact under review. There is no PR branch and no `checkout` temptation. The contract alone covers them.

**Explicitly rejected — do not "simplify" to this:** a `git checkout` entry in `permissions.deny`, or a pattern in `safety-harness.sh`. Permission rules and `PreToolUse` hooks are *session-wide*; neither can distinguish a subagent from the operator's main session, so both would nag or block the human's own branch-switching. Wrong layer. The ADR records this.

## File manifest

### Copy verbatim

- `REFERENCE/decisions/2026-07-09-read-only-reviewer-agents.md` — the ADR

### Merge carefully

- `.claude/agents/CLAUDE.md` — adds a `### Read-only contract` subsection under "Shared agent contracts" (place it *before* the findings contract), and changes the first two rows of the tool-invocation table so `Read` is no longer the blanket default. Leave the untrusted-input contract, tool grant asymmetry, and severity calibration untouched.
- `.claude/agents/code-reviewer.md` — Role gains a `**Read-only:**` inheritance line; step 4's "Read full file context using the Read tool" bullet replaced with the `git show FETCH_HEAD:` recipe; the "Why gather your own context?" note corrected. **The source file also carries an `**Untrusted input:**` line directly above the read-only one** — that came from a later template fix closing a contract-coverage gap. If your local copy lacks it, take both lines; if your project already added its own, keep yours and append the read-only line beneath it. Never resolve this by taking upstream's Role block wholesale — that can delete a contract you already had.
- `.claude/agents/security-specialist.md` — same three edits.
- `.claude/agents/product-reviewer.md` — same three edits.
- `.claude/agents/architect-reviewer.md` — same three edits.
- `.claude/agents/technical-writer.md` — same three edits, but its step 4 is titled "Check Actual Documentation Files" and keeps a deliberate `Read`-tool use: reading the *unchanged* working-tree doc is how it detects a REFERENCE/ doc that went stale.
- `.claude/agents/light-reviewer.md` — Role gains the `**Read-only:**` line. No step-4 change; it only ever ran `gh pr diff`.
- `.claude/agents/triage-reviewer.md` — Role gains the `**Read-only:**` line. No other change.
- `.claude/agents/requirements-auditor.md` — Role gains a shorter `**Read-only:**` line (spec variant: no PR, reads the working-tree spec).
- `.claude/agents/technical-skeptic.md` — same spec-variant line.
- `.claude/agents/devils-advocate.md` — same spec-variant line.
- `.claude/skills/review-pr/SKILL.md` — adds a `### Reviewer isolation` section before Step 1, and `isolation: "worktree"` to the triage, light-tier, and standard-tier spawns. Nothing else changes.
- `.claude/skills/review-pr-team/SKILL.md` — adds the isolation paragraph to Step 1. Nothing else changes.
- `.claude/skills/review-spec/SKILL.md` — adds a paragraph in Step 2 explaining why these spawns must NOT be isolated. Nothing else changes.
- `REFERENCE/pr-review-workflow.md` — Overview gains a "reviewers never touch your working tree" paragraph; Troubleshooting gains a "review moved my branch" entry.
- `REFERENCE/decisions/CLAUDE.md` — add the new ADR to the index (newest first).

### Conditional

- `REFERENCE/TEMPLATE-UPDATES/CLAUDE.md` — only if the target project maintains its own packet index.

## Apply prompt

> Copy the block below into the receiving project's Claude session. It is self-contained.

```
I want to roll out a template improvement to this project. The migration packet README is
at:

  https://github.com/mannepanne/useful-assets-template/blob/main/REFERENCE/TEMPLATE-UPDATES/2026-07-read-only-reviewers/README.md

Source PR: https://github.com/mannepanne/useful-assets-template/pull/58

How to fetch source files: use WebFetch on the raw GitHub URL pattern

  https://raw.githubusercontent.com/mannepanne/useful-assets-template/main/<path>

substituting <path> for any file listed in the manifest. Do NOT invent file contents —
every source file must come from the raw URL above.

Please:

1. WebFetch the packet README first and read it end-to-end. Understand WHY the change
   exists before touching any file. The bug it fixes can strand my commits on the wrong
   branch, so take the reasoning seriously.
2. Create a feature branch (e.g. `fix/adopt-read-only-reviewers`). Do NOT work on main.
3. Check whether this packet is already applied: grep for "read-only-contract" in
   `.claude/agents/`. If every reviewer agent already references it AND the review skills
   already pass `isolation: "worktree"`, stop and tell me.
4. For each file in "Copy verbatim", create it if absent; if present, treat as "merge
   carefully" and flag the conflict.
5. For each file in "Merge carefully", read the local version and WebFetch the source,
   then propose a merge that preserves local customisation. Note that this project may
   have reviewer agents whose step 4 is worded differently — the thing to look for is ANY
   instruction to read PR-changed files with the `Read` tool, or any claim that doing so
   shows "the LATEST committed state". Both must go.
6. If this project has added reviewer agents of its own beyond the ten that ship with the
   template, give them the `**Read-only:**` inheritance line too, and check their context-
   gathering step for the same `Read`-tool bug.
7. Do NOT add `git checkout` to `permissions.deny` or to any hook, even if it seems like a
   tidier fix. Those are session-wide and would block my own branch-switching. The packet
   explains why.
8. Before writing ANY changes, list every proposed edit with a one-line rationale and flag
   anywhere local customisation would be lost. Wait for my confirmation.
9. After I confirm and you've applied the changes, run the packet's verification commands
   and report results.
```

## Verification

```bash
# The ADR landed
test -f REFERENCE/decisions/2026-07-09-read-only-reviewer-agents.md

# The shared contract exists
grep -q "### Read-only contract" .claude/agents/CLAUDE.md

# Every reviewer agent inherits it (expect 10 — adjust upward if you added your own)
test "$(grep -rl 'Read-only:\*\* inherits' .claude/agents/ | wc -l | tr -d ' ')" = "10"

# No agent still tells you to Read a PR-changed file, or claims Read shows committed state
! grep -rq "Read full file context where needed using the Read tool" .claude/agents/
! grep -rq "This ensures you see the LATEST committed state" .claude/agents/

# The step-4 read recipe is present in exactly the 5 agents that read changed files.
# Match on the fenced fetch command, NOT on "git show FETCH_HEAD:" — the latter also
# appears in every agent's Role-level inheritance line and in agents/CLAUDE.md, so it
# would count 8 and this check would be meaningless.
test "$(grep -rl 'git fetch origin pull/<pr-number>/head' .claude/agents/ | wc -l | tr -d ' ')" = "5"

# light-reviewer and triage-reviewer read no files — they must NOT have gained the recipe
! grep -q 'git fetch origin pull/<pr-number>/head' .claude/agents/light-reviewer.md
! grep -q 'git fetch origin pull/<pr-number>/head' .claude/agents/triage-reviewer.md

# PR-review skills isolate; review-spec explicitly does not
grep -q 'isolation: "worktree"' .claude/skills/review-pr/SKILL.md
grep -q 'isolation: "worktree"' .claude/skills/review-pr-team/SKILL.md
grep -q 'Do not spawn these with `isolation: "worktree"`' .claude/skills/review-spec/SKILL.md

# The rejected fix was NOT applied — checkout must not be denied or hooked session-wide
! grep -q '"Bash(git checkout' .claude/settings.json
! grep -rq 'git[[:space:]]*checkout' .claude/hooks/safety-harness.sh

# Partial-merge catch: contract + isolation + ADR index must all land together
grep -q "2026-07-09-read-only-reviewer-agents" REFERENCE/decisions/CLAUDE.md
```

## Notes for the receiving Claude

- **`git fetch origin pull/<N>/head` is non-mutating.** It writes `FETCH_HEAD` and object data only — no branch is created, moved, or checked out, and the working tree is untouched. Verify it yourself before doubting it: run it, then `git branch --show-current` and `git status --porcelain`.
- **`technical-writer` keeps a legitimate `Read`-tool use.** Reading the *unchanged* working-tree copy of a REFERENCE/ doc is precisely how it detects staleness: the PR changed behaviour, the doc didn't change with it. Don't convert every `Read` in that file to `git show`.
- **`light-reviewer` and `triage-reviewer` need only the Role line.** Neither ever read changed files — they work from `gh pr diff`. Adding the recipe to them is noise.
- **Do not give `/review-spec` worktree isolation.** Its reviewers read a spec in the operator's working tree, possibly uncommitted. A worktree would hide the file under review. The asymmetry with the PR skills is deliberate and the skill file says so.
- **Do not reach for `permissions.deny` or `safety-harness.sh`.** It looks like the rigorous fix and it is the wrong layer — session-wide, blind to subagents, would block the operator's own `git checkout`. The verification suite above actively asserts you did *not* do this.
- **Role-section inheritance lines have a fixed order:** `**Untrusted input:**` then `**Read-only:**`, as a contiguous block at the end of the Role section. New contracts append to the bottom. If your local agents put them in a different order, normalise to this one while applying — it is what makes future packets append cleanly instead of colliding.
- **If this project runs with permissive tool settings** (`bypassPermissions`, `dontAsk`, or a broadened git allowlist), worktree isolation is the *only* thing standing between a non-compliant reviewer and your branch. Don't skip layer 2 as "belt and braces".
