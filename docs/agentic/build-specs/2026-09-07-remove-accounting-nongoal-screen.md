# Build Spec — Remove `design/accounting.html` (non-goal violation) + strip all references

**Source:** hub-gatekeeper Phase 0 re-validation, verdict REROUTE, 2026-09-07.
**Planner verification:** confirmed independently (see Sources Cited) — gatekeeper finding is correct.

## Sources cited (read before touching anything)

- `analysis/requirements-analysis.md:15` — "It is explicitly **not an ERP**: no payroll engine, no automatic payments, no double-entry accounting, no task management."
- `analysis/requirements-analysis.md:53-55` (§2.2 Explicit non-goals, from spec §30) — lists "double-entry bookkeeping" verbatim as an out-of-scope item.
- `resources/company_management_system_project_overview.md:1687` — "Full accounting / double-entry bookkeeping" listed as an explicit non-goal in the client spec itself.
- `docs/adr/0005-money-as-integer-poisha.md` — the ONLY sanctioned money model: integer poisha, `balance = opening + ΣIN − ΣOUT`, computed at read time. No chart-of-accounts / debit-credit model exists anywhere in the ADR set.
- `docs/adr/0006-immutable-ledger-reversals.md` — the real ledger correction mechanism is a linked reversal Transaction (`refType='REVERSAL'`), not a debit/credit journal entry. `accounting.html`'s Journal Entries / Trial Balance screens have no counterpart in this model.
- `analysis/requirements-analysis.md` §5 entity model (Account, Transaction with IN/OUT direction) — `accounting.html`'s Chart of Accounts / Journal / Trial Balance concepts (accounts as debit/credit ledger heads) do not map to any entity here.
- `design/roles.html` real `resource.action` RBAC catalog (lines ~285-314): confirmed zero `accounting.*` permission key exists anywhere in the catalog (only `finance.read`, `transactions.create`, `payments.create`, etc.) — the screen was never wired into the access model it sits beside in its own sidebar.
- Cross-checked `analysis/task-breakdown.md`, `docs/memory/PROGRESS.md`, `docs/memory/DECISIONS.md` for any adopted-deviation entry mentioning "accounting" — **zero hits**. No default in `requirement-gaps.md` covers it either. Confirms: never in the required screen inventory, never logged as a deviation. Removal is correct, not merely plausible.

**Conclusion:** `design/accounting.html` is an unauthorized scope addition that contradicts a named non-goal in two authoritative sources and has no home in the real ledger model or the RBAC catalog. Remove it and every reference to it.

## Objective

Delete `design/accounting.html` and remove every reference to it (sidebar nav-item on every screen that has one, the screen registry card on `design/index.html`, and the search index entry in `design/shell.js`), leaving the other 32 screens' sidebar/registry/search markup byte-identical except for the one deleted block each, and preserving the canonical `.app-shell`/`.sidebar`/exactly-one-`.nav-item.active` invariant (DEC-039/040) on every screen.

## Verified scope (planner ran the greps hub-implementer would otherwise have to run one-by-one — stated here so no per-file discovery is needed)

`design/*.html` total: 33 files. Breakdown of exactly what references `accounting.html` and how:

**A. File to delete (1):**
- `design/accounting.html` — the whole file (double-entry module: Chart of Accounts → Journal Entries → Account Ledger → Trial Balance).

**B. Sidebar nav-item strip — 30 files, byte-identical 4-line block at line 107 in every one of them (verified via `md5sum` across all 30 — single hash, confirmed identical):**
```
        <a class="nav-item" href="accounting.html" data-label="Accounting">
          <svg class="nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16v16H4z"></path><path d="M4 9h16M9 4v16"></path></svg>
          <span class="nav-item-label">Accounting</span>
        </a>
```
Files (all currently line 107-110, immediately after the Project Costs `</a>` and immediately before the Finance `nav-group` closing `</div>`):
`app-shell.html, teams.html, payables.html, finance-dashboard.html, roles.html, audit-logs.html, opportunity-detail.html, users.html, dashboard.html, transactions.html, clients.html, payment-entry.html, project-costs.html, deliverable-detail.html, project-detail.html, opportunities.html, team-member-detail.html, projects.html, milestone-detail.html, team-members.html, settings.html, receivables.html, profile.html, client-detail.html, bds-partners.html, accounts.html, project-milestones.html, bds-partner-detail.html, reports.html, leads.html`

(`design/login.html` has no sidebar at all — correctly has zero references, do not touch it. `design/index.html` and `design/shell.js` have references but in different markup shapes — see C/D.)

**C. Registry card strip — `design/index.html` only, lines 183-186 (exact block, immediately after the Project Costs screen-card, immediately before the Finance card's closing `</div></div>`):**
```
          <a class="screen-card" href="accounting.html">
            <div class="screen-name">Accounting</div>
            <div class="screen-desc">accounting.html - chart of accounts, journal, ledger, trial balance</div>
          </a>
```

**D. Search index strip — `design/shell.js` only, one line inside the `SEARCH_INDEX` array (between the `Accounts`/`accounts.html` entry and the `Reports`/`reports.html` entry — do NOT touch the `Accounts` line, it is a different, kept screen):**
```
    { name: 'Accounting', type: 'Page', href: 'accounting.html' },
```

No other file in `design/` references `accounting.html` (verified: `grep -rli accounting design/` returns exactly the 33 files above, nothing else). No CSS in `design/styles.css` is accounting-specific (verified: zero hits for `journal|trial-balance|coa-|chart-of-accounts|debit|credit`) — the screen reused shared table/card classes, so no orphaned CSS cleanup is needed.

## Batching decision

**One batch, script-driven, not manual ≤3-file batches.** Justification (DEC-038 exception, same reasoning as DEC-044's "orchestrator/implementer script normalization"):
- This is one exact, identical, mechanical edit (delete a fixed literal block) applied to 30 files where the block is already verified byte-identical and at the same line number in every file — there is no per-file judgment call, no bespoke content difference to reason about. DEC-038's 3-file cap exists to stop subagents stalling on *heterogeneous* multi-file work requiring per-file reasoning; this is the opposite shape.
- Manually chunking 32 mechanically-identical file edits into ~11 delegated batches multiplies delegation/audit overhead for zero risk reduction, and each batch would still need the identical verification query re-run — the single-script + single-verification-pass is strictly safer (one script to review, not eleven).
- The two markup-shape-different edits (`index.html` registry card, `shell.js` search entry) and the file deletion are simple enough to fold into the same script (three separate, explicit, narrowly-scoped operations) without adding risk.

**Still ≤3 *logical* operations, executed as one script, in this order (each independently verifiable):**
1. Delete `design/accounting.html`.
2. For each of the 30 files in list B: remove the exact 4-line block above. Implementation MUST match on the literal block text (e.g. a `perl -0777 -pi -e` multi-line regex anchored on `<a class="nav-item" href="accounting.html" data-label="Accounting">` through the following `</a>`, or equivalent line-range delete *after* re-confirming the block still starts at the expected line — do not blindly trust "line 107" without re-grepping first, in case the implementer's environment reflows something). Do not touch any other line in these files.
3. For `design/index.html`: remove the exact 3-line-content block in C (the `<a class="screen-card" href="accounting.html">...</a>` element). For `design/shell.js`: remove the exact one line in D. Do not touch the `Accounts`/`accounts.html` entries in either file — they are a different, kept screen.

## Trust boundaries / accessibility surface touched

- No trust boundary or money path is touched — this is static design markup, no backend, no auth, no ledger code. (Confirmed via `accountant-expert`-lens read of the ADRs above: the removal *restores* correctness by deleting a parallel financial model that had zero correspondence to the real integer-poisha/computed-balance ledger — it does not introduce any accounting risk.)
- Accessibility surface: each nav-item strip removes one `<a>` from a `role`-less nav list; must not disturb the remaining `aria-current="page"` / `.nav-item.active` single-active-item invariant on any screen (DEC-039/040). Verify per-file post-edit, not just aggregate.

## Regression surface

- All 30 sidebar-bearing screens' Finance nav-group (5 remaining items: Transactions, Receivables, Payables, Payment Entry, Project Costs) — must render with no gap/broken spacing after removing the 6th item.
- `design/index.html`'s Finance registry card (same 5 remaining screen-cards).
- `design/shell.js`'s global search dropdown — must still find `Accounts`/`accounts.html`, must no longer surface `Accounting`.
- `design/accounts.html` and `design/transactions.html` (the REAL ledger screens, per ADR-0005/0006) are only touched for their own sidebar nav-item strip (they are in list B) — no other content on them changes. This is the regression check that most directly proves the real ledger model wasn't collaterally damaged.
- `design/roles.html`'s RBAC catalog markup (lines ~285-314) is untouched — only its own sidebar nav-item (list B) is stripped.

## DoD Gates

### Static gates (hub-reviewer — grep/diff-able, exact commands)

- **S1 (file gone):** `test ! -e design/accounting.html` exits 0.
- **S2 (zero references anywhere):** `grep -rli accounting design/` returns empty (no file at all, case-insensitive, across every file in `design/`).
- **S3 (scoped diff, no collateral edits):** for each of the 30 files in list B, `git diff -- design/<file>.html` shows exactly 4 removed lines and 0 added lines (a pure 4-line deletion, nothing else changed). Same check for `design/index.html` (4 removed lines: the `<a>` open, 2 `<div>`s, `</a>` close — 0 added) and `design/shell.js` (1 removed line, 0 added).
- **S4 (canonical shell preserved, DEC-039/040):** for each of the 30 files in list B, exactly one occurrence of `class="nav-item active"` (or `class="nav-item nav-item--active"` — match whatever the existing per-file active-class convention already is; do not introduce a new one) remains, and `.app-shell` / `.sidebar` container classes are unchanged (`grep -c 'class="app-shell' design/<file>.html` == 1, unchanged from pre-edit).
- **S5 (file count):** `ls design/*.html | wc -l` == 32 (was 33, minus the one deletion).
- **S6 (no orphaned RBAC key introduced or left):** `grep -n "accounting\." design/roles.html` returns empty (confirms no `accounting.*` permission key exists — should already be true pre- and post-edit, gate exists to prove the deviation never got quietly "fixed" by adding the key instead of removing the screen).

### Empirical gates (hub-tester — browser-checkable, exact steps + expected values)

- **E1:** Open `design/index.html` in browser. In the Finance card, count `.screen-card` children: expect exactly 5 (Accounts, Transactions, Receivables, Payables, Payment Entry, Project Costs — wait, confirm actual pre-existing set minus Accounting is the correct remaining count from the real markup, not asserted here from memory) with no "Accounting" text/link anywhere on the page (`page.locator('a[href="accounting.html"]').count()` === 0). No visual gap/misalignment in the card grid (screenshot diff or bounding-box check against an adjacent unmodified card, e.g. CRM card, for consistent row height).
- **E2:** Open `design/leads.html` (or any one of the 30 list-B screens). In the sidebar Finance nav-group, confirm no element with `href="accounting.html"` exists, and the group's last item is "Project Costs" with normal spacing (no leftover empty `<a>`/margin gap versus e.g. `design/dashboard.html`'s Finance group for comparison).
- **E3:** On 3 sampled screens (`dashboard.html`, `transactions.html`, `roles.html`), confirm exactly one element matches `.nav-item.active` (or the file's real active-class selector) and it has `aria-current="page"` — proves DEC-039/040's canonical-shell invariant survived the edit.
- **E4:** Navigate to `design/accounting.html` directly in the browser — confirm a load failure (file-not-found), proving the file is actually deleted from disk, not merely unlinked.
- **E5:** On any screen, focus the topbar search input and type "Account". Confirm the dropdown shows a result for "Accounts" (`href="accounts.html"`) and does NOT show "Accounting" — proves `shell.js`'s `SEARCH_INDEX` edit removed only the intended line.
- **E6:** Click every remaining sidebar `.nav-item` on one screen (e.g. `leads.html`) via the SPA router (per `shell.js`'s local-link interception) — confirm 0 console errors and no request/navigation to `accounting.html`.

### Gatekeeper criteria (standalone re-audit — map to authoritative sources)

- Conforms to `analysis/requirements-analysis.md:15,53-55` (§2.2 non-goals) — no double-entry bookkeeping screen exists anywhere in `design/`.
- Conforms to `resources/company_management_system_project_overview.md:1687` — same non-goal, client spec source.
- Conforms to `docs/adr/0005-money-as-integer-poisha.md` and `docs/adr/0006-immutable-ledger-reversals.md` — the only financial model surviving in `design/` is Account+Transaction/IN-OUT/computed-balance (verify `design/accounts.html` and `design/transactions.html` still express this model, untouched apart from their own nav-item strip).
- Conforms to DEC-039/DEC-040 canonical shell invariant (`.app-shell`/`.sidebar`/exactly-one-`.nav-item.active` per screen) — re-verified across all 32 remaining screens, not just the touched 30.
- Conforms to CLAUDE.md guardrail "spec deviations are only legitimate if logged in `requirement-gaps.md` defaults or `DECISIONS.md`" — confirms no such log entry existed for this screen (already checked by planner above) and none should be retroactively added to justify keeping it; the correct log entry is this spec + the RUNLOG line recording the removal, plus a `DECISIONS.md` entry after this build lands (hub-implementer/orchestrator responsibility post-build, not this spec's job to write).

## Explicit non-scope (do not do these — surgical-change guard)

- Do not touch `design/accounts.html` or `design/transactions.html` content beyond their own list-B nav-item strip — they are the real, correct ledger screens.
- Do not add an `accounting.*` RBAC key to `design/roles.html` to "fix" the RBAC gap — the fix is removal, not integration.
- Do not fix the account-code-5000-no-name bug at the old `accounting.html:319-322` — moot, the whole file is deleted.
- Do not touch `design/login.html` — it has zero references and no sidebar.
- Do not renumber, reflow, or reformat any surrounding markup beyond the exact blocks specified in B/C/D.
