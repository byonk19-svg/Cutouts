Status: done

# Reduced Palette And Paint Guide

## What To Build

Extend the template pack so the maker gets a practical reduced palette and ranked budget craft paint matches from an editable paint catalog.

## Acceptance Criteria

- [x] The app extracts a small adjustable reduced palette from the source image.
- [x] Each palette color has 2-3 ranked budget craft paint matches.
- [x] Paint matches include brand, paint name, approximate color swatch, and source note.
- [x] The color guide page includes the palette and ranked matches.
- [x] Tests cover deterministic palette extraction and ranking behavior.

## Blocked By

- `.scratch/cutout-template-generator/issues/01-print-pipeline.md`

## Comments

- Completed across the paint guide, editable project palette, local craft paint catalog, paint match review, manual override/no-match persistence, grouped shopping list, and packet PDF paint guide work.
- Later hardening added paint sanity warnings so suspicious label-to-paint matches are shown as `Needs review / choose in store` instead of trusted purchases.
- Verified in the MVP flow with `pnpm verify`, `pnpm test:e2e`, PDF render inspection, and SVG/PDF export checks.
