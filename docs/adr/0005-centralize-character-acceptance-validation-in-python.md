# ADR 0005: Centralize Character Acceptance Validation in Python

One Python validation engine owns Character Acceptance Profile schema loading, image topology, semantic assertions, PDF inspection, and result manifests; Chromium tests produce artifacts and invoke that engine rather than reimplementing assertions in TypeScript. This keeps closed-region, nesting, exterior-echo, and export-geometry semantics consistent across fast and end-to-end validation, at the cost of the browser harness depending on a Python command boundary.
