---
name: nextjs-developer
description: "Use when building or modifying apps/web (Next.js App Router) — route handlers/layouts, server components, client boundaries, loading/error states, metadata, data fetching from the NestJS API, streaming, or performance work. Triggers on: Next.js, App Router, RSC, Server Components, use client, revalidation, PWA screens."
license: MIT
---

> Vendored from [jeffallan/claude-skills](https://github.com/jeffallan/claude-skills) `skills/nextjs-developer/SKILL.md` (MIT, v1.1.0 by Jeffallan). Hub adaptation appended at bottom — it overrides where they differ.

# Next.js Developer

Senior Next.js developer with expertise in Next.js 14+ App Router, server components, and production deployment with focus on performance.

## Core Workflow

1. **Architecture planning** — Define app structure, routes, layouts, rendering strategy
2. **Implement routing** — Create App Router structure with layouts, templates, loading/error states
3. **Data layer** — Set up server components, data fetching, caching, revalidation
4. **Optimize** — Images, fonts, bundles, streaming
5. **Verify** — run `next build` locally, confirm zero type errors; check env vars set; Lighthouse CWV > 90 on public shell pages

## Constraints

### MUST DO (Next.js-specific)
- Use App Router (`app/` directory), never Pages Router (`pages/`)
- Keep components as Server Components by default; add `'use client'` only at the leaf boundary where interactivity is required
- Use explicit fetch semantics — never rely on implicit caching for authenticated data
- Use `generateMetadata` (or static `metadata`) for all page metadata — never hardcode `<title>`/`<meta>` in JSX
- Optimize every image with `next/image`; never a plain `<img>` tag for content images
- Add `loading.tsx` and `error.tsx` at every route segment that performs async data fetching

### MUST NOT DO
- Convert components to Client Components just to access data — fetch server-side first
- Skip `loading.tsx`/`error.tsx` boundaries on async route segments
- Ship without a clean production build

## Code Patterns

### Server Component with data fetching
```tsx
// app/(dashboard)/projects/page.tsx
import { Suspense } from 'react'

async function ProjectList() {
  const res = await fetch(`${process.env.API_INTERNAL_URL}/api/v1/projects`, {
    headers: { cookie: cookies().toString() },
    cache: 'no-store', // authed data: always dynamic
  })
  if (!res.ok) throw new Error('Failed to fetch projects')
  const { data } = await res.json()
  return <ul>{data.map((p) => <li key={p.id}>{p.name}</li>)}</ul>
}

export default function Page() {
  return (
    <Suspense fallback={<ProjectListSkeleton />}>
      <ProjectList />
    </Suspense>
  )
}
```

### Metadata
```tsx
export async function generateMetadata(
  { params }: { params: { id: string } }
): Promise<Metadata> {
  const project = await getProject(params.id)
  return { title: `${project.code} · ${project.name}` }
}
```

---

# Hub Adaptation (project-specific overrides)

1. **Single origin, no Vercel:** app self-hosts behind nginx in Docker; `/api/*` proxies to NestJS. Server-side fetches use `API_INTERNAL_URL=http://api:4000` (compose network); browser calls go to same-origin `/api/v1`. The upstream deployment reference does not apply — deploy gates live in `hub-deploy`.
2. **Auth is cookie-forwarded JWT:** server components forward the request's cookies to the API; refresh handled client-side per auth module design. Never read `Authorization` headers server-side.
3. **Server Actions are restricted:** business mutations MUST go through the NestJS REST API so RBAC guards, validation, and audit stay single-sourced. Server Actions only for pure-UI concerns if ever needed — default is none.
4. **Authenticated dashboards are dynamic:** `cache: 'no-store'` on all authed fetches; no ISR for user data. Static generation only for login shell/marketing-less public assets.
5. **PWA/Serwist interplay:** service-worker caching config lives in serwist setup; new route groups must not fight the app-shell cache (document any precache changes).
6. **Forms:** react-hook-form + zod schemas imported from `packages/shared`; client components submit to REST endpoints; permission gating uses shared constants (hide/disable UI, server still enforces).
7. **Money & status language:** render via `packages/shared` helpers only (৳ poisha formatting, status labels); see `frontend-design` skill for visual direction.
