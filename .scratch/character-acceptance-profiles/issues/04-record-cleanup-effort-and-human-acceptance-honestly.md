# 04 — Record cleanup effort and human acceptance honestly

**What to build:** Produce an auditable Character Acceptance Result that distinguishes automated evidence, cleanup effort, pending physical review, explicit waivers, and completed Maker Acceptance without allowing automation to claim unperformed human work.

**Blocked by:** 03 — Enforce the complete Maker-Ready Baseline.

**Status:** needs-info

**Parked until:** The 10-source field-test worksheet has real cleanup and
physical-check observations that justify further acceptance-result tooling.

- [ ] The profile declares machine-observable workflow budgets for provider requests, Connected Line Segment deletions, Feature Line additions, and major redraw requirements.
- [ ] The automated result records observed workflow counts and fails exceeded required budgets.
- [ ] Cleanup elapsed time and practical effort remain human-recorded rather than flaky wall-clock CI assertions.
- [ ] Automated results remain separate from the immutable Character Acceptance Profile.
- [ ] Human checks are recorded separately as pending, passed, or explicitly waived.
- [ ] An automated-pass result without completed physical checks reports ready for human review rather than Maker Acceptance.
- [ ] Maker Acceptance requires an actual-size print, calibration measurement, adjacent-page continuity review, practical line-weight judgment, and representative Cut Line and Detail Line transfer.
- [ ] A waiver names the unperformed check and cannot produce Maker Acceptance.
- [ ] Result manifests record source identity, profile schema version, validator version, artifact identities, automated observations, diagnostic paths, workflow budgets, and human status.
- [ ] Unknown, missing, stale, or contradictory human records fail clearly rather than defaulting to success.
- [ ] Max's current unperformed physical checks remain pending and are not represented as complete.
- [ ] Lifecycle tests cover automated failure, validation error, ready-for-human, human pass, and explicit waiver outcomes.
