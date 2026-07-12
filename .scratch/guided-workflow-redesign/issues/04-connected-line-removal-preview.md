# 04 — Preview Connected Line Segment removal scope

**What to build:** Make Remove Line safe enough for first-time use by showing the complete Connected Line Segment that will be removed before a click, then preserving fast one-click deletion and immediate Undo.

**Blocked by:** 03 — Make Clean Lines the dominant workspace.

**Status:** ready-for-human

- [x] Hovering or pointing with Remove Line highlights the entire Connected Line Segment that one click will delete.
- [x] The preview is visually distinct from selected, permanent, and original-underlay lines without obscuring nearby details.
- [x] Moving away clears the preview without mutating linework.
- [x] Clicking removes exactly the previewed segment.
- [x] Undo restores the full removed segment and its previous visual state.
- [x] Removal revokes linework and Colors Review Milestones and returns Workflow Progress to Clean Lines.
- [x] Pointer and keyboard-accessible behavior provide equivalent removal-scope information where practical.
- [x] Editor behavior tests cover preview, cancellation, removal, Undo, and milestone invalidation.
- [x] A Coraline head-area acceptance check demonstrates the complete deletion scope before the risky removal shown in the existing baseline evidence.
