# ADR 0001: Build V1 As A Local Developer-Run Web App

## Status

Accepted

## Context

The first version of the cutout template generator is for the maker's personal workflow. It must turn one source image into a reliable printable template pack: extract a cut line, scale it to a finished size, tile it across US letter pages, and export a PDF.

Image processing and PDF generation are central to the workflow. A browser-only implementation would reduce setup, but would make robust image processing, PDF rendering, and later paint catalog work harder. A hosted app would add accounts, uploads, privacy questions, and deployment concerns before the physical print workflow is proven.

## Decision

Build v1 as a local web app with a local backend process. The browser provides the interface; the backend performs image processing, PDF generation, and paint catalog work. The app is started with local development commands and is not packaged as a consumer installer in v1.

## Consequences

- The print pipeline can use mature server-side image and PDF libraries.
- Personal images stay on the maker's machine.
- Setup can assume developer-run local commands during early iteration.
- Browser-only portability and installer packaging are deferred until the workflow proves useful on real cutouts.
