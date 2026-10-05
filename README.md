# Watchdog — Environmental Early Warning

> *The stream's early-warning system is already out walking.*
> Track 6 · Resilience Informatics · OneAquaHealth IEEE Global Hackathon

Watchdog forecasts when an urban stream site is vulnerable. It asks the people, pets and wildlife already there to act as sentinels, and it keeps a human coordinator in charge of every warning. Approved events leave as HL7 FHIR R4 One Health bundles, and a season ledger ranks restoration measures.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm run build && npm start
```

| Where | What |
| --- | --- |
| `/` | Landing page |
| `/observe` | Public sentinel app (mobile PWA, EN/PT) |
| `/login` | Staff sign-in — `coordinator@watchdog`, or pick a demo account |
| `/app/overview` | Coordinator console |
| `/app/rules` | Deterministic rules + in-browser self-test suite |

Everything runs on a **replay clock** (console top bar → presets, speed, golden-path tracker). The golden path is a heat-and-low-water event at Coimbra site COI-03.

## Golden path (≈ 4 minutes)

1. Replay clock → **Day 2 · 14:00** (presenter mode).
2. `/observe` → Report → *Dark mats* + *My dog seems unwell* → *Under 2 hours* → submit. A Signal opens at COI-03.
3. Console → Signal → **Request look** (Tiago). In `/observe/requests` as Tiago: accept, tick mats + dead fish, send.
4. Signal → **Draft advisory** → edit → **Approve and publish** (escalate on). A FHIR bundle is queued.
5. `/app/fhir` → **Send to sandbox**. This is a real POST to the public HAPI FHIR R4 server.
6. Advance 24 h → send two resolution checks → answer *no signs* twice → **Resolved**.
7. `/app/ledger` → missing shade drives COI-03 risk → riparian planting modelled.

## Tests

```bash
npm run typecheck            # TypeScript compiler check
npm run test:e2e             # Playwright test suite (smoke + golden path + self-tests + a11y)
npm run test:e2e:network     # Live sandbox delivery (POST to HAPI FHIR R4)
npx playwright test e2e/golden-path.spec.ts --repeat-each 10  # 10x golden path stability test
npm run capture:screenshots  # Capture visual review screenshots to docs/screenshots/
```

Visual review screenshots are captured and documented in [`docs/screenshots/`](docs/screenshots/).

## Repository map

```
watchdog/
├── .github/
│   └── workflows/ci.yml                  GitHub Actions CI workflow
├── app/
│   ├── layout.tsx · globals.css · icon.svg · manifest.ts · not-found.tsx
│   ├── page.tsx                          landing
│   ├── login/ · signup/                  staff sign-in · walker sentinel profile
│   ├── observe/                          PUBLIC SENTINEL PWA (EN/PT, 390 px)
│   │   ├── layout.tsx · page.tsx         phone frame · streams near you
│   │   ├── sites/[siteId]/               forecast, precaution, why this site
│   │   ├── sites/[siteId]/report/        3-step 30-second report
│   │   └── observations/ · requests/ · about/
│   └── app/                              COORDINATOR CONSOLE
│       ├── layout.tsx · page.tsx · overview/
│       ├── sites/ · watches/ · observations/            (+ detail pages)
│       ├── signals/ · verification/ · advisories/ (+ new/, [id])
│       ├── fhir/ · ledger/ · rules/                     (+ detail pages)
│       └── sources/ · settings/
├── components/
│   ├── providers · toast · ui · icons · art · charts · network-map · auth
│   ├── shell/      sidebar · topbar · replay · notifications · app-shell
│   ├── observe/    mobile-shell · public · risk-curve · city-map · sign-grid · photo-input · site-picker · forget-device
│   └── console/    kit · explain · request-look · reason-modal · photo-view · why-drawer · score-history
│                   advisory-bits · advisory-editor · advisory-view · json-view
├── docs/
│   └── screenshots/                      15 captured review screenshots (mobile & desktop)
├── e2e/
│   ├── helpers.ts                        test setup, replay time navigation, sign-in helpers
│   ├── smoke.spec.ts                     smoke check for all 25 public & console routes
│   ├── golden-path.spec.ts               full golden-path & 17/17 in-browser self-tests
│   ├── a11y.spec.ts                      WCAG 2.1 AA axe automated accessibility suite
│   ├── network.spec.ts                   live HAPI FHIR R4 sandbox delivery test
│   └── capture.spec.ts                   automated visual review screenshot generator
├── lib/
│   ├── types · utils · catalog           domain model, helpers, sites / people / signs
│   ├── weather · engine                  synthetic weather, deterministic rules v1.0.0
│   ├── sim · select · store              reducer + scenario replay, selectors, persisted store
│   ├── advisory · fhir                   drafting + guardrails, FHIR R4 bundle + validator
│   ├── hooks · links · i18n · geo · photo · privacy · svg
│   ├── outbox · openmeteo                live FHIR sandbox delivery · live Open-Meteo & GloFAS
│   └── ledger · selftest · download      season ledger + measures · in-browser tests · file export
└── package.json · tsconfig.json · tailwind.config.ts · next.config.mjs · playwright.config.ts
```

## Architecture

- **Engine (`lib/engine.ts`)** — deterministic and versioned. Watch = 100 × T(weather) × V(OAH habitat). Signal = 60 % community evidence + 40 % watch. Every number is explained in the Why drawer.
- **Reducer (`lib/sim.ts`)** — pure. Observations → signals → looks → advisories → FHIR bundles, with an audit event for every step.
- **Human in the loop** — nothing is published, handed off or dismissed without an explicit, logged coordinator action.
- **Persistence** — Zustand with `localStorage`. The backend swaps it for API calls behind the same actions.

## Network calls (only on explicit user action)

| Call | Endpoint | Where |
| --- | --- | --- |
| Live weather import | `api.open-meteo.com/v1/forecast` (CC BY 4.0) | Data Sources |
| River discharge | `flood-api.open-meteo.com/v1/flood` (GloFAS, Copernicus EMS) | Data Sources |
| FHIR delivery | `hapi.fhir.org/baseR4` (public test server — synthetic data only) | FHIR Outbox |

## Data honesty

- **Weather** — synthetic by default and labelled on every screen. Live Open-Meteo data can replace it per city.
- **Advisory drafts** — a bounded template (`template-v1`) behind real guardrails. The Claude drafter replaces it in the backend.
- **OneAquaHealth data** — never republished. Habitat answers are synthetic stand-ins.
- **Restoration measures** — mapped to Catalogue of Measures *categories*. Codes are to be confirmed with the consortium.

Apache-2.0.

## Backend

Watchdog supports both standalone in-browser operation and centralized server deployment:
- **Local mode**: Optimistic in-browser simulation with offline storage.
- **Remote mode**: Centralized state management backed by libSQL / Turso database with optimistic concurrency, authenticated REST sync, and FHIR transactions.

```bash
cp .env.example .env.local      # optional; defaults work locally
npm run test:unit               # Vitest: self-tests, weather scoping, persistence round trip
npm run db:smoke                # one sandbox per preset: round trip + audit chain against DATABASE_URL
curl -s localhost:3000/api/health
curl -si -X POST localhost:3000/api/workspaces -H 'content-type: application/json' -d '{"preset":"day2"}'
```

### Running on the server (remote transport)

```bash
NEXT_PUBLIC_BACKEND=remote npm run build     # the flag is baked in at build time
NEXT_PUBLIC_BACKEND=remote npm start
# Phone on the same Wi-Fi (plain http): open the console via the laptop's LAN IP, not localhost, so the QR
# code points somewhere the phone can reach, and let the cookie work without https:
COOKIE_SECURE=false NEXT_PUBLIC_BACKEND=remote npm start -- -H 0.0.0.0
```

## Documentation

| Document | What it covers |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Principles, diagrams, directory map, domain model, scoring, API, data model, AI, FHIR, security, testing, ADRs |
| [DEPLOY.md](DEPLOY.md) | GitHub → Turso → Vercel, verification, scheduled jobs, rollback |

Render the Mermaid diagrams to images: `bash scripts/render-diagrams.sh`.

