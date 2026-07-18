# AI Linework Ticket 03 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove and complete accepted-only AI Detail Line export through the existing SVG and tiled PDF pipelines while preserving every protected print-geometry invariant.

**Architecture:** Keep proposal data outside both export APIs. Exercise the existing accepted raster seam from the browser through SVG download and PDF multipart upload, then add backend output regression assertions that compare baseline and accepted PDFs by page geometry, tile labels, embedded-image geometry, and a stable protected-geometry digest. Render the accepted fixture PDF to PNG for visual inspection without changing PDF assembly.

**Tech Stack:** React 19, TypeScript, Playwright Chromium, Python unittest, Pillow, pypdf, PyMuPDF, ReportLab.

---

### Task 1: Lock accepted-only browser export behavior

**Files:**
- Modify: `tests/e2e/ai-linework-proposal.spec.ts`

- [x] **Step 1: Add an accepted/rejected export test**

Drive the credential-free proposal flow through reject and accept branches. Capture the SVG download and PDF multipart request. Assert rejected proposal bytes appear in neither output input, while the accepted canvas raster is the SVG `accepted-detail-layer` and the PDF `editedDetail` part.

- [x] **Step 2: Run the focused spec and assess the existing export seam**

Run: `pnpm exec playwright test tests/e2e/ai-linework-proposal.spec.ts --config tests/e2e/playwright.config.ts`

Expected: PASS if ticket 02 already completed the accepted-layer wiring; otherwise fail on the actual export gap.

- [x] **Step 3: Confirm no export-boundary correction is required when the test is already GREEN**

Keep proposal response state out of `exportPdf` and `exportSvgLinework`; both may read only the accepted editor raster already stored by ticket 02. Do not change SVG viewBox, PDF settings, provider behavior, or print geometry.

- [x] **Step 4: Rerun the focused browser spec and verify GREEN**

Run the Step 2 command.

Expected: PASS.

### Task 2: Add stable SVG/PDF protected-geometry regression proof

**Files:**
- Modify: `tests/traceLineworkSvg.test.ts`
- Modify: `backend/tests/test_pipeline.py`

- [x] **Step 1: Add SVG accepted-layer and geometry-digest assertions**

Compare baseline and accepted SVG exports. Assert physical width/height, viewBox, cutline path, calibration geometry, and manual-stroke geometry are byte-identical while only the accepted detail image layer changes.

- [x] **Step 2: Add PDF accepted-fixture and protected-geometry assertions**

Build baseline and accepted PDFs from the stable fixture. Hash a canonical manifest containing page count, media boxes, tile page labels, tile image dimensions, Finished Size, tile grid, overlap text, and calibration text. Assert equal digests while proving accepted-detail ink appears on rendered tile imagery.

- [x] **Step 3: Run focused output tests**

Run: `node --experimental-strip-types tests/traceLineworkSvg.test.ts`

Run: `python -m unittest backend.tests.test_pipeline.PrintPipelineTest.test_pdf_tile_pages_include_accepted_starter_detail_layer backend.tests.test_pipeline.PrintPipelineTest.test_accepted_ai_fixture_preserves_protected_pdf_geometry_digest`

Expected: PASS after any test-helper corrections; production PDF geometry remains unchanged.

### Task 3: Render, inspect, review, and close out

**Files:**
- Create only temporary artifacts under `tmp/pdfs/`; remove them before commit.
- Modify only files required by in-scope review findings.

- [x] **Step 1: Generate and render the accepted fixture PDF**

Generate `tmp/pdfs/ai-linework-accepted.pdf`, render pages with PyMuPDF, and inspect representative overview/tile pages for clean Cut Line, accepted interior Detail Lines, readable headers, overlap guides, calibration, and no proposal/original overlay leakage.

- [x] **Step 2: Run full validation**

Run: `pnpm test`

Run: `pnpm build`

Run: `pnpm test:e2e`

Run: `git diff --check`

- [x] **Step 3: Run Standards and Spec reviews**

Review quality/security/maintainability separately from ticket-03 acceptance and exclusion compliance. Fix every in-scope finding and rerun affected checks.

- [x] **Step 4: Commit locally without push or merge**

Confirm the diff contains no provider, SVG-fast-path, PDF-geometry, or unrelated changes. Commit on `codex/ai-linework-ticket-03` and leave the worktree clean.
