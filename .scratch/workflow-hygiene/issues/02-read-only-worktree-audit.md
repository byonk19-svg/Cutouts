Status: complete

# 02 - Read-only worktree audit

Blocked by: ticket 01

## What to do

Inspect every registered Cutouts worktree and record path, branch or detached
SHA, dirty state, last commit, main ancestry, unique commits, purpose, owner,
classification, and removal risk.

## Acceptance criteria

- Every registered Cutouts worktree is included.
- Each entry is classified as active, retain, cleanup-candidate, or blocked.
- Dirty/untracked state and unique commits are checked before classification.
- The report explicitly records uncertainty rather than guessing ownership.
- No worktree, branch, file, or commit is deleted during this ticket.

## Evidence

- Reviewed:
  - `.scratch/workflow-hygiene/PRD.md`
  - `.scratch/workflow-hygiene/STATUS.md`
  - `CONTEXT.md`
- Inventory command:
  - earlier snapshots were superseded after new registered worktrees appeared
  - refreshed `git worktree list --porcelain` snapshot -> `16` registered Cutouts worktrees audited
- Snapshot timestamp:
  - refreshed registry snapshot -> `2026-07-23 20:19:06 -05:00`
- Comparison baseline:
  - `git rev-parse origin/main` -> `c1144b656a2897a1444c82be3b4edb35a985431e`
  - `git rev-parse main` -> `8ff06c6961a4289d89b0f6d2df68aff8eed89a07`
  - `git rev-list --left-right --count main...origin/main` -> local `main` is `0` ahead / `30` behind
- Per-worktree read-only checks:
  - `git -C <path> status --porcelain=v1 -uall`
  - `git -C <path> log -1 --format='%H%x09%s'`
  - `git -C <path> merge-base HEAD origin/main`
  - `git -C <path> rev-list --left-right --count origin/main...HEAD`
  - `git -C <path> log --oneline --no-decorate origin/main..HEAD`
  - `Get-ChildItem <path>\\.scratch -Directory`
- Live-owner signal:
  - `list_agents` exposed only the current `d2a4` workflow-hygiene lane; no other readable cwd mapping was available, so non-current owners were recorded as `unknown`
- Deliverables:
  - `.scratch/workflow-hygiene/WORKTREE_AUDIT.md`
  - this issue file
- Outcome summary from the audit:
  - `5` cleanup candidates: `0037`, `3e18`, `a358`, `project-session-ticket-01`, `svg-linework-import`
  - `6` blocked worktrees due to dirtiness, detached artifact state, or unresolved detached-purpose ambiguity: `1062`, `4ea6`, `ai-linework-cleanup`, `ba14`, `detailed-line-art-routing`, `ea2f`
  - `3` active worktrees: the main OneDrive lane, the current `d2a4` workflow-hygiene lane, and `e3fb`
  - `2` retain worktrees with ambiguous detached-history or unique-commit risk: `cf0c`, `cutout-forward-plan`
  - `e3fb` now has `8` untracked files under `.scratch/repository-audit-2026-07/issues/`, so live evidence supports an in-progress repository-audit lane; it is now `active` with owner still `unknown`
  - `ea2f` remains detached at `c1144b6`, clean, with no unique commits and no readable owner or purpose signal, so it remains conservatively `blocked`
  - the five cleanup candidates were rechecked live during this refresh and all remained clean
  - `cleanup-candidate` was limited to clean non-current branch worktrees with no unique commits, no detached-purpose ambiguity, and no active-task signal
  - dirty counts and example paths are snapshot-time observations and may evolve later without falsifying this historical snapshot
  - later registry or target-state changes must trigger another refreshed read-only audit before any cleanup authorization is acted on
- Safety statement:
  - No target worktree, branch, tracked file, untracked file, commit, or worktree metadata was deleted or modified during the audit; the only writes were the two authorized audit deliverables above in the canonical workflow-hygiene lane.
  - Spec compliance review and audit-usability/code-quality review approved the
    refreshed 16-worktree snapshot.
