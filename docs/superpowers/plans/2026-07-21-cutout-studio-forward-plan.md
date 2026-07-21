# Cutout Studio Forward Plan

**Generated:** 2026-07-21
**Current objective:** Preserve the accepted v0.1 personal wood-cutout workflow
baseline and choose any next product capability from explicit maker friction or
an explicit new goal.
**Current gate:** The v0.1 physical acceptance record is complete in
[.scratch/cutout-template-generator/issues/04-physical-mvp-validation.md](../../../.scratch/cutout-template-generator/issues/04-physical-mvp-validation.md).
No new product lane has been selected.

## Why this plan exists

Cutout Studio has made substantial software progress, but completed work is
spread across merged PRs, historical issue trees, research maps, old branches,
and dirty worktrees. This file is the single forward-looking sequence.
Historical PRDs and research remain evidence; they do not decide what happens
next.

## Completed foundation

The following are already on `origin/main` and are not reopened without a
reproduced defect:

- printable PDF scaling, tiling, overlap, and calibration;
- paint guide and shopping guidance;
- Upload -> Clean Lines -> Colors -> Export;
- manual vector Feature Lines and SVG export;
- reviewed AI Detail Line proposals that cannot own protected geometry;
- Project Session-owned durable lifecycle and stale-result protection;
- reliable authored SVG line-art handling.

Merged evidence is PRs #1 through #5. At plan creation, `origin/main` was
`c1144b6`.

## Operating rules

1. Keep exactly one active product lane.
2. Do not start new research, dependencies, AI, geometry, editor, or
   architecture work until physical validation is recorded.
3. Start work from a clean worktree at current `origin/main`; preserve the dirty
   primary checkout.
4. Turn each observed defect into one bounded issue with reproduction,
   acceptance criteria, protected artifacts, and verification.
5. Work implementation issues test-first and close them with focused tests,
   full repository gates, an acceptance-criteria review comparing the
   diff/artifacts to the bounded issue, a code-quality/scope review comparing
   the diff to `AGENTS.md` and repository conventions, and tracker evidence.
6. Do not create tags, discard dirty files, delete branches/worktrees, or push
   without the relevant authorization.

## Sprint 0: Reconcile repository truth

**Owner:** Codex. **Product behavior changes:** none.

1. Preserve and inventory `C:\Users\byonk\OneDrive\Documents\Cutouts`.
2. Use a separate clean worktree at current `origin/main`.
3. Reconcile stale completed tracker tickets from merged PR evidence, leaving
   genuinely manual checks open.
4. Link this plan from the smallest appropriate repository navigation section.
5. Verify links, repository status, and `git diff --check`.

**Done when:** a fresh session can find one answer: physical validation is
next.

## Sprint 1: Physical MVP validation

**Primary issue:**
[.scratch/cutout-template-generator/issues/04-physical-mvp-validation.md](../../../.scratch/cutout-template-generator/issues/04-physical-mvp-validation.md)

### Codex-owned preparation

1. From current `origin/main`, produce a fresh Coraline Template Packet PDF
   under `output/pdf/`, and treat
   [.scratch/cutout-template-generator/issues/04-physical-mvp-validation.md](../../../.scratch/cutout-template-generator/issues/04-physical-mvp-validation.md)
   as the authoritative record for the generated PDF path and physical results.
2. Confirm the PDF opens and includes the expected cover, tiled pages, finished
   size, Cut Line, and accepted Detail Lines.
3. Run `pnpm verify`, relevant Playwright coverage, PDF render inspection, and
   `git diff --check`.

### User-owned physical check

1. Print the cover and two adjacent pages at Actual Size / 100%.
2. Measure the 1-inch calibration square.
3. Tape the pages and assess overlap, labels, and crop guides.
4. Transfer one outer Cut Line and one interior Detail Line onto paper,
   cardboard, or scrap wood.
5. Assess line weight and the paint/shopping guide.
6. Record each result in the physical-validation issue.

**Done when:** one named packet has a calibration measurement, alignment
result, transfer result, and paint-guide result, or the owner explicitly
accepts a clearly recorded waiver without representing an unperformed check as
physical evidence.

**Result:** completed by owner acceptance on 2026-07-21. The owner reported
successful 100% printing, calibration, and two-page alignment, then explicitly
accepted the packet while waiving an exact numeric ruler record, a separate
carbon-transfer exercise, and a separate in-store paint-guide simulation. The
canonical issue records those waivers without claiming the checks were
physically performed.

## Sprint 2: Fix only demonstrated blockers

Skip this sprint if physical validation passes without a must-fix issue.

For each failure:

1. Record the exact packet, printer settings, expected result, actual result,
   and reproduction in one bounded issue.
2. Protect Cut Line geometry, finished dimensions, SVG viewBox, tiling,
   overlap, calibration, and PDF assembly unless evidence proves that artifact
   is wrong.
3. Implement the smallest root-cause correction test-first.
4. Run focused regression coverage, `pnpm verify`, relevant isolated Chromium
   coverage, output inspection, `git diff --check`, an acceptance-criteria
   review comparing the diff/artifacts to the bounded issue, and a
   code-quality/scope review comparing the diff to `AGENTS.md` and repository
   conventions.
5. Repeat only the affected physical check and record the result.

**Result:** skipped. Physical acceptance produced no reported must-fix defect.

## Sprint 3: Establish the v0.1 baseline

1. Run `pnpm verify`, isolated full `pnpm test:e2e`, `git diff --check`, the
   complete browser workflow, and SVG/PDF artifact inspection.
2. Record the accepted packet, physical measurements, known limitations, and
   verified commit in `docs/MVP_ACCEPTANCE_CHECKLIST.md`, the physical issue,
   and this plan.
3. Decide tagging, packaging, pushing, deployment, and branch/worktree cleanup
   separately with explicit authorization.

**Done when:** one commit, one physically accepted packet, and one completed
checklist define the v0.1 baseline.

**Result:** completed on 2026-07-21. Product baseline `c1144b6` produced the
accepted `Coraline Physical MVP` packet. `pnpm verify` passed with 83 backend
tests plus all TypeScript suites and the production build; isolated
`pnpm test:e2e` passed all 30 Chromium tests. The packet identity, SHA-256,
physical results, explicit owner waivers, known limitations, and unauthorized
release actions are recorded in `docs/MVP_ACCEPTANCE_CHECKLIST.md` and the
canonical physical issue. Tagging, pushing, deployment, packaging, and
branch/worktree cleanup remain separate decisions requiring authorization.

## Parked until after v0.1

- laser/stencil bridge behavior;
- layered cutouts, offsets, kerf, or Clipper integration;
- text/monogram generation;
- material nesting;
- replacement tracing engines such as VTracer;
- additional paid AI experiments;
- speculative editor or architecture work;
- installer or hosting work beyond the developer-run local app.

The next plan must come from repeated real-workflow friction or an explicit new
product goal, not another unbounded repository search.
