#!/usr/bin/env bash
# ABOUT: Runs every migration packet's `## Verification` block against this repo.
# ABOUT: A packet's checks must pass on the template itself, or the checks are wrong.
#
# Why this exists: packets shipped verification commands that could never pass -- one
# grepped for a literal whose quote marks broke the substring, one matched explanatory
# prose instead of the config entry it meant to assert. Neither had ever been executed.
# A receiving Claude running a broken check sees "MISSING" for a feature that is present,
# and may "fix" a file that was already correct.
#
# Usage:  bash REFERENCE/TEMPLATE-UPDATES/verify-packets.sh
# Exit 0 if every packet's checks pass against the current tree.
#
# Three traps this harness exists to survive, each learned by falling into it:
#
#   1. `cmd && echo "OK" || echo "MISSING"` ALWAYS exits 0. It reports failure on stdout
#      and returns success. Exit status alone calls a broken check green -- which is why
#      these went unnoticed for months. Hence the failure-marker scan.
#   2. `set -e` does NOT abort on a failing `!`-prefixed pipeline; POSIX exempts them. A
#      `! grep -q ...` assertion can be false and the block still exits 0. Hence the
#      separate negated-assertion pass.
#   3. Interpolating a block into a double-quoted `bash -c "..."` lets the OUTER shell
#      expand backticks and `$` inside the packet's own grep patterns. The block must be
#      executed from a file, never interpolated.
#
# Authoring rule for packets: write checks that exit non-zero on failure. Prefer a bare
# `grep -q ...` or `test ... = ...` over the `&& echo OK || echo MISSING` idiom.

set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

# Packets whose checks legitimately cannot pass on the template itself.
# Format: "packet-dir-name:reason". Empty by default -- a packet needing an entry here
# should explain why in its README.
SKIP=""

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

fail=0
for readme in REFERENCE/TEMPLATE-UPDATES/*/README.md; do
  name=$(basename "$(dirname "$readme")")

  skip_reason=$(printf '%s\n' "$SKIP" | awk -F: -v n="$name" '$1==n {print $2}')
  if [ -n "$skip_reason" ]; then
    printf 'SKIP  %-42s %s\n' "$name" "$skip_reason"
    continue
  fi

  # Extract the fenced bash block(s) under the "## Verification" heading.
  awk '
    /^## Verification/ { inv=1; next }
    inv && /^## /      { inv=0 }
    inv && /^```bash/  { inb=1; next }
    inb && /^```$/     { inb=0; next }
    inb                { print }
  ' "$readme" > "$tmp/block.sh"

  if [ ! -s "$tmp/block.sh" ]; then
    printf 'NONE  %-42s no ## Verification bash block\n' "$name"
    continue
  fi

  # Trap 3: execute from a file so the packet's own backticks and $ are not expanded here.
  # Trap 1 + set -e: a failing check mid-block must fail the block.
  out=$(bash -e "$tmp/block.sh" 2>&1); rc=$?

  # Trap 2: re-evaluate every negated assertion on its own, joining line continuations.
  neg=""
  while IFS= read -r line; do
    stripped=${line#"${line%%[![:space:]]*}"}
    case "$stripped" in "!"*) ;; *) continue ;; esac
    while [ "${line%\\}" != "$line" ]; do
      line=${line%\\}
      IFS= read -r cont || break
      line="$line $cont"
    done
    if ! ( cd "$ROOT" && eval "$line" ) >/dev/null 2>&1; then
      neg="${neg}FAIL: negated assertion is false: ${stripped}
"
    fi
  done < "$tmp/block.sh"

  if [ -n "$neg" ]; then out="${out}
${neg}"; rc=1; fi

  # Trap 1: a check can announce failure on stdout while exiting 0.
  if [ $rc -ne 0 ] || printf '%s' "$out" | grep -qE '^(MISSING|FAIL|BAD|GAP|BROKEN|WARNING)'; then
    printf 'FAIL  %-42s\n' "$name"
    printf '%s\n' "$out" | sed 's/^/        /'
    fail=1
  else
    printf 'PASS  %-42s\n' "$name"
  fi
done

echo "---"
if [ $fail -eq 0 ]; then
  echo "All packet verification blocks pass."
else
  echo "Some packet verification blocks FAIL. A packet's checks must pass on the template."
fi
exit $fail
