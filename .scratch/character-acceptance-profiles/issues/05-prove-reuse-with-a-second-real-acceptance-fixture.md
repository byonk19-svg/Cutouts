# 05 — Prove reuse with a second real Acceptance Fixture

**What to build:** Validate a second real character through the complete shared framework, then remove legacy source-specific inspection and evidence duplication so future cutouts add profiles and fixtures rather than bespoke validation programs.

**Blocked by:** 03 — Enforce the complete Maker-Ready Baseline; 04 — Record cleanup effort and human acceptance honestly.

**Status:** needs-info

**Parked until:** The 10-source real-world field test is complete. Do not turn
an ordinary field-test source into another Acceptance Fixture during the run.

- [ ] The existing authored-line-art or Coraline workflow becomes a committable Acceptance Fixture with a strict Character Acceptance Profile.
- [ ] Its profile is authored before any new pipeline tuning and records source identity, source-specific semantic expectations, requested output, workflow budgets, and human checks.
- [ ] The second real fixture passes fast validation and the complete Chromium character suite through the same Python engine as Max.
- [ ] The contrasting synthetic fixture continues to pass and guards against source-specific overfitting.
- [ ] A defect found by the second fixture begins with a focused failing profile assertion and receives a reusable root-cause fix.
- [ ] Max and every prior fixture remain green after any required tuning.
- [ ] Source-specific packet inspection, semantic assertion, and manifest logic are removed where the shared engine now owns the behavior.
- [ ] Browser helpers capture artifacts but do not duplicate Python semantic interpretation.
- [ ] Non-committable source handling is documented and requires a committable synthetic reproduction before permanent generation changes.
- [ ] Generated acceptance artifacts remain reproducible and normally uncommitted.
- [ ] Full verification, the complete multi-fixture character suite, rendered-output inspection, and `git diff --check` pass.
