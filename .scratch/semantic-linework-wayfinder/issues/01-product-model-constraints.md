# Decide product and model constraints

**Status:** resolved
**Label:** wayfinder:grilling
**Parent:** [Semantic boundary-selection wayfinder](../map.md)
**Resolved by:** Human decision supplied 2026-07-13

## Decision

Cutout Studio remains a local-first application. The existing deterministic
Wood Template - Recommended workflow must remain fully usable without any AI
service.

An external AI service may be evaluated for semantic boundary selection, but
only as an optional enhancement with explicit disclosure and a deterministic
fallback.

## Source-image privacy

Source images may leave the local machine only when:

- the user explicitly starts an AI-assisted simplification action
- the interface clearly states that the image will be processed by an external
  service
- the provider contract does not permit using submitted images for model
  training
- the application does not silently upload images during normal tracing,
  previewing, saving, or exporting

The default deterministic workflow remains entirely local.

## Offline operation

Offline operation is required for the existing deterministic workflow.

Offline AI-assisted semantic simplification is optional, not required for the
initial feasibility spike or MVP.

Loss of network access or AI-service failure must fall back to:

- Wood Template - Recommended
- Faithful Artwork
- manual line cleanup

The user must not lose the project or accepted edits.

## External API policy

External APIs are permitted for:

- feasibility research
- a narrow semantic boundary-selection MVP
- provider comparison using the fixed non-sensitive evaluation corpus

The semantic stage must be behind a provider-independent interface so the
implementation is not permanently coupled to one vendor or model.

The external model may select important semantic regions or boundaries, but it
must not control:

- subject mask
- outer cutline geometry
- finished dimensions
- scaling
- tiling
- overlap
- calibration
- SVG/PDF assembly

## Cost constraints

Recommended starting limits:

- target: no more than $0.10 per image
- acceptable for feasibility: up to $0.25 per image
- hard blocker for an MVP: routinely exceeding $0.50 per image

The prototype must record estimated cost per image for every corpus fixture.

Any multi-pass approach must report total cost, not only the cost of one model
call.

## Latency constraints

Recommended starting limits:

- target: 10-30 seconds per image
- acceptable for an MVP: up to 60 seconds
- hard blocker: routinely exceeding 90 seconds

The UI must show progress and allow a failed request to return safely to the
existing deterministic result.

## Local model requirements

A local model may be researched later, but it is not required for the first
prototype.

The production MVP must not require:

- a dedicated GPU
- specialized drivers
- command-line model installation
- mandatory multi-gigabyte model downloads

Optional local-model support may be added later for users who explicitly choose
it.

## Retention and logging

The application must not retain uploaded source images in external logs.

Permitted operational logging:

- provider and model identifier
- model/version information
- request duration
- estimated cost
- success/failure status
- structured error category
- anonymized fixture identifier during evaluation

Do not log:

- source-image bytes
- generated image contents
- project names containing personal information
- prompts containing unnecessary user or project identifiers

Temporary local artifacts may be saved when the user explicitly requests
debugging or acceptance evidence.

## User disclosure

Before the first external AI request, the interface must explain:

- that the image will leave the device
- which provider processes it
- what the model is being asked to produce
- that the deterministic workflow remains available
- whether any per-image cost applies

The user must be able to cancel before upload.

## Hard blockers

The following prevent production use:

- silent image uploads
- provider training on submitted images
- no deterministic fallback
- AI control over cutline or print geometry
- loss of edits when regeneration fails
- mandatory GPU or specialist setup
- routine cost above $0.50 per image
- routine latency above 90 seconds
- inability to identify the model/version used for a result

## Preferences rather than blockers

These are desirable but not required for the initial MVP:

- fully offline semantic simplification
- zero per-image cost
- latency below 10 seconds
- local-model support
- more than one production provider
- automatic provider failover

## Consequence for the feasibility prototype

The prototype may use an external API with only the fixed non-sensitive corpus.

It must:

- use a provider-independent adapter
- record latency and estimated cost
- save model/version metadata
- preserve the deterministic outer cutline and exporters
- save comparable source, semantic output, cleaned linework, SVG, and rendered
  PDF artifacts
- fall back cleanly when the model response is invalid

## Comments

- Resolved from the explicit product constraints supplied by the project owner.
