# 04 - Reliable Workflow Acceptance Evidence

**What to build:** Provide repeatable evidence that the complete authored
line-art workflow produces a Max-style-transfer-ready template while color
artwork remains honestly review-only and protected print behavior does not
regress.

**Blocked by:** 02 - Editable Authored Detail Export; 03 - Review-Only Color Artwork Boundary.

**Status:** ready-for-human

- [x] Browser acceptance runs cover authored SVG and line-art raster upload,
  original-on/original-off review, one detail edit, and advancement through the
  normal template workflow.
- [x] Saved original-off preview, SVG, and rendered tiled PDF evidence show one
  continuous Cut Line plus recognizable, selected interior authored details.
- [x] A color-art run demonstrates review-only language and preserves accepted
  artifacts until an explicit maker decision.
- [x] Existing cutline, SVG viewBox, finished-size, tiling, overlap, and
  calibration regression checks remain green.
- [x] The ticket records any physical print check still requiring human review.

## Comments

- Added a repeatable, credential-free Chromium acceptance run for authored SVG,
  authored raster, and color-art review-only workflows. It covers original-on
  and original-off review, one accepted-detail edit per authored input, normal
  advancement to Export, the paid-proposal consent boundary, cancellation, and
  zero `/api/generate-linework` requests.
- Stable evidence is recorded in `output/acceptance/authored-line-art/`, with the
  tiled printable PDF at `output/pdf/authored-line-art-acceptance.pdf`. The
  manifest records one Cut Line layer, an accepted Detail Lines layer, no
  original underlay in SVG export, remaining edited detail pixels, and the
  physical-print checklist.
- Visual inspection confirmed the saved original-off SVG and raster previews
  retain recognizable selected details, the color source displays the
  review-only boundary, and rendered PDF pages show the Cut Line and authored
  interior details. Protected Cut Line, SVG viewBox, finished-size, tiling,
  overlap, calibration, PDF, and SVG production geometry were not changed.
- Verification: the focused acceptance run passed 1/1; `pnpm verify` passed 88
  backend tests, all TypeScript suites, TypeScript compilation, and production
  build; the full isolated serial Chromium run passed 29/30, including ticket
  04 and all export/geometry browser paths. The one unrelated failure is the
  pre-existing `invalid partial hex stays presentation-only...` autosave timing
  race: it reads a null pre-debounce snapshot and then observes the autosave
  appear. Its isolated rerun reproduced the same timing race. It was not changed
  in this ticket.
- Standards and Spec re-reviews passed with no remaining findings. No provider
  request was made, no ticket 02 or 03 implementation was reopened, and no
  protected geometry code was modified.
- Physical print remains **ready-for-human**: print the saved PDF at 100% / Actual
  Size with scaling disabled, measure the calibration square, tape the tiled
  overlap marks and confirm the Cut Line is continuous across seams, then
  confirm the selected interior details are recognizable and useful for wood
  transfer.
