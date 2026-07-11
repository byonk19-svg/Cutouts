# Trace Acceptance UX Design

## Goal

Make starter-line cleanup begin in a usable, honest state. After analysis, the subject should be centered and large enough to edit immediately, export readiness should distinguish technical validity from craft cleanup, and paint work should not dominate the page before tracing is accepted.

## Scope

This change is limited to editor framing, Trace Quality Review language/state, and Paint Guide disclosure. It does not change backend tracing or preset algorithms.

## Editor Framing

- Run automatic fit-to-content after analysis for Simple, Balanced, Detailed, and blank Trace Studio modes.
- Use the detected cutline bounds, merged with manual-stroke bounds when applicable.
- Center the fitted bounds in the editor.
- Target approximately 80% of the available editor height, with enough horizontal padding to keep the subject and controls visually separated.
- Preserve the existing Fit action as a user-controlled recovery action.
- Preserve imported non-default viewport state; only automatically fit imported projects that restore with the default viewport.

The existing pending-fit state already applies to all editable modes. The current effect incorrectly limits execution to blank Trace Studio. The implementation should remove that mode restriction rather than introduce a second fitting path.

## Trace Quality Review

- Replace the successful export readiness text `Ready` with `Technically ready to export`.
- Add a separate `Detail cleanup` row.
- Show `Review recommended` until the user marks the template cleanup review complete.
- Show `Accepted` after the relevant cleanup acceptance state is checked.
- Keep missing-cutline and missing-detail warnings unchanged.

Technical readiness means the packet has the required export layers. It does not claim that generated lines are clean enough for transfer without human review.

## Paint Guide Disclosure

- Keep Trace Quality Review and Template Cleanup visible after analysis.
- Place paint-specific content inside one `details` disclosure labelled `Paint Guide`.
- Keep the disclosure collapsed while trace cleanup is incomplete.
- Expand it automatically when trace cleanup becomes accepted.
- Allow the user to open or close it manually at any time.
- Do not discard paint edits or reset paint-review state when the disclosure opens or closes.

Paint-specific content includes the finished-size summary, Paint Match Review, paint sanity warnings, project palette, individual paint matches, shopping list, and paint-related export controls currently housed in the right panel.

## Acceptance Evidence

Use the Balanced preset on the Coraline-style source and capture:

- Editor with original underlay on.
- Editor with original underlay off.
- Printable linework preview.
- The collapsed Paint Guide state.
- The expanded Paint Guide state after trace acceptance.

The fitted subject should occupy roughly 70-85% of editor height and be visually centered. The underlay-off view determines whether head and face linework needs a later targeted adjustment. No tracing-algorithm change belongs in this implementation.

## Testing

- Add a viewport regression proving pending fit works for auto-starter modes and centers tall content at the intended scale.
- Update Trace Quality Review tests for technical readiness and cleanup-review status.
- Add UI coverage for Paint Guide collapsed-before-acceptance and expanded-after-acceptance behavior.
- Run the complete frontend test suite and production build.
- Verify the workflow in a real browser at desktop and narrow viewport sizes.

