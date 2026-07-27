# Closed Paint Regions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve clean, closed boundaries for meaningful paint regions in the Max template while leaving expressive Detail Lines open.

**Architecture:** Add a deterministic paint-region boundary pass inside the existing line-art simplifier. It will close only short gaps in deliberate source ink, identify bounded regions at practical paint scale, render their smoothed contours as closed lines, and merge those contours with the existing editable Detail Line mask.

**Tech Stack:** Python, Pillow, OpenCV, unittest, pypdf, Playwright/Chromium

---

### Task 1: Lock down closed eye and pupil paint regions

**Files:**
- Modify: `backend/tests/test_pipeline.py`

- [x] **Step 1: Add a failing public-output regression**

Extend `test_max_source_has_one_outer_cutline_without_duplicate_exterior_detail`
to combine `analysis.outer_line_png` and `analysis.detail_line_png`, invert the
combined line mask, and inspect connected white regions. Require at least four
bounded regions with practical area and centroids inside the two-eye band:

```python
combined_lines = np.maximum(
    np.asarray(outer_alpha),
    np.asarray(detail_alpha),
)
open_regions = (combined_lines < 128).astype(np.uint8)
count, labels, stats, centroids = cv2.connectedComponentsWithStats(
    open_regions,
    connectivity=4,
)
eye_regions = [
    label
    for label in range(1, count)
    if 120 <= centroids[label][0] <= 285
    and 340 <= centroids[label][1] <= 450
    and 50 <= stats[label, cv2.CC_STAT_AREA] <= 8_000
    and stats[label, cv2.CC_STAT_LEFT] > 0
    and stats[label, cv2.CC_STAT_TOP] > 0
    and stats[label, cv2.CC_STAT_LEFT] + stats[label, cv2.CC_STAT_WIDTH] < combined_lines.shape[1]
    and stats[label, cv2.CC_STAT_TOP] + stats[label, cv2.CC_STAT_HEIGHT] < combined_lines.shape[0]
]
self.assertEqual(len(eye_regions), 4)
```

- [x] **Step 2: Run the regression and verify red**

Run:

```powershell
python -m unittest backend.tests.test_pipeline.PrintPipelineTest.test_max_source_has_one_outer_cutline_without_duplicate_exterior_detail
```

Expected: failure because the current eye and pupil areas leak into the
page-wide open component.

### Task 2: Preserve source-supported closed paint boundaries

**Files:**
- Modify: `backend/cutout_studio/pipeline.py`
- Test: `backend/tests/test_pipeline.py`

- [x] **Step 1: Add a focused boundary helper**

Add `_closed_paint_region_boundary_skeleton(ink, subject, interior)` near the
existing paint-boundary helpers. The helper must:

```python
gap_radius = max(2, round(min(subject_width, subject_height) * 0.008))
closed_ink = cv2.morphologyEx(
    ink,
    cv2.MORPH_CLOSE,
    cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE,
        (gap_radius * 2 + 1, gap_radius * 2 + 1),
    ),
)
```

Then identify non-ink connected regions that are fully inside the subject,
retain only practical areas, render each retained region’s external contour
with `cv2.approxPolyDP`, and return one-pixel closed boundary lines. Reject
regions touching the image edge or the subject exterior.

- [x] **Step 2: Merge closed boundaries in balanced line-art cleanup**

Inside `_simplify_existing_line_art_detail_mask`, compute the closed boundaries
for balanced mode and merge them before final dilation:

```python
protected_closed_regions = (
    _closed_paint_region_boundary_skeleton(ink, subject, interior)
    if level == "balanced"
    else np.zeros_like(ink)
)
retained = cv2.bitwise_or(retained, protected_closed_regions)
```

Keep dot-sized component suppression after the merge so repaired loops cannot
reintroduce facial specks.

- [x] **Step 3: Run focused regressions**

Run:

```powershell
python -m unittest `
  backend.tests.test_pipeline.PrintPipelineTest.test_max_source_has_one_outer_cutline_without_duplicate_exterior_detail `
  backend.tests.test_pipeline.PrintPipelineTest.test_max_pdf_refines_preview_sized_face_lines_without_hard_pixel_steps `
  backend.tests.test_pipeline.PrintPipelineTest.test_max_packet_is_letter_sized_semantic_and_tile_continuous `
  backend.tests.test_pipeline.PrintPipelineTest.test_accepted_ai_fixture_preserves_protected_pdf_geometry_digest
```

Expected: four tests pass, with eye/pupil closure and existing geometry/detail
protections intact.

### Task 3: Regenerate and validate the printable packet

**Files:**
- Modify: `.scratch/max-style-character-template-packet/issues/01-produce-max-style-character-template-packet.md`
- Regenerate: `output/pdf/max-template-packet.pdf`
- Regenerate: `output/acceptance/max-template-packet/*`

- [x] **Step 1: Run full verification**

Run:

```powershell
pnpm verify
```

Expected: all backend/TypeScript tests and production build pass.

- [x] **Step 2: Regenerate through real Chromium**

Run:

```powershell
pnpm exec playwright test --config tests/e2e/playwright.config.ts tests/e2e/max-template-packet-acceptance.spec.ts --workers=1
```

Expected: the Max workflow passes with zero provider requests.

- [x] **Step 3: Inspect the face page and packet geometry**

Run:

```powershell
python -m backend.tests.inspect_max_packet output/pdf/max-template-packet.pdf output/acceptance/max-template-packet/assembled-trace.png
git diff --check
```

Visually inspect `output/acceptance/max-template-packet/pdf-page-05.png`.
Confirm eye whites and pupils read as smooth closed paint areas, no dots return,
and open expression lines remain open.

- [x] **Step 4: Record the maker-feedback fix**

Append an issue comment describing the closed-region behavior and leave the
ticket `ready-for-human` for physical printing and transfer acceptance.

No commit or push is included because this worktree’s repository instructions
require explicit authorization for those actions.
