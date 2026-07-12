# 01 — Introduce durable Guided Workflow state

**What to build:** Add the single-page Guided Workflow foundation so Cutout Studio can represent Upload, Clean Lines, Colors, and Export as durable project progress. The step header must show current, completed, available, and locked steps while the existing product behavior remains usable beneath the new shell.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Workflow Progress records the active step, linework Review Milestone, and Colors outcome as reviewed, skipped, or incomplete.
- [ ] Project autosave and project JSON preserve Workflow Progress without breaking existing saved projects.
- [ ] Legacy projects derive the furthest valid step from their existing source, analysis, cleanup, and paint-guide data.
- [ ] Restored projects clamp an invalid saved step to the furthest step supported by project data.
- [ ] Replacing the Source Image resets downstream milestones; changing project name or Finished Size preserves them.
- [ ] Editing accepted linework revokes linework and Colors milestones while preserving paint selections.
- [ ] Color edits after review preserve the Colors milestone.
- [ ] The step header permits current/backward navigation and shows locked future steps as disabled.
- [ ] Pure workflow-state and project round-trip tests cover transition, invalidation, restoration, and compatibility behavior.

