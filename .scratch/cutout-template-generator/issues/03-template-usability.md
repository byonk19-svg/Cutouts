Status: ready-for-agent

# Template Usability Hardening

## What To Build

Improve the first version after the print pipeline works by tightening confusing states, validation, and browser usability around the single-session workflow.

## Acceptance Criteria

- [ ] Invalid uploads show clear errors.
- [ ] PDF export is disabled until required settings and analysis are valid.
- [ ] Empty, tiny, or all-background images produce deterministic errors.
- [ ] Settings changes update preview and export summary predictably.
- [ ] The UI remains usable at desktop and tablet widths.
- [ ] Browser smoke covers the core workflow.

## Blocked By

- `.scratch/cutout-template-generator/issues/01-print-pipeline.md`
