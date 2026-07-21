Status: complete

# Physical MVP Table Validation

## What To Validate

Validate the exported Cutout Studio packet at the table with paper, tape, pencil, and scrap material before adding more product features.

The app is MVP-complete in software for the current workflow: upload/source image, Trace Studio manual vector linework, project persistence, SVG linework export, printable packet PDF, paint guide, craft paint matching, paint match review, editable palette, grouped shopping list, and full maker-flow e2e smoke coverage.

This issue should stay focused on physical trust. Do not expand the paint catalog, add AI, or add new editor tools from this issue.

## Acceptance Criteria

- [x] Export a fresh Coraline Template Packet PDF.
- [x] Print the cover page at Actual size / 100%, not Fit to page.
- [x] Measure the 1-inch calibration square and record the result. The owner reported that the calibration worked correctly at 100%; the exact ruler value was not separately supplied and was explicitly waived for v0.1 acceptance.
- [x] Print two adjacent tiled pages.
- [x] Tape the pages together using row/column labels, crop marks, and overlap guides.
- [x] Confirm the linework aligns across the page boundary.
- [ ] Trace one outer cutline section and one interior detail section onto paper, cardboard, or scrap wood. **Waived by owner for v0.1; not performed.**
- [ ] Confirm line thickness is practical for pencil/carbon transfer. **Waived by owner for v0.1; no carbon-transfer result is claimed.**
- [ ] Review the paint guide and copied shopping list as if shopping in store. **Waived by owner for v0.1; no in-store simulation is claimed.**
- [x] Record any must-fix packet issues before v0.1 release polish. None were reported.

## Blocked By

- `.scratch/cutout-template-generator/issues/01-print-pipeline.md`
- `.scratch/cutout-template-generator/issues/02-paint-guide.md`
- `.scratch/cutout-template-generator/issues/03-template-usability.md`

## Comments

- This is intentionally `ready-for-human` because it requires physical printing, measuring, taping, and tracing.
- If physical validation exposes a concrete software issue, create a narrow follow-up implementation issue for that specific fix.
- Partial evidence exists from the authored-line-art workflow ticket dated 2026-07-21: the saved authored-line-art PDF was printed at 100% / Actual Size and the maker found the calibration, tiled Cut Line continuity, and recognizable interior transfer details acceptable.
- Before the later owner acceptance, this broader gate remained open because it did not yet record the exact calibration result, the full explicit two-page tape procedure, one outer plus one interior transfer check, the line-weight assessment, or the paint-guide and shopping-list review for the canonical Coraline Template Packet.
- 2026-07-21 digital-prep evidence: generated through real Chromium `Upload -> Clean Lines -> Colors -> Export` from product baseline `c1144b6` / branch head `8ad948eaee55b1e57a1127e191cc4b927d86376f` for project `Coraline Physical MVP`; packet size `30.00in` tall x `11.97in` wide; `10` US-letter pages total (`cover`, `paint guide`, `8` trace tiles in `2x4`); PDF at `output/pdf/coraline-physical-mvp-template-packet.pdf`; evidence manifest at `output/acceptance/physical-mvp/manifest.json`; SHA-256 `6a7050fafeac0b53f831d985aa8027db51933e46ef56faefb46988581129f1c2`; one-browser generation test passed; `pypdf` confirmed page count, letter boxes, and text; PDF content stream confirmed `72x72pt` calibration square; visual inspection of all pages passed; horizontal overlap strip pixel comparisons matched with negligible render difference. At generation time this recorded digital preparation only; the later owner-acceptance result is recorded separately below.
- 2026-07-21 owner acceptance: the cover printed successfully at Actual size / 100%; the owner reported the calibration worked correctly, and two adjacent pages printed, taped, and aligned successfully. The owner then accepted the packet for v0.1 and explicitly waived an exact numeric ruler record, a separate outer/interior carbon-transfer exercise, and a separate in-store paint/shopping simulation. Those waived activities are not represented as independently performed. No must-fix packet defect was reported.
