# 07 — Move paint work behind Project Session actions

**What to build:** Route palette editing, paint inclusion, color-review effects, and asynchronous paint matching through Project Session actions. The maker's color work must remain durable and recoverable while late or failed match responses are prevented from changing the wrong Project Revision or palette entry.

**Blocked by:** 02 — Make Source Image and analysis replacement failure-safe; 03 — Centralize Guided Workflow capabilities.

**Status:** complete

- [x] Adding, updating, removing, merging, resetting, and including paint colors each apply one atomic Project Transition.
- [x] Every paint action targets a stable palette identity and cannot accidentally update a different color after intervening edits.
- [x] Asynchronous paint-match results carry both their originating Project Revision and target color identity.
- [x] Late results are discarded when the Project Revision or target color is no longer current.
- [x] Match failure reports a recoverable operation error without removing the color, its existing matches, other palette entries, or Review Milestones.
- [x] Paint changes remain durable through Autosave and Project File round trips.
- [x] Paint edits after completed color review retain the milestone and update exported paint guidance.
- [x] Explicitly restarting color review records the intended incomplete state without changing accepted linework.
- [x] Linework invalidation continues to preserve current paint selections for later reuse.
- [x] React no longer writes migrated palette or paint-review durable state directly.
- [x] Focused tests cover palette transitions, stale match results, failure preservation, milestone behavior, and round trips through the Project Session interface.
- [x] Browser coverage verifies editing, matching, review, persistence, and Export behavior without changing the paint catalog or matching algorithm.

## Comments

Completed in commit `8735abb`. Merged via PR #4.
