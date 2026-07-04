# PRD: Cutout Template Generator V1

## Problem Statement

The maker creates outdoor wood cutouts by tracing purchased printable templates onto wood, cutting them with a jigsaw, painting them, and sealing them. Purchased templates work because they provide a full-size tiled cut line, page assembly guidance, and simple paint references. The maker wants a local program that can turn their own simple image into a printable template pack for personal use.

## Solution

Build Cutout Studio as a local developer-run web app. The maker uploads one source image with a removable background, adjusts deterministic cleanup settings, enters a finished size in inches, previews the cut line, and exports a US-letter PDF template pack. The pack includes an overview page, a color guide page, and tiled black-and-white trace pages with overlap guides, page numbers, and a calibration mark.

Paint matching is useful but secondary. V1 extracts a reduced palette and ranks approximate matches against an editable catalog of budget craft paints.

## User Stories

1. As a maker, I want to upload one source image, so that I can create a template from my own artwork.
2. As a maker, I want the app to assume a simple removable background, so that I can use clean craft images without manual tracing.
3. As a maker, I want to adjust the cut line threshold, so that the subject separates from the background correctly.
4. As a maker, I want to smooth the cut line, so that the jigsaw path is practical.
5. As a maker, I want to remove small specks, so that background noise does not become part of the cutout.
6. As a maker, I want to fill small holes, so that accidental gaps do not break the silhouette.
7. As a maker, I want optional detail lines, so that I can trace paint boundaries without cluttering the cut line.
8. As a maker, I want to enter a finished height in inches, so that the printed template matches the intended yard cutout size.
9. As a maker, I want the app to preserve aspect ratio, so that the subject is not distorted.
10. As a maker, I want the template split across US letter pages, so that I can print it at home.
11. As a maker, I want tile overlap guides, so that I can assemble pages accurately.
12. As a maker, I want page numbers, so that I can lay out the tiled template in order.
13. As a maker, I want a calibration mark, so that I can verify the printer is set to 100 percent scale.
14. As a maker, I want black-and-white trace pages, so that the printed pages are easy to stencil.
15. As a maker, I want an overview page, so that print settings and project dimensions are recorded.
16. As a maker, I want a color guide page, so that I can reference the original image while painting.
17. As a maker, I want a reduced palette, so that I do not buy too many paints.
18. As a maker, I want ranked budget craft paint matches, so that I can choose cheap available acrylic paints.
19. As a maker, I want to download a PDF, so that I can print and use the template immediately.
20. As a maker, I want the app to run locally, so that my images do not need to be uploaded to a hosted service.

## Implementation Decisions

- Build a local web app with a browser UI and local backend process.
- Use React + Vite for the frontend because this is a new interactive app UI.
- Use a Python backend for image processing and PDF generation because the bundled runtime already includes Pillow, NumPy, and ReportLab.
- Avoid a web framework dependency in v1; use a small standard-library HTTP server with JSON and multipart endpoints.
- Test the print pipeline at the backend service seam: image upload/settings in, deterministic analysis and PDF bytes out.
- Keep project persistence, installer packaging, hosted deployment, and brush editing out of v1.
- Store the budget craft paint catalog as editable JSON data, not hard-coded logic.

## Testing Decisions

- Backend tests should verify external behavior through the image-processing/PDF service functions, not private helper internals.
- Tests should use generated fixture images with known geometry so expected dimensions and tiling can be asserted.
- PDF tests should verify page count, metadata, tile numbering text, and non-empty output bytes.
- Frontend verification should include a browser smoke of upload, settings changes, preview refresh, and PDF export.

## Out Of Scope

- Etsy-ready commercial template packs.
- Copyright/IP screening.
- Buyer-facing license text and listing images.
- Hosted accounts, cloud upload, or multi-user storage.
- Saved editable projects.
- Manual erase/restore brush editing.
- Non-letter paper sizes.
- AI background removal for messy photos.
- Exact live store inventory or price guarantees.

## Further Notes

The first milestone is the print pipeline: upload, extract the cut line, scale to finished size, tile to US letter pages, and export a PDF. Paint matching and interface polish should not block that milestone, but the first vertical slice should leave space for the color guide page.
