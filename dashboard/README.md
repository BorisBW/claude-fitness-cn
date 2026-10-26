# Fitness Data Hub (Pulse Dashboard)

A single-page, mobile-browsable training dashboard you can deploy to Vercel and open from your phone. It reads the **same local Obsidian files** the Coach Paddy skill writes: no database, no cloud sync of your health data.

The centrepiece is the **pulse ledger**: one row per week, Monday to Sunday, every run drawn as a pulse. Logged weeks carry a slight tremor, planned weeks are clean lines, and the stack runs all the way to race day (a nod to the *Unknown Pleasures* cover).

> **Demo.** With no `data.json` present, the page falls back to `public/data.sample.json`: a synthetic athlete ("Demo Runner") building through a trail 50K and a Hyrox toward the Osaka Marathon. No real person's data is in this repo.

## What it shows

| Section | Source |
|---|---|
| **Overview**: race countdown, KPIs, pulse ledger | weekly `Logs/` + curated plan |
| **Macro cycle**: phases, long-run ladder, milestones | curated |
| **Races**: countdowns, PBs, goals, race strategy | curated |
| **Running**: weekly volume, HR efficiency, recent sessions | weekly `Logs/` |
| **Strength**: volume load, run vs strength minutes | `Training Plan.md` + `Logs/` |
| **Recovery**: HRV / RHR / sleep / readiness trends | `Recovery Log.md` |
| **Physio**: HR zones, baselines, predictions, weight | `Coach Memory.md` + curated |
| **Rehab**: injury status cards and tests | curated |
| **Diet**: 7-day intake vs targets, TDEE estimate | food log |

## How it works

```
Obsidian (local .md)  ──►  build-data.mjs  ──►  public/data.json  ──►  index.html
  Recovery Log              parsers +             git-ignored,          vanilla JS + SVG,
  Training Plan             curated.local.mjs     your real data        static SPA
  Coach Memory
  weekly Logs/
```

- **Parsers** (`scripts/build-data.mjs`) read the markdown tables the skill produces (English or Chinese headers).
- **Your curated data** (injuries, goals, PBs, races, macro plan, vault path) goes in `scripts/curated.local.mjs`, which is git-ignored. Copy the shape of `EXAMPLE_CURATED` in `build-data.mjs` and `export default` it. Without the file, the example block is used, personalised from your `npm run setup` answers (name, goal, race, injuries).
- No framework, no chart library: all charts are hand-drawn SVG.

## Run locally

```bash
npm run sample      # regenerate the synthetic demo data
npm run data        # build YOUR data.json (vault path from curated.local.mjs or FITNESS_DIR)
npx serve public    # open http://localhost:3000
```

## Optional passcode

Put `DASHBOARD_PASSCODE=yourcode` in `.env.local` (or set it as an env var) before `npm run data`. The page then shows a passcode screen. It is a front-end gate only: it keeps casual visitors out, it is **not** real security, so don't put sensitive identity data in the dashboard. The demo data has no passcode.

## Deploy to Vercel

```bash
npm run deploy      # npm run data, then vercel deploy --prod
```

`data.json` is uploaded with the deploy but never committed. A deploy straight from this repo (no `data.json`) shows the demo athlete. Pages are served with `X-Robots-Tag: noindex`.
