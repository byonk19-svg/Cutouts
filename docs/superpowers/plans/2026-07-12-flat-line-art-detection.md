# Flat Line-Art Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect already-outlined flat cartoons, preserve their existing dark ink as starter details, and provide a persisted Auto/Existing line art/Rendered image override with visible status.

**Architecture:** Extend the existing `TemplateSettings` request contract with a conservative extraction-mode override. Keep classification and ink extraction private to `pipeline.py`, expose only the chosen mode in trace-quality metadata, and adapt the existing More Tools/settings/project seams without changing outer-cutline or export geometry.

**Tech Stack:** Python 3, Pillow, OpenCV, NumPy, React 19, TypeScript, Node test runner, Playwright.

---

### Task 1: Classify flat line art

**Files:**
- Modify: `backend/cutout_studio/pipeline.py`
- Test: `backend/tests/test_pipeline.py`

- [ ] **Step 1: Write failing classifier tests**

Add synthetic flat-cartoon and soft-render fixtures. Assert `_looks_like_flat_line_art(flat, mask)` is true and the gradient fixture is false.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `python -m unittest backend.tests.test_pipeline.PipelineTests.test_flat_cartoon_is_detected_as_existing_line_art backend.tests.test_pipeline.PipelineTests.test_soft_render_is_not_detected_as_existing_line_art`

Expected: failure because `_looks_like_flat_line_art` does not exist.

- [ ] **Step 3: Implement conservative classification**

Add `_flat_line_art_metrics()` and `_looks_like_flat_line_art()` using near-white background coverage, quantized color count, dark-ink coverage, and non-ink gradient density. Return false whenever any required signal is ambiguous.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: both tests pass.

### Task 2: Preserve dark source ink without duplicate cutlines

**Files:**
- Modify: `backend/cutout_studio/pipeline.py`
- Test: `backend/tests/test_pipeline.py`

- [ ] **Step 1: Write failing mask tests**

Create a thick interior source stroke and assert the line-art detail mask fills its center instead of returning only two edge contours. Create silhouette-adjacent and interior strokes and assert the boundary-adjacent ink is suppressed while interior ink remains.

- [ ] **Step 2: Run focused tests and verify RED**

Run the new test methods directly. Expected: failure because `_existing_line_art_detail_mask` does not exist.

- [ ] **Step 3: Implement minimal ink extraction**

Threshold dark pixels from the flattened working image, intersect with the subject interior, remove small components, and exclude a dilated band derived from the subject boundary. In `_detail_line_mask`, choose this path only for Balanced/clean when Auto classification succeeds or the override forces it.

- [ ] **Step 4: Run focused and backend suites**

Run: `python -m unittest backend.tests.test_pipeline`

Expected: all pipeline tests pass, including the rendered-image baselines.

### Task 3: Persist override and expose chosen mode

**Files:**
- Modify: `backend/cutout_studio/pipeline.py`
- Modify: `src/traceWorkflow.ts`
- Modify: `src/cutoutProject.ts`
- Modify: `src/main.tsx`
- Test: `backend/tests/test_pipeline.py`
- Test: `tests/cutoutProject.test.ts`
- Test: `tests/traceQuality.test.ts`

- [ ] **Step 1: Write failing contract and round-trip tests**

Assert settings accept `auto`, `lineArt`, and `rendered`; reject unknown values to `auto`; legacy project settings gain `auto`; and trace-quality metadata accepts `detailExtractionMode`.

- [ ] **Step 2: Run focused tests and verify RED**

Run the backend settings test and `node --experimental-strip-types tests/cutoutProject.test.ts`. Expected: failures for missing fields/defaults.

- [ ] **Step 3: Implement request, project, and metadata contracts**

Add `detailExtractionMode` to Python and TypeScript settings with `auto` defaults. Add `detailExtractionModeUsed: "lineArt" | "rendered"` to trace-quality metadata. Preserve compatibility by normalizing missing project settings to `auto` and accepting missing legacy analysis metadata.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the commands from Step 2 plus `node --experimental-strip-types tests/traceQuality.test.ts`. Expected: all pass.

### Task 4: Add More Tools override and status

**Files:**
- Modify: `src/main.tsx`
- Modify: `src/styles.css` only if existing segmented-control styles are insufficient
- Modify: `tests/e2e/mvp-workflow.spec.ts`

- [ ] **Step 1: Write failing Playwright assertions**

Assert More Tools contains an `Image type` Auto/Existing line art/Rendered image segmented control, Auto is selected by default, and Trace Quality Review displays `Existing line art detected` for line-art analysis.

- [ ] **Step 2: Run the focused E2E test and verify RED**

Run: `corepack pnpm exec playwright test --config tests/e2e/playwright.config.ts --grep "existing line art"`

Expected: failure because the override and status do not exist.

- [ ] **Step 3: Implement UI behavior**

Render the override in More Tools using the established segmented-choice component. On change, update settings and regenerate analysis. Show `Existing line art detected` or `Rendered image boundaries` in both compact and expanded trace status.

- [ ] **Step 4: Run full verification**

Run: `corepack pnpm verify`, `corepack pnpm test:e2e`, and `git diff --check`.

Expected: every backend, frontend, build, geometry, export, and Playwright regression passes.

- [ ] **Step 5: Review, commit, and push**

Review the final diff against repository standards and the approved spec. Commit only intended files with `Preserve existing cartoon line art`, push `main`, and verify `HEAD == origin/main` with a clean worktree.
