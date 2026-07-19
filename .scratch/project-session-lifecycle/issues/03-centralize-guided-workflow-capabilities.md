# 03 — Centralize Guided Workflow capabilities

**What to build:** Make the Project Session the single authority for Guided Workflow navigation, Review Milestones, and the Project Capabilities presented to the maker. Controls and requested actions must use the same policy, eliminating drift between disabled presentation and handler enforcement.

**Blocked by:** 01 — Establish the Project Session seam.

**Status:** ready-for-agent

- [ ] The Project Session derives the current, completed, available, and locked Guided Workflow steps from one policy.
- [ ] The view renders Project Capabilities from the session rather than independently rebuilding navigation and gating rules.
- [ ] A requested transition to a locked step is rejected by the Project Session even when presentation safeguards are bypassed.
- [ ] Completing linework review atomically records its Review Milestone and advances to Colors only when a valid Cut Line exists.
- [ ] Completing or skipping color review atomically records the correct outcome and advances to Export only after linework review.
- [ ] A mutation to accepted linework revokes linework and color Review Milestones, returns Workflow Progress to Clean Lines, and preserves paint selections.
- [ ] Color edits after completed review retain the color Review Milestone, while restarting color review remains an explicit action.
- [ ] Restored or malformed Workflow Progress is normalized to the furthest valid step supported by available project artifacts.
- [ ] Focused tests exercise capabilities and authoritative action rejection through the Project Session interface.
- [ ] Browser coverage verifies that displayed step states and actual navigation enforcement remain consistent.
- [ ] The existing four-step interface, primary actions, wording, and visual layout remain unchanged.
