# Fitness Data Hub (Dashboard)

A single-page, mobile-browsable training dashboard you can deploy to Vercel and open from your phone anytime. It reads the **same local Obsidian files** the Coach Paddy skill writes — no separate database, no cloud sync of your health data.

> **Live demo** renders bundled *synthetic* data (`data.sample.json`). Your real data (`data.json`) is generated locally and git-ignored — it never leaves your machine except to your own private deploy.

## What it shows

| Section | Source |
|---|---|
| **Overview** — race countdown hero, KPI cards, **整体训练负荷** (Fitness/Fatigue/Form + 耐力vs力量构成) | computed from recovery + curated + weekly logs |
| **Races** — countdowns, PBs, goals | curated |
| **Trail** — long-run progression, ankle stability, gap tracker | curated |
| **Hyrox** — station radar, finish estimate, bottlenecks | curated |
| **Strength** — Volume Load charts (main lifts + accessories) | `Training Plan.md` |
| **Running** — weekly volume (+<10% 增幅规则), 强度分布 (80/20), 关键训练配速趋势 (长跑/节奏/间歇), 心率效率 (Garmin avg HR) | weekly `Logs/` |
| **Recovery** — HRV/RHR & sleep/readiness trends | `Recovery Log.md` |
| **Nutrition** — today overview, macro rings, meal distribution, 14-day kcal trend + dynamic target, intake-vs-weight, weekly balance | `food-log.jsonl` (WeChat ClawBot / 训记) |
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
FITNESS_DIR="/path/to/vault/Fitness" \
DIET_LOG="/path/to/weixin-test/food-log.jsonl" npm run data   # generate YOUR data.json
npx serve public                     # open http://localhost:3000
```

**Nutrition data**: `food-log.jsonl` is written by the WeChat food pipeline (`food.mjs` local async or
`food-live.mjs` live bot). Point `DIET_LOG` at it; if unset or missing, the Nutrition section simply
shows an empty state.

**Unified diet model** — the dashboard accepts **either** source format, so both the WeChat
pipeline and 训记 records render identically:
- 统一格式 (WeChat pipeline / agent-normalized): `{ date, meal, meal_time, items:[{name, portion, kcal, protein, carb, fat}], total_kcal, total_protein, total_carb, total_fat }`
- 训记原始格式 (defensive fallback): `{ date, meal_type, foods:[{ name, amount, unit, ntr:{cal, protein, carb, fat} }] }` — `ntr` is per-100g, scaled by `amount`

每日宏量目标 `dietTarget` is curated in `build-data.mjs` (and in `make-sample.mjs` for the
demo): `{ kcal, protein, carb, fat }`. It powers the 热量缺口 and 蛋白质完成 KPI cards and the
宏量营养素 bars — edit it for your own targets.

**动态目标线** — the daily kcal chart's dashed target line is not flat: each day's target =
`dietTarget.kcal` + an estimated training burn, so a heavy training day gets a higher target

**Running analytics** (parsed from weekly log activity rows):
- 强度分布 80/20 — rows classified by training label: Easy/恢复/长跑/越野 → 轻松 (Zone1-2), 节奏/Tempo/间歇/Interval/VO2 → 高强度 (Zone3+); per-week easy/hard km stacked, hard% ≤20% is the polarized-training target
- 关键训练配速趋势 — Long Run / Tempo / Interval rows with both distance and duration get a pace (`paceSec = min×60/km`); lines compare **same type** only (长跑对长跑), never across types
- 心率效率 — same key rows with avg HR (`HR 165` / `心率 165` / `avg 165` in the training text, Garmin source) get `效率 = 速度(m/min) ÷ 心率`; rising = faster at the same HR. No HR → empty state, never invented
and the chart shows whether you actually ate enough. `build-data.mjs` infers the burn from the
same-day row in the weekly logs by keyword (`长跑/LSD` +500, `力量/Hyrox` +200, `跑` +250, else +0);
records with no matching training fall back to the baseline. `make-sample.mjs` tags each demo
day with its training type the same way.

Passcode is set at the top of `public/index.html` (`PASSCODE`). It's a front-end gate only — it deters casual visitors, it is **not** real security. Don't put sensitive identity data in this dashboard.

## Deploy to Vercel

```bash
cd dashboard
npx vercel deploy --prod
```

The template's deploy shows synthetic sample data (because `data.json` is git-ignored). To show your own data on a **private** deploy, run `npm run data` locally first, or wire `build-data.mjs` into your build with `FITNESS_DIR` set as an environment variable pointing at a synced copy of your vault.

Pages are served with `X-Robots-Tag: noindex` so search engines don't index them.
