# 02 — Complete the semantic assertion vocabulary

**What to build:** Let Character Acceptance Profiles describe the maker-visible semantic relationships needed across varied characters, then migrate Max's remaining hard-coded semantic expectations into its profile without making the validator understand character-specific anatomy.

**Blocked by:** 01 — Run a Character Acceptance Profile end to end.

**Status:** needs-info

**Parked until:** The 10-source real-world field test identifies a repeated
semantic acceptance gap that this ticket is needed to diagnose.

- [ ] The declarative vocabulary supports silhouette containment, closed Paint Regions, nested regions, open Feature Lines, required Detail Lines, forbidden Detail Lines, and exterior-echo rejection.
- [ ] Feature identifiers and labels remain fixture-local; no universal body-part ontology is introduced.
- [ ] Feature regions use manually authored coordinates normalized to the full Source Image and map through observed subject bounds.
- [ ] Initial locators use rectangles, and invalid or out-of-range normalized geometry is rejected.
- [ ] Relationships reject missing references, duplicate identifiers, impossible nesting, and unsupported assertion types.
- [ ] Reusable validator defaults own ordinary tolerances; every fixture override uses normalized values and records a reason.
- [ ] The validator never automatically loosens a tolerance after failure.
- [ ] Max's eye whites, pupils, antler areas, ears, face, body, limbs, paws, tail, and significant paint boundaries are expressed through the profile where they are profile concerns.
- [ ] Max's brows, lashes, mouth, toes, and decorative strokes remain open where they do not define Paint Regions.
- [ ] Dot-sized artifacts, duplicate silhouettes, and other forbidden details produce named failures.
- [ ] Existing algorithm-level tests remain only where they lock down a reproduced defect rather than duplicate profile semantics.
- [ ] Assertion-contract tests prove passed, failed, and errored outcomes using deterministic synthetic Artifact Sets.
- [ ] All existing Character Acceptance Profiles remain green.
