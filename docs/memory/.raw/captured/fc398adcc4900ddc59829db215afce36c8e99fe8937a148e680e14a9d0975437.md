# ADR-0001: Frontend stack — Next.js App Router + Serwist PWA, self-hosted

**Status:** Accepted
**Date:** 2026-08-22
**Source:** DEC-001

## Context

Hub is an internal tool for ≤5 users with monthly usage bursts and a $0
recurring-cost target (see `CLAUDE.md`). It needs to work well on mobile in the
field (PWA install, offline-tolerant shell) and share one deploy story with the
backend so there's no second hosting bill or CORS surface to secure. Candidate
platforms considered: Vercel/Netlify/Cloudflare Pages (managed, edge-first) vs.
a self-hosted Node server on the same VM as the API.

## Decision

Next.js 15, App Router, built as a PWA via Serwist (manifest + service worker +
install prompt), self-hosted as a Node server on the same Oracle VM as the API
— not deployed to Vercel/Netlify/Cloudflare.

## Consequences

- Same-origin frontend and API (reverse-proxied by nginx) removes CORS
  entirely; cookies/JWT flow without cross-site cookie complications.
- Full Node SSR is available with no platform-specific adapter layer or
  edge-runtime restrictions (Vercel/Cloudflare edge functions impose extra
  constraints Next.js self-hosting doesn't).
- We own the deploy pipeline end-to-end (Docker image, health check, rollback)
  instead of relying on a managed platform's build/deploy semantics — more
  ops surface, but consistent with ADR-0003's single-VM topology and the $0
  cost target (managed platform free tiers cap out well before Vercel).
- PWA behavior (offline shell, install) is our own responsibility via Serwist
  rather than a platform-provided edge cache; acceptable at this scale.
