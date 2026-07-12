# 07 — Complete responsive and Coraline acceptance

**What to build:** Validate the complete Guided Workflow as a coherent product at desktop and mobile sizes, using the real Coraline acceptance image and preserving evidence for every step.

**Blocked by:** 02 — Build the focused Upload step and File menu; 03 — Make Clean Lines the dominant workspace; 04 — Preview Connected Line Segment removal scope; 05 — Build the dedicated Colors step; 06 — Build the PDF-first Export step.

**Status:** ready-for-human

- [x] One Playwright workflow completes Upload → Clean Lines → Colors → Export without opening More Tools or diagnostics.
- [x] Every step presents one obvious primary action and future-step controls remain absent or locked.
- [x] Desktop Clean Lines gives the canvas at least 70% of main content width and 65–75vh of usable height.
- [x] A common mobile viewport stacks controls beneath the canvas without fixed three-column rails or overlap.
- [x] Coraline screenshots capture Upload, Clean Lines, Colors, and Export at 1440×900.
- [x] Mobile screenshots capture the same four steps at a common phone viewport.
- [x] Connected Line Segment preview makes the known risky Coraline head removal scope visible before deletion.
- [x] The final usability review records whether the main workflow is understandable without advanced drawers.
- [x] Existing backend, unit, TypeScript, production build, PDF/SVG, and Playwright regression suites pass.
- [x] No tracing algorithm or PDF/vector geometry changes are included in the redesign.
