# ADR 0006: Use Versioned JSON Character Acceptance Profiles

Each Acceptance Fixture uses one strict, versioned JSON Character Acceptance Profile as the canonical expectation source for Python and Chromium validation; unknown schema versions or assertion types fail rather than being ignored. Profiles use manually authored full-Source-Image normalized regions and semantic relationships, while generated manifests and human records remain separate results, preventing duplicated expectations and silent schema drift at the cost of explicit migrations when the vocabulary changes.
