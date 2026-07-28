Status: needs-info

Parked until the 10-source real-world field test identifies a repeated blocker
that requires more acceptance-framework work.

# Character Acceptance Profiles

## Problem Statement

Cutout Studio can produce a maker-ready Template Pack from a clean character
Source Image, but the evidence for each real character is currently scattered
across source-specific test code, browser helpers, packet inspection scripts,
generated manifests, issue comments, and human judgment. Lessons learned from
one character are therefore difficult to apply to the next without copying
coordinates, thresholds, and artifact logic into another bespoke test.

The maker needs future character work to improve one shared production
pipeline while preserving the physical guarantees already proven by earlier
cutouts. A character must not pass because its expected answer influenced
generation, because universal protections were weakened, or because an
unperformed physical check was represented as complete.

## Solution

Introduce a developer-owned Character Acceptance Profile for each committable
Acceptance Fixture. The strict, versioned JSON profile describes semantic
expectations through manually authored normalized Source Image regions,
fixture-local feature identifiers, and a small declarative assertion
vocabulary. It remains a read-only validation oracle and never enters
production generation or durable maker project data.

One Python character-acceptance engine evaluates profiles against generated
linework, accepted linework, SVG, rendered PDF artifacts, and a universal
Maker-Ready Baseline. Fast checks run during ordinary verification, while a
dedicated character suite drives the complete Chromium workflow and produces
diagnostic evidence. Automated results remain separate from human acceptance
records. An Acceptance Fixture may enter regression coverage after automated
acceptance but reaches Maker Acceptance only after the required actual-size
print and transfer checks.

The first tracer bullet migrates Max from duplicated source-specific
expectations to the shared framework and adds one contrasting synthetic fixture
that proves completed source art is not modified by Max-style repair behavior.

## User Stories

1. As a maker, I want every future character checked against the same physical
   product guarantees, so that adding a difficult cutout cannot weaken prior
   output quality.
2. As a maker, I want exactly one authoritative Cut Line preserved for every
   character, so that the plywood cutting pattern remains unambiguous.
3. As a maker, I want meaningful Paint Regions represented clearly, so that I
   can understand where each color belongs.
4. As a maker, I want expressive Feature Lines to remain open when they do not
   define Paint Regions, so that the pattern does not invent paint areas.
5. As a maker, I want required facial, clothing, limb, accessory, and other
   character features preserved, so that the printed pattern remains
   recognizable.
6. As a maker, I want tiny texture, shading marks, and duplicate contours
   rejected, so that the transferred pattern stays practical.
7. As a maker, I want accepted Detail Lines to survive into SVG and PDF, so that
   the exported packet matches what I reviewed.
8. As a maker, I want Trace Pages to remain black-and-white, so that source
   color and editor state do not contaminate the transfer pattern.
9. As a maker, I want finished size, calibration, tiling, overlap, ordering, and
   page labels protected for every character, so that printing at Actual Size
   remains reliable.
10. As a maker, I want human print checks recorded separately from automated
    checks, so that I know what has and has not been physically proven.
11. As a maker, I want a character described as maker-accepted only after an
    actual-size print and representative transfer test, so that the label
    reflects real use.
12. As a maker, I want cleanup effort measured, so that a technically valid
    result requiring extensive reconstruction is not called maker-ready.
13. As a maker, I want non-committable personal or copyrighted sources kept out
    of the repository, so that validation does not leak restricted material.
14. As a developer, I want one canonical profile per Acceptance Fixture, so
    that expectations do not drift across Python, TypeScript, Markdown, and
    manifests.
15. As a developer, I want profiles strictly versioned, so that schema changes
    are explicit and reviewable.
16. As a developer, I want unknown schema versions and assertion types rejected,
    so that validation never silently omits a requirement.
17. As a developer, I want profile regions authored against the full clean
    Source Image, so that a cropping defect cannot rewrite the oracle.
18. As a developer, I want normalized coordinates, so that validation survives
    resizing and print-scale rendering.
19. As a developer, I want fixture-local feature identifiers, so that unusual
    characters do not require a universal body-part ontology.
20. As a developer, I want semantic relationships such as closed, open, nested,
    paired, present, and absent, so that tests express maker intent rather than
    frozen pixels.
21. As a developer, I want a small declarative assertion vocabulary, so that
    character-specific executable test code does not accumulate.
22. As a developer, I want reusable validator defaults, so that profiles do not
    copy algorithm thresholds.
23. As a developer, I want normalized tolerance overrides to require a reason,
    so that exceptional ranges remain explainable.
24. As a developer, I want one Python engine to interpret semantic assertions,
    so that browser and backend validation cannot disagree.
25. As a developer, I want Chromium to pass exported artifacts to the same
    engine, so that end-to-end evidence uses identical semantics.
26. As a developer, I want profiles excluded from production generation, so
    that expected answers cannot influence output.
27. As a developer, I want the validator to inspect both generated and accepted
    linework, so that manual reconstruction cannot conceal a weak pipeline.
28. As a developer, I want a universal Maker-Ready Baseline automatically
    applied to every fixture, so that profiles only add source-specific
    expectations.
29. As a developer, I want profiles unable to disable baseline assertions, so
    that difficult fixtures must produce genuine fixes.
30. As a developer, I want automated assertions to return passed, failed, or
    errored, so that uncertainty cannot masquerade as acceptance.
31. As a developer, I want missing sources, hash mismatches, malformed profiles,
    and missing artifacts reported as errors, so that invalid evidence cannot
    pass.
32. As a developer, I want feature-level diagnostic messages, so that a failure
    names the violated maker expectation.
33. As a developer, I want highlighted diagnostic overlays, so that failed
    normalized regions are visually inspectable.
34. As a developer, I want results to record profile and validator versions, so
    that evidence remains attributable.
35. As a developer, I want generated result manifests separate from profiles,
    so that yesterday's outcome does not become today's expectation.
36. As a developer, I want human acceptance recorded separately as pending,
    passed, or explicitly waived, so that automation cannot forge physical
    approval.
37. As a developer, I want a focused fixture command during TDD, so that
    source-specific defects have a tight feedback loop.
38. As a developer, I want fast profile checks in ordinary verification, so
    that schema, hashes, analysis topology, and baseline invariants regress
    quickly.
39. As a developer, I want one dedicated full character command, so that
    Chromium, SVG, PDF, rendering, and evidence checks can run before
    completion.
40. As a developer, I want the full suite to avoid paid or nondeterministic
    provider requests, so that CI is repeatable and cost-free.
41. As a developer, I want AI behavior represented by fixed synthetic or
    recorded proposal responses, so that the existing explicit review boundary
    remains testable.
42. As a developer, I want generated evidence to be reproducible and normally
    uncommitted, so that the repository does not grow with every PDF render.
43. As a developer, I want durable generated evidence committed only for an
    intentional issue or release, so that exceptional artifacts remain
    deliberate.
44. As a developer, I want a private-source defect reproduced with a
    committable synthetic fixture before changing production behavior, so that
    permanent rules remain reviewable.
45. As a developer, I want every shared pipeline change to begin with a failing
    Acceptance Fixture, so that tuning is evidence-driven.
46. As a developer, I want all prior profiles rerun after pipeline tuning, so
    that one character cannot regress another.
47. As a developer, I want protected geometry compared structurally or
    byte-equivalently where appropriate, so that semantic improvements cannot
    disturb physical output.
48. As a developer, I want Max expectations migrated into the shared profile,
    so that the first real character proves the new seam end to end.
49. As a developer, I want a contrasting synthetic fixture in the first slice,
    so that the framework immediately rejects Max-shaped overfitting.
50. As a developer, I want existing focused algorithm regressions retained only
    where they lock down reproduced defects, so that high-level profile tests
    do not erase useful low-level feedback.
51. As a reviewer, I want one concise terminal summary and a structured result
    bundle, so that both humans and automation can understand failures.
52. As a reviewer, I want source identity, requested output, workflow budget,
    semantic results, baseline results, export results, and human status visible
    in one result, so that acceptance is auditable.
53. As a reviewer, I want profile changes reviewed independently from generated
    output, so that a failing character cannot be made green by silently
    weakening its oracle.
54. As a maintainer, I want explicit schema migrations, so that old fixtures
    remain readable until deliberately upgraded.
55. As a maintainer, I want the initial implementation to avoid UI and Project
    File changes, so that developer validation does not expand maker-facing
    lifecycle scope.

## Implementation Decisions

- A Character Acceptance Profile is developer-owned validation data and is not
  part of a Project Session, Project File, or maker-facing interface.
- One strict, versioned JSON document is the canonical profile for each
  Acceptance Fixture.
- Profiles are colocated with their committable clean Source Images.
- A profile records source filename, dimensions, byte size, SHA-256, source
  commitability, requested output, fixture-local feature definitions, semantic
  assertions, workflow budgets, and the human checklist.
- Feature locators use manually authored coordinates normalized to the full
  Source Image. The validator maps them through observed subject bounds to
  generated artifacts.
- Initial locators are rectangles. More precise locator shapes are added only
  after a fixture demonstrates that rectangles are insufficient.
- Profiles use stable fixture-local identifiers and human-readable labels.
  Feature names do not form a global character-part ontology.
- The initial assertion vocabulary covers silhouette containment, closed Paint
  Regions, nested regions, open Feature Lines, required and forbidden Detail
  Lines, one outer Cut Line, exterior echo rejection, clean Trace Pages, and
  protected export geometry.
- Profiles contain declarative data only and cannot embed executable tests.
- Validators own reusable default tolerances. Profile overrides use normalized
  values and require a reason.
- The profile schema rejects unknown versions, unknown assertions, unknown
  fields that would affect meaning, invalid relationships, duplicate feature
  identifiers, and out-of-range normalized geometry.
- Schema migration is explicit and tested. The loader never silently discards
  unknown expectations.
- Character Acceptance Profiles are never passed to production analysis,
  cleanup, SVG generation, or PDF generation. Test harnesses may translate
  ordinary requested output inputs into the same user-facing settings a maker
  would select, but semantic expectations remain isolated.
- One Python character-acceptance engine is the sole interpreter of profile
  semantics.
- The engine accepts a profile and a named Artifact Set, then returns one
  Character Acceptance Result.
- An Artifact Set can include generated analysis layers, accepted linework,
  SVG, PDF, rendered pages, assembled trace, workflow counts, and provider
  request counts.
- The engine evaluates both generated and accepted linework when both are
  supplied.
- Required accepted features default to surviving into every relevant exported
  artifact.
- The Maker-Ready Baseline applies automatically and cannot be disabled by a
  fixture.
- The baseline protects the authoritative Cut Line, Finished Size, SVG viewBox,
  letter media, calibration, tile overlap, ordering, page labels, black-and-white
  Trace Pages, accepted-layer fidelity, and absence of original or transient
  artwork.
- Automated assertion states are passed, failed, or errored. Optional
  diagnostics may warn, but warnings cannot satisfy a required assertion.
- The Character Acceptance Result is separate from the profile and records
  source hash, profile version, validator version, artifact identities,
  assertion observations, baseline observations, diagnostic paths, and overall
  automated status.
- Human acceptance is a separate record with pending, passed, or explicitly
  waived checks. A waiver does not produce Maker Acceptance.
- An automated-pass fixture may enter CI as ready for human review. Maker
  Acceptance requires actual-size print, calibration, adjacent-page continuity,
  practical line-weight review, and representative Cut Line and Detail Line
  transfer.
- Cleanup action counts and provider requests are machine-observed workflow
  budgets. Elapsed cleanup time and practical effort are human-recorded rather
  than wall-clock CI assertions.
- Non-committable sources may use local profiles and evidence, but any permanent
  production change they motivate also requires a committable synthetic
  reproduction.
- The profile framework is source-category-neutral, while initial permanent
  acceptance remains deterministic and credential-free.
- AI proposal coverage uses fixed synthetic or recorded responses and preserves
  the existing explicit review and acceptance boundary.
- Fast validation covers schema, identity, source hashes, analysis-layer
  semantics, and the Maker-Ready Baseline.
- The full character suite drives Chromium, exports SVG and PDF, renders pages,
  assembles trace pages, invokes the same Python engine, and writes diagnostic
  evidence.
- Generated screenshots, SVGs, PDFs, rendered pages, overlays, and manifests
  are reproducible outputs and are normally not committed.
- A pipeline change is acceptable only after a red-green fixture regression,
  all existing profiles remain green, protected geometry remains equivalent,
  and changed rendered output receives visual review.
- The first vertical slice includes the shared schema, strict loader, Python
  engine, Max profile migration, one contrasting synthetic fixture, diagnostics,
  and both validation speeds. It makes no UI or Project File changes.

## Testing Decisions

- Tests assert observable Character Acceptance Results and exported artifacts,
  not private helper implementation.
- The primary seam is Character Acceptance Profile plus Artifact Set producing
  a Character Acceptance Result.
- Strict-loader tests cover supported versions, malformed JSON, missing
  required fields, source hash mismatch, duplicate identifiers, invalid
  normalized regions, broken relationships, unknown assertion types, and
  unknown future versions.
- Assertion-contract tests use small deterministic synthetic Artifact Sets to
  prove passed, failed, and errored outcomes for every vocabulary term.
- Baseline tests prove that fixture profiles cannot disable or replace universal
  protections.
- Max acceptance proves required silhouette features, closed eye whites and
  pupils, antler regions, retained open expression lines, absence of dots and
  exterior echoes, semantic paint labels, workflow budgets, and protected
  packet geometry.
- The contrasting synthetic fixture proves that complete symmetric Paint
  Regions and intentional interior lines are not replaced by Max-style repair
  behavior.
- Generated-linework checks prove the automatic result stays within cleanup
  budgets; accepted-linework checks prove the final editable layer satisfies
  every required semantic expectation.
- Export parity tests prove accepted features survive into SVG and rendered PDF
  artifacts.
- Full packet tests prove page count, media boxes, calibration, ordering,
  overlap continuity, clean monochrome Trace Pages, assembled output, and
  absence of underlays and transient editor state.
- Chromium tests remain responsible for the real Upload, Clean Lines, Colors,
  Export, save/restore, artifact-download, and adapter boundaries.
- Browser code invokes the Python validator command and consumes its structured
  result rather than duplicating semantic logic.
- Existing authored-line-art acceptance and Max packet workflows are prior art
  for browser artifact capture, SVG inspection, PDF rendering, and
  machine-readable evidence.
- Existing pipeline regressions are prior art for protected geometry digests,
  source-specific defect reproduction, and semantic topology checks.
- Existing fixed semantic linework corpus is prior art for deterministic
  contrasting sources and human comparison artifacts.
- Focused fixture validation is the TDD feedback loop.
- Ordinary verification includes all fast profile checks.
- The dedicated character suite runs every full Acceptance Fixture with zero
  real paid-provider requests.
- Every output-changing ticket ends with rendered-artifact inspection and
  `git diff --check`.
- Physical print and transfer checks remain human actions and are never marked
  complete by automated tests.

## Out of Scope

- Maker-facing profile creation or editing
- Profile storage in Project Files or Autosave
- Profile-driven generation, cleanup, or feature completion
- Automatic profile creation from generated output
- A universal ontology of body parts or character types
- Pixel-for-pixel golden-image acceptance
- Automatic landmark recognition for profile authoring
- Polygon or freeform locator authoring in the first slice
- Multiple physical wood layers
- Automatic layer decomposition
- Stencil bridges
- Kerf compensation
- CNC or laser paths
- Text or monograms
- Etsy packaging
- Hosting or installer work
- Watermark removal
- New paid AI behavior
- Real provider requests during automated validation
- Migrating the entire existing synthetic corpus in the first tracer bullet
- Requiring every automated-pass fixture to complete physical Maker Acceptance
  before joining CI

## Further Notes

- The clean source identity and semantic expectations must be recorded before
  pipeline tuning begins.
- A private or restricted source can reveal a defect but cannot become permanent
  repository evidence without a committable reproduction.
- Profile changes should receive the same scrutiny as production changes because
  weakening an oracle can hide a regression.
- Full-source normalized coordinates deliberately make incorrect subject
  cropping observable instead of adapting the oracle to the bad crop.
- The first implementation should replace duplicated Max expectation data while
  preserving focused algorithm tests that remain valuable.
- The specification follows ADRs 0004 through 0007 and the established Cutout
  Studio glossary.
