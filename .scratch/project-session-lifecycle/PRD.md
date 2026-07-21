# Project Session Lifecycle

**Status:** complete

## Problem Statement

Cutout Studio stores one maker project across many independent React state values, effects, event handlers, and small lifecycle modules. A single maker action can therefore update accepted linework, Workflow Progress, paint work, persistence status, and operation state at different times. The interface can briefly or permanently expose combinations that are not valid Project Sessions.

This structure also makes failure and concurrency unsafe. Some asynchronous handlers clear existing work before replacement input has been validated, and most results are not tied to the Project Revision that started them. A failed import or late response can erase or overwrite useful project work. Project Capabilities such as entering Colors or accepting an AI Linework Proposal are partly derived for display and partly enforced in individual handlers, so those rules can drift.

The maker needs every project action to behave as one coherent decision: preserve the artifacts that remain valid, revoke decisions that became stale, reject outdated results, and never destroy the current project merely because preparation failed.

## Solution

Introduce one deep Project Session module as the sole write authority for durable project state and the transient lifecycle facts that affect Project Capabilities. React becomes a view adapter: it renders session state, requests named maker actions, executes browser effects through adapters, and retains only transient presentation state.

Every durable action applies one atomic Project Transition. Asynchronous work is prepared outside the transition and may commit only if its originating Project Revision is still current. Failure may update transient operation status but leaves durable project state unchanged. The module derives Project Capabilities for display and enforces the same rules when actions are attempted.

Project Files continue to serialize the existing durable state and saved workspace preferences. They exclude unaccepted AI Linework Proposals, Editor Transaction history, transient operation status, transient presentation choices, and active gestures. The existing schema remains compatible.

The migration is incremental. Existing project serialization, Guided Workflow, AI proposal review, paint, and editor behavior move behind the Project Session interface one lifecycle slice at a time. Protected geometry, provider rules, visual behavior, and export output remain unchanged.

## User Stories

1. As a maker, I want each project action to complete atomically, so that I never see a partially updated project.
2. As a maker, I want project preservation rules applied consistently, so that valid work is not lost when I change one aspect of the project.
3. As a maker, I want workflow invalidation rules applied consistently, so that stale Review Milestones never unlock later steps.
4. As a maker, I want the controls to reflect the actions currently permitted by my Project Session, so that the next valid action is clear.
5. As a maker, I want unavailable actions rejected even if a disabled control is bypassed, so that the project cannot enter an invalid state.
6. As a maker, I want changing the project name to preserve analysis, linework, paint work, and Review Milestones, so that metadata edits do not erase progress.
7. As a maker, I want changing Finished Size to preserve accepted linework, paint work, and Review Milestones, so that scale corrections do not force unrelated review.
8. As a maker, I want a successful Source Image replacement to reset analysis and downstream Review Milestones, so that old decisions never apply to new artwork.
9. As a maker, I want a failed Source Image replacement to leave the existing project intact, so that an unreadable file does not destroy my work.
10. As a maker, I want failed analysis preparation to leave the existing project intact, so that I can retry without reconstructing prior work.
11. As a maker, I want failed project-file validation to leave the current project intact, so that opening a damaged file is recoverable.
12. As a maker, I want a valid Project File to replace the current project in one transition, so that restored artifacts and Workflow Progress agree immediately.
13. As a maker, I want a late analysis result for an older Project Revision discarded, so that it cannot overwrite newer artwork or settings.
14. As a maker, I want a late project-open result discarded when the active project has changed, so that asynchronous file work cannot rewind my session.
15. As a maker, I want a late paint-match result applied only to the color and Project Revision that requested it, so that it cannot update the wrong palette entry.
16. As a maker, I want a late AI proposal result discarded after the project changes, so that provider output cannot attach to the wrong Source Image or Cut Line.
17. As a maker, I want an AI proposal request failure to preserve accepted Detail Lines, Feature Lines, paint work, and Workflow Progress, so that optional assistance cannot damage local work.
18. As a maker, I want an unaccepted AI Linework Proposal kept out of the Project File, so that reopening a project never treats a proposal as accepted work.
19. As a maker, I want an accepted AI proposal saved only as accepted Detail Lines, so that durable project data reflects my explicit decision.
20. As a maker, I want accepting an AI proposal to create exactly one Undo entry, so that one Undo restores the prior accepted Detail Lines.
21. As a maker, I want AI proposal acceptance to preserve manual Feature Lines and paint selections, so that optional simplification does not erase later work.
22. As a maker, I want AI proposal acceptance to revoke stale linework and color Review Milestones, so that the new Detail Lines receive explicit review.
23. As a maker, I want Undo to restore the prior editable artifact without silently restoring Review Milestones, so that approval remains an explicit decision.
24. As a maker, I want Redo to reapply the editable artifact without silently restoring Review Milestones, so that workflow approval cannot be changed indirectly.
25. As a maker, I want Undo and Redo history limited to the active app run, so that Project Files remain compact and rejected proposal data is not retained.
26. As a returning maker, I want accepted Detail Lines and Feature Lines restored from my Project File, so that my current artwork survives between sessions.
27. As a returning maker, I want paint selections and inclusion choices restored from my Project File, so that color work survives between sessions.
28. As a returning maker, I want Review Milestones restored and normalized against available data, so that the Guided Workflow resumes at a valid step.
29. As a returning maker, I want saved workspace preferences restored where they are already supported, so that my editing setup remains familiar.
30. As a returning maker, I want transient menus, hover previews, active gestures, and proposal review views reset, so that stale presentation state does not leak between sessions.
31. As a maker, I want linework editing to revoke linework and color Review Milestones while preserving paint selections, so that corrections remain safe without wasting color work.
32. As a maker, I want color edits after completed color review to update the project without automatically revoking that milestone, so that small corrections do not create an approval loop.
33. As a maker, I want restarting color review to remain an explicit action, so that workflow requirements do not change implicitly.
34. As a maker, I want pending AI proposal review to block Colors and Export consistently, so that I cannot advance while the accepted linework decision is unresolved.
35. As a maker, I want a review-only proposal to remain impossible to accept, so that provider and validation restrictions cannot be bypassed.
36. As a maker, I want rejecting an AI proposal to leave accepted Detail Lines unchanged, so that rejection has no hidden artifact consequences.
37. As a maker, I want starting a new project to clear the old Project Session only after I confirm, so that accidental activation is recoverable.
38. As a maker, I want the new project transition to clear its old Autosave only as part of the confirmed reset, so that previous data is not removed prematurely.
39. As a maker, I want Autosave to snapshot only valid Project Sessions, so that partially prepared work is never persisted.
40. As a maker, I want Autosave failure to leave my in-memory project unchanged, so that persistence trouble does not roll back editing.
41. As a maker, I want Autosave failure shown clearly, so that I know to use an explicit save action.
42. As a maker, I want no automatic Autosave retry loop, so that background behavior remains predictable.
43. As a maker, I want the next project change or explicit save to provide another save opportunity, so that Autosave can recover without hidden retries.
44. As a maker, I want explicit project download to serialize one consistent Project Revision, so that the Project File cannot combine old and new fields.
45. As a maker, I want project restoration to reject unsupported schemas without changing my active project, so that incompatible files fail safely.
46. As a maker, I want existing compatible Project Files to open without migration prompts, so that this architecture change does not invalidate saved work.
47. As a maker, I want Cut Line geometry preserved across this change, so that physical cutting output remains identical.
48. As a maker, I want SVG geometry preserved across this change, so that vector linework remains identical.
49. As a maker, I want PDF dimensions, tiling, overlap, calibration, and assembly preserved, so that printed templates remain physically accurate.
50. As a maker, I want existing provider disclosure, exact-cost confirmation, one-request behavior, and no automatic retry preserved, so that AI assistance remains bounded and explicit.
51. As a maker, I want the existing Guided Workflow screens and controls to behave the same, so that an architecture improvement does not force me to relearn the app.
52. As a maker, I want errors associated with the action that failed, so that I can recover without guessing which project artifact changed.
53. As a maker, I want a failed optional operation to leave unrelated Project Capabilities available, so that one error does not freeze the whole workflow.
54. As a maker, I want concurrent non-conflicting preparation to remain safe, so that responsiveness does not compromise project integrity.
55. As a developer, I want every durable state change to cross one Project Session interface, so that preservation and invalidation logic has locality.
56. As a developer, I want Project Capabilities derived and enforced by the same module, so that display and action policy cannot drift.
57. As a developer, I want browser and local-backend mechanics supplied through adapters, so that lifecycle behavior can be tested without real files, downloads, credentials, or provider calls.
58. As a developer, I want lifecycle tests to assert observable session outcomes, so that internal refactoring does not require rewriting behavior tests.
59. As a developer, I want stale-result behavior testable with controlled adapters, so that concurrency regressions have a tight feedback loop.
60. As a developer, I want the migration delivered in small lifecycle slices, so that each replacement can be validated against existing behavior.

## Implementation Decisions

- The Project Session is one deep, in-process module and the sole write authority for durable project state and transient lifecycle facts that affect Project Capabilities.
- Its interface accepts named maker actions and exposes the current session state, Project Capabilities, operation outcomes, and requested external effects. Callers do not coordinate preservation or invalidation themselves.
- Each successful action produces one atomic Project Transition. A partially applied transition is invalid and must never be exposed or persisted.
- Project Capabilities are derived from the same policy that validates requested actions. Disabled presentation is advisory; session enforcement is authoritative.
- Every asynchronous preparation records its originating Project Revision and any relevant artifact identity. A successful result may commit only when that revision and identity remain current.
- Preparation and validation occur before durable replacement. Failure updates only transient operation status and leaves durable project state unchanged.
- Browser file access, local storage, local-backend requests, download mechanics, scrolling, and confirmation prompts remain adapters at the Project Session seam.
- Production adapters use the existing browser and local-process mechanisms. In-memory adapters provide deterministic test behavior. No adapter is allowed to mutate session state directly.
- React is a view adapter. It renders session state, presents Project Capabilities, requests actions, executes effect requests, and retains only transient presentation choices and active gestures.
- Existing serialization, workflow, proposal-review, paint, and editor modules may remain internally composed during migration, but none remains a parallel authority for durable project writes.
- A Project File serializes the existing durable state and saved workspace preferences. It excludes unaccepted AI proposals, Editor Transaction history, transient operation status, transient presentation choices, and active gestures.
- The saved-project schema version and external JSON shape remain unchanged. The refactor must continue to normalize existing compatible Project Files using the current rules.
- Unaccepted AI proposal data remains runtime-only. Explicit acceptance stores the proposal only as accepted Detail Lines.
- Editor Transactions remain a separate runtime-only module. The Project Session consumes their committed artifact outcomes and applies Review Milestone consequences atomically.
- One accepted proposal produces one Editor Transaction. Undo and Redo affect editable artifacts only and never restore Review Milestones, workflow navigation, proposal-review status, or saved status.
- Project Revision changes are opaque to the view. The implementation may use monotonically increasing revisions or equivalent tokens, but stale-result correctness is part of the interface.
- Autosave is a best-effort effect requested after a valid durable transition. Failure reports persistence health without rollback or automatic retry.
- Explicit save serializes one coherent Project Revision and may also refresh the local Autosave using the same snapshot.
- Successful Source Image replacement resets generated analysis, accepted generated Detail Lines, source-dependent editor work, and downstream Review Milestones according to existing product rules. Failed replacement changes none of them.
- Changing project name or Finished Size preserves accepted linework, paint work, and Review Milestones according to existing product rules.
- Any mutation to accepted linework revokes linework and color Review Milestones, returns Workflow Progress to Clean Lines, and preserves existing paint selections.
- Color edits after completed color review retain the milestone. Restarting color review remains an explicit action.
- AI proposal request, review, acceptance, rejection, review-only behavior, workflow gating, one-request behavior, exact-cost disclosure, protected geometry, and no-retry behavior remain unchanged.
- Migration is incremental and test-first. Each lifecycle slice replaces direct durable setters with Project Session actions before the next slice begins.
- The migration must not combine the separate local-backend orchestration, trace-pipeline locality, broad editor-history redesign, or visual redesign candidates discovered by the architecture survey.

## Testing Decisions

- The highest and primary test seam is the Project Session interface. Tests provide an initial session, request a maker action, execute controlled adapter outcomes when needed, and assert the observable next state, Project Capabilities, effect requests, and errors.
- Project Session tests replace behavior coverage that currently reaches past the intended seam into scattered setters or private lifecycle helpers. Existing pure helpers may retain focused algorithm tests only when they remain genuine internal seams.
- Table-driven lifecycle tests cover successful Project Transitions and the complete preservation/invalidation matrix for naming, Finished Size, Source Image replacement, analysis, line edits, paint edits, color review, new project, project restore, and AI proposal decisions.
- Failure tests prove that unreadable images, invalid Project Files, failed analysis, failed paint matching, provider failure, invalid provider output, download failure, and Autosave failure do not mutate unrelated durable state.
- Concurrency tests use controlled in-memory adapters to complete requests out of order and prove that stale Project Revisions cannot overwrite the current Source Image, analysis, palette, accepted linework, or proposal state.
- Capability tests verify both presentation facts and authoritative enforcement for Guided Workflow navigation, linework review, color review, Export, AI proposal request, proposal acceptance, review-only results, and pending review.
- Editor integration tests verify exactly one Undo entry for proposal acceptance, artifact-only Undo and Redo, milestone invalidation, Feature Line preservation, paint preservation, and empty history after restore.
- Project File tests verify unchanged schema output, compatible round trips, normalized Workflow Progress, persisted accepted artifacts, persisted saved workspace preferences, and exclusion of runtime-only state.
- Autosave tests use a controlled storage adapter and clock. They verify one snapshot after a valid transition, no snapshot for failed preparation, no rollback on failure, and no automatic retry loop.
- Existing Guided Workflow tests are prior art for deterministic transition coverage. Existing AI proposal-review tests are prior art for explicit review and acceptance rules. Existing project round-trip tests are prior art for serialization compatibility.
- Existing browser tests remain the integration seam for Upload through Export, project open/save/restore, line-edit invalidation, AI proposal review/apply/reject, protected-artifact preservation, and PDF request construction.
- Browser coverage must include delayed or mocked local-backend responses for stale-result behavior without credentials or real provider requests.
- Existing backend, trace quality, paint, SVG, PDF, TypeScript, production build, and full browser suites remain regression gates.
- Tests assert maker-visible behavior, durable project state, Project Capabilities, requested effects, and adapter outcomes. They do not assert React setter order, internal reducer shape, private helper calls, or file organization.

## Out of Scope

- Any visual redesign, new control, renamed workflow step, or layout change.
- Changes to deterministic tracing, mask extraction, line cleanup, paint extraction, paint matching, SVG construction, or PDF generation algorithms.
- Changes to Cut Line geometry, Finished Size calculation, tile layout, page overlap, calibration, SVG viewBox, PDF assembly, or print line widths.
- Changes to provider selection, model prompts, image-retention terms, privacy disclosure, exact request cost, request count, retry behavior, proposal normalization, or duplicate-silhouette suppression.
- Persisting unaccepted AI proposals, proposal-review views, operation errors, Undo history, Redo history, active gestures, hover state, menus, or modal state.
- A new Project File schema version or migration to a different storage format.
- Cloud persistence, accounts, collaboration, multi-project synchronization, or hosted storage.
- Consolidating local-backend transport into a new client module beyond the minimum adapter needed by the Project Session seam.
- Refactoring trace-pipeline private helpers or diagnostic tooling.
- Broadly unifying raster and Feature Line editor implementations; this spec requires only the Editor Transaction seam needed for session outcomes.
- Replacing React, changing routing, or introducing a global state library.
- Opportunistic cleanup unrelated to removing direct durable Project Session writes.

## Further Notes

- ADR 0003 establishes the Project Session as the durable lifecycle owner and records the rejected alternatives.
- The existing local developer-run architecture and explicit AI proposal exception remain governed by ADR 0001 and ADR 0002.
- The architecture survey identified Project Session lifecycle as the highest-leverage deepening candidate because the main view currently owns hundreds of state writes and repeated lifecycle coordination.
- The implementation should favor deletion of duplicated caller policy over layering a new session module on top of unchanged direct setters.
- Ticketing should use blocker-first tracer bullets. The first ticket must establish the Project Session test seam and migrate one complete lifecycle path; later tickets should migrate independent lifecycle clusters without creating parallel authority.
- The final ticket must remove remaining direct durable setters, run full browser coverage, and prove that the saved-project schema and protected print artifacts remain unchanged.

## Closeout

Completed via PR #4 (`249b3bb`) with `pnpm verify` green and isolated Playwright `26/26` green.
