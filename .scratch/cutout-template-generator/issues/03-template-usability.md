Status: done

# Template Usability Hardening

## What To Build

Improve the first version after the print pipeline works by tightening confusing states, validation, and browser usability around the single-session workflow.

## Acceptance Criteria

- [x] Invalid uploads show clear errors.
- [x] PDF export is disabled until required settings and analysis are valid.
- [x] Empty, tiny, or all-background images produce deterministic errors.
- [x] Settings changes update preview and export summary predictably.
- [x] The UI remains usable at desktop and tablet widths.
- [x] Browser smoke covers the core workflow.

## Blocked By

- `.scratch/cutout-template-generator/issues/01-print-pipeline.md`

## Comments

- Completed through the Trace Studio pivot, simplified setup flow, project persistence, selection/stroke editing, packet export readiness, print packet polish, and full maker-flow Playwright smoke test.
- Current product guidance is that automatic starter lines are optional rough help. Manual/vector Trace Studio linework is the main workflow.
- Verified with `pnpm verify`, `pnpm test:e2e`, `git diff --check`, and browser/PDF smoke passes during MVP hardening.
