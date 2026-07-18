# ADR 0002: Permit Explicit AI Linework Proposals

## Status

Accepted

## Context

ADR 0001 keeps the personal template workflow and its print pipeline local.
That remains the default and is sufficient for authored SVG linework, but the
local starter-line extractor does not consistently simplify rendered or
photographic sources into sparse wood-transfer Detail Lines.

The maker may choose to trade the local-only privacy boundary for one optional
proposal. That exception needs to be visible, bounded, and unable to alter the
Cut Line or printable geometry.

## Decision

Allow AI-Assisted Simplification only when local analysis classifies a source
as Needs Simplification and has produced a valid Cut Line.

Before a request, disclose that the Source Image will be uploaded to OpenAI
under its normal retention terms and require confirmation of the exact $0.10
estimate. Send one fixed Wood-Transfer Style request with no automatic retry.
Ready Line Art and the SVG Fast Path remain local.

Treat provider output only as a proposal. Normalize it to preview-sized
transparent black Detail Lines, apply deterministic validation and
`exterior-component-band-24` suppression, and keep it separate from accepted
Detail Lines. The provider has no authority over the source image, subject
mask, Cut Line, Finished Size, tile grid, overlap, calibration, SVG viewBox, or
PDF assembly.

## Consequences

- Personal images stay on the maker's machine unless the maker explicitly
  confirms this one disclosed proposal request.
- A failed or invalid result cannot replace accepted linework and does not
  trigger another paid request.
- Cutout Studio remains responsible for every protected geometry and print
  artifact.
- Maker review and application of a technically valid proposal are separate
  lifecycle work; generation alone does not make a proposal editable or
  exportable.
