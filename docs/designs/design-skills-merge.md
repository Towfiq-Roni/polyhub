# Merged Design Skill Workflow — ui-ux-pro-max × design-taste-frontend × frontend-design

How the three design skills combine for hub UI work. Load order matters; scope differs.

## When to load what

| Task | Load |
|---|---|
| New screen / visual direction | `ui-ux-pro-max --design-system` → `frontend-design` originality critique |
| Reviewing / fixing existing screens | `design-taste-frontend` pre-flight audit → `hub-reviewer` gates |
| Palettes, font pairings, chart picks | `ui-ux-pro-max --domain <domain>` searches |
| Anti-slop pass on any UI | `design-taste-frontend` §9 AI-Tells + §14 Pre-Flight |

## Division of labor

| Skill | Supplies |
|---|---|
| `ui-ux-pro-max` | Pattern intelligence: searchable styles, palettes, pairings, UX rules, charts |
| `design-taste-frontend` | Anti-slop discipline: dials, AI-Tell bans, Pre-Flight Check matrix |
| `frontend-design` | Originality guard: "is this the default look?" critique before committing |

## Pipeline (any new UI surface)

1. **Design Read** (taste-skill §0.B): one line declaring page kind, audience, vibe, aesthetic family.
2. **Pattern search** (pro-max): `--design-system` or targeted `--domain`.
3. **Originality gate** (frontend-design): reject templated output; hub brand tokens only.
4. **Build** against `design/tokens.css` — no raw hex, ever.
5. **Pre-Flight** (taste-skill §14): run the applicable boxes before declaring done.
6. **QA chain**: `hub-reviewer` R1–R6 → `hub-tester` empirical → `hub-gatekeeper`.

## Scope honesty (taste-skill §13)

`design-taste-frontend` declares **dashboards / dense product UI out of scope**. Hub IS an internal
admin panel — so for the 31 mockups, apply its **universal** rules only:

- Em-dash ban (§9.G), eyebrow restraint (§4.7), copy self-audit (§4.9)
- Button/form contrast AA (§4.5), theme lock (§4.11), shape/color consistency locks
- Reduced-motion + dark/light dual-mode testing (§6)

Do NOT apply its landing-page layout rules (hero stack, bento rhythm, zigzag caps) to app screens.
Landing/marketing surfaces (none currently planned) get the full skill.

## Dials for hub (locked)

Internal finance dashboard ⇒ `--density 8 --motion 3` (per pro-max hub adaptation). Taste-skill
baseline 8/6/4 does NOT override this — trust-first dense product wins.
