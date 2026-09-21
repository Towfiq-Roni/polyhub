# ADR-0000: Record architecture decisions

**Status:** Accepted
**Date:** 2026-09-06

## Context

Hub has kept a decision log (`docs/memory/DECISIONS.md`) since project start, but
it's a single append-only line per entry — enough to know *what* was decided and
a one-clause *why*, not enough to carry full context, alternatives considered,
or consequences for a decision that later implementation work depends on
heavily. As the project moves from Phase 0 (design) into Phase 1 (real
scaffolding) and beyond, the decisions with the biggest blast radius — stack
choices, data representations, infra topology — deserve a fuller record so a
future contributor (or a future session of this same agent) doesn't have to
reconstruct the reasoning from scattered DEC lines and analysis docs.

## Decision

We will use Michael Nygard's ADR format for architecture-grade decisions,
stored as individual Markdown files in `docs/adr/`, numbered sequentially
(`NNNN-title.md`), each with Status / Context / Decision / Consequences
sections. See `docs/adr/README.md` for the criteria distinguishing an
ADR-worthy decision from a `DECISIONS.md`-only one, and for how superseding
works.

## Consequences

- Every ADR after this one documents one already-made decision retroactively
  (Phase 0 close) or a new one going forward at the point it's made.
- `docs/memory/DECISIONS.md` remains the single append-only chronological
  source of truth for *all* decisions; ADRs are a derived, richer view over the
  architecture-grade subset and must cite the source `DEC-###` or gap ID.
- A decision that gets revisited produces a *new* ADR file that supersedes the
  old one; the old file is never edited beyond its Status line, matching the
  append-only spirit already used for `DECISIONS.md` and `PROGRESS.md`.
