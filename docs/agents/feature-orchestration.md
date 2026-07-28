# Feature Orchestration Runbook

This runbook defines how a multi-ticket feature stays resumable from repository
state instead of chat history.

## Sources of truth

- `AGENTS.md`: permanent operating rules for all agent work in this repo
- `.scratch/<feature-slug>/PRD.md`: product boundary, ticket order, and feature
  level constraints
- `.scratch/<feature-slug>/issues/<NN>-*.md`: the active ticket contract,
  acceptance criteria, and ticket-local evidence
- `.scratch/<feature-slug>/STATUS.md`: operational truth for the canonical
  worktree, current ticket, authorization state, and next action

`STATUS.md` transition ownership belongs to the controller unless the active
issue explicitly delegates a specific update.

Treat those files as distinct owners. Do not use one file to silently override
another. If they conflict, stop and resolve the conflict explicitly in the
ticket or PRD instead of guessing.

## Canonical worktree contract

- One canonical worktree and one feature branch own a sequential ticket lane.
- Fresh implementation chats resume in that recorded worktree by default.
- Exploration can inspect other worktrees, but it stays read-only unless a
  ticket explicitly authorizes implementation there.
- A new worktree is exceptional and must be recorded in `STATUS.md` before it
  becomes the active lane.

## Authorization model

- `go` authorizes exactly one recorded action from `STATUS.md` or the active
  issue.
- `go` does not authorize a paid provider request, destructive cleanup,
  branch/history rewriting, a tag, an unspecified merge, a release, or any
  action that is not already described in repository state.
- Verification commands are allowed when they are part of the active ticket's
  acceptance evidence, but they do not change tracker status on their own.
- Workers stay inside the active ticket's owned files and return structured
  receipts unless a controller instruction or issue explicitly delegates a
  broader lane.

## Standard commands

### `pnpm workflow:doctor`

Read-only repository health report for the active feature lane.

It reports:

- current worktree
- named branch or detached HEAD
- dirty and untracked file counts
- recorded canonical worktree
- active ticket and ticket status
- base/head relationship
- duplicate or unexplained feature worktrees
- port availability for `5173` and `8787`
- cleanup candidates

Exit codes:

- `0`: healthy state
- `1`: actionable warning state
- `2`: invalid required state

The doctor must not mutate repository files, worktrees, issue status, or
tracker status.

### `pnpm verify:release`

Release-evidence command for the active feature lane.

It must:

1. run `pnpm workflow:doctor`
2. run `pnpm verify`
3. run serial Playwright using `--workers=1`
4. run `git diff --check`
5. record the commit SHA and final working-tree state
6. write exactly one Markdown summary under
   `.scratch/<feature-slug>/evidence/`

Any nonzero doctor exit makes `verify:release` fail. Doctor warning state still
runs and records the required checks so the evidence shows both the operational
warning and the check results.

It must never push, merge, delete a worktree, or change tracker status.

## Worker receipt contract

Every implementation worker returns a structured receipt that includes:

- status: `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, or `BLOCKED`
- task boundary handled
- files changed
- commands run with results
- evidence paths created or updated
- remaining human gates or follow-up risks

## Closeout state machine

`STATUS.md` drives closeout instead of chat recap.

### Phase: `implementation`

- exactly one ticket is active
- the next action names a single authorized implementation step
- workers may change only files inside that ticket boundary

### Phase: `verification`

- implementation is complete for the active ticket
- required tests or evidence commands are the next authorized action
- no push, merge, cleanup, or status change is implied by successful checks

### Phase: `ready-for-human`

- ticket acceptance evidence exists
- the next action is a human review, approval, or physical check
- further agent changes require a new recorded action

### Phase: `closed`

- the ticket or feature lane has an explicit recorded closeout
- remaining cleanup or release work is either complete or split into a new
  tracked action

## Cleanup and audit rules

- Worktree audits are read-only.
- Post-merge or post-ticket audit remains read-only until a separately recorded
  cleanup action authorizes mutation.
- Cleanup requires a target-by-target authorization list.
- Duplicate or unexplained worktrees are reported before any deletion is
  considered.
- Ticket-local evidence should point to audit results instead of modifying the
  tracker to imply cleanup happened automatically.
