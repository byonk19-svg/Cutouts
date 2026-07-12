# Cutout Studio Guided Workflow Redesign

**Status:** ready-for-agent

## Problem Statement

Cutout Studio exposes most of its capabilities simultaneously through a permanent three-column layout, a large setup rail, a dense editor toolbar, persistent diagnostics, paint controls, project actions, and top-level exports. The tracing and export pipeline works, but a first-time maker must understand implementation concepts and choose among advanced options before completing the basic craft workflow.

The current layout also makes the artwork secondary. Setup and diagnostics squeeze the editor into the middle column even though line cleanup is the most important and time-consuming product task. Labels and helper text cannot solve this structural problem.

## Solution

Replace the control-panel interface with a single-page Guided Workflow containing four steps: Upload, Clean Lines, Colors, and Export. Only the active step renders its working controls. Each screen has one obvious primary action, while advanced capabilities remain available through progressive disclosure.

Upload asks only for a Source Image, Finished Size, and optional project name, then runs Balanced starter tracing automatically. Clean Lines becomes a nearly full-width artwork workspace with six primary controls and optional drawers for More Tools and diagnostics. Colors becomes a dedicated semantic paint-review step. Export makes the printable PDF the dominant outcome and moves SVG/project JSON into More Export Options.

Workflow Progress is saved with the project. Restored projects resume at their saved active step unless available project data supports only an earlier step. Review Milestones gate forward navigation and are invalidated only by changes that make their decision stale.

## User Stories

1. As a first-time maker, I want to see one focused upload screen, so that I know how to begin without understanding tracing settings.
2. As a maker, I want Balanced starter tracing selected automatically, so that I can judge a result before choosing advanced presets.
3. As a maker, I want to set the finished height before generation, so that the resulting Template Pack matches my intended cutout size.
4. As a maker, I want project naming to remain optional and visually secondary, so that metadata does not distract from creating the template.
5. As a maker, I want project actions grouped in a File menu, so that New, Open, and Save do not compete with workflow actions.
6. As a maker, I want generation to take me directly to Clean Lines, so that I can immediately review the result.
7. As a maker, I want the artwork canvas to dominate Clean Lines, so that I can inspect and edit feature lines comfortably.
8. As a maker, I want the editor to auto-fit the subject on entry, so that cleanup begins without zooming or panning.
9. As a maker, I want Remove Line selected by default, so that the most common cleanup task is immediately available.
10. As a maker, I want the entire Connected Line Segment highlighted before deletion, so that I understand the full removal scope.
11. As a maker, I want one-click Connected Line Segment removal with Undo, so that cleanup remains fast and reversible.
12. As a maker, I want Add Missing Line to create a normal-width freehand Feature Line, so that the primary drawing interaction is predictable.
13. As an advanced maker, I want smoothing and thickness under More Tools, so that I can refine added lines without cluttering the primary toolbar.
14. As a maker, I want one short instruction that changes with the selected tool, so that I know what clicking or drawing will do.
15. As a maker, I want Show Original available as a primary control, so that I can compare generated lines with the Source Image.
16. As a maker, I want Fit available as a primary control, so that I can recover the intended editor framing at any time.
17. As a maker, I want no more than six primary editor controls visible, so that cleanup does not feel like operating a developer tool.
18. As an advanced maker, I want eraser, smooth curve, brush size, redo, reset, zoom, layers, regeneration presets, blank Trace Studio, and outside-only mode under More Tools, so that existing capabilities remain available without overwhelming the main workflow.
19. As a maker, I want a compact trace-status control, so that I can see cutline quality and page count without a permanent diagnostics panel.
20. As a maker, I want full technical diagnostics only when I open the status drawer, so that warnings remain available without occupying the workspace.
21. As a maker, I want only an invalid or missing Cut Line to block linework approval, so that noncritical warnings do not override my judgment.
22. As a maker, I want one “Looks good — continue to colors” decision, so that I do not have to complete an artificial cleanup checklist.
23. As a maker, I want a line edit after approval to revoke downstream Review Milestones, so that stale approvals are not presented as current.
24. As a maker, I want existing paint selections preserved when linework approval is revoked, so that correcting artwork does not erase useful color work.
25. As a maker, I want Colors to appear only after linework review, so that paint decisions do not distract from template cleanup.
26. As a maker, I want the Colors step to show the actual number of current project colors, so that the UI reflects my palette rather than forcing six rows.
27. As a maker, I want six colors to remain the default extraction target, so that typical projects start with a manageable Reduced Palette.
28. As a maker, I want each color row to emphasize area label, selected paint, and list inclusion, so that it answers the practical shopping questions first.
29. As an advanced maker, I want confidence, merging, custom hex, palette count, and detailed matching controls under Edit Color Details, so that they remain available without dominating review.
30. As a maker, I want Continue to Export to record completed color review, so that the Color Guide is included in my Template Pack.
31. As a maker, I want Skip Paint Guide to be an explicit valid decision, so that paint matching never blocks printing a trace template.
32. As a maker, I want skipping Colors to disable the PDF Color Guide, so that the exported packet matches my decision.
33. As a maker, I want completing Colors later to replace the skipped milestone and enable the Color Guide, so that I can revise that decision.
34. As a maker, I want small paint edits after color approval to update export without revoking approval, so that corrections do not create an approval loop.
35. As a maker, I want Export to show finished dimensions, tile count, assembled preview, and calibration guidance, so that I can verify the physical output before downloading.
36. As a maker, I want Download Printable PDF to be the only primary export action, so that the craft product is unmistakable.
37. As an advanced maker, I want SVG and project JSON under More Export Options, so that secondary formats remain available.
38. As a maker, I want cover-page and Color Guide inclusion controls on Export, so that packet composition is decided where I download it.
39. As a maker, I want a persistent four-step header, so that I always understand my position in the workflow.
40. As a maker, I want completed and current steps to be navigable, so that I can revise earlier work.
41. As a maker, I want locked future steps visible but disabled, so that the workflow is understandable without allowing invalid jumps.
42. As a maker, I want forward advancement to happen through the active screen’s primary action, so that every step has one clear next decision.
43. As a returning maker, I want active step and Review Milestones saved, so that reopening a project returns me to meaningful work.
44. As a returning maker, I want legacy project files to derive the furthest valid step, so that the redesign does not break existing projects.
45. As a returning maker, I want a restored project prevented from resuming beyond available data, so that invalid Workflow Progress cannot expose unusable screens.
46. As a maker, I want changing project name or Finished Size to preserve linework and color milestones, so that metadata and scale corrections do not erase review work.
47. As a maker, I want replacing the Source Image to reset generated analysis and downstream milestones, so that old approvals cannot apply to new artwork.
48. As a desktop maker, I want the canvas to occupy at least 70% of the main content width and 65–75vh, so that line cleanup is the visual focus.
49. As a tablet or mobile maker, I want controls stacked beneath the canvas without fixed side rails, so that the workflow remains usable on narrow screens.
50. As a maker, I want to complete Upload through PDF download without opening More Tools or diagnostics, so that advanced concepts are truly optional.

## Implementation Decisions

- The Guided Workflow is one single-page state machine rather than route-based navigation.
- The active workflow step and Review Milestones are durable project data and participate in autosave and project JSON round trips.
- Restored projects clamp their active step to the furthest valid step supported by project data.
- Legacy projects derive workflow progress from existing Source Image, analysis, cleanup progress, and paint-guide state.
- Forward step transitions occur through the primary action on each screen. The step header navigates only to the current or previously unlocked steps.
- Balanced tracing runs automatically from Upload. Preset selection is unavailable until a result exists and then lives under More Tools.
- Replacing the Source Image resets analysis and downstream milestones. Changing project name or Finished Size preserves linework, colors, and milestones.
- Any mutation to accepted linework revokes linework and Colors milestones and returns the active step to Clean Lines while retaining paint selections.
- Color edits after color review do not revoke the Colors milestone. An explicit restart action may do so.
- Skipping Colors records a distinct skipped outcome and disables the Color Guide in PDF settings. Completing Colors later replaces it with reviewed and re-enables the Color Guide.
- A missing or geometrically invalid Cut Line is the only diagnostic condition that blocks Clean Lines approval.
- Remove Line highlights the entire Connected Line Segment before one-click deletion. Undo is immediately available.
- Add Missing Line is normal-width freehand by default. Smoothing and thickness are More Tools modifiers.
- Clean Lines exposes exactly six primary controls: Remove Line, Add Missing Line, Undo, Show Original, Fit, and Looks Good — Continue to Colors.
- Full trace diagnostics live in an optional drawer opened by a compact status control.
- Paint controls render only in Colors. Export controls render only in Export.
- Download Printable PDF is the sole primary export action. SVG and project JSON are secondary actions under More Export Options.
- Existing outer cutline, editable starter details, manual strokes, paint matching, autosave, project restore, SVG, and PDF behavior must be preserved.
- The current monolithic interface should be decomposed into step-focused UI modules and a small workflow-state module, while established domain modules remain the source of tracing, project, paint, and export behavior.

## Testing Decisions

- The highest test seam is a Playwright workflow test that completes Upload → Clean Lines → Colors → Export without opening advanced controls.
- Playwright coverage verifies one primary action per step, step gating, hidden paint/diagnostic/export controls, Balanced automatic generation, desktop canvas dominance, mobile stacking, and PDF-first export.
- A pure workflow-state test seam verifies valid step derivation, locked-step navigation, milestone completion, line-edit invalidation, color skipping, color-review completion, Source Image replacement, and non-invalidating metadata/size changes.
- Project round-trip tests verify active step and milestone persistence, autosave compatibility, invalid-step clamping, and legacy-project derivation.
- Editor behavior tests verify Connected Line Segment hover preview, one-click removal, Undo, and line-edit milestone invalidation through observable behavior.
- Existing backend, PDF geometry, SVG vector, trace pipeline, paint guide, viewport, TypeScript, and build suites remain regression gates.
- Coraline acceptance runs capture all four steps at 1440×900 and a common mobile viewport, and verify that the main workflow remains usable without More Tools.
- Tests assert user-visible behavior and durable state contracts rather than component structure or private React state.

## Out of Scope

- Changes to tracing algorithms, preset thresholds, contour extraction, detail segmentation, or head-region filtering.
- Changes to PDF geometry, tiling, overlap, calibration, line widths, or vector export behavior.
- New cloud storage, accounts, collaboration, hosting, or installer packaging.
- Removing advanced tracing, editing, paint, SVG, or project-management capabilities.
- Solving the known Coraline head-line connectivity problem algorithmically; this redesign adds removal-scope preview but does not change segmentation.
- Redesigning the paint catalog or replacing deterministic paint matching.

## Further Notes

- The printable Template Pack remains the product’s primary outcome. The reference craft workflow is print, assemble, trace, cut, transfer details, paint, outline, and weatherproof.
- The five existing Coraline acceptance screenshots provide baseline evidence for line quality, underlay visibility, printable linework, and Paint Guide disclosure.
- `main` was nine commits ahead of `origin/main` when this PRD was created. The redesign should begin from the verified local baseline and avoid mixing unrelated repository changes.
