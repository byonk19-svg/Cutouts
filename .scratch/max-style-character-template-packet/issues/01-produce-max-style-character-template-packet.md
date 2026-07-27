Status: ready-for-human

# Produce a Max-Style Character Template Packet

## Source intake

- Clean source filename: `Max-from-the-Grinch-movie.webp`
- Source path: `C:\Users\byonk\Downloads\Max-from-the-Grinch-movie.webp`
- Source dimensions: 700 x 1500 pixels
- Source byte size: 123,278 bytes
- Source SHA-256: `3E2FFFB275DC538D572BBADE8136F0F1BDF425490D63B65A1472EA3DE1A07846`
- Source may be committed: yes
- Finished Height: 24 inches
- Solid black regions: print as boundary outlines
- Packet layout: a separate Color Guide page is acceptable

The previously inspected watermarked marketplace preview is excluded from
processing, tuning, fixtures, and validation.

## Goal

Prove that Cutout Studio can take the identified clean, unwatermarked,
flat-color Source Image through Upload -> Clean Lines -> Colors -> Export and
produce a printable single-piece plywood cutout packet functionally equivalent
to `C:\Users\byonk\Downloads\MaxEasyMakeCharacters.pdf`.

## Scope

Use this one Source Image to create one single-piece jigsaw template. Fix only
defects reproduced by this source.

Do not add multiple physical wood layers, automatic layer decomposition,
stencil bridges, kerf compensation, CNC or laser paths, text or monograms,
Etsy packaging, hosting, an installer, watermark removal, or new paid AI
behavior.

## Protected artifacts

Preserve Finished Size, one authoritative outer Cut Line, SVG viewBox behavior,
US-letter page dimensions, calibration geometry, tile overlap, page ordering,
page labels, project save and restore, and accepted Detail Lines remaining
separately editable.

## Acceptance criteria

- [x] The clean source is identified by filename, dimensions, byte size, and SHA-256.
- [x] The complete Upload -> Clean Lines -> Colors -> Export workflow runs from the clean source.
- [x] The subject background is removed without adding the image rectangle to the Cut Line.
- [x] The generated output has exactly one unambiguous outer Cut Line.
- [x] No nearby Detail Line creates a duplicate outside silhouette.
- [x] The Cut Line preserves the antler, ears, body, paws, tail, and feet as one recognizable character silhouette.
- [x] Interior Detail Lines preserve the eyes, pupils, nose, mouth, ears, antler openings, chest, legs, paws, tail, and major paint boundaries.
- [x] Watermark-removal behavior is not present or required.
- [x] No major facial, body, antler, limb, or tail region must be redrawn from scratch.
- [x] Cleanup takes no more than 15 minutes.
- [x] Cleanup requires no more than 15 deliberate Connected Line Segment deletions or Feature Line additions.
- [ ] The maker can explain why every retained interior line belongs on the transferred wood pattern.
- [x] Trace pages contain black-and-white linework only.
- [x] The original color source is absent from trace pages.
- [x] Editor selections, handles, underlays, review overlays, and temporary gestures are absent from export.
- [x] The paint guide identifies meaningful areas rather than generic Color 1, Color 2 labels.
- [x] Finished dimensions match the requested 24-inch height.
- [x] The packet includes a clear assembly map and numbered tiled pages.
- [x] The PDF opens successfully and all trace pages use US-letter media boxes.
- [x] The one-inch calibration square is correct in exported PDF geometry.
- [x] Adjacent-page overlap strips match exactly in the exported PDF.
- [ ] The assembled printed pattern is recognizable as the source character.
- [ ] The maker accepts the packet as suitable to trace, cut, transfer, and paint.

## Validation

Run focused regression tests for every reproduced defect, `pnpm verify`,
`pnpm test:e2e -- --workers=1`, `git diff --check`, a real Chromium workflow
capture, exported SVG inspection, rendered PDF inspection, page-count and
media-box checks, calibration checks, and adjacent-tile continuity comparison.

No real paid provider request may occur during automated validation.

## Human acceptance

Print at 100% / Actual Size and verify the calibration square, at least two
adjacent pages, Cut Line continuity, practical line weight, one outer Cut Line
transfer, one interior Detail Line transfer, and paint-guide usefulness.

Record any waiver explicitly without representing an unperformed check as
completed.

## Comments

- 2026-07-23: Required source intake completed. Ticket moved from
  `needs-info` to `ready-for-agent`.
- 2026-07-23: Automated acceptance completed with zero Detail Line deletions,
  zero Feature Line additions, and zero provider requests. The exported packet
  is `output/pdf/max-template-packet.pdf`; the SVG, assembled trace, rendered
  pages, screenshots, and machine-readable results are under
  `output/acceptance/max-template-packet/`.
- 2026-07-23: Ticket moved to `ready-for-human`. Physical printing, calibration
  measurement, two-page assembly, practical line-weight judgment, transfer
  trials, retained-line explanation, and final maker acceptance remain
  intentionally unperformed.
- 2026-07-24: Reference comparison reopened automated acceptance. The packet
  now uses the reference-style two-column by four-row assembly with eight
  numbered trace sheets (10 PDF pages total), preserves authored antler, ear,
  eye, pupil, tail, leg, paw, and toe transfer lines, consolidates detected
  color variants into five meaningful paint regions, and smooths accepted
  raster Detail Lines for full-size printing without changing their editable
  project layer. Regenerated browser, SVG, PDF, calibration, and overlap
  evidence used zero provider requests. The ticket remains `ready-for-human`
  because the required physical print and transfer checks are still pending.
- 2026-07-24: Maker review found the exported face lines insufficiently
  refined. The reproduced defect had two causes: colored marker texture was
  being accepted as authored ink, and preview-sized accepted Detail Lines were
  re-thresholded after enlargement. Marker-textured flat art now keeps
  deliberate near-neutral outline ink in the face while retaining lower-body
  transfer features, and PDF export rounds and softly enlarges accepted raster
  lines at their source scale. Regression coverage requires a continuous face
  boundary and antialiased full-size facial linework. Physical print acceptance
  remains pending.
- 2026-07-24: Maker review removed dot-sized facial remnants. Balanced
  line-art cleanup now discards post-normalization components smaller than a
  transferable mark instead of allowing protected short remnants to become
  printed dots. The eyes, pupils, lashes, nose, mouth, and continuous face
  boundary remain covered by the Max regression fixture.
- 2026-07-24: Maker review requested clearer closed paint areas. Balanced
  line-art cleanup now matches incomplete source-color regions to nearby
  authored ink, replaces overlapping scratch lines with one smoothed closed
  boundary, and preserves non-paint expression strokes as open Detail Lines.
  The exported eye band contains exactly four practical closed regions—two eye
  whites and two pupils—and the distinct antler-tip shade is closed without
  closing the decorative antler spur or duplicating either ear silhouette.
  Chromium regeneration and packet inspection confirmed no paid provider
  requests, black-and-white trace pages, one Cut Line, US-letter media boxes, a
  72-point calibration square, and matching tile overlaps. Physical print and
  transfer acceptance remain pending.
