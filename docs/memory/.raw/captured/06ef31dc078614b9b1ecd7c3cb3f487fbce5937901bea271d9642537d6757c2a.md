# REQ-32: Design Restrictions, Universal Export, Error Clarity, Loop-Guardian

Source: /req "I think it's stuck. Before continuing there should be some restrictions for design. And, if any agent is stuck loop guardian should also look into that. And, there should be downloadable reports for every single thing. There should be choices for export. Excel, CSV and PDF. Where PDF will have a nice design. And, for design it should be simple however no data should be missing. The app should not be congested looking. And, every error should show a human readable but valid reason by reading which I can tell exactly what went wrong." · Status: VALIDATED (architect APPROVED ✔, gatekeeper PASS ✔, human approval ✔ — 2026-08-23)

Chain: business brief ✔ (session fd51e9b6) → technical analysis ✔ (session fd51420e8) → architect REVISE ✔ incorporated → gatekeeper REROUTE-design findings G1–G5 incorporated → architect re-approval ✔ (session fd4d484e4ffe) → gatekeeper re-validation PASS ✔ (session fd4d0b683ffe) → human approval ✔ (2026-08-23).

Stakeholder answered scope questions: reportable boundary = ALL list screens + account data + suites + audit; PDF = light print adaptation; Excel = multi-sheet workbooks; periods = screen filters AND standard presets; stall policy = clean stop with notes then automatic resume after halt (ALL agent stages); audit every download; files show ৳2dp, internal transport poisha.

Chain: business brief ✔ (session fd51e9b6) → technical analysis ✔ (session fd5142 0e8) → architect REVISE ✔ incorporated → gatekeeper REROUTE-design findings G1–G5 incorporated → architect re-approval → gatekeeper re-validation → human approval.

Stakeholder answered scope questions: reportable boundary = suites + lists + audit; PDF = light print adaptation; Excel = multi-sheet workbooks; periods = screen filters AND standard presets; stall policy = clean stop with notes then automatic resume after halt.

## Problem & Goal

Phase 0 is mid-flight (tokens/styles/DESIGN.md built, 0 of ~30 screens). Four gaps block continuation: no written design restrictions governing the remaining screens (drift risk across 30 mockups); data is trapped in-app (no export path beyond superseded CSV-only gap E-5); error surfaces would expose raw machinery to a non-technical owner moving real money; agent builds stall without automated recovery. Goal: freeze binding design rules, guarantee take-away-any-data in three fit-for-purpose formats, make every failure self-diagnosable, and wire the existing loop-guardian into the build workflow — before screen production resumes.

## Requirement (verbatim)

1. "Before continuing there should be some restrictions for design."
2. "there should be downloadable reports for every single thing. There should be choices for export. Excel, CSV and PDF. Where PDF will have a nice design."
3. "for design it should be simple however no data should be missing. The app should not be congested looking."
4. "every error should show a human readable but valid reason by reading which I can tell exactly what went wrong."
5. "if any agent is stuck loop guardian should also look into that."

## Design Decisions

**D1 Anti-congestion rules as DESIGN.md prose** (gates all remaining Phase 0 screens):
1. Density ≠ congestion — dense = small type/tight rows (built, kept); congested = failed hierarchy; congestion is a defect.
2. Column cap ≤7 primary columns visible above the fold on any list table.
3. Zero data loss via progressive disclosure, never deletion; every datum reachable ≤2 interactions from its screen.
4. Grouping under section headers separated by hairlines; ≥1 `--space-lg` gap between unrelated groups; no orphan fields.
5. Action economy: one primary button per view; ≤2 inline ghost actions per row; remainder in overflow menu.
6. Sanctioned disclosure patterns: tabs, collapsible sections, detail drawer/modal, milestone-dropdown scoping.
7. Congestion gate: ≤3 visual weights per viewport region; primary list >2 scroll-lengths at 390px ⇒ split into tabs.
Rejected: new token values or tokens.css changes (rules are structural, not values); congestion policing per-screen ad hoc (unreviewable).
Frontmatter untouched ⇒ create-design-md lint/export stay green. styles.css grows reactively only when screens prove repeated patterns.

**D2 Universal export.**
Boundary (widened per gatekeeper G2 to honor "every single thing" — earlier narrower list was a drafting artifact): company/project/people report suites (§24) + ALL major list screens with current filters applied — clients, leads, opportunities, projects, milestones, deliverables, resources, transactions ledger, accounts, categories, team members, BDS partners, client/milestone payments, team payments, BDS payments, receivables, payables, project-costs — + audit logs. Dashboards excluded as such (figures live in suites).

| Format | Job | Generator |
|---|---|---|
| Excel `.xlsx` | working spreadsheet | exceljs streaming `WorkbookWriter`; multi-sheet workbooks per suite |
| CSV | machine-readable archive/re-import | stdlib RFC-4180 helper in packages/shared; no dependency |
| PDF | presentable document | pdfkit; light print theme |

Rejected: puppeteer-print (Chromium RAM breaks ≤500MB), SheetJS CE/xlsx-populate/excel4node (frozen/stale/buffered), @react-pdf/renderer (React reconciler weight, zero gain), Accept-header negotiation (two mechanisms where one param suffices).
**Delivery discipline:** complete-then-send — full artifact built in memory (exceljs `writeBuffer()`, pdfkit buffer, CSV string), StreamableFile returned ONLY on success; mid-generation throw ⇒ normal exception ⇒ error envelope; never a truncated money file with HTTP 200 sent. Buffers correct at ≤5-user scale.
**PDF light theme:** white paper, brand ink/slate/status hues verbatim from tokens.css (mapping stated qualitatively in DESIGN.md prose per gatekeeper G4 — exact values live solely in the single pdfkit theme object in apps/api); IBM Plex Sans TTF committed to repo (OFL) registered in pdfkit — no Helvetica fallback; logo PNG rasterized ONCE at design time via sharp and committed as asset (sharp never enters apps/api deps). Chrome: title, period/filters used, generation timestamp, page numbers, totals.
**Periods:** screen-filter mirroring AND presets `this-month|this-quarter|this-year|all-time|custom&from=&to=` (Asia/Dhaka, E-3).
**Money in files (E-9):** ৳ taka exactly 2dp via fixed-point string conversion from poisha integers; xlsx cells internally IEEE doubles accepted at render boundary. Structural anti-drift rule: exporters call the SAME derivation functions as screen read paths (one math home; never re-derive balances/receivables in exporter queries); reconciliation e2e verifies transport/format layer only (parse cells → fixed-point round → assert equality).

**D3 Error clarity standard.**
Envelope `{statusCode, error:{code, message, nextStep?, fieldErrors?}, requestId?}` supersedes bare `{statusCode,message,error}` everywhere. Single global exception filter (catch-all ⇒ leaks structurally impossible): class-validator DTOs → catalog-copy fieldErrors · zod issues → same shape (path maps directly) · PermissionsGuard denial → names missing key + who to ask · domain rules → typed HttpException subclasses carrying catalog code · Prisma P2002/P2025/FK → friendly-name mapper · unknown → generic copy + requestId; stacks log-only. Catalog `packages/shared/errors/catalog.ts` stable code ↔ {message,nextStep}, consumed by both apps; web binds `fieldErrors[].path` → existing `.is-invalid`/`.error-text`. requestId provenance: nginx `$request_id` passthrough else `crypto.randomUUID()`.

**D4 Loop-guardian wiring.**
Auto-invoke on machine-checkable thresholds: identical failed attempt signature ×2 · fix-revert cycle ×2 · no PROGRESS tick across 3 consecutive attempts · gate FAIL loop exceeding cycle max. Semantics (stakeholder answer): detect → checkpoint notes (attempted/failed/remains; uncommitted work stashed+described) → clean stop → ONE automatic resume with notes injected → success continues; failure ⇒ permanent halt w/ notes. Verdict `STALLED-RECOVERED`/`STALLED-HALTED` + cause appended to Session Log. **Agent leash (architect F1):** amend `.opencode/agent/loop-guardian.md` to diagnostics-only — verdicts GUIDED/NO_LOOP, delete TOOK_OVER takeover mode; explicit "never edits files, never approves gates, never commits". Guardian cannot bypass the B–E quality chain.

**D5 Motion & Responsiveness** (simple, lightweight, zero-JS where possible):
1. **Loading screen:** DEA wordmark animates character-by-character on first paint (CSS `@keyframes` letter-reveal, ~800ms total, `prefers-reduced-motion` disables entirely). No JS, no extra fonts.
2. **Transitions:** shared `--duration-fast: 120ms` / `--duration-normal: 200ms` / `--duration-slow: 300ms` tokens; only `opacity`, `transform`, `color`, `background-color`, `border-color` animated (compositor-friendly, no layout thrash).
3. **Loaders:** inline spinner (CSS-only, 1.5rem, brand slate `--accent`); skeleton cards for lists (CSS gradient shimmer, 1.5s loop, reduced-motion pauses).
4. **Page transitions:** none in Phase 0 static HTML (each screen standalone). Phase 1 Next.js App Router handles route transitions natively; any custom transitions opt-in via `view-transition-name` on shared shell elements only.
5. **Responsive breakpoints (mobile-first, inherited from styles.css):** ≤480px (phone), ≤768px (tablet), ≤900px (small desktop / sidebar drawer), >900px (full sidebar). All components fluid; tables horizontal-scroll container with sticky first column on ≤768px; sidebar collapses to off-canvas drawer at ≤900px (already in styles.css).
6. **Performance ceiling:** zero animation-related JS imports; total added CSS <2KB gzipped; all animations GPU-accelerated properties only; `prefers-reduced-motion: reduce` disables every keyframe/transition/animation globally via single `@media` rule in tokens.css. Lighthouse Performance ≥90 on 3G-simulated mobile target.

Addendum 2026-08-23T14:00Z — folded into DRAFT per template append-only rule; replaces no prior content.

## Data Model Changes

None. All four additions are read-path/presentation/process. No Prisma schema changes; exports write only append-only AuditLog rows.

## Dataflow

Export: UI affordance → `GET /api/v1/{resource}/export` or `/api/v1/reports/{suite}?format=csv|xlsx|pdf&period=…` (+ verbatim list-filter params consuming the SAME packages/shared zod schema as the list endpoint — mechanical mirror guarantee) → PermissionsGuard (`<resource>.view` for lists; `reports.view`+`reports.export` for suites; `audit_logs.view` for audit) → service calls same derivation functions as screen read paths (Overdue M3 computed, balances L1 computed) → complete-then-send buffer → success: StreamableFile + Content-Disposition `{resource}_{period-or-range}_{date}.{ext}` + AuditLog(actor+route+params) ; failure: global filter envelope. Only writes: audit rows.
Errors: origin (ValidationPipe/zod/guard/domain/Prisma/unknown) → catch-all filter normalizes via catalog → envelope → web toast/field binding; technical detail logs only.
Guardian: threshold hit → checkpoint+stash → clean stop → one auto-resume → verdict logged.

## Permissions & Audit

No new permission keys — `reports.view`, `reports.export`, `audit_logs.view`, `<resource>.view` all pre-exist in spec §21.4 catalog (gatekeeper-verified at resources/company_management_system_project_overview.md:1341-1344). Allow-only union respected; guard denies by default. New audit events: every export (actor + route + params), append-only, via one interceptor. Stricter "reports.export everywhere" variant deferred (E-10).

## UI Affected

All remaining Phase 0 screens governed by D1 rules. **D5 motion/responsive tokens and patterns apply to every screen:** loading character-reveal, duration tokens, spinner/skeleton loaders, breakpoints ≤480/≤768/≤900/>900, horizontal-scroll tables with sticky first column, sidebar drawer collapse. Export affordance pattern (Excel/CSV/PDF picker + period presets) appears on every list-screen mockup; reports.html shows suite/format matrix. Phase 0 AC gains congestion-gate line. Error states across forms/lists use envelope-driven messages (field-level binding). DESIGN.md gains anti-congestion prose + qualitative PDF mapping note + D5 duration tokens + global reduced-motion rule.

## Task Delta

analysis/task-breakdown.md:
- Phase 0 foundations — insert after styles.css line: `- [ ] DESIGN.md anti-congestion addendum (REQ-32 D1) + congestion gate added to AC`
- Phase 0 foundations — replace tokens.css line with: `- [ ] tokens.css: add --dur-fast:120ms, --dur-normal:200ms, --dur-slow:300ms; move global @media (prefers-reduced-motion: reduce) kill-switch from styles.css; deprecate --dur-base→--dur-normal mapping`
- Phase 0 foundations — replace styles.css line with: `- [ ] styles.css: add @keyframes letter-reveal (DEA char-by-char ~800ms stagger); .spinner 24px var(--accent); .skeleton 1.5s shimmer; add @media (max-width:768px) table horizontal-scroll with sticky first column; remove prefers-reduced-motion rule (now in tokens.css); ensure sidebar drawer at ≤900px remains`
- Phase 0 foundations — insert: `- [ ] Motion tokens + global reduced-motion rule (REQ-32 D5) added to tokens.css; loading character-reveal, duration tokens, spinner/skeleton loaders`
- Phase 0 foundations — insert: `- [ ] Responsive breakpoints + table scroll/sticky + sidebar drawer patterns (REQ-32 D5) added to styles.css`
- Phase 0 screens — insert before critique line: `- [ ] Export affordance pattern (Excel/CSV/PDF picker + period presets) on every list-screen mockup; reports.html suite/format matrix`
- Phase 0 screens — insert: `- [ ] Loading screen DEA character-reveal + skeleton/spinner states shown on every mockup`
- Phase 0 AC line — append: `; congestion gate passes on every screen (≤7 primary columns or disclosed, zero data loss); D5 motion/responsive compliance verified on 390/768/900/1440px viewports`
- Phase 1 shared-package line — append `, error catalog (codes↔copy), export column contracts, RFC-4180 helper, motion duration tokens`
- Phase 1 apps/api bootstrap line — append `incl. global exception filter skeleton + error envelope + requestId provenance`
- Phase 2 — insert after PermissionsGuard line: `- [ ] Error standard live: ValidationPipe field-errors, Prisma mapper, PERMISSION_DENIED capability naming; e2e asserts envelope shape`
- Phase 3 — insert: `- [ ] Shared export service + first /export endpoint (clients) with format negotiation, complete-then-send, audit interceptor`
- Phase 3 — insert: `- [ ] Amend .opencode/agent/loop-guardian.md to diagnostics-only (GUIDED/NO_LOOP only); remove TOOK_OVER/takeover path; explicit "never edits files, never approves gates, never commits"`
- Each of Phases 3–7 module lines gain own `/export` within their phase (per-module, no retrofit)
- Phase 8 — replace CSV-only reports line with: `- [ ] Reports suites (§24): Excel multi-sheet workbooks + CSV + PDF (light brand theme) behind reports.view + reports.export; period presets + custom range` + `- [ ] Universal list-export parity check + reconciliation e2e: exported totals == on-screen derived values to the poisha (finance-integrity extension)`
docs/memory/PROGRESS.md: mirror Phase 0 inserts. analysis/development-plan.md §4: amend BOTH stale envelope lines (error envelope; success `{data, meta?}` noted as skipped for StreamableFile binary routes). analysis/requirement-gaps.md: E-5 superseded; E-9/E-10/E-11 appended (analyst §7 drafts). DECISIONS.md: DEC-032..035 drafts pending approval.

## Gate Notes

Filled by hub-gatekeeper during design validation.

- Round 1 verdict: **REROUTE-design** — G1 MAJOR template nonconformance + off-repo provenance (fixed: rewritten to this template, verbatim source inline, renamed REQ-32) · G2 MAJOR boundary narrower than sourced directive (fixed: widened to all list screens, rationale recorded) · G3 MINOR second stale dev-plan §4 line (fixed: apply-list covers both) · G4 MINOR hex literals would violate create-design-md deletion rule (fixed: qualitative mapping, values only in pdfkit theme object) · G5 MINOR architect verdict unrecorded (fixed: chain status in header; re-approval required before human sign-off).
- Confirmed non-issues: finance invariants L1/L3/M3 untouched; no stored balances/overdue; RBAC keys pre-existing; guardian cannot bypass gates; DESIGN.md lint/export unaffected; phase scheduling retrofit-safe; exceljs/pdfkit within $0/≤500MB budget.
