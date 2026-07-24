Status: complete

# 01 - Status contract and workflow commands

## What to build

- Add the multi-ticket feature orchestration rules to `AGENTS.md`.
- Add `docs/agents/feature-orchestration.md` with the detailed runbook and
  closeout state machine.
- Add `.scratch/_templates/STATUS.md`.
- Add tested Node scripts for `pnpm workflow:doctor` and
  `pnpm verify:release`.
- Add the package-script entries and document their use.

## Acceptance criteria

- `workflow:doctor` is read-only and reports the current worktree, branch or
  detached state, dirty/untracked state, recorded canonical worktree, active
  ticket, base/head relationship, duplicate or unexplained feature worktrees,
  availability of ports 5173 and 8787, and cleanup candidates.
- Doctor output and exit status distinguish healthy state, actionable warnings,
  and invalid required state without mutating repository or tracker files.
- `verify:release` runs the doctor, `pnpm verify`, serial Playwright, and
  `git diff --check`; records the commit and final working-tree state; writes one
  Markdown evidence summary; and exits nonzero when any required check fails.
- Release verification never pushes, merges, deletes, or changes tracker status.
- Tests cover both commands, including success and failure behavior without
  running the repository's expensive suites inside unit tests.
- Documentation preserves separate product, ticket, operational, and permanent
  sources of truth plus the stable one-action meaning of `go`.
- Provider requests remain zero and protected geometry is unchanged.

## Evidence

- Added the orchestration contract to `AGENTS.md`, the detailed runbook at
  `docs/agents/feature-orchestration.md`, and the reusable status template at
  `.scratch/_templates/STATUS.md`.
- Added `pnpm workflow:doctor`, `pnpm verify:release`, and `pnpm test:workflow`
  in `package.json`, with usage documented in `README.md`.
- Added tested Node implementations in `scripts/workflow-doctor.mjs` and
  `scripts/verify-release.mjs` plus unit coverage in
  `tests/workflowDoctor.test.ts` and `tests/verifyRelease.test.ts`.
- Validation:
  - `node --test --experimental-strip-types tests/workflowDoctor.test.ts tests/verifyRelease.test.ts`
  - `pnpm test:workflow`
  - `pnpm verify`
- Release evidence:
  - `.scratch/workflow-hygiene/evidence/verify-release-20260724-012243.md`
    records the final post-review command behavior.
  - `pnpm verify`, serial Chromium `30/30`, and `git diff --check` passed.
  - The overall command correctly exited nonzero because the doctor reported
    the expected dirty/human-gate worktree warnings. The Windows launcher
    emitted no `DEP0190` warning after the explicit `cmd.exe` fix.
- Notes:
  - `pnpm workflow:doctor` reports warning state in this implementation worktree
    because the worktree is intentionally dirty during Ticket 01 and the repo
    currently has multiple unexplained historical Cutouts worktrees.
  - `pnpm verify:release` records required checks during doctor warning state
    but exits nonzero instead of falsely reporting release readiness.
  - The existing serial Playwright suite updates tracked files under `output/`,
    which remains a follow-up hygiene concern outside this ticket's owned file
    list.
  - Spec review: approved after the warning-state release contract was fixed.
  - Code-quality and safety review: approved after recorded commit validation,
    bounded active-ticket paths, deterministic evidence timestamps, and missing
    ancestry-field checks were hardened.
