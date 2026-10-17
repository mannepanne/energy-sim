# Fan-out reviews: reviewer agents stop debating, orchestrator synthesises

**Status:** Active
**Authoritative source:** https://github.com/mannepanne/useful-assets-template/pull/56
**Apply before:** [`2026-07-read-only-reviewers`](../2026-07-read-only-reviewers/README.md) — that packet's skill edits anchor on the parallel-spawn steps this one introduces. Apply the two back to back, in one sitting.

---

> **Note.** The source files on `main` already contain the read-only-reviewers changes too, so the skill files you fetch here will mention `isolation: "worktree"` and link to `#read-only-contract`. Those references stay dangling until you apply the read-only packet immediately afterwards. That is expected — do not try to strip them out.

---

## Why

The review skills used to run reviewers as an **agent team**: each reviewer analysed the artefact independently, then entered a "collaborative discussion" phase where they broadcast findings to each other, challenged severity ratings, and iterated until they reached consensus.

In practice that discussion phase ran long for diminishing returns. The design had an accelerator and no brake — the orchestrating skill was instructed to *monitor* the discussion and prod harder if reviewers seemed "too polite", while nothing bounded how many rounds consensus took. Reviewers with genuinely different specialisms often had no basis on which to converge, so they didn't.

Auditing what the discussion actually produced, essentially all of its value was **severity recalibration when one reviewer lacked context another had** — Security rates an input handler 🔴 assuming the input is unvalidated; the Architect knows it's validated at the router. That recalibration does not require agents to talk to each other. The orchestrator receives every report and can do it directly.

This packet removes the discussion phase. Reviewers now fan out, run in parallel, and return findings to the orchestrator, which deduplicates and reconciles them. Parallelism is unchanged (concurrent `Agent` calls in one message), so only the debate tail is cut. Independence also makes corroboration meaningful: two reviewers flagging the same `file:line` without having seen each other's work is a genuinely strong signal, where under debate agreement was partly an artefact of persuasion.

Full reasoning, alternatives considered, and trade-offs accepted: `REFERENCE/decisions/2026-07-09-fan-out-review-synthesis.md` (included in this packet).

## What changed

- **`/review-pr-team` and `/review-spec` restructured** from two phases (independent review → collaborative discussion → synthesis) to two (parallel independent review → orchestrator synthesis). Team creation, team monitoring, and team cleanup steps deleted.
- **Explicit reconciliation rules added** to both skills' synthesis step: dedupe by `file:line`; check whether one report discharges an assumption another report's severity depends on; weigh the specialist on questions in its own domain; where reports don't settle a disagreement, record both positions rather than manufacture consensus. Never invent a finding no reviewer reported.
- **Unresolved disagreements now surface to the human** instead of being negotiated away by the agents. Both skills' output templates gained a slot for this, and the summary counts reconciled vs unresolved divergences.
- **Seven reviewer agents** had their `## Team Collaboration` section (broadcast / challenge / debate / reach consensus) replaced with `## Reporting to the orchestrator`. Scope-preserving guidance in those sections was **kept** and rewritten as self-directed instruction — e.g. `requirements-auditor`'s "don't second-guess the WHY", `technical-writer`'s "defer on technical correctness", `devils-advocate`'s "don't be destructive".
- **Agents are now told to state the assumptions a severity depends on.** This is what makes orchestrator reconciliation work: a stated assumption in one report is what another report can discharge.
- **A findings contract** was added to `.claude/agents/CLAUDE.md`: every finding carries `file:line` + severity + one-line evidence, so the orchestrator can match findings across reports mechanically.
- **`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` removed** from `.claude/settings.json` — no skill needs it any more.
- **Timing estimates corrected** from 2–7 min to 2–4 min for `/review-pr-team` and `/review-spec`, across all docs.

Not changed: the triage dispatcher and its three tiers, the `prReviewMode` gate, the threat model and severity calibration, the post-review follow-through protocol, and the light/standard tiers of `/review-pr` (which were already fan-out — they never used a team).

For the full diff, see the linked PR above.

## File manifest

### Copy verbatim

Files that did not exist before this change. Add as-is unless a same-named file already exists locally (then treat as *merge carefully*).

- `REFERENCE/decisions/2026-07-09-fan-out-review-synthesis.md` — the ADR recording this decision, its alternatives, and its trade-offs

### Merge carefully

Files that almost certainly exist in the target project with different content. Read the local version, identify what this packet changes, and merge — preserve local customisations elsewhere in the file.

- `.claude/skills/review-pr-team/SKILL.md` — substantially rewritten. The team-creation prompt, monitoring step, and cleanup step are gone; Step 1 spawns four `Agent` calls in one message, Step 2 is the synthesis with explicit reconciliation rules. **The `--body-file` posting pattern and the Read-then-Write stale-file fallback are unchanged — preserve any local variations of those.**
- `.claude/skills/review-spec/SKILL.md` — same restructure, three reviewers. Step 1 (spec path resolution via `Glob`) is unchanged. The synthesis step names the specific lens pairings to check (Devil's Advocate's alternative vs Technical Skeptic's costing; Requirements Auditor's gap vs Skeptic's cost estimate).
- `.claude/skills/review-pr/SKILL.md` — two small edits only: the tier table's `team` row no longer says "with debate", and the Step 3 team-tier prose no longer refers to "team setup, discussion phase, and clean-up". Timing 2–7 → 2–4 min. **Everything else in this file — input validation, triage parsing fallback, misclassification handling — is untouched and must be preserved.**
- `.claude/agents/CLAUDE.md` — adds an `## Orchestration model` section and a `### Findings contract` subsection under "Shared agent contracts". The untrusted-input contract, tool invocation conventions, tool grant asymmetry, and severity calibration sections are **unchanged** — do not disturb them.
The seven reviewer agents below all get the same treatment: `## Team Collaboration` → `## Reporting to the orchestrator`, with the debate mechanics (broadcast / challenge / reach consensus) deleted and the role-scoping guidance kept, rewritten as self-directed instruction. Each path is given in full — fetch each one individually.

- `.claude/agents/security-specialist.md` — Role line drops "as part of an agent team". Agent now states the assumptions a severity depends on. Final review standard "Be collaborative" → "Be balanced".
- `.claude/agents/product-reviewer.md` — Role line drops "as part of an agent team". Final review standard "Be collaborative" → "Be balanced".
- `.claude/agents/architect-reviewer.md` — Role line drops "as part of an agent team". Agent now names the trade-off when a security/product concern has an architectural alternative.
- `.claude/agents/technical-writer.md` — Role line drops "as part of an agent team". **Dual-use — see the notes below.** Its `## Light-mode invocation` section must survive untouched.
- `.claude/agents/requirements-auditor.md` — keeps "don't second-guess the WHY"; the two "defer to another reviewer" bullets become "flag it and say you can't judge it".
- `.claude/agents/technical-skeptic.md` — keeps "be honest about complexity"; the cross-reviewer bullets become "cost the alternatives and the gaps you notice" (self-directed).
- `.claude/agents/devils-advocate.md` — keeps "don't be destructive"; "challenge the Technical Skeptic" becomes "make alternatives concrete enough to cost".
- `.claude/settings.json` — remove the `env` block containing `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`. **If your local `env` block has other keys, remove only this one key and keep the block.**
- `REFERENCE/pr-review-workflow.md` — the `/review-spec` and `/review-pr-team` "How it works" sections, the tier table, the timings, the "if reviewers disagree" best-practice block, and the troubleshooting section all change.
- `REFERENCE/decisions/CLAUDE.md` — add the new ADR to the index (newest first).
- `.claude/CLAUDE.md` — "Automated PR review system" skill descriptions and the "Pull request reviews" bullets: timings and "multi-perspective team review" → "four-perspective review".
- `CLAUDE.md` (project root) — the `/review-pr-team` line under "Implementation steps".
- `.claude/skills/review-gate.md` — the two timing figures inside the verbatim pitch text.

### Conditional

- `REFERENCE/TEMPLATE-UPDATES/CLAUDE.md` — only if the target project maintains its own packet index (most derivatives don't; they only consume packets).

## Apply prompt

> Copy the block below into the receiving project's Claude session. It is self-contained — the receiving Claude won't have access to this packet's surrounding context.

```
I want to roll out a template improvement to this project. The migration packet README is
at:

  https://github.com/mannepanne/useful-assets-template/blob/main/REFERENCE/TEMPLATE-UPDATES/2026-07-fan-out-review-synthesis/README.md

Source PR: https://github.com/mannepanne/useful-assets-template/pull/56

How to fetch source files: use WebFetch on the raw GitHub URL pattern

  https://raw.githubusercontent.com/mannepanne/useful-assets-template/main/<path>

substituting <path> for any file listed in the manifest (e.g.
`.claude/skills/review-pr-team/SKILL.md`). Do NOT invent file contents — every source file
must come from the raw URL above.

Please:

1. WebFetch the packet README first and read it end-to-end. Understand WHY the change
   exists and WHAT changed before touching any file.
2. Create a feature branch (e.g. `refactor/adopt-fan-out-reviews`). Do NOT work on main.
3. First, check whether this project even has the debate design: grep for
   "Team Collaboration", "broadcast", and "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS". If none
   of those appear, this packet may already be applied — stop and tell me.
4. For each file in "Copy verbatim", check whether a file at that path exists locally.
   If not, WebFetch the source and create it. If it does, treat it as "merge carefully"
   instead and flag the conflict.
5. For each file in "Merge carefully", read the local version and WebFetch the source
   version. Identify the sections this packet adds or modifies, and propose a merged
   version that preserves any local customisation. Pay particular attention to
   `.claude/skills/review-pr/SKILL.md` (only two small edits — do not overwrite it
   wholesale) and `.claude/settings.json` (remove one key, not the whole env block, if
   other keys are present).
6. The template ships TEN reviewer agents. Seven are listed in the manifest above. The
   other three — `code-reviewer`, `light-reviewer`, `triage-reviewer` — never had debate
   instructions and must NOT be touched. If this project has added reviewer agents of its
   OWN beyond those ten, check whether they carry a `## Team Collaboration` section; if
   so, give them the same `## Reporting to the orchestrator` treatment, preserving any
   scope guidance. If there are no project-specific agents, this step is expected to be a
   no-op — say so and move on.
7. Before writing ANY changes, list every proposed edit with a one-line rationale, and
   flag any place where local customisation would be lost. Wait for my confirmation.
8. After I confirm and you've applied the changes, run the verification commands from
   the packet and report results.
```

## Verification

```bash
# The ADR landed
test -f REFERENCE/decisions/2026-07-09-fan-out-review-synthesis.md

# No debate mechanics survive anywhere in the skills or agents
! grep -rqiE "broadcast|## Team Collaboration|debate severity|reach consensus" .claude/skills/ .claude/agents/

# The experimental teams flag is gone
! grep -q "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS" .claude/settings.json

# settings.json is still valid JSON after the env-block edit
python3 -c "import json; json.load(open('.claude/settings.json'))"

# Every reviewer agent gained the replacement section (expect 7)
test "$(grep -rl '## Reporting to the orchestrator' .claude/agents/ | wc -l | tr -d ' ')" = "7"

# Both skills spawn in parallel and synthesise
grep -q "single message" .claude/skills/review-pr-team/SKILL.md
grep -q "single message" .claude/skills/review-spec/SKILL.md

# Partial-merge catch: the findings contract exists AND the ADR is indexed AND the docs
# no longer advertise the old timing. A merge that updated skills but not docs fails here.
grep -q "Findings contract" .claude/agents/CLAUDE.md
grep -q "2026-07-09-fan-out-review-synthesis" REFERENCE/decisions/CLAUDE.md
! grep -rqE "2.7 min(ute)?s?" REFERENCE/pr-review-workflow.md .claude/CLAUDE.md CLAUDE.md
```

## Notes for the receiving Claude

- **This packet removes a mechanism; it does not add a feature.** If the local skills already spawn reviewers with plain `Agent` calls and have no discussion phase, there is nothing to do beyond the ADR and the docs. Check before editing.
- **Do not rewrite the reviewer agents' Output Format sections.** They're untouched by this packet on purpose. `code-reviewer` and `technical-writer` are reused by the light and standard tiers of `/review-pr`, so churn there risks breaking tiers this change doesn't otherwise touch.
- **The scope guidance inside the old `## Team Collaboration` sections is worth keeping.** Those sections mixed debate mechanics (broadcast, challenge, reach consensus — delete) with genuine role scoping ("don't second-guess the WHY", "defer on technical correctness", "be honest about complexity" — keep, rephrased as self-directed). A blanket deletion loses real instruction.
- **`technical-writer` is dual-use.** It's spawned by `/review-pr` light and standard tiers as well as by `/review-pr-team`. Its `## Reporting to the orchestrator` section must not assume a four-reviewer context, and its `## Light-mode invocation` section must survive untouched.
- **Resist reintroducing a follow-up round.** The obvious "improvement" to fan-out is letting the orchestrator ask one reviewer a clarifying question when reports conflict. The ADR explicitly rejects this — it reopens the unbounded loop for the case that matters least, and an unresolved conflict between two specialists is itself the signal the human needs. If a future review genuinely needs a query mechanism, that's a new ADR, not a quiet restoration.
- **If the derivative's `.claude/settings.json` has an `env` block with other keys**, remove only `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` and leave the block. Removing the whole block is only correct when that key is the sole occupant, as it was in the template.
