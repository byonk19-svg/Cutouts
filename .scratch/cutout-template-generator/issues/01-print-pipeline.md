Status: done

# Print Pipeline PDF Export

## What To Build

Build the first complete path through Cutout Studio: one source image is uploaded to the local app, processed into a cut line with deterministic cleanup settings, scaled to a finished size, tiled across US letter trace pages, and exported as a PDF template pack with an overview page and color guide page.

## Acceptance Criteria

- [x] A maker can upload a PNG or JPG in the browser UI.
- [x] The backend extracts a cut line from a removable background using cleanup settings.
- [x] The maker can set finished height in inches while preserving aspect ratio.
- [x] The app previews the cut line and export summary.
- [x] The exported PDF includes an overview page, color guide page, and tiled trace pages.
- [x] Trace pages are US letter size and include page numbers, overlap guides, and a calibration mark.
- [x] Backend tests cover generated image input, cut line extraction, tiling, and PDF page count.

## Blocked By

None - can start immediately.

## Comments

- Completed in commit `9e1031d`. Verified with `pnpm verify`, browser upload-preview-export smoke, and rendered PDF inspection.
