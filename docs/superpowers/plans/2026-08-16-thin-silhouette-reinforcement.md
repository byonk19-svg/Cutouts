# Thin-Silhouette Reinforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in, exact-preview workflow that reinforces physically narrow outer Cut Line geometry while leaving source-derived Detail Lines, colors, and Feature Lines unchanged.

**Architecture:** A focused Python geometry module measures and proposes reinforced outer silhouettes in finished inches. Analysis reports detection metadata, a separate local endpoint creates review-only proposals, and Project Session owns proposal lifecycle plus the durable original-or-reinforced choice. PDF and SVG consume the same accepted vector path; the original source mask continues to own interior artifacts.

**Tech Stack:** Python 3, Pillow, NumPy, OpenCV, ReportLab, TypeScript, React 19, Node test runner, Playwright.

---

## File Map

- Create `backend/cutout_studio/thin_silhouette.py`: pure measurement, detection, reconstruction, topology, and path validation.
- Create `backend/tests/test_thin_silhouette.py`: generated rights-safe geometry matrix and resolution/finished-size coverage.
- Modify `backend/cutout_studio/pipeline.py`: analysis metadata, accepted Cut Line export settings, and vector Cut Line rasterization for PDF.
- Modify `backend/cutout_studio/server.py`: `/api/reinforce-cutline` multipart proposal endpoint.
- Modify `backend/tests/test_pipeline.py` and `backend/tests/test_server.py`: analysis/API/export contracts.
- Modify `src/cutoutProject.ts`: durable original/reinforced Cut Line types, normalization, save/restore, and resize invalidation.
- Modify `src/projectSession.ts`: proposal token/state/actions, stale response protection, accept/restore transitions, and capabilities.
- Modify `tests/cutoutProject.test.ts` and `tests/projectSession.test.ts`: durable lifecycle coverage.
- Create `src/thinSilhouette.ts`: frontend proposal types, response validation, labels, and width-range constants.
- Create `tests/thinSilhouette.test.ts`: response validation and presentation rules.
- Modify `src/main.tsx`: proposal adapter and Clean Lines review workflow.
- Modify `src/styles.css`: bounded review layout with responsive side-by-side previews.
- Modify `tests/e2e/mvp-workflow.spec.ts`: browser workflow and export request fidelity.

### Task 1: Pure finished-inch geometry

**Files:**
- Create: `backend/cutout_studio/thin_silhouette.py`
- Create: `backend/tests/test_thin_silhouette.py`

- [ ] **Step 1: Write failing tests for physical measurement and detection**

Create generated fixtures for a straight limb, bent limb, T-junction, crossing,
thin limb with broad body, broad head with narrow neck, nearby limbs, small gap,
loop with attached stroke, ordinary filled silhouette, and Run-8-like detached
head/body geometry. Assert that `measure_thin_silhouette(mask, 36)` reports
finished-inch widths, flags the Run-8-like fixture, and does not flag the filled
silhouette.

```python
diagnostic = measure_thin_silhouette(mask, finished_height_in=36.0)
self.assertTrue(diagnostic.detected)
self.assertGreater(diagnostic.thin_fraction, 0.35)
self.assertFalse(measure_thin_silhouette(filled, 36.0).detected)
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `python -m unittest backend.tests.test_thin_silhouette -v`

Expected: import failure because `thin_silhouette.py` does not exist.

- [ ] **Step 3: Implement measurement, skeleton, and topology primitives**

Define immutable result types and constants without describing them as safety
limits:

```python
DETECTION_REFERENCE_WIDTH_IN = 0.25
DETECTION_MIN_THIN_FRACTION = 0.35
DETECTION_MIN_RUN_IN = 2.0
PROPOSAL_MIN_WIDTH_IN = 0.25
PROPOSAL_MAX_WIDTH_IN = 0.75
PROPOSAL_INITIAL_WIDTH_IN = 0.50

@dataclass(frozen=True)
class ThinSilhouetteDiagnostic:
    detected: bool
    minimum_width_in: float
    p10_width_in: float
    thin_fraction: float
    longest_thin_run_in: float
    component_count: int
```

Use cropped-mask height divided by Finished Height for pixels per inch. Keep the
module independent of source loading, palette, details, PDF, and UI.

- [ ] **Step 4: Verify measurement tests GREEN**

Run: `python -m unittest backend.tests.test_thin_silhouette -v`

Expected: measurement and detector tests pass.

- [ ] **Step 5: Write failing reconstruction tests**

Assert that `propose_reinforced_silhouette(mask, height, width)`:

- rejects widths outside 0.25-0.75;
- produces one validated external path;
- reports component joins and hole changes;
- leaves an ordinary filled silhouette byte-equivalent;
- preserves broad body/head area while thickening narrow branches;
- exposes the small-gap merge as a topology warning;
- remains consistent after 2x source scaling (`IoU >= 0.98`).

- [ ] **Step 6: Verify reconstruction tests RED**

Run: `python -m unittest backend.tests.test_thin_silhouette -v`

Expected: missing `propose_reinforced_silhouette` assertions fail.

- [ ] **Step 7: Implement bounded proposal generation**

Use structural external components, skeleton buffering in finished inches,
external-contour union, deterministic simplification, and explicit validation.
Return exact mask/path/preview dimensions plus:

```python
@dataclass(frozen=True)
class ThinSilhouetteTopologyChange:
    components_before: int
    components_after: int
    holes_before: int
    holes_after: int
    components_joined: bool
    enclosed_regions_changed: bool
    gap_merge_warning: bool
```

Do not include excluded small alpha components in the proposed outer silhouette.
If one coherent external contour cannot be produced, raise `ValueError` so the
caller falls back to warning/refusal.

- [ ] **Step 8: Verify geometry GREEN and commit**

Run: `python -m unittest backend.tests.test_thin_silhouette -v`

Then:

```powershell
git add backend/cutout_studio/thin_silhouette.py backend/tests/test_thin_silhouette.py
git commit -m "feat: add thin silhouette geometry"
```

### Task 2: Analysis, proposal API, and exact PDF Cut Line

**Files:**
- Modify: `backend/cutout_studio/pipeline.py`
- Modify: `backend/cutout_studio/server.py`
- Modify: `backend/tests/test_pipeline.py`
- Modify: `backend/tests/test_server.py`

- [ ] **Step 1: Write failing analysis/API tests**

Assert that analysis JSON includes optional `thinSilhouette` metadata without
changing `outerCutPath`, and `/api/reinforce-cutline` accepts image/settings plus
`minimumWidthIn`, returning exact proposal preview/path/topology fields. Assert
invalid width, missing source, and incoherent geometry produce HTTP 400.

- [ ] **Step 2: Verify API tests RED**

Run:

```powershell
python -m unittest backend.tests.test_pipeline backend.tests.test_server -v
```

Expected: missing analysis field and route assertions fail.

- [ ] **Step 3: Add analysis metadata and proposal route**

`analyze_template` measures the cleaned cropped subject mask and serializes:

```json
{
  "detected": true,
  "minimumWidthIn": 0.07,
  "p10WidthIn": 0.07,
  "thinFraction": 1.0,
  "longestThinRunIn": 12.0,
  "componentCount": 2
}
```

The new multipart route calls the pure proposal module and returns
`outerCutPath`, `outerLinePngDataUrl`, `previewWidthPx`, `previewHeightPx`,
`minimumWidthIn`, and topology changes. It never mutates analysis or exports.

- [ ] **Step 4: Verify analysis/API tests GREEN**

Run the same focused backend command and require all tests to pass.

- [ ] **Step 5: Write failing PDF fidelity tests**

Provide an accepted triangular path that differs visibly from the source mask.
Assert PDF trace pages contain the accepted outer geometry while the original
Detail Line raster remains present. Assert malformed paths and mismatched
preview dimensions are rejected.

- [ ] **Step 6: Verify PDF tests RED**

Run the named new tests in `backend.tests.test_pipeline` and confirm the source
mask still owns the outer line before implementation.

- [ ] **Step 7: Implement accepted-path export**

Extend `TemplateSettings.from_mapping` with optional:

```python
accepted_cut_line_path: str = ""
accepted_cut_line_width_px: float = 0.0
accepted_cut_line_height_px: float = 0.0
```

Validate the repository's `M/L/Z` path grammar and bounds. Rasterize that vector
path at PDF print dimensions for the outer layer only. Compose it with original
or maker-edited Detail Lines and existing manual vector strokes. Default export
behavior remains unchanged when no accepted path is supplied.

- [ ] **Step 8: Verify backend suites and commit**

Run:

```powershell
python -m unittest backend.tests.test_thin_silhouette backend.tests.test_pipeline backend.tests.test_server -v
```

Then commit only the four task files with:

`git commit -m "feat: expose reinforced cutline proposals"`

### Task 3: Durable Project Session ownership

**Files:**
- Modify: `src/cutoutProject.ts`
- Modify: `src/projectSession.ts`
- Modify: `tests/cutoutProject.test.ts`
- Modify: `tests/projectSession.test.ts`

- [ ] **Step 1: Write failing durable-model tests**

Add fixture analysis containing detection metadata and original Cut Line fields.
Assert legacy project normalization selects original, reinforced acceptance
survives save/restore, and Finished Size restoration invalidates reinforcement
before resizing analysis.

- [ ] **Step 2: Verify durable tests RED**

Run:

```powershell
node scripts/run-ts-tests.mjs tests/cutoutProject.test.ts tests/projectSession.test.ts
```

Expected: missing reinforcement types/actions fail compilation or assertions.

- [ ] **Step 3: Add durable Cut Line data**

Extend analysis with optional detection and original fields. Store accepted
reinforcement as:

```ts
type AcceptedCutLineReinforcement = {
  minimumWidthIn: number;
  outerCutPath: string;
  outerLinePngDataUrl: string;
  previewWidthPx: number;
  previewHeightPx: number;
  topologyChanges: ThinSilhouetteTopologyChanges;
};
```

Keep `analysis.outerCutPath` and `analysis.outerLinePngDataUrl` as the active
authoritative geometry so existing SVG/rendering code keeps one read path.
Retain explicit `originalOuterCutPath` and `originalOuterLinePngDataUrl` for
restore. Normalize missing optional data to original.

- [ ] **Step 4: Write failing proposal lifecycle tests**

Cover begin, complete, stale complete, fail, cancel/keep-original, accept,
restore-original, source/regeneration invalidation, and Finished Size
invalidation. Assert acceptance is atomic and revokes line/color milestones.

- [ ] **Step 5: Verify lifecycle tests RED**

Run the focused TypeScript command and confirm missing actions fail.

- [ ] **Step 6: Implement Project Session proposal state/actions**

Mirror the proven token/revision pattern used by AI proposals but keep the state
independent and local-only. Expose capabilities only when a detected source and
current proposal permit them. Snapshot result payloads before storage. Accept
copies the exact proposal into durable analysis; keep/cancel/failure do not
mutate the project.

- [ ] **Step 7: Verify frontend domain tests and commit**

Run the focused tests plus `pnpm typecheck:tests`, then commit:

`git commit -m "feat: own reinforced cutlines in project session"`

### Task 4: Clean Lines review experience

**Files:**
- Create: `src/thinSilhouette.ts`
- Create: `tests/thinSilhouette.test.ts`
- Modify: `src/main.tsx`
- Modify: `src/styles.css`
- Modify: `tests/e2e/mvp-workflow.spec.ts`

- [ ] **Step 1: Write failing response/presentation tests**

Test strict proposal response validation, 0.25-0.75 range enforcement, 0.50
initial value, topology summary copy, and the explicit non-safety statement.

- [ ] **Step 2: Verify helper tests RED**

Run: `node scripts/run-ts-tests.mjs tests/thinSilhouette.test.ts`

Expected: missing module import fails.

- [ ] **Step 3: Implement typed client boundary**

Create constants, type guards, and pure copy helpers. Reject non-finite sizes,
empty paths, malformed data URLs, and inconsistent topology counts.

- [ ] **Step 4: Verify helper tests GREEN**

Run the same focused test and require pass.

- [ ] **Step 5: Write failing Playwright workflow**

Stub analysis with detection, proposal responses at 0.50 and another width, and
export capture. Assert:

- original Cut Line is active before review;
- control appears only when detected;
- review opens at 0.50;
- topology and non-safety warnings are visible;
- loading prevents acceptance;
- Keep original leaves the saved project unchanged;
- Use reinforced updates preview/save/SVG/export payload;
- Restore original works;
- Finished Size invalidates reinforcement;
- Detail Lines and Feature Lines are unchanged.

- [ ] **Step 6: Verify Playwright RED**

Run the named Chromium spec serially and confirm the missing control assertion
fails for the expected reason.

- [ ] **Step 7: Implement the Clean Lines workflow**

Use the Project Session token before the fetch, complete/fail through named
actions, debounce or explicitly apply width changes so stale results cannot be
accepted, and render exact original/proposal line images side by side. Keep the
review compact and inside Clean Lines. Export adds accepted path fields only
when reinforcement is active.

- [ ] **Step 8: Verify browser workflow and commit**

Run helper tests, frontend tests, typechecks, and the named Playwright spec.
Commit the five task files with:

`git commit -m "feat: review and accept thin cutline reinforcement"`

### Task 5: Real Run 8 evidence and regression verification

**Files:**
- Modify only if tests reveal an in-scope defect.
- Keep local evidence under `output/thin-subject-silhouette-feasibility/` untracked.

- [ ] **Step 1: Run the complete automated verification**

Run:

```powershell
pnpm lint
pnpm typecheck
pnpm typecheck:tests
pnpm test
pnpm build
pnpm test:e2e -- --project=chromium --workers=1
git diff --check
```

Record exact counts and distinguish pre-existing lint warnings from errors.

- [ ] **Step 2: Exercise the real local Run 8 workflow**

Use the exact local source and SHA from the diagnostic. Select it with
Playwright `setInputFiles`, generate the ordinary original, open reinforcement,
inspect 0.25/0.50/0.75, accept 0.50, save/reopen, export SVG and PDF, restore
original, and confirm source/detail geometry never changes.

- [ ] **Step 3: Inspect generated output**

Compare editor preview, SVG path bounds, and rendered PDF Cut Line. Confirm the
accepted proposal is identical across them, topology warning is accurate, PDF
mechanics remain unchanged, and no physical-safety claim appears.

- [ ] **Step 4: Review the complete branch diff**

Confirm only design/plan, focused backend/frontend implementation, and tests are
tracked. Keep diagnostic and field-source artifacts untracked.

- [ ] **Step 5: Commit any final test-only corrections**

If required, stage only focused files and commit with a message describing the
verified correction. Do not push, open a PR, or merge without separate
authorization.
