# Handoff: Polyhub — Company Management System

## Overview
Polyhub is an internal company management system for Polygon Technology: CRM (leads → opportunities → clients), project/milestone tracking, team management, and finance (accounts, payment entry, receivables/payables, double-entry accounting, reports). This package documents a complete high-fidelity design prototype covering ~30 screens with a shared shell, ready to be rebuilt in a real app.

## About the Design Files
The files in `screens/` are **design references built as HTML prototypes** — not production code to copy directly. They demonstrate exact layout, color, typography, and interaction behavior using an in-memory mock-data pattern (no real backend/auth/DB). The task is to **recreate these designs in your target stack** (React/Next, Vue, etc. — choose what fits your team) using real data, auth, and persistence, following the structure and behavior documented below.

## Fidelity
**High-fidelity.** Every screen uses final colors, typography, spacing, and component patterns. Recreate pixel-close using your own component library/tokens where you have one; otherwise lift the values in "Design Tokens" below directly.

## Shared Shell
Every page composes three shared pieces (see `screens/Sidebar.dc.html`, `Topbar.dc.html`, `Footer.dc.html`):

- **Sidebar** (`Sidebar.dc.html`): fixed-height left nav, 240px expanded / 64px collapsed. Collapses automatically under 900px viewport width; manual toggle button sits beside the "Polyhub" wordmark (click the wordmark while collapsed to re-expand). Persists collapsed state in localStorage (`hub-sidebar`). Nav sections: Overview (Dashboard), CRM (Leads, Opportunities, Clients, BDS Partners), Projects (Projects, Milestones), Team (Teams, Team Members, Users, Roles, Audit Logs), Finance (Finance Dashboard, Accounts, Transactions, Payment Entry, Receivables, Payables, Accounting, Reports), Settings. Active item highlighted via `data-active`.
- **Topbar** (`Topbar.dc.html`): sticky top bar, 56px tall, page title, global search (live-filtered dropdown over a static index of projects/clients/team members/pages — Enter navigates to first match), notification bell, theme toggle (persisted to localStorage `hub-theme`, dark/light), user menu with Logout. Search box and username hide progressively below 700px/480px viewport width.
- **Footer** (`Footer.dc.html`): "Powered by Polygon Technology (Polygon)", pinned to the bottom of the scroll area (not the viewport) so it sits under short content and scrolls with long content — never overlapping.

**Page skeleton pattern** used on every screen:
```
<div style="display:flex; height:100vh; overflow:hidden">
  <Sidebar />
  <div style="flex:1; display:flex; flex-direction:column; height:100%; overflow:hidden">
    <Topbar />  <!-- sticky, outside the scroll area -->
    <div style="flex:1; overflow-y:auto; display:flex; flex-direction:column">
      <main style="flex:1; padding:32px 24px 64px">...page content...</main>
      <Footer />
    </div>
  </div>
</div>
```
This keeps the header always visible and the footer pinned to the bottom of short pages while scrolling normally on long ones.

## Screens
Grouped by product area. Each screen file lives in `screens/`.

### CRM
- **Leads** (`Leads.dc.html`) — table of leads with status chips (New/Contacted/Qualified/Proposal/Won/Lost), search + status filter, Add Lead modal. Leads at Qualified/Proposal/Won show a "Convert to Opportunity" button, which creates a real Opportunity record and marks the lead Won/converted.
- **Opportunities** (`Opportunities.dc.html`) — pipeline table (stage, probability, value, close date, owner), search + stage filter, Add Opportunity modal (client, value, expected close date, owner). Picks up leads converted from the Leads screen via localStorage handoff.
- **OpportunityDetail** (`OpportunityDetail.dc.html`) — stage selector; when stage = Won, shows a "Create Client" action that creates a Client record and links to Clients.
- **Clients** (`Clients.dc.html`) — client list with status, outstanding balance; picks up clients created from Won opportunities.
- **ClientDetail** (`ClientDetail.dc.html`) — tabs: Overview (contact + company info, editable via a single Edit/Discard/Save flow), Projects, Finance (receivables/payables breakdown for this client), Resources (add file upload or link, remove), Accounts (bank/MFS accounts for this client with add modal).
- **BdsPartners** / **BdsPartnerDetail** — referral partners, commission rate, referred leads, tabs for Overview/Leads/Compensation/Payments, Edit flow, Phone field, Active/Inactive toggle.

### Projects
- **Projects** (`Projects.dc.html`) — paginated (10/page) table, sortable columns, search + status filter, Add Project modal, row click opens a Quick View modal (status/progress/value/owner/team summary + "View Full Details" link), "Assign" opens a single merged modal (quick-select a team to bulk-check its members, or check members individually) — disabled for Completed projects.
- **ProjectDetail** (`ProjectDetail.dc.html`) — progress bar, Team section (assigned members + "Manage Team" reopening the Assign modal), Milestones list with per-milestone receivable amount, checkbox complete/incomplete, multi-add form ("+ Add Another" drafts pattern), Resources (file upload/link add + remove).
- **ProjectMilestones** (`ProjectMilestones.dc.html`) — a project picker feeding a full milestone list (progress bar, due dates, receivable amounts, status); dedicated empty state when no project is selected and when a project has no milestones yet. Same multi-add drafts pattern as Project Detail.
- **MilestoneDetail** / **DeliverableDetail** — supporting detail pages for a single milestone/deliverable.

### Team
- **Teams** / **TeamMembers** / **TeamMemberDetail** — team member roster, detail page with tabs (Overview editable, Projects with inline role/allocation edit, Bank Accounts with multi-add drafts, Activity), single Edit → Discard/Save flow gating all tabs at once, Active/Inactive toggle.
- **Users** / **Roles** / **Permissions** (folded into Roles as an internal tab) / **AuditLogs** — access control and system activity log.

### Finance
- **FinanceDashboard** — KPI summary.
- **BankAccounts.dc.html** (nav label: "Accounts") — the org's own Cash/Bank/MFS accounts: method, provider, account name/type, account number, balance, status. View (detail modal), Edit, Activate/Deactivate per row. Persisted to localStorage (`hub-bank-accounts`) so Payment Entry reads the same data.
- **PaymentEntry** — method-first flow (Cash / Bank / MFS chosen first, determines which fields show). Cash: Amount, Direction, Date, Description, Notes only. Bank/MFS: entry type (Client Payment / Team Payment / Vendor Payment / Other), our account (filtered to the chosen method, pulled from Accounts), for team/client entries the counterparty's saved account (constrained to valid pairings: Bank→Bank/Card/MFS, MFS→MFS/Bank/Card) with an inline "manage this person's accounts" modal, optional transaction ID for Bank/MFS, "Other" entries get a Chart of Accounts dropdown (filtered to Revenue/Asset codes for Money In, Expense/Liability for Money Out) to classify the entry.
- **Transactions** — ledger of recorded entries.
- **Receivables** / **Payables** — Edit opens a modal (Receivables' modal shows a live Outstanding calculation with over/under-payment notes as invoiced/received amounts change; Payables' modal is a plain edit with a note that totals only update once marked paid), "Mark Received"/"Mark Paid" actions, fixed-width action column so rows never wrap.
- **Accounting** (`Accounting.dc.html`) — tabs ordered to the accounting cycle: Chart of Accounts → Journal Entries → Account Ledger → Trial Balance. "Add Code" is a dropdown of predefined codes (not freeform) — picking one shows a preview of its Name/Type/Normal Balance before saving.
- **ProjectCosts** / **Reports** — cost tracking and reporting views.

### Account / Auth
- **Login**, **Profile**, **Settings** — standard auth/account screens.

## Interactions & Behavior Patterns (apply consistently across screens)
- **Edit flow**: pages with editable records use a single header-level Edit button. While editing, Cancel is replaced by **Discard** (reverts to a snapshot captured when Edit was clicked) and **Save** (commits). Never a bare "Cancel".
- **Multi-add drafts**: any "add N of something" flow (milestones, bank accounts) shows numbered draft rows with a "+ Add Another" (ghost button) and a single commit button — nothing is saved until the commit button is pressed, and any draft can be removed individually before saving.
- **Modals**: centered, `position:fixed`, scrim at `rgba(1,1,1,0.6)`, card `border-radius:8px`, `box-shadow:0 8px 24px rgba(0,0,0,0.55)`, header/body/footer sections each with `padding:24px` and a border between sections.
- **Empty states**: dashed-border card, muted text, short explanation — used for milestones, resources, filtered tables with no matches.
- **File uploads**: never a bare native `<input type="file">` (renders inconsistent browser chrome) — always a hidden input behind a styled "Choose File" label/button plus a filename readout.
- **Status chips**: pill-shaped, 1px border + matching text color (no filled background), color mapped by status semantics (success=green, warning=amber, danger=red, neutral=muted gray).
- **Tables**: header row uppercase 12px muted label; cells `white-space:nowrap` with fixed-width/ellipsis where content can overflow, so rows never wrap to multiple lines; sortable columns show a ▲/▼ marker.
- **Pipeline flow**: Lead → (qualified/proposal/won) → **Convert to Opportunity** → Opportunity stages → **Won** → **Create Client** → Client → Project. This is a deliberate one-directional pipeline; do not conflate Lead and Opportunity stages.

## State Management
Every screen is currently self-contained in-memory React-like local component state (seeded with mock data). A few flows deliberately pass data between screens via `localStorage` as a stand-in for a shared backend:
- `hub-theme` — dark/light, read by every page on mount.
- `hub-sidebar` — collapsed/expanded.
- `hub-bank-accounts` — org accounts, written by Accounts page, read by Payment Entry.
- `hub-converted-leads` — written by Leads "Convert to Opportunity", consumed once by Opportunities on mount then cleared.
- `hub-created-clients` — written by OpportunityDetail "Create Client", consumed once by Clients on mount then cleared.

In a real implementation, replace all of this with real API calls / a shared store; the localStorage hand-offs mark exactly where a real cross-entity write (lead→opportunity, opportunity→client, account CRUD) needs to happen.

## Design Tokens

**Typography**: `'IBM Plex Sans', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif` throughout. Page titles 20px/600, section titles 14–15px/600, body 13–14px, small/meta 12px, table headers 12px uppercase with `letter-spacing:0.04em`.

**Colors — Dark theme**
```
bg:        #010101
surface:   #080808
border:    rgba(111,126,143,0.32)
ink:       #FAFAFA
inkHi:     #FBFAFB
inkDim:    #F8F8F9
muted:     #717F91
accent:    #717F91
accentInk: #010101
accentSoft:rgba(113,127,145,0.14)
success:   #63A583
warning:   #C9A24B
danger:    #CD6A5E
info:      #6C86AD
neutral:   #6F7E8F
```

**Colors — Light theme**
```
bg:        #FBFAFB
surface:   #FFFFFF
border:    rgba(111,126,143,0.30)
ink:       #121417
inkHi:     #010101
inkDim:    #3A414B
muted:     #5A6675
accent:    #4A5563
accentInk: #FBFAFB
accentSoft:rgba(74,85,99,0.12)
success:   #2E7D54
warning:   #9A6E1E
danger:    #B23A2E
info:      #3E5C8A
neutral:   #5A6675
```

**Spacing**: 4/8/12/16/24/32px scale. Card padding 16px, modal section padding 24px, page content padding `32px 24px 64px`.

**Radius**: buttons/inputs 4px, cards/modals 8px, chips/pills 999px (full).

**Shadows**: modal card `0 8px 24px rgba(0,0,0,0.55)` (dark), same in light theme.

## Assets
No image assets — icons are inline SVG (Feather-style, 18×18, `stroke-width:2`, `stroke:currentColor`). No logo asset; wordmark is text ("Polygon" mark + "Hub" name).

## Files
All screens are in `screens/`. `support.js` is the design-tool runtime loader referenced by each file's `<script src="./support.js">` tag — **do not port this file**; it only exists to run these HTML prototypes in the design tool. Treat every `.dc.html` file as reference markup + inline styles + a logic section at the bottom (`<script type="text/x-dc" data-dc-script>`) describing state/handlers/computed style objects — read the logic section for exact behavior and computed values per screen.
