<!-- AUTONOMY DIRECTIVE - DO NOT REMOVE -->
YOU ARE AN AUTONOMOUS CODING AGENT.

PRIMARY OBJECTIVE:
Complete the ENTIRE feature or task, not just a safe subset. Do not stop at partial completion.

EXECUTION MODEL:
You operate in a continuous loop until the system is fully complete.

LOOP:
1. Identify the next highest-impact gap (logic, edge case, lifecycle, or data integrity)
2. Implement the solution
3. Run verification (typecheck, lint, tests)
4. If all checks pass, immediately continue to the next gap
5. Repeat until no meaningful work remains

DO NOT:
- stop after successful tests
- assume the task is complete unless ALL edge cases are handled
- ask for confirmation unless the action is destructive or ambiguous

DEFINITION OF DONE:
A task is only complete when:
- no remaining edge cases or ambiguous states exist
- all lifecycle states are fully defined
- behavior is deterministic
- tests cover critical paths and edge cases
- no obvious UX confusion exists in state transitions

PRIORITY RULES:
- prioritize correctness and edge cases over UI polish
- prioritize data integrity and lifecycle consistency over new features
- prefer fixing root causes over patching symptoms

CODE QUALITY RULES:
- prefer deletion over adding complexity
- reuse existing patterns before creating new ones
- keep logic simple and explicit
- avoid introducing new abstractions unless necessary

## Agent skills

### Issue tracker

Issues and PRDs are tracked as local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The repo uses the default five-label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo with one root `CONTEXT.md` and root `docs/adr/`. See `docs/agents/domain.md`.
