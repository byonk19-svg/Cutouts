# 01 - Reliable Authored Line-Art Import

**What to build:** A maker can upload a safe SVG or usable authored line-art
raster and enter a clearly identified Ready line-art workflow. The app prepares
the source ink locally in the protected preview coordinate space, keeps the Cut
Line authoritative, and gives the maker an aligned editable starting detail
layer instead of rendered-image edge output.

**Blocked by:** None - can start immediately.

**Status:** ready-for-human

- [x] Safe self-contained SVG artwork and usable existing line-art rasters enter
  the Ready line-art workflow without a cloud request.
- [x] Unsafe SVG content is rejected before processing, with a maker-readable
  error that leaves the current project unchanged.
- [x] The maker can see the ready-line-art state and compare the aligned
  authored ink with the original underlay in Clean Lines.
- [x] The Cut Line remains the only authoritative outside silhouette.
- [x] Focused tests cover classification, safe import, coordinate alignment, and
  failure recovery through observable behavior.

## Comments

- Implemented test-first on `codex/detailed-line-art-routing`. Safe SVG imports
  now reject document declarations, embedded or animated content, event
  handlers, scriptable values, and non-local resource references before local
  rasterization. Self-contained fragment references remain supported.
- Clean Lines now identifies accepted SVG and raster artwork as **Ready line
  art**, explains local aligned editable Detail Lines, supports Original
  underlay comparison, and reiterates that the protected Cut Line is the only
  outside silhouette.
- Browser coverage proves preview-coordinate alignment, maker-readable unsafe
  import recovery with the prior project unchanged, usable authored raster
  classification, and zero `/api/generate-linework` requests on both reliable
  paths.
- Verification: `pnpm verify` passed 87 backend tests, all TypeScript suites,
  TypeScript compilation, and the production build. The isolated serial
  Chromium run passed 27/27. `git diff --check`, Standards review, and Spec
  review passed.
- Tickets 02-04, provider behavior, protected Cut Line geometry, SVG viewBox,
  Finished Size, tiling, overlap, calibration, and PDF assembly were not
  changed.
