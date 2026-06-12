# Claude Fitness Coach (Coach Paddy)

A data-driven, multi-sport AI fitness coach for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Coach Paddy reads your watch + strength-log data, turns it into actionable coaching (morning readiness, evening recaps, weekly reviews, adaptive plans), records everything in **plain-text local files you own**, and surfaces it all in a **mobile dashboard you can deploy to Vercel**.

**[中文说明见下方](#中文说明)**

---

## Three data sources

Coach Paddy is built around three feeds, each handling what it does best:

| Source | What it provides | How |
|---|---|---|
| **Garmin (佳明)** | Sleep, HRV, RHR, Body Battery, training load, ACWR, VO₂max, activities | [Garmin MCP](https://github.com/Taxuspt/garmin_mcp) · [China fork](https://github.com/BorisBW/garmin-mcp-cn) for `garmin.cn` |
| **Coros (高驰)** | Alternative / second-watch recovery + activity data (sleep, daily metrics, activities) | Coros MCP |
| **Xunji (训记)** | Strength-training log — read & write sets/reps/weight, Volume Load tracking | Xunji Open API v2 (token via env var) |

> Garmin and Coros are interchangeable for recovery/running data — use whichever watch you wear (or both, for dual-watch comparison). Xunji is the strength layer: the coach reads your logged lifts and writes new sessions back.

## Core logic

Everything is a transparent, tweakable formula in [`fitness-coach.md`](fitness-coach.md) — no black box.

- **Readiness Score (1-10)** — base 5, adjusted by sleep, HRV status vs. baseline, Body Battery, RHR trend, and active injury. Drives whether today is a full, reduced, or rest day.
- **Race Confidence Score (0-100%)** — `Injury(40%) + Load(25%) + Fitness(25%) + Recovery(10%)`. Triggers a plan pivot if it drops too far.
- **ACWR** — Acute:Chronic Workload Ratio read **directly from Garmin** (HR + training-effect based, not mileage-estimated). Safe band 0.8–1.3.
- **Volume Load** — `weight × total working reps` per lift, tracked over weeks so progress shows even when the weight doesn't change. Main lifts are tracked separately from accessories.

## Local-first recording

No proprietary app database. Every report is read from and written back to markdown files in your own [Obsidian](https://obsidian.md/) vault:

```
Fitness/
├── Coach Memory.md      # Athlete profile, history, baselines, nutrition, injury log
├── Training Plan.md     # Current plan + strength progress + Volume Load history
├── Recovery Log.md      # Daily: sleep / HRV / RHR / Body Battery / readiness
└── Logs/                # Weekly training logs (morning + evening detail)
    └── 2026-W10 (Mar02-Mar08).md
```

You own the data, it's diff-able in git, and it's portable. Templates are in [`examples/`](examples/).

## Mobile dashboard (deploy to Vercel)

The [`dashboard/`](dashboard/) folder is a static single-page app that parses those same local files into a phone-friendly dashboard — race countdowns, Volume Load charts, recovery trends, a Hyrox station radar, trail-prep tracker, and more. Deploy it to Vercel and check your training from anywhere.

```bash
cd dashboard
npm run sample          # synthetic demo data
npx vercel deploy --prod
```

Your real `data.json` is generated locally and git-ignored — the public deploy only ever shows synthetic sample data. See [`dashboard/README.md`](dashboard/README.md).

---

## Setup

### 1. Install a watch MCP server

**Garmin (global):**
```bash
uvx --python 3.12 --from git+https://github.com/Taxuspt/garmin_mcp garmin-mcp-auth
```
**Garmin (China, `garmin.cn`):**
```bash
GARMIN_IS_CN=true uvx --python 3.12 --from git+https://github.com/BorisBW/garmin-mcp-cn garmin-mcp-auth
```
**Coros:** add your Coros MCP server to `~/.claude/settings.json` the same way.

### 2. Register the MCP server(s) in `~/.claude/settings.json`

```json
{
  "mcpServers": {
    "garmin": {
      "command": "uvx",
      "args": ["--python", "3.12", "--from", "git+https://github.com/Taxuspt/garmin_mcp", "garmin-mcp"]
    }
  }
}
```
> China users: swap the repo for `git+https://github.com/BorisBW/garmin-mcp-cn` and add `"env": {"GARMIN_IS_CN": "true"}`.

### 3. (Optional) Xunji strength logging

Set your Xunji API token as an environment variable — **never hard-code it**:
```bash
export XUNJI_TOKEN="xjllm_xxxxxxxx"
```
The skill calls the Xunji Open API with `Authorization: Bearer $XUNJI_TOKEN`. Movement-name mappings are in [`xunji-movements.md`](xunji-movements.md).

### 4. Install the skill

```bash
cp fitness-coach.md ~/.claude/commands/fitness-coach.md
```
Then edit the **Athlete Profile** and **Memory Files** paths in `fitness-coach.md` to match your sport and vault.

### 5. Use it

```bash
claude
> /fitness-coach morning      # readiness report before training
> /fitness-coach evening      # training recap + injury check after
> /fitness-coach weekly       # volume + ACWR + strength progress review
```

## Commands

| Command | When | What |
|---|---|---|
| `/fitness-coach` | Anytime | Free chat — training, nutrition, race strategy |
| `/fitness-coach morning` | Wake up | Readiness Score + today's plan |
| `/fitness-coach evening` | Post-training | Analysis + Race Confidence + injury check + logs to Obsidian (+ Xunji write-back for strength) |
| `/fitness-coach weekly` | End of week | Volume trends + ACWR + Volume Load progress |
| `/fitness-coach plan` | As needed | Generate/update training plan |

## Repo structure

```
claude-fitness-cn/
├── README.md
├── fitness-coach.md        # The skill (copy to ~/.claude/commands/)
├── xunji-movements.md      # Strength movement name reference
├── examples/               # Obsidian memory-file templates
│   ├── coach-memory.md
│   ├── training-plan.md
│   └── recovery-log.md
└── dashboard/              # Vercel-deployable mobile dashboard
    ├── public/index.html
    ├── scripts/build-data.mjs
    └── scripts/make-sample.mjs
```

---

## 中文说明

基于 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 的数据驱动多项目 AI 健身教练。Coach Paddy 读取你的手表 + 力量训练数据，转化为可执行的教练建议（晨间准备度、训练后复盘、周度回顾、自适应计划），把一切记录在**你自己拥有的纯文本本地文件**里，并通过**可部署到 Vercel 的手机端 dashboard** 随时浏览。

### 三个数据源

| 来源 | 提供数据 | 方式 |
|---|---|---|
| **佳明 Garmin** | 睡眠、HRV、静息心率、Body Battery、训练负荷、ACWR、VO₂max、活动 | [Garmin MCP](https://github.com/Taxuspt/garmin_mcp) · [中国区 fork](https://github.com/BorisBW/garmin-mcp-cn) |
| **高驰 Coros** | 备用/双表的恢复与活动数据（睡眠、每日指标、活动） | Coros MCP |
| **训记 Xunji** | 力量训练记录 — 读写组数/次数/重量，Volume Load 追踪 | 训记开放 API v2（token 走环境变量） |

> 佳明和高驰在恢复/跑步数据上可互换，戴哪块用哪块（或双表对比）。训记是力量层：教练读取你记录的训练，并把新的训练写回。

### 核心逻辑（全部为透明可调的公式，见 `fitness-coach.md`）

- **准备度评分 (1-10)**：基准 5 分，按睡眠、HRV 状态、Body Battery、RHR 趋势、伤病调整 → 决定今天全力/降量/休息
- **比赛信心评分 (0-100%)**：伤病(40%) + 负荷(25%) + 竞技状态(25%) + 恢复(10%)，过低触发计划调整
- **ACWR**：急性:慢性负荷比，直接读 Garmin（基于心率+训练效果，比里程估算准），安全区 0.8–1.3
- **Volume Load**：每个动作 `重量 × 总工作次数`，按周追踪，重量没涨也能看到容量进步；大项与辅助分开追踪

### 本地优先的记录方式

没有私有 app 数据库，所有报告读写自你自己的 Obsidian 笔记库（`Coach Memory.md` / `Training Plan.md` / `Recovery Log.md` / `Logs/`）。数据你拥有、可 git diff、可迁移。模板见 `examples/`。

### 手机端 Dashboard

`dashboard/` 是一个静态单页应用，把上述本地文件解析成手机友好的仪表盘（比赛倒计时、Volume Load 图表、恢复趋势、Hyrox 站点雷达、越野备赛追踪等），部署到 Vercel 随时随地查看。真实 `data.json` 本地生成且被 git 忽略，公开部署只展示合成示例数据。

---

## License

MIT

## Credits

- [Garmin MCP Server](https://github.com/Taxuspt/garmin_mcp) by Taxuspt
- [python-garminconnect](https://github.com/cyberjunky/python-garminconnect) by cyberjunky
- Built with [Claude Code](https://docs.anthropic.com/en/docs/claude-code) by Anthropic
