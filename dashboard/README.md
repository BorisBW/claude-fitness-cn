# Fitness Data Hub (Dashboard)

A single-page, mobile-browsable training dashboard you can deploy to Vercel and open from your phone anytime. It reads the **same local Obsidian files** the Coach Paddy skill writes — no separate database, no cloud sync of your health data.

> **Live demo** renders bundled *synthetic* data (`data.sample.json`). Your real data (`data.json`) is generated locally and git-ignored — it never leaves your machine except to your own private deploy.

## What it shows

| Section | Source |
|---|---|
| **Overview** — race countdown hero, KPI cards | computed from recovery + curated |
| **Races** — countdowns, PBs, goals | curated |
| **Trail** — long-run progression, ankle stability, gap tracker | curated |
| **Hyrox** — station radar, finish estimate, bottlenecks | curated |
| **Strength** — Volume Load charts (main lifts + accessories) | `Training Plan.md` |
| **Running** — weekly volume, recent sessions | weekly `Logs/` |
| **Recovery** — HRV/RHR & sleep/readiness trends | `Recovery Log.md` |
| **Physio** — HR zones, baselines, weight, nutrition | `Coach Memory.md` + curated |
| **Rehab** — injury status cards | curated |

## How it works

```
Obsidian (local .md)  ──►  build-data.mjs  ──►  public/data.json  ──►  index.html
  Recovery Log              (parsers +           (git-ignored,         (Chart.js,
  Training Plan              curated edits)        your real data)       static SPA)
  Coach Memory
  weekly Logs/
```

- **Parsers** (`scripts/build-data.mjs`) read the markdown tables the skill produces.
- **Curated block** at the bottom of `build-data.mjs` holds hand-maintained data (injuries, goals, PBs, race plans) — edit it for your own training.
- The page is a static SPA — no backend. Charts via Chart.js from CDN.

## Run locally

```bash
cd dashboard
npm run sample                       # generate the synthetic demo data
FITNESS_DIR="/path/to/vault/Fitness" npm run data   # generate YOUR data.json
npx serve public                     # open http://localhost:3000
```

Passcode is set at the top of `public/index.html` (`PASSCODE`). It's a front-end gate only — it deters casual visitors, it is **not** real security. Don't put sensitive identity data in this dashboard.

## Deploy to Vercel

```bash
cd dashboard
npx vercel deploy --prod
```

The template's deploy shows synthetic sample data (because `data.json` is git-ignored). To show your own data on a **private** deploy, run `npm run data` locally first, or wire `build-data.mjs` into your build with `FITNESS_DIR` set as an environment variable pointing at a synced copy of your vault.

Pages are served with `X-Robots-Tag: noindex` so search engines don't index them.
