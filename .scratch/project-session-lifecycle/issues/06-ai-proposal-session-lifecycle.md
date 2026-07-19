# 06 — Integrate the AI proposal lifecycle

**What to build:** Move the optional AI Linework Proposal request, review, acceptance, review-only, and rejection lifecycle behind Project Session actions. The maker must retain the existing explicit-cost and review experience while stale results, capability gating, protected artifacts, and exactly-one Undo behavior become session invariants.

**Blocked by:** 02 — Make Source Image and analysis replacement failure-safe; 05 — Bridge Editor Transactions into the Project Session.

**Status:** ready-for-agent

- [ ] AI proposal request capability requires Needs Simplification, a valid Cut Line, exact-cost confirmation, upload confirmation, and no request already in progress.
- [ ] One explicit request remains one provider attempt with no automatic retry.
- [ ] Proposal results carry their originating Project Revision and are discarded after any conflicting Source Image, analysis, or accepted-linework transition.
- [ ] Request failure or invalid output reports transient failure while preserving Source Image, Cut Line, accepted Detail Lines, Feature Lines, paint work, Review Milestones, and print settings.
- [ ] AI-lines-only, Original Overlay, and Print Preview review continue to gate explicit acceptance through Project Capabilities.
- [ ] Review-only results cannot become acceptable, even if the view attempts the action directly.
- [ ] Rejecting a proposal leaves accepted Detail Lines and Editor Transaction history unchanged.
- [ ] Accepting a valid reviewed proposal creates exactly one Editor Transaction, replaces only accepted Detail Lines, preserves Feature Lines and paint work, and revokes stale Review Milestones.
- [ ] Pending proposal review blocks Colors and Export through the same session policy used by the displayed Guided Workflow state.
- [ ] Unaccepted proposals and their review state remain excluded from Project Files and are cleared by successful project replacement or restore.
- [ ] Provider disclosure, exact $0.10 estimate, fixed style, provider/model behavior, normalization, duplicate-silhouette suppression, and protected geometry remain unchanged.
- [ ] Focused and browser tests use mocked, credential-free provider adapters and never make a real provider request.
- [ ] Existing Cut Line, Finished Size, SVG, tiling, calibration, and PDF assembly outputs remain unchanged.
