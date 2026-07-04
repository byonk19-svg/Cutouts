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

### Paint Region

An interior area of the cutout that receives a specific paint color. Paint regions are useful for guidance, but they are secondary to producing a reliable cut line in the first version.

### Budget Craft Paint

Affordable, commonly available acrylic craft paint suitable for wood cutout projects. The first version should match colors against an editable catalog of budget craft paints rather than one store's inventory.

### Paint Match

A ranked recommendation that maps an extracted image color to budget craft paint options. The first version should show multiple close options because store inventory and image color accuracy can vary.

### Reduced Palette

The small set of representative colors extracted from a source image for painting. The first version should default to about six colors and allow the maker to adjust the count.

### Detail Line

An optional interior line printed on the template to help trace paint boundaries or character details. Detail lines can be shown or hidden because too many extracted image edges can make a template harder to use.

### Source Image

The image provided by the maker as the basis for a cutout template. In the first version, a source image is expected to contain one clear subject on a simple background.

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

A workflow where the maker imports one source image, adjusts template settings, exports a PDF, and does not save an editable project file for later sessions.
