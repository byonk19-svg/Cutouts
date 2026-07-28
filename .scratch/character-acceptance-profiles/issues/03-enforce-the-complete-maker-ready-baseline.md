# 03 — Enforce the complete Maker-Ready Baseline

**What to build:** Apply one non-disableable Maker-Ready Baseline to every Acceptance Fixture and prove required character features and physical print protections survive from generated linework through accepted Detail Lines, SVG, rendered PDF pages, and the assembled trace.

**Blocked by:** 02 — Complete the semantic assertion vocabulary.

**Status:** needs-info

**Parked until:** The 10-source real-world field test demonstrates a repeated
baseline or export-protection gap not covered by current verification.

- [ ] Every fixture automatically inherits the Maker-Ready Baseline and cannot disable or replace a baseline assertion.
- [ ] Generated linework is evaluated separately from accepted Detail Lines so manual reconstruction cannot hide weak automatic output.
- [ ] Required accepted features default to surviving into every relevant downstream artifact.
- [ ] The baseline protects one authoritative Cut Line, Finished Size, SVG viewBox, US-letter media boxes, calibration geometry, tile overlap, page ordering, and page labels.
- [ ] Trace Pages contain black-and-white linework only and exclude Source Image pixels, underlays, selections, handles, review overlays, and temporary gestures.
- [ ] Accepted Detail Lines remain separately identifiable and editable before export and appear in both SVG and rendered PDF output.
- [ ] Protected geometry is compared structurally or byte-equivalently where appropriate.
- [ ] Profile schema, source identity, fast semantic checks, and fast baseline checks run during ordinary verification.
- [ ] A dedicated full character command runs the real Chromium workflow, SVG inspection, PDF rendering, assembly, continuity checks, and the shared Python validator.
- [ ] The full command uses one actual Chromium worker where deterministic sequencing is required.
- [ ] Generated evidence is reproducible under fixture-specific output directories and is not canonical profile input.
- [ ] No automated acceptance path performs a real paid-provider request.
- [ ] Full verification, the complete character suite, rendered-output inspection, and `git diff --check` pass.
