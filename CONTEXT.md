# Cutout Template Generator Context

## Glossary

### Personal Workflow

The first product boundary: a workflow for creating printable wood cutout templates for the maker's own use. It does not include Etsy listing preparation, buyer support, commercial licensing, or marketplace packaging.

### Template Pack

A printable output bundle that helps a maker transfer an image to wood and paint it. A template pack may contain tiled outline pages, assembly guidance, and a paint color guide.

### Print Pipeline

The first implementation milestone for turning one source image into printable trace pages. It includes cut line extraction, finished-size scaling, US-letter tiling, page numbers, overlap guides, calibration, and PDF export.

### Cut Line

The full-size outer silhouette that the maker traces onto wood and cuts with a jigsaw. The cut line is the highest-priority artifact because it determines whether the physical cutout works.

A missing or geometrically invalid Cut Line is the only trace-quality condition that blocks the maker from completing Clean Lines. Other diagnostic warnings inform visual review but do not prevent the maker from accepting manually corrected linework.

### Paint Region

An interior area of the cutout that receives a specific paint color. Paint regions are useful for guidance, but they are secondary to producing a reliable cut line in the first version.

### Budget Craft Paint

Affordable, commonly available acrylic craft paint suitable for wood cutout projects. The first version should match colors against an editable catalog of budget craft paints rather than one store's inventory.

### Paint Match

A ranked recommendation that maps an extracted image color to budget craft paint options. The first version should show multiple close options because store inventory and image color accuracy can vary.

### Reduced Palette

The small set of representative colors extracted from a source image for painting. Extraction defaults to six colors, while the Colors step displays the project's actual current color count. Palette-size adjustment is an advanced color-detail control.

### Detail Line

An optional interior line printed on the template to help trace paint boundaries or character details. Detail lines can be shown or hidden because too many extracted image edges can make a template harder to use.

### Clean Template Editor

The manual cleanup step after automatic tracing. The editor locks the outer cut line and lets the maker erase or draw only the interior detail layer before exporting the tiled PDF. This exists because Etsy-style craft templates are cleaned-up line art, not raw automatic image traces.

### Feature Line

A deliberate interior line that helps the maker transfer important character features such as eyes, mouth, clothing seams, hands, boots, hair outline, or accessories. Feature lines are separate from paint-region boundaries and should remain black-and-white on trace pages.

The primary Add Missing Line action creates a normal-width freehand Feature Line. Smoothing and thickness are optional modifiers exposed through More Tools rather than separate primary workflow modes.

### Connected Line Segment

The complete contiguous group of detail-line pixels affected by the Remove Line tool. Before deletion, the editor highlights the entire Connected Line Segment under the pointer so the maker can see the full removal scope. Removal is one click and remains reversible through Undo.

### Source Image

The image provided by the maker as the basis for a cutout template. In the first version, a source image is expected to contain one clear subject on a simple background.

Replacing the Source Image resets generated analysis and every downstream Review Milestone. Changing project name or Finished Size does not change image geometry, so it preserves cleaned linework, paint selections, and completed milestones.

### Removable Background

A transparent, white, or simple background that can be separated from the subject using deterministic image-processing settings such as thresholding.

### Cut Line Cleanup

The manual adjustment step after automatic silhouette extraction. Cleanup allows the maker to correct thresholding, smoothing, small specks, holes, or other issues before generating printable pages.

### Cleanup Setting

A deterministic control used to adjust the generated cut line without freehand drawing. First-version cleanup settings include thresholding, smoothing, speck removal, hole filling, detail-line visibility, and finished size.

### Finished Size

The intended real-world height or width of the completed wood cutout, measured in inches. Printable templates must preserve this scale when tiled across paper.

### Tiled Template

A full-size template split across US letter pages for home printing. In the first version, tiled templates include page numbers, overlap guides, and a calibration mark so printed scale can be checked.

### Trace Page

A black-and-white printable page used for transferring the cut line and selected detail lines to wood. Trace pages should remain visually clean and separate from color reference material.

### Color Guide

A reference page that shows the reduced palette, paint matches, and a color version of the project for painting guidance.

### Overview Page

An instruction and summary page included with a template pack. It shows the project preview, finished size, print-at-100-percent warning, calibration mark, page count, and paint guide summary.

### Local Web App

A browser-based app that runs on the maker's Windows machine for personal use. The first version should process local image files and export printable PDFs without requiring accounts, hosting, or cloud uploads.

### Local Backend

A local process that supports the browser app by performing image processing, PDF generation, and paint catalog work on the maker's machine.

### Developer-Run Tool

A first-version app that is started with local development commands by the maker or developer. It is not packaged as a consumer installer.

### Single-Session Workflow

A legacy workflow assumption where the maker imports one source image, adjusts template settings, and exports a PDF in one sitting. Cutout Studio now supports autosave and editable project files, so new workflow design must preserve progress across sessions.

### Guided Workflow

The primary four-step product journey: Upload, Clean Lines, Colors, and Export. Only the active step exposes its working controls. Earlier steps remain available for backward navigation, while later steps remain gated by durable review milestones.

The Guided Workflow is a single-page state machine, not a set of routes. Image data, editor history, paint selections, autosave, and project restoration remain inside one project state boundary while the active step determines which workspace is visible.

Its step header allows navigation to the current step and previously unlocked steps. Locked future steps remain visible but disabled. Advancement to the next step happens through the active screen's primary action after its Review Milestone is satisfied.

### Workflow Progress

The durable project state that records the maker's last active guided-workflow step and completed review milestones. When a project is restored, Cutout Studio resumes at the saved step unless required project data only supports an earlier step. Legacy projects derive the furthest valid step from their existing analysis, linework-review, and color-review data.

### Review Milestone

A durable decision that allows the maker to advance in the Guided Workflow. Reviewing linework unlocks Colors; reviewing or explicitly skipping Colors unlocks Export. Editing linework revokes the linework and color review milestones and returns the project to Clean Lines, while preserving existing paint selections for later reuse.

Color edits made after the Colors milestone update the project and exported paint guide without revoking that milestone. The maker may explicitly restart color review when they want the workflow to require another color decision.

Skipping Colors records an explicit skipped milestone and disables the Color Guide in the exported Template Pack. Completing color review later replaces the skipped milestone and enables the Color Guide again.
