# Max-Style Character Template Packet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce and validate a 24-inch Max Template Pack from the approved real Source Image while fixing only the reproduced duplicate-exterior Detail Line defect.

**Architecture:** Keep the existing deterministic Upload -> Clean Lines -> Colors -> Export pipeline and all protected geometry unchanged. Add one reusable detail-layer cleanup operation that removes source ink inside a narrow exterior Cut Line band after detail extraction, then prove that important interior regions remain. Extend the existing Playwright acceptance-evidence pattern for the real Max source, semantic paint labels, SVG/PDF inspection, and physical-print handoff.

**Tech Stack:** Python, Pillow, OpenCV, ReportLab, pypdf/PyMuPDF, React/TypeScript, Playwright, pnpm.

---

### Task 1: Preserve the approved real-source fixture

**Files:**
- Create: `backend/tests/fixtures/max/Max-from-the-Grinch-movie.webp`
- Modify: `.scratch/max-style-character-template-packet/issues/01-produce-max-style-character-template-packet.md`

- [ ] Copy the byte-identical approved Source Image into the Max fixture directory.
- [ ] Verify its SHA-256 is `3E2FFFB275DC538D572BBADE8136F0F1BDF425490D63B65A1472EA3DE1A07846`.
- [ ] Keep the watermarked marketplace preview out of the repository and test inputs.

### Task 2: Reproduce the duplicate exterior Detail Line

**Files:**
- Modify: `backend/tests/test_pipeline.py`
- Test: `backend/tests/test_pipeline.py`

- [ ] Add `MAX_FIXTURE_DIR` beside `CORALINE_FIXTURE_DIR`.
- [ ] Add a focused test that analyzes the Max fixture with `TemplateSettings(finished_height_in=24)`.
- [ ] Assert the subject bounds exclude the white image rectangle, the Cut Line exists, the output is 24 inches tall, and the tile grid is 2 columns by 3 rows.
- [ ] Build an exterior band by dilating the outer-line alpha and assert the accepted Detail Line alpha has negligible overlap with that band.
- [ ] Assert retained pixels remain in the antler-opening, face, torso/leg, tail, and paw regions.
- [ ] Run the focused test and confirm it fails because the current Detail Line layer overlaps the exterior band.

### Task 3: Suppress only the exterior duplicate

**Files:**
- Modify: `backend/cutout_studio/pipeline.py`
- Test: `backend/tests/test_pipeline.py`

- [ ] Add `_suppress_exterior_detail_band(detail, mask, print_scale)` near the detail-layer helpers.
- [ ] Derive a scale-aware exterior band from `mask - erode(mask)` and dilate it enough to cover source outline ink without reaching deliberate interior antler openings.
- [ ] Apply the suppression to every deterministic `_detail_line_mask` return path so preview and print-scale detail layers follow the same rule.
- [ ] Run the focused Max regression and confirm it passes.
- [ ] Run the existing detail-extraction, Coraline golden-output, PDF, and SVG-focused tests and fix only regressions caused by the new suppression.

### Task 4: Add repeatable Max acceptance evidence

**Files:**
- Create: `tests/e2e/max-template-packet-acceptance.spec.ts`
- Create: `tests/e2e/maxAcceptanceEvidence.ts`
- Modify: `.scratch/max-style-character-template-packet/issues/01-produce-max-style-character-template-packet.md`

- [ ] Reuse the existing Playwright acceptance-evidence conventions and output under `output/acceptance/max-template-packet/` and `output/pdf/max-template-packet.pdf`.
- [ ] Upload the Max fixture, set Finished Height to 24 inches, generate the Balanced starter trace, and record that no `/api/generate-linework` request occurs.
- [ ] Capture Source Image, Clean Lines with original hidden, Colors, Export, SVG, PDF, representative rendered trace pages, and an assembled trace rendering.
- [ ] Complete Colors with meaningful labels: `Max fur`, `Ears and pupils`, `Antler`, `Eyes`, and `Black outlines and facial details`; do not leave exported generic `Color N` labels.
- [ ] Export one separate Color Guide page and keep trace pages black-and-white.
- [ ] Write a manifest containing source SHA-256, Finished Height, cleanup action count, provider request count, SVG layer inspection, PDF page count, media boxes, calibration result, tile grid, and physical-print status.

### Task 5: Validate protected SVG and PDF behavior

**Files:**
- Modify: `tests/e2e/max-template-packet-acceptance.spec.ts`
- Modify: `tests/e2e/maxAcceptanceEvidence.ts`

- [ ] Assert the SVG contains exactly one `cutline-layer`, accepted Detail Lines remain a separate layer, the viewBox is present, Finished Height is 24 inches, and no original underlay or transient editor state is exported.
- [ ] Assert every trace page has a 612 × 792 point US-letter media box and contains only grayscale pixels.
- [ ] Assert the calibration square measures 72 points.
- [ ] Compare adjacent horizontal and vertical tile overlap strips and require matching line continuity.
- [ ] Render and inspect the overview, Color Guide, and all trace pages for clipping, source-image leakage, duplicate silhouette, labels, ordering, and recognizable assembled shape.

### Task 6: Run full verification and prepare human acceptance

**Files:**
- Modify: `.scratch/max-style-character-template-packet/issues/01-produce-max-style-character-template-packet.md`

- [ ] Run the focused regression tests.
- [ ] Run `pnpm verify`.
- [ ] Run `pnpm test:e2e -- --workers=1`.
- [ ] Run `git diff --check`.
- [ ] Inspect the final diff and confirm only Max-ticket files changed.
- [ ] Mark automated acceptance criteria complete only when supported by artifacts.
- [ ] Set the issue to `ready-for-human` and leave the print-at-100-percent calibration, adjacent-page assembly, line-weight, physical transfer, and maker-usefulness checks unchecked until performed.
- [ ] Do not commit, push, or create a branch unless separately requested.
