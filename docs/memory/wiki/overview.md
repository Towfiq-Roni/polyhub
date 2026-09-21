---
type: overview
title: Vault Overview
status: developing
created: 2026-09-07
updated: 2026-09-07
tags:
  - overview
---

# Vault Overview

This vault is hub's `docs/memory/` directory, adopted in place (DEC-065): the
live `PROGRESS.md`/`DECISIONS.md` files stay exactly where hub's Session
Protocol expects them, with an Obsidian layer (`wiki/`, `.raw/`, ledgers)
alongside for navigation and provenance.

## What's connected

Tranche 1 (`capture-repo-docs-tranche1` + `ingest-repo-docs-tranche1`, DEC-066)
captured hub's full conceptual/decision doc corpus — requirements & analysis,
all ADRs, validated design docs, and process/workflow docs — as immutable
sources and linked them from [[wiki/index.md|the index]]. See the Sources
section there for the full list, grouped by category.

Not captured in this tranche: the 39 `design/*.html` screens and 38
`docs/designs/claude-design-handoff/screens/*.dc.html` mockups — visual
artifacts without durable textual claims to extract; a design/gap-analysis
pass reads those directly instead of via the vault.

## Compounding this vault

- New decisions land in `docs/memory/DECISIONS.md` as always; a `PostToolUse`
  hook nudges `/claude-obsidian:save` after each edit.
- Re-run `capture plan`/`capture apply` + `wiki-ingest` when a captured source
  drifts from its repo original — captures are immutable, a changed source
  gets a new capture, not an overwrite.
