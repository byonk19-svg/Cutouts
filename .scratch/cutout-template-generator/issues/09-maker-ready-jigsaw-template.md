Status: ready-for-agent

# Prove One Maker-Ready Jigsaw Template

## Problem

The `Coraline Physical MVP` packet proved PDF scale, calibration, tiling,
overlap, and assembly, but it did not prove template quality. It was generated
from `backend/tests/fixtures/coraline/coraline-best-clean-outline.png`, a
processed black-and-white outline rather than the real colored Source Image.

At 30 inches tall, the packet magnifies rough and visually doubled contours.
Interior marks are fragmented and ambiguous instead of sparse, deliberate
transfer lines. Because the source contains only black and white, the paint
guide contains generic `Color 1` and `Color 2` entries rather than useful area
labels and paint guidance.

## Required Information

- Provide the real colored Coraline image, or another real colored character
  image the maker genuinely intends to turn into a jigsaw template.
- Keep that source local when licensing or redistribution does not permit it to
  be committed. Record its filename and SHA-256 in acceptance evidence.

This issue remains `needs-info` until that source is available. Do not tune the
pipeline against another processed outline fixture.

### Source received — 2026-07-21

- Local path: `C:\Users\byonk\Downloads\coraline-jones-wybie-lovat-youtube-other-mother-png-favpng-KtJE4LMVAEBZCVcR067bzMXqu.jpg`
- Dimensions: `820x960` pixels
- Format: 24-bit RGB JPEG with no alpha channel
- Bytes: `88479`
- SHA-256: `0242226d8b59a9591073d649f55dd98a725c10a406633dc0220881e7832f8124`
- Input warning: the visible checkerboard is baked into the JPEG pixels; it is
  not real transparency. The reproduction must verify that background removal
  isolates the character rather than promoting checkerboard cells or the image
  rectangle into Cut Line or Detail Line geometry.

The source-image, finished-height, and cleanup-budget decisions are resolved.

### Finished size confirmed — 2026-07-21

- Finished height: `36.00in`
- Width remains derived from the accepted subject bounds and preserved aspect
  ratio.
- The 36-inch output must be judged at printed scale; a clean small preview is
  not sufficient evidence.

### Cleanup expectation confirmed — 2026-07-21

- The generated result must already be a recognizable, coherent jigsaw
  template.
- Light Cleanup is acceptable.
- Full manual reconstruction is a product failure, even if the maker could
  eventually draw a good final packet in Trace Studio.
- Light Cleanup is limited to `15 minutes` and at most `15` deliberate
  Connected Line Segment deletions or Feature Line additions.
- Redrawing any major face, hair, coat, limb, hand, boot, or bag region from
  scratch fails the starter-template requirement regardless of elapsed time.

## Scope

Use one real color Source Image to produce and review one Maker-Ready Jigsaw
Template. Fix only defects reproduced by that run. Do not add layered-cut
geometry, stencil bridges, kerf compensation, laser/CNC paths, nesting, or
machine-ready export.

## Protected Artifacts

- finished dimensions and physical units
- outer Cut Line ownership and geometry safeguards
- PDF page size, calibration, tiling, overlap, labels, and assembly
- accepted Detail Lines remaining separate and editable
- project save/restore and Guided Workflow milestones

## Acceptance Criteria

- [ ] Acceptance evidence identifies the real color Source Image by filename and SHA-256 without committing it when redistribution is inappropriate.
- [ ] The complete Upload -> Clean Lines -> Colors -> Export workflow runs from that source.
- [ ] The printed-size preview has one unambiguous outer Cut Line without a nearby duplicate silhouette.
- [ ] The outer Cut Line is smooth enough at the requested finished size that the maker can follow it with a jigsaw.
- [ ] Interior Detail Lines preserve recognizable face, hair, clothing, limb, footwear, hand, and accessory boundaries that matter for transfer.
- [ ] Highlights, texture, speckles, broken fragments, and duplicate contours are absent or removable with only light cleanup.
- [ ] Cleanup completes within 15 minutes and at most 15 deliberate delete/add actions, with no major region reconstructed from scratch.
- [ ] The maker can distinguish every retained interior line from the Cut Line and state why it belongs on the wood.
- [ ] Colors are derived from the real source rather than a black-and-white outline fixture.
- [ ] The Color Guide uses meaningful area labels and deliberate paint/no-match decisions instead of generic unresolved entries.
- [ ] Rendered PDF evidence includes the cover, Color Guide, representative tile pages, and an assembled preview at the requested finished size.
- [ ] Existing calibration, page dimensions, tile overlap, and alignment remain unchanged and pass regression checks.
- [ ] The maker explicitly accepts the final packet as something they would trace, cut, and paint; mechanical validity alone is insufficient.

## Verification

- focused regression tests for each reproduced defect
- `pnpm verify`
- isolated `pnpm test:e2e`
- real Chromium workflow capture
- SVG and PDF render inspection at printed scale
- `git diff --check`
- acceptance-criteria review and code-quality/scope review

## Comments

- The rejected `Coraline Physical MVP` packet remains useful evidence for the
  print pipeline; do not delete or relabel it as maker-ready output.
- BridgeIt and other layered/stencil geometry repositories do not address this
  failure. The current problem is deliberate jigsaw-template artwork and useful
  paint planning from a real source.
