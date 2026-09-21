---
version: alpha
name: Hub Design System
description: >-
  Dark-first Swiss-minimal design language for hub, an internal management
  system connecting CRM, projects, milestones, and ledger-driven finance for a
  small Bangladeshi software house. Palette, surfaces, and slate accent derive
  from the DEA brand mark.
colors:
  canvas: "#010101"
  surface: "#080808"
  surface-hover: "rgba(251, 250, 251, 0.04)"
  scrim: "rgba(1, 1, 1, 0.72)"
  ink-hi: "#FBFAFB"
  ink: "#FAFAFA"
  ink-dim: "#F8F8F9"
  muted: "#717F91"
  faint: "#6F7E8F"
  disabled: "#6A7888"
  border: "rgba(111, 126, 143, 0.32)"
  border-strong: "#6F7E8F"
  accent: "#717F91"
  accent-ink: "#010101"
  accent-soft: "rgba(113, 127, 145, 0.14)"
  status-neutral: "#6F7E8F"
  status-neutral-tint: "rgba(111, 126, 143, 0.14)"
  status-info: "#6C86AD"
  status-info-tint: "rgba(108, 134, 173, 0.15)"
  status-success: "#63A583"
  status-success-tint: "rgba(99, 165, 131, 0.15)"
  status-warning: "#C9A24B"
  status-warning-tint: "rgba(201, 162, 75, 0.16)"
  status-danger: "#CD6A5E"
  status-danger-tint: "rgba(205, 106, 94, 0.16)"
typography:
  sans:
    fontFamily: IBM Plex Sans
  display:
    fontFamily: IBM Plex Sans
    fontSize: 32px
    fontWeight: 600
    lineHeight: 40px
  heading:
    fontFamily: IBM Plex Sans
    fontSize: 24px
    fontWeight: 600
    lineHeight: 32px
  title:
    fontFamily: IBM Plex Sans
    fontSize: 20px
    fontWeight: 600
    lineHeight: 28px
  lead:
    fontFamily: IBM Plex Sans
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
  body:
    fontFamily: IBM Plex Sans
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  small:
    fontFamily: IBM Plex Sans
    fontSize: 13px
    fontWeight: 400
    lineHeight: 20px
  caption:
    fontFamily: IBM Plex Sans
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
  label:
    fontFamily: IBM Plex Sans
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
  data:
    fontFamily: IBM Plex Sans
    fontSize: 13px
    fontWeight: 500
    lineHeight: 20px
    fontFeature: '"tnum"'
rounded:
  sm: 4px
  md: 8px
  pill: 999px
spacing:
  2xs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  3xl: 64px
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.sm}"
    height: 36px
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: 36px
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
  modal:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
---

> **Status note (2026-09-02):** the `design/` reference implementation this document was authored
> from (tokens.css/styles.css/31 mockup screens) was retired and deleted, then rebuilt from a new
> external design handoff stored at `docs/designs/claude-design-handoff/` (33 `.dc.html` reference
> screens) per the plan at `docs/designs/phase0-redesign-claude-handoff-plan.md` and DEC-055 in
> `docs/memory/DECISIONS.md`. That rebuild is now complete — all 33 screens plus the shared shell
> are built, reviewed, and empirically browser-tested. Color tokens are confirmed byte-identical to
> what's documented below; the values and rules here reflect the current, shipped implementation.
> See `docs/memory/PROGRESS.md` for build history.

## Overview

Hub is an internal management system for a Bangladeshi software house, carrying CRM, project and milestone delivery, and ledger-driven finance in one dense, scannable workspace. The visual language is dark-first Swiss minimalism built directly from the DEA brand mark: a near-black canvas, off-white ink tiers, and a slate family lifted from the circuit-line strokes of the logo. The design spends its personality in exactly one place — a dual-anatomy status chip system that makes work state and payment state distinguishable at a glance — and keeps every table, form, and card quiet around it.

## Colors

- **Canvas:** the brand mark's own black; the page background everywhere, so the app reads as printed on the logo.
- **Surface:** lifted from the mark's interior counters; cards, the sidebar, modals, and inputs sit one step above canvas without gradients.
- **Ink tiers (ink-hi, ink, ink-dim):** the mark's off-whites, assigned by descending emphasis — headings and figures, then body, then table cells and secondary text.
- **Slate trio (muted, faint, disabled):** the circuit-line strokes demoted to support roles — labels and metadata, placeholders and hairlines, disabled controls.
- **Accent:** the brightest slate is the only interactive fill; primary buttons invert it with the mark's own black (`accent-ink`) as label color.
- **Status hues:** five postures shared by both status machines — neutral means idle/not in play, info means in motion, success means settled/good, warning means pending action, danger means negative or blocked. Each has a solid for text, dots, and outlines plus an alpha tint derived from that solid for filled fills; every solid holds AA contrast on canvas.
- **Tints (`*-tint`, `surface-hover`, `scrim`, `accent-soft`, `border`)** are documented alpha derivations of their solid token over canvas; never sample them independently of their source.

## Typography

IBM Plex Sans is the single family at three weights — regular for reading, medium for labels and emphasis, semibold for headings and figures. Sizes always travel with their paired line height from the frontmatter; do not rescale one without the other. The `data` scale exists solely for money: its tabular numeral feature keeps ৳ columns aligned, and every amount cell uses it. Captions and KPI labels set in caps carry wide tracking; body text never does.

## Layout

A single base density grid governs all spacing, with a half-step reserved for micro-adjustments inside controls (chip padding, icon gaps). The app shell is a fixed left navigation rail beside a fluid content column under a sticky top bar; the rail is always visible and auto-collapses to a 64px icon rail on narrow viewports — there is no off-canvas drawer, hamburger toggle, or scrim. Tables favor density over airiness — small type, tight rows, right-aligned numerals — while cards group related data into bordered panels rather than floating islands.

## Elevation & Depth

Depth is tonal, not shadowed: canvas, surface, and hover-wash layers plus hairline borders carry the entire hierarchy. Exactly one shadow token exists for genuinely floating chrome — modals and popovers — always paired with the scrim behind them. Buttons, cards, and inputs never cast shadows; their edges are borders.

## Shapes

Three radii, each meaning something: `sm` marks interactive controls (buttons, inputs), `md` marks containers (cards, modals, empty-state frames), and `pill` is reserved exclusively for status chips. Because pills mean "status" and nothing else, shape alone tells you a badge is a status before you read it. The empty-state frame is the one deliberate exception to solid borders — dashed, signaling absence rather than structure.

## Components

**Status chips** are the signature system: two anatomies across five shared hues. Work-status chips (Draft, Planning, Active, On Hold, Completed, Cancelled, Not Started, In Progress, Submitted, Approved, Rejected, Changes Requested) render as outline chips with a leading dot — transparent fill, border and dot and text all in the posture solid. Payment-status chips (Unpaid, Pending, Partial, Paid, Overdue) render as filled-tint chips — tint background, solid-colored text, no dot, no border. Hue assignment follows posture semantics: neutral carries Draft/Not Started/Unpaid; info carries Planning/Active/In Progress/Pending; success carries Completed/Approved/Paid; warning carries On Hold/Submitted/Changes Requested/Partial; danger carries Cancelled/Rejected/Overdue. Overdue is derived at read time, never stored, and always wears the payment anatomy.

**Buttons:** one primary (slate fill, black label) per view marks the single most important action; ghost buttons take secondary actions; the danger fill is reserved for destructive financial operations such as reversals. Disabled buttons drop to the disabled slate with a hairline border and no fill.

**Inputs** sit on surface with a strong slate border that sharpens to accent on focus; errors recolor the border to the danger solid and pair it with danger helper text below the field. Labels sit above inputs, hints below, and the two never swap places.

**Modals** compose head, body, footer bands separated by hairlines, with actions right-aligned in the footer and the destructive action leftmost of the pair when cancellation matters.

## Anti-Congestion (REQ-32 D1)

Density is not congestion — dense means small type and tight rows; congested means failed hierarchy, and congestion is a defect. The rules: a list table shows at most **7 primary columns** above the fold; **zero data loss** — every datum stays reachable within 2 interactions via sanctioned disclosure patterns (tabs, collapsible sections, detail drawer/modal, milestone-dropdown scoping), never deletion; unrelated groups sit under section headers separated by hairlines with at least one `--space-lg` gap and no orphan fields; **action economy** allows one primary button per view and at most 2 inline ghost actions per row, the remainder in an overflow menu; at most **3 visual weights** per viewport region; a primary list longer than 2 scroll-lengths at 390px splits into tabs.

## Do's and Don'ts

- Do consume every color through a single token stylesheet's custom properties (was `design/tokens.css`, now retired — see status note above); don't hardcode hex or rgb() literals in any stylesheet, component, or mockup.
- Don't represent money as floating point — amounts are integer poisha end-to-end, and the ৳ sign is applied only at render time.
- Don't store Overdue as a persisted status; derive it at read time and render it with the danger-filled payment anatomy.
- Do keep work chips outlined-with-dot and payment chips filled-tint; don't borrow one machine's anatomy for the other.
- Don't add font families or weights beyond IBM Plex Sans at 400/500/600.

## Motion & Responsive Behavior

### Duration & Easing
Four duration tokens govern all motion: `--dur-fast` (120 ms) for micro-interactions like hover transitions and row highlights; `--dur-normal` (200 ms) as the default for component state changes — drawer slides, modal fades, chip transitions; `--dur-slow` (300 ms) for full-view transitions such as page loads or shell rearrangements. All durations pair with a single easing curve `--ease-out` (cubic-bezier(0.2, 0, 0, 1)) so deceleration feels consistent whether a tooltip appears or a sidebar draws.

### Reduced Motion
A global `prefers-reduced-motion: reduce` media query in tokens.css collapses every animation and transition to a near-instant 0.01 ms duration, forces single iteration, and disables smooth scrolling. This single kill-switch covers the entire design system — no component-level opt-outs are needed. When reduced motion is active, the letter-reveal loader, spinner, skeleton shimmer, drawer slide, and all hover/focus transitions resolve immediately.

### Breakpoints
Four responsive thresholds structure layout shifts:
- **480 px** — content padding tightens; topbar padding reduces.
- **768 px** — tables gain horizontal scroll with a sticky first column pinned to the left edge using `position: sticky; left: 0` so the primary identifier remains visible during sideways swipe.
- **900 px** — the fixed left rail auto-collapses to a 64px icon rail (labels hidden, icons and tooltips remain); there is no hamburger button, backdrop scrim, or off-canvas drawer — the collapse toggle lives on the sidebar itself and persists via `localStorage`; the transition animates with `--dur-normal` and `--ease-out`.
- **1440 px** — content max-width caps at 1280 px, centering the workspace on ultra-wide viewports.

### Loading Animations
The DEA letter-reveal loader splits the wordmark into individual characters, each staggered by roughly 100 ms (spanning ~800 ms total) using the `letter-reveal` keyframe: opacity and a subtle vertical translate resolve with `--ease-out`. The spinner is a 24 px ring using `--accent` for the leading edge, rotating once per 0.8 s linear loop. Skeletons use a 1.5 s shimmer sweep — a gradient moving from `--accent-soft` through `--surface-hover` and back — applied to any block awaiting data.

### Table & Sidebar Adaptations
At or below 768 px, `.table-wrap` enables touch-friendly horizontal overflow; the first header and cell in each row become sticky with a `--surface` background so they never disappear during scroll. At or below 900 px, the sidebar auto-collapses in place to a 64px icon rail (labels hidden, icons and tooltips remain) — it stays part of the fixed layout rather than sliding in as a drawer, and there is no `.shell.nav-open` class or backdrop scrim; the collapse transition animates with the shared duration and easing tokens.
