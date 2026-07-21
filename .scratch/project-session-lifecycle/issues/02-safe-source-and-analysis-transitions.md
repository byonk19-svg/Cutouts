# 02 — Make Source Image and analysis replacement failure-safe

**What to build:** Route Source Image selection, analysis, regeneration, and confirmed new-project behavior through atomic Project Transitions. A maker's current work must survive failed preparation and late responses, while successful replacement continues to reset only the source-dependent work required by existing product rules.

**Blocked by:** 01 — Establish the Project Session seam.

**Status:** complete

- [x] Source Image reading and analysis complete before a replacement Project Transition mutates durable project state.
- [x] An unreadable image or failed analysis leaves the current Source Image, analysis, accepted linework, Feature Lines, paint work, and Review Milestones unchanged.
- [x] A successful Source Image replacement atomically installs the new source and analysis and resets source-dependent artifacts, Workflow Progress, and unaccepted proposal state according to existing rules.
- [x] Same-source regeneration preserves manual Feature Lines where existing behavior promises preservation and invalidates only the decisions made stale by the regenerated artifacts.
- [x] Analysis and regeneration results carry their originating Project Revision and are discarded when that revision is no longer current.
- [x] Starting a new project clears the active Project Session and its Autosave only after the maker confirms the destructive reset.
- [x] Cancelling new-project confirmation leaves the entire Project Session unchanged.
- [x] Project Capabilities and operation status correctly represent preparing, failed, successful, and stale-result outcomes.
- [x] Controlled tests complete analysis responses out of order and prove that an older response cannot overwrite a newer source or settings revision.
- [x] Browser coverage verifies successful replacement, failed replacement preservation, delayed-response rejection, and confirmed new-project behavior.
- [x] Cut Line geometry, trace settings, provider behavior, SVG output, and PDF behavior remain unchanged.

## Comments

Completed in commit `83c0c05`. Merged via PR #4.
