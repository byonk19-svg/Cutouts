# 03 - Review-Only Color Artwork Boundary

**What to build:** A maker who uploads color, rendered, or photographic artwork
can still create and review a Cut Line, but is clearly told that generated
interior lines are review-only rather than a guaranteed Max-style transfer
drawing.

**Blocked by:** 01 - Reliable Authored Line-Art Import.

**Status:** complete

- [x] Needs-simplification artwork is visibly distinct from Ready line art at
  the point where the maker reviews Clean Lines.
- [x] Technical Cut Line validity is not presented as a claim that the interior
  detail layer is Max-style or ready to transfer.
- [x] A review-only proposal or starter layer cannot replace accepted details
  without the maker's explicit existing accept decision.
- [x] Existing projects derive a safe readiness state when the saved project
  predates explicit readiness metadata.
- [x] Browser and project-session tests cover messaging, state preservation, and
  backwards-compatible restore behavior.

## Comments

- Human workflow acceptance completed through ticket 04's physical print check on 2026-07-21.

- Implemented test-first on `codex/detailed-line-art-routing`. Clean Lines now
  shows a visually distinct **Needs simplification** notice for color or
  rendered artwork and explains that a technically valid Cut Line does not
  make locally generated starter details a guaranteed Wood-Transfer Style
  drawing.
- The notice keeps manual cleanup available and states that a separate proposal
  cannot replace accepted Detail Lines without explicit review and acceptance.
  Existing Project Session enforcement for review-only proposals remains the
  authority and is covered by its existing lifecycle and browser tests.
- Project Session normalization now derives `needs-simplification` from rendered
  analysis when older project state has no readiness metadata, while preserving
  an explicit `ready-line-art` classification.
- Browser coverage proves the conservative message survives legacy project
  save/restore, accepted Detail Lines remain unchanged, and no
  `/api/generate-linework` request occurs.
- Verification: `pnpm verify` passed 88 backend tests, all TypeScript suites,
  TypeScript compilation, and the production build. The isolated serial
  Chromium run passed 29/29. Focused Project Session, project-file,
  review-only-proposal, and browser tests passed; `git diff --check`, Standards
  review, and Spec review passed.
- Ticket 04, external provider behavior, protected Cut Line geometry, SVG/PDF
  output, Finished Size, tiling, overlap, and calibration were not changed.
