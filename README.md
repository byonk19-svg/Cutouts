# Cutout Studio

Cutout Studio is a local developer-run web app for making personal wood cutout template packs.

## What V1 Does

- Upload one PNG or JPG source image with a simple removable background.
- Generate an adjustable outer cut line with deterministic cleanup settings.
- Set finished cutout height in inches while preserving aspect ratio.
- Export a US-letter PDF template pack with:
  - overview page
  - color guide page
  - tiled black-and-white trace pages
  - page numbers
  - overlap guides
  - 1 inch calibration marks

## Setup

```powershell
python -m pip install -r requirements.txt
pnpm install
pnpm approve-builds esbuild
```

## Run Locally

```powershell
pnpm dev
```

Open the Vite URL shown in the terminal, usually `http://127.0.0.1:5173`.

## Verify

```powershell
pnpm verify
```

## Notes

Paint matches are approximate and use an editable budget craft paint catalog at `backend/cutout_studio/paint_catalog.json`. Store availability and exact color appearance can vary.
