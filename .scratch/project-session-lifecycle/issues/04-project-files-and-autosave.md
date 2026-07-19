# 04 — Make Project Files and Autosave session-consistent

**What to build:** Move project open, restore, explicit save, and Autosave coordination behind the Project Session seam. The maker must receive one coherent saved revision, safe failure behavior, and full compatibility with existing Project Files without persisting runtime-only proposal or editing state.

**Blocked by:** 02 — Make Source Image and analysis replacement failure-safe; 03 — Centralize Guided Workflow capabilities.

**Status:** ready-for-agent

- [ ] Project File reading and validation complete before the active Project Session is replaced.
- [ ] Invalid, unreadable, or unsupported Project Files report failure without changing the active project or its Autosave.
- [ ] A valid Project File installs Source Image, analysis, accepted artifacts, paint work, saved workspace preferences, and normalized Workflow Progress in one atomic transition.
- [ ] Explicit save serializes one coherent Project Revision rather than combining values observed across different revisions.
- [ ] The existing schema version and external Project File shape remain unchanged for compatible projects.
- [ ] Project Files exclude unaccepted AI proposals, proposal review state, transient operation status, Editor Transaction history, transient presentation choices, and active gestures.
- [ ] Opening or restoring a project starts with empty Undo and Redo histories while retaining the current accepted Detail Lines and Feature Lines.
- [ ] Autosave is requested only after a valid durable Project Transition and snapshots the resulting coherent revision.
- [ ] Autosave failure reports persistence health without rolling back project work or starting an automatic retry loop.
- [ ] The next durable change or explicit save creates a new save opportunity after an Autosave failure.
- [ ] Controlled storage-adapter tests cover success, failure, debouncing, no retry, invalid restore, compatible round trip, and runtime-state exclusion.
- [ ] Browser coverage verifies project save/open/restore and visible Autosave failure recovery.
