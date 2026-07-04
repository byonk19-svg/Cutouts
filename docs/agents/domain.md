# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout

This repo uses a single-context domain layout:

- `CONTEXT.md` at the repo root
- `docs/adr/` at the repo root

## Before Exploring

Read `CONTEXT.md` and any relevant ADRs under `docs/adr/`. If either does not exist, proceed silently.

## Use The Glossary's Vocabulary

When output names a domain concept, use the term as defined in `CONTEXT.md`. If the needed concept is missing, update the glossary through domain modeling rather than drifting to synonyms.

## Flag ADR Conflicts

If output contradicts an existing ADR, surface it explicitly rather than silently overriding it.
