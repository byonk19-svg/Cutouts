# Workflow Hygiene

## Goal

Make multi-ticket Cutouts work resumable from repository state instead of chat
history, while preserving explicit safety, verification, human acceptance, and
Git authorization boundaries.

## Scope

1. Add the orchestration contract, reusable status template, read-only workflow
   doctor, and release-verification evidence command.
2. Audit every registered Cutouts worktree without modifying or deleting any of
   them.
3. Remove only individually approved cleanup targets after human review.

## Ticket order

1. `issues/01-status-contract-and-workflow-commands.md`
2. `issues/02-read-only-worktree-audit.md`
3. `issues/03-authorized-worktree-cleanup.md`

Tickets are sequential. Ticket 03 requires a target-by-target human
authorization list produced after reviewing Ticket 02's audit.

## Permanent boundaries

- The controller conversation is disposable; repository files own resumable
  state.
- One canonical worktree and feature branch serve sequential tickets.
- Fresh implementation conversations do not create new worktrees by default.
- Exploration remains read-only unless implementation acceptance criteria are
  explicitly supplied.
- `go` authorizes exactly one recorded action and never implicitly authorizes a
  paid request, destructive cleanup, history rewriting, tag, unspecified merge,
  or release.
- Verification commands never push, merge, delete, or change issue status.
- Provider requests are prohibited and protected Cut Line/PDF geometry must
  remain unchanged throughout this feature.
