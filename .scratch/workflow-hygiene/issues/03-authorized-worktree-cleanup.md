Status: complete

# 03 - Authorized worktree cleanup

Blocked by: ticket 02 and human target-by-target authorization

## What to do

After human review of the read-only audit, remove only specifically authorized,
clean obsolete worktrees and then verify every retained worktree.

## Acceptance criteria

- The issue contains an explicit approved path list before cleanup begins.
- Dirty or ambiguous worktrees are preserved.
- Branches with unique commits are preserved unless separately authorized.
- Stale metadata is pruned only after its associated path is verified.
- The final receipt lists exactly what was removed, recovery implications, and
  what remains.

## Human authorization

The user explicitly authorized cleanup of these five worktrees on 2026-07-23.
The portable identifiers below replace the original machine-local paths:

- [x] worktree for `codex/project-session-ticket-07` - authorized
- [x] worktree for `codex/project-session-ticket-02` - authorized
- [x] worktree for `codex/ai-linework-ticket-01` - authorized
- [x] worktree for `codex/project-session-ticket-01` - authorized
- [x] worktree for `codex/svg-linework-import` - authorized

If the registered-worktree count or membership changes before authorization,
refresh Ticket 02's read-only audit before deleting anything.

## Cleanup receipt

Completed on 2026-07-23 after a fresh target-by-target safety check confirmed
that every authorized worktree was registered, clean, contained zero commits
outside `origin/main`, and was already merged into `origin/main`.

Removed worktrees:

- worktree for `codex/project-session-ticket-07`
- worktree for `codex/project-session-ticket-02`
- worktree for `codex/ai-linework-ticket-01`
- worktree for `codex/project-session-ticket-01`
- worktree for `codex/svg-linework-import`

Preserved branch refs:

- `codex/project-session-ticket-07` at `8735abb66405b020f946c147a02627b751e6a546`
- `codex/project-session-ticket-02` at `83c0c05d4330a2851ba600772c51291c7ef40407`
- `codex/ai-linework-ticket-01` at `b363316ffa31ac8ed5b9010019677d324aef4bae`
- `codex/project-session-ticket-01` at `17dc03ec2ce3ea4fe7d469de79a64e095115683f`
- `codex/svg-linework-import` at `09d228b5d01f1eb3b39f14346a4eb3ac94b83bb7`

Git removed each registration and working directory. The OneDrive-hosted main
repository denied Git permission to delete the five exact stale metadata
folders, so those specific metadata remnants were deleted separately after
their registrations and worktree `.git` links were gone. Ignored dependency,
build, test-result, and temporary files inside the authorized worktrees were
deleted permanently because this environment does not support Recycle Bin
directory deletion. Committed history remains recoverable by recreating a
worktree from the preserved branch refs.

Post-cleanup verification:

- all five authorized paths are absent
- all five exact metadata folders are absent
- all five branch refs remain at their recorded commits
- the registered-worktree count changed from `16` to `11`
- every retained registered worktree remains readable at its prior HEAD
- no blocked, retained, active, or unlisted worktree was removed
