# Cutout Studio

Cutout Studio is a local developer-run web app for making personal wood cutout template packs.

## What V1 Does

- Upload one PNG or JPG source image with a simple removable background.
- Generate an adjustable outer cut line with deterministic cleanup settings.
- Use Trace Studio to manually draw, select, edit, duplicate, smooth, and delete vector feature lines over a faint source-image underlay.
- Save and reopen editable `.cutout.json` projects so template work can resume across sessions.
- Set finished cutout height in inches while preserving aspect ratio.
- Export a linework-only SVG for crisp vector transfer art.
- Export a US-letter PDF template packet with:
  - instruction cover page
  - page map and linework legend
  - paint guide page with editable labels, notes, paint suggestions, and shopping list
  - tiled black-and-white trace pages
  - page numbers
  - row and column labels
  - crop marks and overlap guides
  - 1 inch calibration square on the cover page

The exported trace pages are black-and-white only: a thick locked outer cut line plus thinner black interior detail lines. The source underlay, selection handles, editor dimming, and UI overlays are never intended to print. Paint colors stay in the separate paint guide instead of driving the printable tracing lines.

## Setup

```powershell
python -m pip install -r requirements.txt
pnpm install
pnpm approve-builds esbuild
```

Browser smoke tests use Playwright Chromium. Install that browser explicitly when you want to run the end-to-end workflow check:

```powershell
pnpm exec playwright install chromium
```

This is intentionally not part of normal install because the app is a local developer-run tool and browser binaries are large.

## Run Locally

```powershell
pnpm dev
```

Open the Vite URL shown in the terminal, usually `http://127.0.0.1:5173`.

## Verify

```powershell
pnpm verify
```

Run the full browser workflow smoke after Chromium is installed:

```powershell
pnpm test:e2e
```

That smoke starts its own current dev server and expects ports `5173` and `8787` to be free. Stop any existing `pnpm dev` session before running it. The smoke covers upload, Trace Studio manual strokes, project persistence, Paint Match Review, shopping list updates, SVG export, and PDF export response type.

See `docs/MVP_ACCEPTANCE_CHECKLIST.md` for the manual print validation steps that still need a real printer and paper.

## Notes

Paint matches are approximate and use an editable local craft paint catalog at `backend/cutout_studio/craft_paint_catalog.json`. Store availability and exact color appearance can vary.
