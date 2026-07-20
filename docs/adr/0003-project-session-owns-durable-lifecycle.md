# ADR 0003: Project Session Owns the Durable Lifecycle

## Status

Accepted

## Context

Durable project changes are currently spread across React state setters, effects, event handlers, and small lifecycle modules. Preservation rules, Review Milestone invalidation, asynchronous failure behavior, and Project Capabilities can therefore diverge between the displayed controls and the action handlers.

## Decision

Use one deep, in-process Project Session module as the sole write authority for durable project state and the transient lifecycle facts that affect Project Capabilities. Its small interface accepts named maker actions and exposes the resulting project state and Project Capabilities. Each action produces one atomic Project Transition; asynchronous results may commit only when their originating Project Revision remains current. A Project File serializes only the durable subset of the session.

The module owns lifecycle policy but not browser, storage, local-backend, or download mechanics. Those mechanics remain in adapters at the seam and return validated outcomes to the Project Session. React is a view adapter: it renders project state, requests actions, and owns only transient presentation state. Editor Transactions remain a separate runtime-only module and are not serialized.

The migration must preserve the existing saved-project schema, Guided Workflow behavior, protected geometry, paint work, accepted Detail Lines, Feature Lines, PDF output, and explicit AI proposal rules. It proceeds incrementally, replacing direct durable setters with Project Session actions rather than rewriting the interface at once.

## Consequences

- Tests exercise lifecycle behavior through the Project Session interface and assert observable outcomes rather than internal helpers.
- Production and in-memory adapters justify the external-effect seams.
- Failed preparation leaves the current project unchanged; Autosave failure reports persistence health without rolling back work.
- Existing browser coverage remains responsible for the real view and adapter integration.

## Considered Options

Keeping independent React setters was rejected because lifecycle knowledge would continue leaking across callers. Moving browser and network mechanics inside the Project Session was rejected because it would reduce testability and make the interface depend on environment-specific effects.
