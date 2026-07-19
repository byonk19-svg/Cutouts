# 05 — Bridge Editor Transactions into the Project Session

**What to build:** Connect committed Detail Line and Feature Line changes to the Project Session as Editor Transaction outcomes. Editing and reversal must preserve the current canvas interactions while making artifact changes, Review Milestone invalidation, paint preservation, and history semantics one coherent lifecycle path.

**Blocked by:** 03 — Centralize Guided Workflow capabilities.

**Status:** ready-for-agent

- [ ] A committed raster Detail Line change reaches the Project Session as one Editor Transaction outcome.
- [ ] A committed Feature Line add, remove, move, duplicate, smooth, simplify, or width change reaches the Project Session as one Editor Transaction outcome.
- [ ] Each committed editor action creates exactly one Undo entry and clears the applicable Redo branch.
- [ ] Undo restores only the prior editable artifact and does not restore revoked Review Milestones, workflow navigation, proposal-review status, or saved status.
- [ ] Redo reapplies only the editable artifact and does not restore Review Milestones or workflow navigation.
- [ ] Any accepted-linework mutation atomically revokes linework and color Review Milestones, returns Workflow Progress to Clean Lines, and preserves paint selections.
- [ ] Undo and Redo history remains runtime-only and is cleared by successful new-project and project-restore transitions.
- [ ] Existing pointer gestures, Connected Line Segment behavior, canvas rendering, selection behavior, and viewport behavior remain unchanged.
- [ ] Focused tests exercise observable session and editor outcomes rather than private canvas calls or history-array implementation.
- [ ] Browser coverage verifies raster editing, Feature Line editing, Undo, Redo, milestone invalidation, and paint preservation.
- [ ] The ticket does not broadly redesign or merge the raster and Feature Line editor implementations.
