# ADR-0001: Frontend framework — Next.js 15 App Router + Serwist PWA

## Status
Accepted

## Context
SRS §2.4/§5.1 requires an installable, offline-shell-capable PWA serving 30+ screens across CRM, Projects, Finance, and Administration modules (F-01 through F-32), for up to 5 concurrent users (NFR-SCALE-01). The frontend must render data-dense tables and forms (finance/ledger screens especially) without excessive client bundle weight.

## Decision
Use Next.js 15 with the App Router, and Serwist for PWA/offline-shell support.

## Consequences
- Server components reduce client-side JS for data-heavy list/detail screens.
- Serwist provides a maintained service-worker abstraction, avoiding hand-rolled offline-caching logic.
- Ties the frontend to React/Next.js conventions and its release cadence.
- Server Actions vs. calling the NestJS REST API directly (ADR-0005) needs a per-feature convention — business mutations should hit the API for RBAC/audit single-sourcing, not bypass it via a Server Action.

## Alternatives considered
- **Plain React SPA (Vite):** simpler mental model, but PWA/offline and initial-load performance for 30+ screens need more manual engineering; no built-in SSR to reduce bundle size for data-dense screens.
- **Server-rendered templates (no SPA):** simplest possible frontend, but no PWA install capability and full-page reloads on every form-heavy finance action — poor fit for F-18/F-19/F-20's payment-entry UX.

## Related
NFR-SCALE-01, SRS §2.4, §5.1; F-01 through F-32 (all UI-facing features)
