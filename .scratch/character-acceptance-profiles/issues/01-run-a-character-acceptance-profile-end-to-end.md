# 01 — Run a Character Acceptance Profile end to end

**What to build:** Make one canonical Character Acceptance Profile drive a complete, read-only validation run from a clean Source Image through generated artifacts, Chromium export, and a structured Character Acceptance Result. Use Max as the real fixture and one contrasting synthetic fixture to prove the seam is reusable without allowing profile data to influence production generation.

**Blocked by:** None — can start immediately.

**Status:** ready-for-human

- [x] A strict versioned JSON profile records source identity, ordinary requested output, fixture-local features, declarative expectations, and the human checklist.
- [x] Source identity validation rejects a missing source, byte-size mismatch, dimension mismatch, or SHA-256 mismatch.
- [x] One Python validation boundary accepts a profile plus a named Artifact Set and returns a structured Character Acceptance Result.
- [x] Automated assertions report passed, failed, or errored; required failures cannot be downgraded to warnings.
- [x] The validator produces a concise feature-level terminal report and machine-readable result manifest.
- [x] At least one failure produces a highlighted diagnostic overlay tied to its normalized Source Image region.
- [x] Max completes a real Chromium Upload → Clean Lines → Colors → Export workflow and its artifacts are evaluated through the Python boundary.
- [x] A contrasting committable synthetic fixture proves that completed symmetric source regions and intentional interior lines are not modified by Max-style behavior.
- [x] The initial Maker-Ready Baseline proves one authoritative Cut Line, clean Trace Pages, and absence of original or transient artwork in exported trace output.
- [x] Production analysis, cleanup, SVG, and PDF generation receive no feature identifiers, semantic regions, character identity, or other oracle data.
- [x] The acceptance run makes no real paid-provider request.
- [x] Focused tests, the real Chromium workflow, and `git diff --check` pass.

## Comments

### Automated acceptance — 2026-07-26

- Source identity: `Max-from-the-Grinch-movie.webp`, 700 × 1500 px,
  123278 bytes,
  `3E2FFFB275DC538D572BBADE8136F0F1BDF425490D63B65A1472EA3DE1A07846`,
  committable.
- Character Acceptance Result: `passed`; 12 semantic assertions, 10
  Maker-Ready Baseline checks, and 10 workflow checks passed with zero failed
  or errored checks.
- Browser evidence records Upload, Clean Lines, Colors, and Export in order,
  binds the exported SVG and PDF by hash, and derives zero paid-provider
  requests from the bound request log.
- SVG inspection found one Cut Line layer, one accepted Detail Line layer, a
  viewBox, 24-inch finished height, and no original or transient editor state.
- PDF inspection found 10 pages, eight trace pages, US-letter media, one
  monochrome trace raster per tile, matching overlaps, and a 72-point one-inch
  calibration square.
- `pnpm verify`: passed with 113 Python tests, all TypeScript tests, typecheck,
  and production build.
- `pnpm test:e2e -- --workers=1`: passed 31 Chromium tests. Because that command
  shape used four workers, the suite was also run directly with
  `pnpm exec playwright test --config tests/e2e/playwright.config.ts
  --workers=1`; all 31 tests passed serially.
- `git diff --check`: passed with line-ending warnings only.
- Independent specification and code-quality reviews approved the
  implementation with no remaining blocking findings.

### Human acceptance still required

The automated profile is accepted, but Maker Acceptance remains `pending`.
Print at 100% / Actual Size, measure the calibration square, assemble at least
two adjacent pages, inspect Cut Line continuity and practical line weight,
transfer one outer Cut Line and one interior Detail Line, and judge the Color
Guide before changing this issue from `ready-for-human`.
