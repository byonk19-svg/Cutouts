# MVP Acceptance Checklist

Use this checklist after `pnpm verify` and `pnpm test:e2e` pass. Automation proves the workflow exports; this proves the packet works at the table.

## Browser Workflow

- Upload a representative source image.
- Generate a Trace Studio starting template.
- Confirm the original underlay is visible only in the editor.
- Draw, select, resize, duplicate, delete, and undo at least one manual vector stroke.
- Save or export a `.cutout.json` project.
- Reload or reopen the project and confirm manual strokes and paint edits return.
- Review paint matches, set one manual override, mark one color as no match, and exclude one color from the shopping list.
- Export SVG linework and confirm it contains clean black linework only.
- Export Template Packet PDF and confirm it opens as a PDF.

## Physical Print Check

- Print the cover page at 100% / actual size. Do not use Fit to page.
- Measure the 1 inch calibration square on the cover.
- If the square is not exactly 1 inch, fix printer or PDF viewer scaling before trusting finished dimensions.
- Print two adjacent tiled pages at 100% / actual size.
- Tape the adjacent pages together and verify page labels, row/column labels, crop marks, and overlap guides are understandable without app context.
- Check that line thickness is traceable but not muddy.
- Confirm the finished size summary matches the requested height.

## Transfer Check

- Trace one small outer cutline section onto scrap cardboard or wood.
- Transfer one interior detail line using carbon paper or firm pen pressure.
- Confirm the printed linework is clear enough to cut, paint, and outline.

## Paint Planning Check

- Review the paint guide page away from the app.
- Confirm labels and notes describe the intended areas, such as hair, coat, boots, trim, eyes, or outline.
- Confirm hidden colors are not in the shopping list.
- Confirm selected matches and manual overrides are understandable as shopping guidance.
- Treat all matches as approximate. Screen colors, printer output, store lighting, and paint batches can vary.

## Rejected v0.1 Candidate — 2026-07-21

- **Product commit:** `c1144b6` (`origin/main` when the packet was generated)
- **Acceptance evidence head:** `711ca320e8722052303cf3cab314a3fe45697d52`
- **Mechanically validated historical packet:** `output/pdf/coraline-physical-mvp-template-packet.pdf`
- **Packet identity:** `Coraline Physical MVP`, `30.00in` high x `11.97in` wide, 10 US-letter pages
- **Packet SHA-256:** `6a7050fafeac0b53f831d985aa8027db51933e46ef56faefb46988581129f1c2`
- **Automated verification:** `pnpm verify` passed (83 backend tests, all TypeScript suites, and production build); isolated `pnpm test:e2e` passed all 30 Chromium tests.
- **Artifact verification:** all PDF pages rendered and were visually inspected; PDF structure, page size, page count, calibration geometry, and adjacent overlap strips passed digital inspection.
- **Physical mechanics:** the owner printed the cover at Actual size / 100%, reported calibration as working correctly, and reported that two adjacent printed pages taped and aligned correctly.
- **Historical owner waivers:** the exact ruler measurement was not separately supplied; the outer/interior carbon-transfer exercise and separate in-store paint/shopping simulation were not performed. The owner initially accepted these waivers, then rescinded v0.1 acceptance after direct artwork-quality review. They are not claimed as completed physical observations.
- **Quality result:** rejected after direct packet review. The test used a processed black-and-white outline fixture rather than the real colored Source Image; the enlarged Cut Line is rough and visually doubled, interior Detail Lines are noisy and ambiguous, and the resulting two-color paint guide is not actionable.
- **Baseline decision:** no maker-ready v0.1 baseline has been established. This artifact proves only that the PDF mechanics work.
- **Known product boundary:** v0.1 remains a developer-run local personal-workflow app, without installer, hosting, marketplace packaging, or new post-v0.1 capabilities.
- **Release mechanics:** no tag, push, deployment, packaging, or worktree cleanup is authorized by this acceptance record.

## Accepted v0.1 Maker-Ready Baseline — 2026-07-22

- **Implementation branch:** `codex/forward-plan-reconciliation`
- **Final verified implementation commit:** `247482c` (`fix: preserve authored SVG quality at print scale`), following Coraline correction commit `d2d62e4`
- **Final automated verification:** `pnpm verify` passed 89 backend tests, all TypeScript suites, and the production build; isolated `pnpm test:e2e` passed all 35 Chromium tests; `git diff --check` passed
- **Primary accepted packet:** `output/pdf/coraline-maker-ready-jigsaw-template.pdf`
- **Primary packet identity:** real-color Coraline source, `14.87in x 36.00in`, 10 US-letter pages
- **Primary packet SHA-256:** `318921bfc3d3a6264c026a0f4972abca6f5b80d0e3197376b73bbc1cc269c08b`
- **Cleanup result:** three Connected Line Segment deletions, zero Feature Line additions, under five minutes, and no major region reconstructed
- **Physical result:** the owner printed the corrected packet, reported that it looked good, and continued the workflow with the Grinch source; issue 09 records the accepted waiver boundaries without claiming unperformed measurements
- **Second accepted character run:** `output/pdf/grinch-decorating-maker-ready.pdf`, `20.66in x 36.00in`, 14 US-letter pages
- **Grinch packet SHA-256:** `e2c2c6195e646855ace56c650603bbd9d5fd1fcb145bdc081f8fa567eb189e7e`
- **Grinch result:** authored SVG stayed local, rendered at the 144-DPI PDF target, required one Connected Line Segment deletion, made zero provider requests, and was explicitly accepted by the owner
- **Known limitation:** retained transfer-line density still depends on source artwork; heavy source-authored face or accessory marks remain a maker judgment rather than an automatic semantic simplification guarantee
- **Baseline decision:** v0.1 is accepted for the local personal jigsaw-template workflow. Layered, stencil, laser/CNC, nesting, installer, hosting, and additional paid-AI capabilities remain outside this baseline
- **Release mechanics:** no tag, push, deployment, packaging, or worktree cleanup is authorized by this acceptance record
