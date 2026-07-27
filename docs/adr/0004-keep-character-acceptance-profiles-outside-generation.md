# ADR 0004: Keep Character Acceptance Profiles Outside Generation

Character Acceptance Profiles are developer-owned, read-only oracles consumed only by validation and evidence tooling; production analysis, cleanup, SVG, and PDF generation never receive profile coordinates, expected features, or character identity. This preserves a source-general production pipeline and prevents a fixture from passing because its expected answer influenced generation, at the cost of profiles being unable to rescue weak output.
