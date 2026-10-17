# Plain review output: budgets in lines, praise capped, mannered prose defined as a failure mode

**Status:** Active
**Authoritative source:** https://github.com/mannepanne/useful-assets-template/pull/67
**Applies to:** any project with an always-loaded instruction file. **No prerequisite packets.** Projects that are not derived from this template can apply it too — see [Who needs this](#who-needs-this).

---

## Who needs this

This packet is standalone by design. It routes on what the receiving project *has*, not on which packets it has applied. Run the three checks below and apply the layers they light up. Layer 1 applies everywhere; the rest are conditional.

| Check | If it finds something | Layer |
|---|---|---|
| An always-loaded instruction file exists: `CLAUDE.md`, `.claude/CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `GEMINI.md`, or a system prompt you control | Always true | **Layer 1** — the writing rule |
| Prompts that define a review output format: `grep -rl '^## Output Format' .claude/agents/` or any prompt with sections like "Critical issues / Warnings / Suggestions" | Reviewer prompts exist | **Layer 2** — reviewer prompts |
| Prompts that synthesise several reviewer reports into one review: `grep -rl 'Synthesi' .claude/skills/` or an orchestration prompt with a review template | Orchestration prompts exist | **Layer 3** — synthesis templates |
| The ten reviewer agents and three review skills that ship with this template: `test -f .claude/agents/CLAUDE.md && test -f .claude/skills/review-pr-team/SKILL.md` | Template derivative | **Layer 4** — exact files from the source PR |

A project with no reviewer prompts at all still benefits from Layer 1, which is where most of the day-to-day effect lives: chat replies, commit messages, PR descriptions, documentation.

**Symptoms this packet treats:** review output that runs to several screens; findings wrapped in three or four sub-bullets each; a praise section longer than the findings; a block of per-reviewer tallies at the end; prose that performs ("what changed, in one breath") rather than states; the same finding appearing in the review, again in chat, and again in a follow-up list.

---

## Why

Review output had grown to four screens per run. The facts were there but hard to take in. Three causes, all in the prompts rather than in any one model:

- **The synthesis templates demanded the length.** Each finding was a title plus three or four mandatory sub-bullets ("raised by", "why blocking", "resolution needed"). Ten findings meant forty sentences before any prose.
- **Three sections existed only to restate.** Praise sections and a per-reviewer count block repeated what the findings already said, and praise in particular invited padding.
- **The only style instruction was one line saying "be succinct".** An adjective loses to a template that asks for four sub-bullets. Instructions do not override templates; templates set the length.

A second problem arrives with more capable models: mannered prose. Phrases that substitute metaphor and flourish for direct statement, existing to display the writer rather than convey the idea. Anthropic's [prompting guide for Claude Fable 5.1](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1#writing-density) names this and recommends defining the anti-pattern in the prompt. The fix here is written to work on any model, from any vendor, because it defines a mechanism with examples instead of maintaining a banned-word list. Word lists get bypassed by synonym and drift between models; a definition of the failure transfers to any model that can read it.

The full reasoning, including the rejected alternatives, is in the ADR [`REFERENCE/decisions/2026-09-12-plain-review-output.md`](../../decisions/2026-09-12-plain-review-output.md). The three design principles the packet rests on:

1. **Templates set the length; instructions cannot override them.** Change the template and the padding has nowhere to go.
2. **Budgets in units survive model changes.** "One to three lines per finding" means the same thing to every model. "Concise" does not.
3. **Define the failure mode, do not ban words.** A mechanism with examples is portable; a list is not.

## What changed

- **A single style reference**, `.claude/COLLABORATION/writing-style.md`: the mechanism behind mannered prose, nine checkable rules, and a table of patterns that signal performance rather than statement.
- **The short form of the rule in the always-loaded file**, replacing the one-line "be succinct".
- **An output style contract for reviewer prompts**: one to three lines per finding, strengths capped at three sentences, no preamble, no closing summary. Carried in each reviewer's own Output Format, because a pointer alone gets skipped.
- **Synthesis templates rewritten**: verdict on the first line, one line per finding with reviewer attribution as a tag at the end, an unresolved-disagreements section, praise capped, no count block, a one-screen budget.
- **No echo**: the orchestrator does not paste the posted review into chat. The comment is the record; chat carries the status line and the follow-through.

---

## Layer 1 — the writing rule (every project)

**1a. Add the style reference.** Fetch `.claude/COLLABORATION/writing-style.md` byte-exact (see the apply prompt) and place it where your project keeps behavioural guidance. In a template derivative the path is the same. In another project, any docs folder works; adjust the relative links in its header to match.

**1b. Put the short form in the always-loaded file.** In this template it replaces the bullet `**Don't waste tokens** - Be succinct and concise.` under Essential principles in `.claude/CLAUDE.md`. In another project, add it wherever collaboration rules live. The text, with the link adjusted to your path:

> - **Write plainly** - Lead with the conclusion. One idea per sentence, ordinary sentences with a subject and a verb. No preamble, no closing paragraph that repeats the body, no praise beyond three sentences. Remove all mannered prose: when a literal phrase is available, use it. Lists for parallel items, prose for argument, length in units (a review finding is one to three lines). Full rule and examples: [writing-style.md](./COLLABORATION/writing-style.md).

The short form is inline on purpose. A rule that lives only behind a link is not in context when the writing happens.

**1c. If the project has a separate "writing style" block** for spelling or capitalisation conventions, add one pointer sentence there to the style reference, so a future documentation sweep does not merge the two.

## Layer 2 — reviewer prompts (any prompt that defines a review output format)

Apply to every prompt that returns findings in severity sections. In this template that is eight agents: the five PR reviewers (`code-reviewer`, `security-specialist`, `product-reviewer`, `architect-reviewer`, `technical-writer`) and the three spec reviewers (`requirements-auditor`, `technical-skeptic`, `devils-advocate`). Prompts that already return something tighter, such as a classification block or at most three one-line items, are left alone. The automated check below recognises this template's heading shape (`## Output Format` with `### ✅` sections under `.claude/agents/`); a project whose reviewer prompts are headed differently checks steps 2a and 2b by reading each prompt.

**2a. In each such prompt, directly after the line that introduces the output structure** ("Structure your findings as:" or equivalent), insert:

> Every finding is one to three lines and carries location, severity, evidence, fix, and any assumption the rating rests on. The strengths section is at most three sentences. No preamble before the first finding and no closing summary.

**2b. Cap the strengths section in its own descriptor.** Append ", in at most three sentences" to the one-line description under the ✅ heading (for example "What's good about this PR, in at most three sentences").

**2c. If the project has a shared contract file the agents inherit from** (in this template, `.claude/agents/CLAUDE.md`), add an `### Output style contract` section after the untrusted-input contract, containing this blockquote and the two paragraphs after it:

> **Output style:** every finding is one to three lines and carries the items in the Findings contract. Sub-bullets under a finding are for a genuine second point, not for restating the first. The "strengths" or "well done" section holds at most three sentences. No preamble before the first finding, no closing summary, and no finding repeated in a second section. Remove all mannered prose: when a literal phrase is available, use it.

> **Scope test:** does this agent return findings-shaped output? Those that do carry the budget in their own Output Format section, because a template shapes output more reliably than an inherited sentence. Agents that return a classification block or a handful of one-line items are already tighter than this contract. **Precedence:** where an agent's own Output Format is stricter than this contract, the agent's format wins.

> The length budget is deliberate and lives in units rather than adjectives: "be concise" loses to a template that asks for four sub-bullets per finding, while "one to three lines" does not.

The wording above is deliberately more general than the template's own contract, which names its eight agents; a derivative that applies Layer 2 rather than Layer 4 installs this wording and should keep it rather than "correcting" it to match the template's in a later sweep.

If that file has a **Findings contract** listing what a finding carries, extend it with two items: **Fix** (what would resolve it, in one clause; a finding with no known fix says so) and **Assumption** (if the severity depends on something the reviewer could not verify, state it in one clause, because synthesis reconciles severity by checking whether another report discharges a stated assumption).

**2d. Pointer line in each agent's Role section.** Only where the project uses inheritance pointers. The line:

> **Output style:** inherits the shared output style contract from [`./CLAUDE.md`](./CLAUDE.md#output-style-contract). One to three lines per finding, strengths capped at three sentences, no preamble and no closing summary.

Placement is conditional:

| The agent's Role section has | Do this |
|---|---|
| A fixed-order inheritance block (`**Untrusted input:**` then `**Read-only:**`, contiguous, at the end of Role) | **Append** the line as the third item, one blank line after `**Read-only:**`. Never insert above or between. |
| Some inheritance lines, but not in the fixed order | Append after the last one. Do not reorder what is there. |
| No inheritance lines | Add the line at the end of the Role section. |
| No Role section, or no shared contract file | Skip 2d. Steps 2a and 2b carry the budget on their own. |

Apply 2d to all agents, including the terse ones; the precedence rule in 2c makes it harmless there, and uniform inheritance keeps future merges clean.

## Layer 3 — synthesis templates (any prompt that merges several reports into one review)

**3a. Replace the review template** with this shape. Placeholders are in brackets; every location in a real review comes from a reviewer's report.

```markdown
## [Review title]

**Recommendation: [VERDICT]** — [one sentence saying why].

Reviewed independently by [reviewers]. [If a reviewer failed, say which perspective is missing here.]

**Completion requirements:** tests [✅ / ❌ one clause] · documentation [✅ / ❌ one clause] · code quality [✅ / ❌ one clause: conventions, no secrets, clean history]

### 🔴 Must fix before merge
- `[file:line]` [Finding]. Fix: [fix]. — [reviewer tags]

### ⚠️ Should address
- `[file:line]` [Finding]. [Reviewer A] rated 🔴 assuming [X]; [Reviewer B]'s report shows [Y], so ⚠️. Fix: [fix]. — [tags]

### ⚖️ Unresolved — your call
- `[file:line]` [Finding]. [Reviewer A] says [X]; [Reviewer B] says [Y]. Neither report settles it because [reason]; [what would]. Decide before merge. — [tags]

### 💡 Suggestions
- `[file:line]` [Finding]. Fix: [fix]. — [tags]

### ✅ Solid
[At most three sentences. When there are no findings this section is the review, so keep at least one sentence; otherwise omit it if nothing stands out.]
```

For a spec review the same shape applies with these differences: locations are spec sections rather than `file:line`; the section after Should address is `⚖️ Divergences — your call` and carries both reconciled and unresolved items; and each proposed alternative says whether its feasibility was assessed ("proposed by [reviewer]; [reviewer] costed it as simpler / harder / not assessed").

**3b. State the rules under the template**, so the model fills it the same way every time:

- One bullet per finding, one to three lines: location, finding, fix, reviewer tags. Sub-bullets only for a genuine second point.
- Reconciliation is a clause on the line: what each reviewer rated, what settled it, the result.
- Unresolved disagreements get their own section. Keep the higher severity and say what would settle it.
- Every empty section is omitted. No empty headers, no "none found".
- A finding appears once.
- No count block. Per-reviewer tallies restate the bullets as numbers.
- Length budget: one screen, about forty lines, unless there are more than eight findings. Cut prose, never findings or their evidence.
- No preamble before the title and no closing paragraph.

**3c. Remove the sections the template no longer has**: the old praise section, the per-reviewer summary block, and any "format per issue" instruction that asked for sub-bullets.

**3d. No echo.** Wherever the orchestrator posts the review somewhere (a PR comment, a file), add: "Do not paste the posted comment into chat; the comment is the record, and chat carries the status line, the follow-through, and any observation of your own that no reviewer raised, marked as yours." Where a dispatcher concatenates reviewer reports without synthesising, say "post the reports as returned; do not edit a reviewer's findings before posting them under that reviewer's attribution."

## Layer 4 — template derivatives: exact files

Projects that have this template's ten agents and three review skills can take the source files directly. Everything in Layers 1 to 3 is already applied in them.

### Copy verbatim

- `.claude/COLLABORATION/writing-style.md` — the style reference.
- `REFERENCE/decisions/2026-09-12-plain-review-output.md` — the ADR.

### Merge carefully

- `.claude/CLAUDE.md` — the "Write plainly" bullet replaces "Don't waste tokens"; the "Consistency" bullet under Documentation standards gains a pointer to the style reference.
- `.claude/COLLABORATION/CLAUDE.md` — a `writing-style.md` index entry, placed before `documentation-standards.md`.
- `.claude/agents/CLAUDE.md` — Findings contract gains items 4 and 5; a new `### Output style contract` section after the untrusted-input contract; the Role-section inheritance list gains item 3; the Common Patterns bullet on output format gains a pointer. **Do not disturb** the read-only, untrusted-input, tool invocation, tool grant asymmetry, or severity calibration sections.
- The eight findings-producing agents — Output Format gains the budget sentence and the strengths cap; Role gains the pointer line as the third inheritance item.
- `.claude/agents/light-reviewer.md`, `.claude/agents/triage-reviewer.md` — Role gains the pointer line only.
- `.claude/skills/review-pr-team/SKILL.md` — Step 2d template and rules replaced; Step 4 no-echo sentence; two troubleshooting entries.
- `.claude/skills/review-spec/SKILL.md` — Step 3d template and rules replaced.
- `.claude/skills/review-pr/SKILL.md` — light and standard tiers say "post as returned"; Step 4 no-echo sentence.

### Conditional

- `REFERENCE/pr-review-workflow.md` — only if the project keeps this reference; the standard-tier, team-tier and spec-review output descriptions change.
- `REFERENCE/decisions/CLAUDE.md` — only if the project keeps an ADR index; one entry at the top.
- `REFERENCE/TEMPLATE-UPDATES/CLAUDE.md` — only if the project maintains its own packet index.

## Apply prompt

> Copy the block below into the receiving project's Claude session. It is self-contained; the receiving Claude does not need this template's other files or history.

```
I want to roll out an improvement to this project: plain, digestible output from Claude,
and in particular from any review prompts we have. The packet README is at:

  https://github.com/mannepanne/useful-assets-template/blob/main/REFERENCE/TEMPLATE-UPDATES/2026-09-plain-review-output/README.md

Source PR: https://github.com/mannepanne/useful-assets-template/pull/67

This packet is standalone. It has no prerequisite packets and this project may not be
derived from that template at all. It is organised in four layers; the README's "Who
needs this" table says which apply here.

How to fetch source files: use `gh api` with the raw media type, which returns the file's
exact bytes:

  gh api repos/mannepanne/useful-assets-template/contents/<path> -H 'Accept: application/vnd.github.raw'

substituting <path> for any file named in the packet (e.g.
`.claude/COLLABORATION/writing-style.md`). If `gh` is not authenticated,
`curl -fsSL https://raw.githubusercontent.com/mannepanne/useful-assets-template/main/<path>`
is an equivalent fallback.

Do NOT use WebFetch to retrieve source files. WebFetch answers a prompt against the page
using a small model, so it returns a paraphrase rather than the file, and its output is
cached for 15 minutes. Do NOT invent, reconstruct, or type out file contents from memory.

Please:

1. Fetch the packet README first (with the command above, not WebFetch) and read it
   end-to-end. Understand WHY before touching any file.
2. Run the "Who needs this" checks and tell me which layers apply to this project, and
   which file here is the always-loaded instruction file (CLAUDE.md, AGENTS.md,
   .cursorrules, GEMINI.md, or something else).
3. Create a feature branch (e.g. `feature/adopt-plain-output`). Do NOT work on main.
4. Layer 1, always: fetch writing-style.md byte-exact and place it where this project
   keeps behavioural guidance, fixing the relative links in its header. Add the short-form
   bullet to the always-loaded file, replacing any existing "be concise" style line rather
   than adding a second one.
5. Layer 2, if this project has prompts that define a review output format: apply steps
   2a and 2b to every such prompt. Apply 2c only if there is a shared contract file the
   prompts inherit from. Apply 2d per the placement table; if a fixed-order inheritance
   block exists, APPEND, never insert or reorder. Do not delete or reword any existing
   inheritance line.
6. Layer 3, if this project has a prompt that synthesises several reviewer reports:
   replace its template with the packet's shape, state the rules under it, remove the
   praise section and count block it replaces, and add the no-echo sentence.
7. Layer 4, only if this project has this template's ten agents and three review skills:
   use the source files from the PR for the merge-carefully list, preserving local
   customisation section by section. Do not overwrite wholesale.
8. Before writing ANY changes, list every proposed edit with a one-line rationale, and
   flag any place where local customisation would be lost. Wait for my confirmation.
9. After I confirm and you've applied the changes, run the verification commands from
   the packet that match the layers you applied, and report results.
```

## Verification

Each layer's checks are guarded so they pass vacuously where the layer does not apply. On this template all four layers apply and all checks run.

```bash
# Layer 1: the style reference exists (any path) and carries the rule
# Set WS=<path> before running if the file lives somewhere other than the three paths tried here
ws="${WS:-}"
if [ -z "$ws" ]; then
  for c in .claude/COLLABORATION/writing-style.md docs/writing-style.md writing-style.md; do
    [ -f "$c" ] && ws="$c" && break
  done
fi
test -n "$ws" && test -f "$ws" || { echo "MISSING: writing-style.md (tried three conventional paths; run with WS=<path> to name yours)"; exit 1; }
grep -q 'Remove all mannered prose' "$ws"
grep -q 'When a literal phrase is available, use it' "$ws"
grep -q '| The fragment run |' "$ws"

# Layer 1: the always-loaded file carries the short form, and the old one-liner is gone
grep -qs 'Remove all mannered prose' .claude/CLAUDE.md CLAUDE.md AGENTS.md .cursorrules GEMINI.md || { echo "MISSING: short-form rule in the always-loaded file"; exit 1; }
! grep -qs "Don't waste tokens" .claude/CLAUDE.md CLAUDE.md AGENTS.md .cursorrules GEMINI.md

# Byte-identity over the "Copy verbatim" files that exist locally at the template path
for p in .claude/COLLABORATION/writing-style.md REFERENCE/decisions/2026-09-12-plain-review-output.md; do
  [ -f "$p" ] || continue
  src=$(mktemp)
  gh api "repos/mannepanne/useful-assets-template/contents/$p" -H 'Accept: application/vnd.github.raw' > "$src" \
    || { echo "FETCH FAILED: $p"; exit 1; }
  diff -u "$src" "$p" || { echo "DRIFT: $p does not match source"; exit 1; }
  rm -f "$src"
done
echo "verbatim files byte-identical to source (or placed elsewhere)"

# Layer 2: every findings-shaped Output Format carries the budget and the cap
if [ -d .claude/agents ]; then
  for f in .claude/agents/*.md; do
    case "$f" in *CLAUDE.md) continue;; esac
    if grep -q '^## Output Format' "$f" && grep -q '^### ✅' "$f"; then
      grep -q 'one to three lines' "$f" || { echo "GAP: $f has a findings-shaped Output Format without the finding budget"; exit 1; }
      grep -q ', in at most three sentences' "$f" || { echo "GAP: $f strengths descriptor lacks the cap (step 2b)"; exit 1; }
    fi
  done
  echo "reviewer output formats carry the budget"
  # Shared contract, where one exists
  if [ -f .claude/agents/CLAUDE.md ]; then
    grep -q '### Output style contract' .claude/agents/CLAUDE.md
    grep -q 'Precedence:' .claude/agents/CLAUDE.md
    grep -q '^4\. \*\*Fix\*\*' .claude/agents/CLAUDE.md
    grep -q '^5\. \*\*Assumption\*\*' .claude/agents/CLAUDE.md
  fi
  # Pointer-line order. Where the fixed-order block exists (Untrusted input directly above
  # Read-only), Output style must sit two lines below Read-only. Where it does not, the
  # packet only asks that the new line comes after the existing ones.
  for f in .claude/agents/*.md; do
    case "$f" in *CLAUDE.md) continue;; esac
    u=$(grep -n '^\*\*Untrusted input:\*\* inherits' "$f" | cut -d: -f1)
    r=$(grep -n '^\*\*Read-only:\*\* inherits' "$f" | cut -d: -f1)
    o=$(grep -n '^\*\*Output style:\*\* inherits' "$f" | cut -d: -f1)
    [ -n "$r" ] && [ -n "$o" ] || continue
    [ "$o" -gt "$r" ] || { echo "BAD ORDER: $f (Output style must come after Read-only)"; exit 1; }
    if [ -n "$u" ] && [ $((r-u)) -eq 2 ]; then
      [ $((o-r)) -eq 2 ] || { echo "BAD ORDER: $f (fixed-order block present; Output style must append directly after Read-only)"; exit 1; }
    fi
  done
  echo "pointer order holds"
fi

# Layer 3: synthesis templates carry the rules and lost the count block
for s in .claude/skills/review-pr-team/SKILL.md .claude/skills/review-spec/SKILL.md; do
  [ -f "$s" ] || continue
  grep -q 'Length budget' "$s" || { echo "MISSING: length budget in $s"; exit 1; }
  grep -q 'No count block' "$s" || { echo "MISSING: no-count-block rule in $s"; exit 1; }
  grep -q 'Cut prose, never findings' "$s" || { echo "MISSING: cut-prose-not-findings rule in $s"; exit 1; }
done
! grep -qs 'Review Summary' .claude/skills/review-pr-team/SKILL.md
! grep -qs 'Review Summary' .claude/skills/review-spec/SKILL.md
! grep -qs 'Raised by:' .claude/skills/review-spec/SKILL.md
if [ -f .claude/skills/review-pr-team/SKILL.md ]; then
  grep -q 'Unresolved — your call' .claude/skills/review-pr-team/SKILL.md
  grep -q 'Do not paste the posted comment into chat' .claude/skills/review-pr-team/SKILL.md
fi
if [ -f .claude/skills/review-pr/SKILL.md ]; then
  grep -q 'Do not paste the posted comment into chat' .claude/skills/review-pr/SKILL.md
  grep -q 'Post the reports as returned' .claude/skills/review-pr/SKILL.md
fi

# Partial-merge catch (Layer 4): the contract exists but an agent did not get its pointer,
# or a pointer exists but the contract section it links to does not
if [ -f .claude/agents/CLAUDE.md ] && grep -q '### Output style contract' .claude/agents/CLAUDE.md; then
  if grep -q '^\*\*Read-only:\*\* inherits' .claude/agents/*.md; then
    r=$(grep -l '^\*\*Read-only:\*\* inherits' .claude/agents/*.md | wc -l | tr -d ' ')
    o=$(grep -l '^\*\*Output style:\*\* inherits' .claude/agents/*.md | wc -l | tr -d ' ')
    test "$r" = "$o" || { echo "GAP: $r agents inherit read-only but only $o inherit output style"; exit 1; }
  fi
fi
if grep -qs '^\*\*Output style:\*\* inherits' .claude/agents/*.md; then
  grep -qs '### Output style contract' .claude/agents/CLAUDE.md || { echo "BROKEN: pointer lines exist but the contract section does not"; exit 1; }
fi
echo "no partial merge"
```

## Notes for the receiving Claude

- **Layer 1 replaces, it does not add.** If the always-loaded file already has a "be concise" or "don't waste tokens" line, the short-form bullet takes its place. Two style rules in one file is the drift this packet is trying to remove.
- **The dangerous move in Layer 2 is a wholesale Role-block replacement.** If the project has inheritance lines, add the new one at the end and leave the others byte-for-byte. Deleting a safety contract during a merge is the failure shape the fixed-order convention exists to prevent.
- **The budget goes in the reviewer's own template, not only in a shared contract.** That is the whole lesson of the source PR: three reviewers flagged that the standard tier posted reviewer output verbatim, so the contract alone did nothing there. Steps 2a and 2b are not optional where 2c is applied.
- **The template's example paths are placeholders.** Do not carry a concrete `config.ts:42` into a template a model will fill; a fabricated location in a posted review destroys trust in the review system.
- **Praise is capped, not banned.** A clean review still says in one to three sentences that the work is sound. "Omit if nothing stands out" applies when there are findings to read instead.
- **Outside this template**, the equivalent of `.claude/agents/CLAUDE.md` might be a `prompts/` folder, a system prompt in code, or nothing. Layer 2's steps 2a and 2b apply to any prompt text that defines findings sections, wherever it lives. Layer 3 applies to any prompt that merges reports, including a single-agent "review then summarise" prompt.
- **The byte-identity check compares against `main` of the source repo.** In this template itself, a branch that edits `writing-style.md` or the ADR reports DRIFT until it is merged. That is expected and is the check working; it needs network access and `gh` authentication to run.
- **Do not ban formatting.** The style reference says when lists and headers help; older prompts sometimes carry "never use bullets" rules that over-correct newer models. If you find one, replace it with the rule from `writing-style.md` rather than stacking the two.
