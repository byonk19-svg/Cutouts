Status: ready-for-human

# Physical MVP Table Validation

## What To Validate

Validate the exported Cutout Studio packet at the table with paper, tape, pencil, and scrap material before adding more product features.

The app is MVP-complete in software for the current workflow: upload/source image, Trace Studio manual vector linework, project persistence, SVG linework export, printable packet PDF, paint guide, craft paint matching, paint match review, editable palette, grouped shopping list, and full maker-flow e2e smoke coverage.

This issue should stay focused on physical trust. Do not expand the paint catalog, add AI, or add new editor tools from this issue.

## Acceptance Criteria

- [x] Export a fresh Coraline Template Packet PDF.
- [ ] Print the cover page at Actual size / 100%, not Fit to page.
- [ ] Measure the 1-inch calibration square and record the result.
- [ ] Print two adjacent tiled pages.
- [ ] Tape the pages together using row/column labels, crop marks, and overlap guides.
- [ ] Confirm the linework aligns across the page boundary.
- [ ] Trace one outer cutline section and one interior detail section onto paper, cardboard, or scrap wood.
- [ ] Confirm line thickness is practical for pencil/carbon transfer.
- [ ] Review the paint guide and copied shopping list as if shopping in store.
- [ ] Record any must-fix packet issues before v0.1 release polish.

## Blocked By

- `.scratch/cutout-template-generator/issues/01-print-pipeline.md`
- `.scratch/cutout-template-generator/issues/02-paint-guide.md`
- `.scratch/cutout-template-generator/issues/03-template-usability.md`

## Comments

- This is intentionally `ready-for-human` because it requires physical printing, measuring, taping, and tracing.
- If physical validation exposes a concrete software issue, create a narrow follow-up implementation issue for that specific fix.
- Partial evidence exists from the authored-line-art workflow ticket dated 2026-07-21: the saved authored-line-art PDF was printed at 100% / Actual Size and the maker found the calibration, tiled Cut Line continuity, and recognizable interior transfer details acceptable.
- This broader gate is still open because it does not yet record the exact calibration measurement, the full explicit two-page tape procedure, one outer plus one interior transfer check, the line-weight assessment, or the paint-guide and shopping-list review for the canonical Coraline Template Packet.
- 2026-07-21 digital-prep evidence: generated through real Chromium `Upload -> Clean Lines -> Colors -> Export` from product baseline `c1144b6` / branch head `8ad948eaee55b1e57a1127e191cc4b927d86376f` for project `Coraline Physical MVP`; packet size `30.00in` tall x `11.97in` wide; `10` US-letter pages total (`cover`, `paint guide`, `8` trace tiles in `2x4`); PDF at `output/pdf/coraline-physical-mvp-template-packet.pdf`; evidence manifest at `output/acceptance/physical-mvp/manifest.json`; SHA-256 `6a7050fafeac0b53f831d985aa8027db51933e46ef56faefb46988581129f1c2`; one-browser generation test passed; `pypdf` confirmed page count, letter boxes, and text; PDF content stream confirmed `72x72pt` calibration square; visual inspection of all pages passed; horizontal overlap strip pixel comparisons matched with negligible render difference. This records digital preparation only; every print, measure, tape, transfer, and paint-guide human checkbox above remains open.
