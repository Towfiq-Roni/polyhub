# ADR-0009: Testing strategy — Jest/Supertest + Playwright

## Status
Accepted

## Context
CLAUDE.md's non-negotiable rules require financial-mutation atomicity to be tested, not just reviewed by eye, and hub's own `finance-integrity`/`test-driven-development` conventions assume a runnable test suite. F-18 through F-22's atomic posting logic and F-25's trial-balance-always-balances invariant need real automated verification. SRS §1.4/DESIGN.md's 30+ PWA screens need browser-level verification, not just unit tests of business logic.

## Decision
Jest for unit and integration tests (with Supertest for API-level integration, including transaction/atomicity tests), Playwright for browser end-to-end tests.

## Consequences
- Jest is NestJS's CLI-scaffolded default — least friction wiring DI-aware test modules (`Test.createTestingModule`) that the framework's own docs and ecosystem assume.
- Supertest lets integration tests assert the full HTTP→service→Prisma→DB path in one test, which is exactly where an atomicity bug (a payment record created without its journal entry, or vice versa) would actually surface.
- Playwright (already the tool named in the repo's `webapp-testing` skill) covers real browser flows — PWA install behavior, responsive breakpoints, actual rendered ৳ formatting — that unit tests can't.
- Three test layers to maintain and keep fast enough not to slow down the CI pipeline `deployment-pipeline-design` already assumes.

## Alternatives considered
- **Vitest + Playwright:** faster test runner than Jest, but NestJS's own documentation, CLI scaffolding, and most community examples assume Jest — choosing Vitest trades a real ecosystem-friction cost for a speed gain that doesn't matter much at this project's actual test-suite size.
- **Minimal — manual testing only:** rejected outright. Directly contradicts CLAUDE.md's explicit test-driven-development requirement and the `finance-integrity` skill's I1-I10 invariant checks, which are specified as runnable checks, not a manual review checklist.

## Related
CLAUDE.md non-negotiable rules (atomicity); F-18 through F-22, F-25; `finance-integrity` skill, `test-driven-development` skill
