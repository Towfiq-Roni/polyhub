# Build Spec — Replace `payment-entry.html`'s fake Chart-of-Accounts classifier with the real spec `TransactionCategory` concept

**Source:** DEC-060 (known open gap, blocks Phase 0 sign-off), stakeholder directive 2026-09-07 to fix now.
**Scope:** single file, single batch. `design/payment-entry.html` only — no `styles.css` change needed (reuses existing `.field`/`.select`/`.hint` classes verbatim, zero new CSS).

## Sources read (cite before design decision)

- `docs/memory/DECISIONS.md` DEC-060 — names the exact defect: `CHART_OF_ACCOUNTS` array (`{code, name, type: Asset/Revenue/Liability/Expense}`) driving a "Chart of Accounts (transaction type)" select wired to `state.chartAccountCode`, with no home in hub's real ledger model. DEC-061 confirms the sibling `accounting.html` removal and that this was independently flagged three times (hub-implementer, hub-reviewer, hub-code-reviewer) as a design decision, not a mechanical fix.
- `docs/adr/0005-money-as-integer-poisha.md` — balances are **always computed** (`opening + ΣIN − ΣOUT`); no schema/account-type concept anywhere. Debit/credit account normal-balance has no home here.
- `docs/adr/0006-immutable-ledger-reversals.md` — the real correction primitive is a linked reversal `Transaction` (IN/OUT direction), not a journal-entry debit/credit pair.
- `analysis/requirements-analysis.md:15,53-55` — "not an ERP... no double-entry accounting" is a named non-goal (§2.2, from client spec §30).
- `analysis/requirements-analysis.md:134-136` (entity model table) — **this is the load-bearing find**: the real `Transaction` entity already has a `categoryId` FK to a `TransactionCategory{name (unique), direction (IN/OUT), active}` table, "seeded from spec §11.2." This is a flat category *tag* with a direction, not an account-type/debit-credit taxonomy — structurally exactly what ADR-0005/0006 sanction, and it already has a named home in the entity model. No such entity exists for "chart of accounts."
- `resources/company_management_system_project_overview.md:735-788` (spec §11.2 Transactions) — gives the literal seeded category list:
  - Income: `Client Milestone Payment`, `Other Income`
  - Disbursement: `Team Member Payment`, `BDS Payment`, `Project Cost`, `Office Expense`, `Software`, `Travel`, `Equipment`, `Other Expense`
- `analysis/requirements-analysis.md:290` — Finance Dashboard shows "category breakdown," confirming `TransactionCategory` is the real reporting axis this screen's classifier should feed, not a decorative field.
- `docs/memory/DECISIONS.md` DEC-055 — payment-entry.html is locked at exactly 3 entry-type categories (`project`/`team`/`other`); "Vendor Payment" (i.e. BDS/ad-hoc vendor spend) folds into `other`. This is why the `other` bucket's sub-classifier must expose `BDS Payment` — there is no other screen or button in this form for it.
- Invoked `accountant-expert` skill (finance-touching task per CLAUDE.md routing) — confirms the general accounting distinction: a flat category tag with an IN/OUT direction (single-entry, cash-basis bookkeeping) is a materially different, simpler, and *correct-for-this-system* concept from a chart-of-accounts (double-entry, debit/credit, account-type normal-balance) taxonomy. Since hub's ADRs explicitly forgo double-entry, the account-type model is not just unused scaffolding — it is the wrong model. The category-tag model is both accounting-correct for a single-entry cash ledger and already named in the spec, satisfying CLAUDE.md's Simplicity-First ladder step 2 ("already in this codebase's own spec? use it, don't invent one").

## Decision (candidate chosen, and why the others lose)

**Chosen: candidate (b)** — replace `CHART_OF_ACCOUNTS` with a `TRANSACTION_CATEGORIES` list grounded verbatim in spec §11.2's seeded `TransactionCategory` set, filtered by the form's existing Income/Expense direction toggle, **excluding** `Client Milestone Payment` and `Team Member Payment` (those are the `project`/`team` entry-type buttons already on this form — the `other` bucket only needs the categories that don't already have a dedicated button).

Rejected:
- **(a) drop the classifier entirely, rely on category+free-text:** rejected. `requirements-analysis.md:290`'s Finance Dashboard "category breakdown" and the spec's own seeded `TransactionCategory` table show hub's real design *does* want a structured category axis on every transaction — dropping it would silently regress a real reporting requirement, not just remove an ERP-flavored extra. Free-text description already exists on this form (`descInput`) and stays as-is; it is not a substitute for the structured field the spec defines.
- **(c) something else:** considered inventing a hub-specific category list not tied to §11.2. Rejected — the spec already names the exact list; inventing a different one would itself be an unlogged deviation (same class of problem as the one being fixed).

Net effect: same UI shape (one `<select>` in the same `#otherFields` block, same label position), same amount of code (arguably less — the old `.type` string-matching filter becomes a direct object-key lookup), zero new files, zero new CSS.

## Verified current state (exact strings, `design/payment-entry.html`, confirmed via `Read`/`grep` — line numbers as of this spec's writing, re-grep before editing since line numbers shift after each edit site is applied)

**Site 1 — HTML label + select + hint (currently ~lines 279-283):**
```html
                  <div class="field">
                    <label for="chartAccountSelect">Chart of Accounts (transaction type)</label>
                    <select class="select" id="chartAccountSelect"></select>
                  </div>
                  <p class="hint">Classifies this entry for the books.</p>
```

**Site 2 — JS constant (currently ~lines 396-405):**
```js
    var CHART_OF_ACCOUNTS = [
      { code: '1100', name: 'Accounts Receivable', type: 'Asset' },
      { code: '4000', name: 'Service Revenue', type: 'Revenue' },
      { code: '4100', name: 'Interest Income', type: 'Revenue' },
      { code: '2000', name: 'Accounts Payable', type: 'Liability' },
      { code: '5000', name: 'Salaries Expense', type: 'Expense' },
      { code: '5100', name: 'Office Expense', type: 'Expense' },
      { code: '5200', name: 'BDS Commission Expense', type: 'Expense' },
      { code: '5300', name: 'Marketing Expense', type: 'Expense' }
    ];
```

**Site 3 — state init (currently ~line 440):**
```js
      chartAccountCode: ''
```
(last property in the `state` object literal, no trailing comma — preserve that.)

**Site 4 — render() other-block (currently ~lines 543-550):**
```js
        var chartOptions = CHART_OF_ACCOUNTS.filter(function (a) {
          return state.direction === 'Income' ? (a.type === 'Revenue' || a.type === 'Asset') : (a.type === 'Expense' || a.type === 'Liability');
        });
        var chartSelect = document.getElementById('chartAccountSelect');
        chartSelect.innerHTML = '<option value="">Select an account code…</option>' + chartOptions.map(function (a) {
          return '<option value="' + a.code + '">' + a.code + ' - ' + a.name + '</option>';
        }).join('');
        chartSelect.value = state.chartAccountCode;
```

**Site 5 — change listener (currently ~line 575):**
```js
    document.getElementById('chartAccountSelect').addEventListener('change', function (e) { state.chartAccountCode = e.target.value; });
```

No other file references `CHART_OF_ACCOUNTS`/`chartAccountCode`/`chartAccountSelect` (verified: `grep -rn "CHART_OF_ACCOUNTS\|chartAccountCode\|chartAccountSelect" design/` returns only these 5 sites in `payment-entry.html`, nothing in any other screen).

## Minute breakdown — ONE batch, ONE file (`design/payment-entry.html`)

Execute in this order (top-to-bottom in the file, so no earlier edit shifts a later edit's anchor text — matching by exact string content, not line number, is still mandatory since even same-order edits can drift by a line or two from this spec's snapshot):

1. **Site 1 (HTML).** Replace the block verbatim with:
   ```html
                  <div class="field">
                    <label for="txnCategorySelect">Category</label>
                    <select class="select" id="txnCategorySelect"></select>
                  </div>
                  <p class="hint">Classifies this entry for reporting.</p>
   ```
   Why: `chartAccountSelect`/"Chart of Accounts" is the exact user-facing wording DEC-060 flags; `txnCategorySelect`/"Category" matches the real `Transaction.categoryId` → `TransactionCategory` concept it now drives. Renamed the `id` (not just the label) so the field can never be confused with `state.category` (which already means `project`/`team`/`other` in this same file — a same-named id would be a readability trap for the next implementer).

2. **Site 2 (JS constant).** Replace the `CHART_OF_ACCOUNTS` array with:
   ```js
    // Seeded from spec §11.2 Transaction categories (analysis/requirements-analysis.md:135
    // TransactionCategory{name, direction}). 'Client Milestone Payment' and 'Team Member
    // Payment' are deliberately excluded — those are the Client/Team Payment entry-type
    // buttons above, not part of the "Other" bucket. This is a flat category tag with a
    // direction, not a chart of accounts: hub's ledger has no debit/credit/account-type
    // concept (ADR-0005, ADR-0006). DEC-060 fix.
    var TRANSACTION_CATEGORIES = {
      Income: ['Other Income'],
      Expense: ['BDS Payment', 'Project Cost', 'Office Expense', 'Software', 'Travel', 'Equipment', 'Other Expense']
    };
   ```
   Why: verbatim spec §11.2 category names (byte-for-byte, so a future contributor can grep the spec and find identical strings), keyed by the same `Income`/`Expense` string values `state.direction` already uses elsewhere in this file (`state.direction === 'Income' ? ... : ...` pattern at lines 474-475, 515, 541-542) — no new direction vocabulary introduced.

3. **Site 3 (state init).** Replace `chartAccountCode: ''` with `txnCategory: ''` (same position in the object literal, no trailing comma).

4. **Site 4 (render()).** Replace the 6-line block with:
   ```js
        var categoryOptions = TRANSACTION_CATEGORIES[state.direction] || [];
        if (categoryOptions.indexOf(state.txnCategory) === -1) state.txnCategory = '';
        var categorySelect = document.getElementById('txnCategorySelect');
        categorySelect.innerHTML = '<option value="">Select a category…</option>' + categoryOptions.map(function (c) {
          return '<option value="' + c + '">' + c + '</option>';
        }).join('');
        categorySelect.value = state.txnCategory;
   ```
   Why: direct object-key lookup replaces the old `.type`-string-matching `.filter()` — strictly less code, same behavior shape (recompute options list on every render, keyed off current direction). The added reset line (`if (categoryOptions.indexOf(...) === -1) state.txnCategory = ''`) is a **new correctness fix**, not scope creep: the old code let `chartSelect.value = state.chartAccountCode` silently leave a stale/invalid value selected when switching direction (e.g. pick `5300` under Expense, flip to Income — old code just tried to select a now-absent `<option>`, which silently no-ops and leaves the select's *displayed* value as whatever the browser defaults to, while `state.chartAccountCode` still held the stale code). This one-line guard is required for the field to be honest about its own state after a direction flip; leaving out was the DEC-060 gap's associated bug, not a separate feature. Still zero new files/CSS.

5. **Site 5 (listener).** Replace with:
   ```js
    document.getElementById('txnCategorySelect').addEventListener('change', function (e) { state.txnCategory = e.target.value; });
   ```

Do not touch: `submitPaymentEntry()` (lines ~619-657) — it never referenced `chartAccountCode`, so it needs no change; the summary-line text stays exactly as it is today (out of scope — DEC-060 is about the classifier field, not the submit summary's wording). Do not touch `styles.css` — no new classes needed, `.field`/`.select`/`.hint` are reused as-is.

## Trust boundaries / accessibility surface touched

- No trust boundary or money path: this is static design markup, no backend, no real ledger write. (Same posture as the sibling DEC-061 fix — restores model correctness, doesn't introduce risk.)
- Accessibility: the `<label for="...">`/`<select id="...">` pairing must stay matched after the id rename (Site 1) — a mismatched `for`/`id` pair is a real a11y regression (label click no longer focuses the select, screen readers lose the accessible name). This is the one accessibility-sensitive line in this spec.

## Regression surface

- Nothing else in `payment-entry.html` reads `state.chartAccountCode`/`CHART_OF_ACCOUNTS`/`chartAccountSelect` (confirmed by the grep above) — no other render branch, submit path, or summary string depends on this field.
- The `project`/`team` entry-type buttons and their fields (`#projectFields`, `#teamFields`, milestone/team-member selects, counterparty account section) are untouched — must still render identically before/after (regression check: click `Client Payment` and `Team Payment`, confirm no visual/behavioral change).
- The Cash-only gating (`isCash` hides `#entryTypeSection`/`#accountsSection`/`#txnIdField`) is untouched.
- `design/accounts.html` / `design/transactions.html` (the real ledger screens) are not touched at all — confirms this fix stays scoped to the one screen DEC-060 named.

## DoD Gates

### Static gates (hub-reviewer — exact grep/diff commands)

- **S1:** `grep -c "CHART_OF_ACCOUNTS" design/payment-entry.html` → `0`.
- **S2:** `grep -c "chartAccountCode\|chartAccountSelect" design/payment-entry.html` → `0`.
- **S3:** `grep -c "Chart of Accounts" design/payment-entry.html` → `0` (label text fully gone).
- **S4:** `grep -c "TRANSACTION_CATEGORIES" design/payment-entry.html` → `≥3` (one definition + at least the `TRANSACTION_CATEGORIES[state.direction]` lookup use + no stray second definition — exact count depends on final code, assert non-zero and exactly one `var TRANSACTION_CATEGORIES = {` definition line).
- **S5:** `grep -c "'Client Milestone Payment'\|'Team Member Payment'" design/payment-entry.html` → `0` (confirms the two excluded categories never appear literally in this file — they must not leak in via a copy-paste of the full spec list).
- **S6:** `grep -c "'BDS Payment'" design/payment-entry.html` → `1` (confirms BDS/vendor spend stays reachable through the `other` bucket per DEC-055's "Vendor Payment folds into Other").
- **S7:** `grep -c 'for="txnCategorySelect"' design/payment-entry.html` → `1` and `grep -c 'id="txnCategorySelect"' design/payment-entry.html` → `1` (label/select id pairing intact, a11y gate).
- **S8:** `git diff --stat -- design/` shows exactly one file changed: `design/payment-entry.html` (no `styles.css`, no other screen touched).
- **S9:** `node --check` equivalent — extract the `<script>` body and confirm no JS syntax error (matches the precedent set in the DEC-061 batch's own gates, since this repo has no build tooling yet to lint against).

### Empirical gates (hub-tester — browser-checkable, Playwright, exact steps + expected values)

- **E1 (Expense category set):** Open `payment-entry.html`. Click `Money Out` (direction=Expense), then click `Other` (entry-type). Read `#txnCategorySelect option` texts. Expect exactly 8 `<option>` elements: 1 placeholder (`Select a category…`, value `""`) + 7 named options in this exact order: `BDS Payment`, `Project Cost`, `Office Expense`, `Software`, `Travel`, `Equipment`, `Other Expense`.
- **E2 (Income category set):** With `Other` still active, click `Money In` (direction=Income). Read `#txnCategorySelect option` texts. Expect exactly 2 `<option>` elements: placeholder + `Other Income`. Confirm the selected value resets to `""` (not left on a stale Expense-side value) — this proves Site 4's reset guard works.
- **E3 (selection round-trip):** Under Expense+Other, select `Software` from `#txnCategorySelect`. Confirm `document.getElementById('txnCategorySelect').value === 'Software'` after the `change` event fires (proves the listener writes `state.txnCategory` and the next `render()` doesn't clobber a still-valid selection — type something in the Description field afterward, an unrelated re-render trigger if one exists, and confirm the category selection survives).
- **E4 (direction-flip clears stale selection):** Continue from E3 (Software selected under Expense). Click `Money In`. Confirm `#txnCategorySelect`'s selected value is `""` (placeholder) — not still showing `Software` as a phantom selected `<option>` that no longer exists in the DOM. Click `Money Out` again — confirm the select is back to the placeholder (not silently restored to `Software`; the state was actually cleared, not just hidden).
- **E5 (project/team unaffected — regression):** Click `Client Payment` (category=project). Confirm `#projectFields` is visible, `#otherFields` is hidden, `#txnCategorySelect` is not present/visible on screen. Click `Team Payment`. Confirm `#teamFields` visible, same `#otherFields` hidden. This proves the fix didn't disturb the other two entry-type branches.
- **E6 (no console errors):** Across all of E1-E5's interactions, 0 browser console errors/warnings.
- **E7 (label a11y):** Click directly on the "Category" `<label>` text (not the `<select>` itself) while `Other` is active — confirm it focuses `#txnCategorySelect` (proves `for`/`id` pairing from S7 actually works at runtime, not just textually matched).

### Gatekeeper criteria (standalone re-audit — map to authoritative sources)

- Conforms to `docs/adr/0005-money-as-integer-poisha.md` — no account-type/debit-credit taxonomy exists anywhere in `design/payment-entry.html` post-fix (verify via the same S1-S3 greps independently).
- Conforms to `docs/adr/0006-immutable-ledger-reversals.md` — no journal-entry/chart-of-accounts concept reintroduced.
- Conforms to `analysis/requirements-analysis.md:134-136` (entity model) — the classifier's option values are a subset of the spec's own named `TransactionCategory` seed list, not an invented list (verify the 8 category strings used exactly match spec §11.2's wording, case and spacing).
- Conforms to `resources/company_management_system_project_overview.md:768-788` (spec §11.2 Categories) — same check, against the primary client-spec source directly.
- Conforms to DEC-055 (exactly 3 entry-type categories, Vendor Payment folds into Other) — confirms the entry-type buttons (`project`/`team`/`other`) are unchanged in count/wiring, and `BDS Payment` remains reachable only via the `other` bucket's category sub-select, not as a 4th button.
- Closes DEC-060 — the gatekeeper's re-audit should find the named defect (`CHART_OF_ACCOUNTS`, `chartAccountCode`, "Chart of Accounts (transaction type)") fully absent, with no analogous replacement debit/credit concept introduced elsewhere in the same file.
- **Not this spec's job, flagged for whoever closes the task:** a `DECISIONS.md` append recording this fix (closing DEC-060) is an orchestrator/implementer responsibility post-gate-PASS, per CLAUDE.md's memory-update protocol — this spec does not write that entry (hub-planner has no `Edit` and only writes its own spec + one `RUNLOG.md` line).

## Explicit non-scope (surgical-change guard)

- Do not touch `submitPaymentEntry()`'s summary-line text or `#descInput` placeholder logic beyond what Site 4 already changes (nothing there references the category field today).
- Do not add validation/required-field error text for the new category select — it was optional before (no error state existed for `chartAccountCode`) and stays optional now; adding a new required-field rule would be a business-rule scope expansion DEC-060 never asked for.
- Do not touch `design/styles.css` — no new classes needed.
- Do not touch any other `design/*.html` file — the classifier is unique to `payment-entry.html`.
- Do not rename `state.category` (project/team/other) — only the new `state.txnCategory` is introduced; the two must stay visually/semantically distinct in the code (this is why Site 1/3/4/5 all use `txnCategory`/`txnCategorySelect`, never bare `category`).
