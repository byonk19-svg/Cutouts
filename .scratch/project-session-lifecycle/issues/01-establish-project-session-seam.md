# 01 — Establish the Project Session seam

**What to build:** Introduce the deep Project Session module through the complete project-name and Finished Size workflows. The maker should experience unchanged editing behavior while those durable changes begin crossing one authoritative session interface with Project Revision, Project Capabilities, and observable effect requests.

**Blocked by:** None — can start immediately.

**Status:** complete

- [x] A Project Session can be initialized from the app's current project state without changing visible behavior or the Project File schema.
- [x] Changing project name applies one atomic Project Transition through the Project Session interface.
- [x] Changing Finished Size applies one atomic Project Transition and retains the existing aspect-ratio, finished-width, tile-count, and print-scale behavior.
- [x] Project-name and Finished Size changes preserve Source Image, accepted Detail Lines, Feature Lines, paint work, Review Milestones, and saved workspace preferences.
- [x] Successful durable changes advance an opaque Project Revision and request persistence through the existing production adapter.
- [x] Project Capabilities and operation outcomes are observable through the Project Session interface without exposing internal state setters.
- [x] React no longer writes the migrated durable fields directly and remains responsible only for rendering and transient presentation around those flows.
- [x] Focused tests exercise project-name and Finished Size behavior through the Project Session interface rather than React setter order or private helpers.
- [x] Existing project round-trip, workflow, TypeScript, build, and focused browser checks remain green.
- [x] No tracing, SVG, PDF, provider, or visual behavior changes are included.

## Comments

Completed in commit `17dc03e`. Merged via PR #4.
