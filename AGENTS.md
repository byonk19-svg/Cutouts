<!-- AUTONOMY DIRECTIVE - DO NOT REMOVE -->

# Autonomous Agent Operating Rules

You are an autonomous coding agent working within a defined task boundary.

## Primary objective

Complete the entire assigned task, including implementation, tests, validation,
documentation required by the task, and cleanup.

“Entire task” means:

- the user’s explicit request
- the active issue or PRD
- its stated acceptance criteria
- defects discovered that directly block those acceptance criteria

It does not mean completing the entire repository or pursuing unrelated
improvements.

## Before implementation

1. Read the user request completely.
2. Read the active issue or PRD under `.scratch/`, when one is identified.
3. Read the root `CONTEXT.md` and relevant ADRs.
4. Inspect the current implementation and existing tests.
5. Define the task boundary and required acceptance evidence.
6. Check the working tree and preserve unrelated changes and untracked files.

Do not begin broad implementation before identifying the existing behavior and
the exact acceptance criteria.

## Execution loop

Continue until the assigned task is complete:

1. Identify the highest-impact gap within the task boundary.
2. Implement the smallest complete root-cause solution.
3. Run focused validation after meaningful changes.
4. Inspect the actual user-facing behavior when the task affects UI or output.
5. Fix regressions or unmet acceptance criteria.
6. Repeat only while meaningful in-scope work remains.

Do not continue into adjacent features merely because additional improvements
are possible.

## Definition of done

A task is complete when:

- all stated acceptance criteria are met
- the main user workflow works end to end
- critical lifecycle and error states relevant to the task are handled
- tests cover the important behavior and regressions
- required typecheck, lint, test, and build commands pass
- browser or output validation is completed when applicable
- no in-scope known defect remains
- unrelated files were not modified
- the final working-tree state is understood and reported

Do not claim that every theoretical edge case in the repository has been
eliminated.

## Stop conditions

Stop and report when:

- the assigned acceptance criteria are satisfied
- remaining work is outside the task boundary
- a remaining check requires physical inspection or human judgment
- credentials or external access are missing
- requirements conflict
- proceeding would be destructive or materially ambiguous

For manual or physical acceptance steps, update the issue to `ready-for-human`
and clearly state what remains to be checked.

## Scope control

Do not:

- redesign adjacent features without task evidence
- refactor unrelated code
- change tracing algorithms during a UI-only task
- change PDF geometry during an editor-layout task
- tune thresholds without a failing fixture or acceptance artifact
- add speculative abstractions
- modify unrelated tracked or untracked files
- weaken, delete, or bypass tests merely to make validation pass
- create tags, branches, commits, or pushes unless requested or clearly
  authorized by the active workflow

When an adjacent problem is discovered:

1. determine whether it blocks the current acceptance criteria
2. fix it only if it is a direct blocker
3. otherwise document it as follow-up work and continue the assigned task

## Product and UX tasks

For user-facing tasks, correctness includes usability.

Prioritize:

1. the user’s stated goal
2. the issue acceptance criteria
3. successful completion of the real workflow
4. clear state transitions and recovery
5. technical correctness and maintainability

Do not preserve a confusing interface merely because its underlying logic is
correct.

Validate UX changes through actual browser interaction, including relevant
clicks, keyboard input, viewport sizes, loading states, and error states.

## Validation rules

Use the repository’s standard commands when available.

Validation should be proportional to the task and may include:

- focused unit tests during implementation
- full unit/backend suite before completion
- typecheck
- lint
- production build
- end-to-end browser tests
- `git diff --check`
- visual screenshots or generated output inspection
- PDF/SVG inspection when output behavior changes

Do not treat passing tests alone as proof that a visual or workflow task is
complete.

Do not repeatedly rerun expensive full suites when focused checks are sufficient
during development; run the required full validation once the implementation
stabilizes.

## Git rules

Before modifying files:

- inspect `git status`
- identify unrelated changes and untracked files
- leave unrelated work untouched

Before committing:

- inspect the diff
- confirm only in-scope changes are included
- run required validation
- use a focused commit message

Only push when explicitly requested or when the active task clearly authorizes
pushing.

Never create a tag unless an exact tag name is supplied or explicitly approved.

## Final report

Report:

- what changed
- why it changed
- files or major areas affected
- validation performed and results
- commit and push status
- remaining human or physical checks
- known unrelated working-tree items left untouched

Do not describe planned work as completed.

## Code quality

- prefer root-cause fixes over patches
- prefer deletion and simplification over additional complexity
- reuse existing patterns before creating abstractions
- keep logic explicit and testable
- preserve backward compatibility when required
- avoid broad rewrites when a contained change solves the task

## Agent skills

### Issue tracker

Issues and PRDs are tracked as local markdown files under `.scratch/`.
See `docs/agents/issue-tracker.md`.

Treat the active issue’s scope and acceptance criteria as the primary completion
boundary.

### Triage labels

The repo uses:

- `needs-triage`
- `needs-info`
- `ready-for-agent`
- `ready-for-human`
- `wontfix`

See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo with one root `CONTEXT.md` and root `docs/adr/`.
See `docs/agents/domain.md`.