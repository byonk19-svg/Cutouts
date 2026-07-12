# Guided Workflow Acceptance

The focused Upload -> Clean Lines -> Colors -> Export workflow is understandable without opening More Tools, diagnostics, advanced color editing, or secondary export options. Each step has one primary action, and later steps remain locked until their prerequisite is complete.

Automated Playwright acceptance preserves desktop (`1440x900`) and mobile (`390x844`) screenshots for all four steps under `output/screenshots/latest/guided-workflow/`. It also verifies:

- Clean Lines gives the canvas at least 70% of the workspace width and 65% of the viewport height.
- Mobile layouts do not overflow horizontally or retain fixed multi-column rails.
- The known Coraline head-area connected line displays its full removal scope before deletion.
- Colors and Export keep advanced disclosures closed during the main workflow.
- The primary PDF export remains visible without opening More Export Options.

The automated acceptance uploads the checked-in Coraline clean-outline fixture and uses the matching detail-layer fixture for the known risky removal scope. The existing Coraline baseline screenshots remain the rendered source-image line-quality reference.

Physical acceptance remains manual: print the cover and two adjacent tile pages at 100%, measure the calibration square, and verify overlap alignment and transfer readability using `docs/MVP_ACCEPTANCE_CHECKLIST.md`.
