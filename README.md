# Claude Fitness Coach (Coach Paddy)

A data-driven, multi-sport AI fitness coach for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Coach Paddy reads your watch + strength-log data, turns it into actionable coaching (morning readiness, evening recaps, weekly reviews, adaptive plans), records everything in **plain-text local files you own**, and surfaces it all in a **mobile dashboard you can deploy to Vercel**.

**[中文说明见下方](#中文说明)**

---

## Supported wearables

The coaching logic never talks to a device directly — it reads **six slots** (`sleep`, `hrv`,
`rhr`, `energy`, `load`, `activities`). Each source fills what it can, and the Readiness algorithm
degrades explicitly when a slot is missing. Adding a device is a row in a mapping table, not a fork.

| | Garmin | Coros | WHOOP | Apple Watch |
|---|:---:|:---:|:---:|:---:|
| Sleep | ✅ score | ✅ score | ✅ score | ⚠️ duration only |
| HRV | ✅ | ✅ | ✅ | ✅ |
| Resting HR | ✅ | ✅ | ✅ | ✅ |
| Energy / Body Battery | ✅ | ❌ | ✅ recovery % | ❌ |
| ACWR / training load | ✅ true ACWR | ❌ | ⚠️ strain ratio | ❌ |
| Activities | ✅ + splits | ✅ summary | ✅ summary | ⚠️ summary only |
| Structured workout push | ✅ | ❌ | ❌ | ❌ |
| **Pulls without your phone** | ✅ | ✅ | ✅ | ❌ phone must push |

**Garmin** is the reference implementation and fills every slot. **WHOOP** is the closest
alternative — a real cloud API with OAuth, and its recovery % is a genuine Body Battery analogue.
**Coros** covers recovery and activities. **Apple Watch** is the odd one out: Apple publishes no
cloud API for HealthKit, so data has to be pushed off the phone by a Shortcut, and several metrics
simply don't exist. It runs a [separate adapter skill](apple-watch-fitness-coach.md) — see
[what it can't do](#apple-watch-limitations).

Plus the strength layer, which no wearable covers:

| Source | What it provides | How |
|---|---|---|
| **Xunji (训记)** | Strength-training log — read & write sets/reps/weight, Volume Load tracking | Xunji Open API v2 (token via env var) |

## Core logic

Everything is a transparent, tweakable formula in [`fitness-coach.md`](fitness-coach.md) — no black box.

- **Readiness Score (1-10)** — base 5, adjusted by sleep, HRV, energy, RHR trend, and active injury. Drives whether today is a full, reduced, or rest day. **Degrades explicitly on devices that can't fill every slot**: a required subjective 1-5 question replaces a missing Body Battery, and the report states how many inputs produced the number.
- **HRV via SWC** — scored against *your own* trailing 28 days (`μ ± 0.5×SD` band + 7-day rolling mean) instead of a manufacturer's lagging status label. **Source-agnostic by construction** — it survives a device switch, though the baseline has to be rebuilt over ~28 days.
- **Race Confidence Score (0-100%)** — `Injury(40%) + Load(25%) + Fitness(25%) + Recovery(10%)`. Triggers a plan pivot if it drops too far.
- **Training Load (two-pool model)** — unified endurance + strength load tracking. Endurance pool (k=7 decay) and strength pool (k=14, recovers 2x slower). CTL tracks **endurance fitness only**; strength enters fatigue but not fitness (strength progress is tracked by VL trends and PRs, not by a load average). sRPE modifier for strength sessions when reported. Full rationale in [`notes/training-load-encoding.md`](notes/training-load-encoding.md).
- **ACWR** — Self-computed from our own load model: 7-day acute / 28-day chronic, **both pools included**. This captures strength training that Garmin's HR-based ACWR systematically underestimates. Safe band 0.8–1.3. The dashboard labels it `含力量` when using the model-based number.
- **Volume Load** — `weight × total working reps` per lift, tracked over weeks so progress shows even when the weight doesn't change. Main lifts are tracked separately from accessories.

## Local-first recording

No proprietary app database. Every report is read from and written back to markdown files in your own [Obsidian](https://obsidian.md/) vault:

```
Fitness/
├── Coach Memory.md      # Athlete profile, history, baselines, nutrition, injury log
├── Training Plan.md     # Current plan + strength progress + Volume Load history
├── Athlete Bio Data.md  # Daily: sleep / HRV / RHR / Body Battery / readiness + body comp
└── Logs/                # Weekly training logs (morning + evening detail)
    └── 2026-W10 (Mar02-Mar08).md
```

You own the data, it's diff-able in git, and it's portable. Templates are in [`examples/`](examples/).

## Mobile dashboard (deploy to Vercel)

The [`dashboard/`](dashboard/) folder is a static single-page app that parses those same local files into a phone-friendly dashboard. Its centrepiece is the **pulse ledger**: one row per week, every run drawn as a pulse, logged weeks running into the planned ones all the way to race day. Around it: macro cycle, races, running, strength, recovery, physiology, rehab and diet. Deploy it to Vercel and check your training from anywhere.

```bash
cd dashboard
npm run sample          # synthetic demo athlete (Road to Osaka)
npx vercel deploy --prod
```

Your real `data.json` is generated locally and git-ignored. Without it the page falls back to the synthetic demo athlete, so the public deploy never shows your data. See [`dashboard/README.md`](dashboard/README.md).

---

## Setup

**Requirements**: [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Node.js](https://nodejs.org) 18+, and for Garmin / Coros the [`uv`](https://docs.astral.sh/uv/getting-started/installation/) tool (it provides `uvx`).

### The easy way — `npm run setup` (graphical)

```bash
git clone https://github.com/BorisBW/claude-fitness-cn.git
cd claude-fitness-cn
npm run setup
```

A form opens in your browser (中文 / English). Five short pages: how the coach should talk to you →
which watch you wear → a bit about you (age, sport, goal, injuries, training days per week) →
where to keep your files → **Install**. Nothing is written before you press Install. It then:

- installs the skill into `~/.claude/skills/fitness-coach/` (plus the Apple Watch adapter if you picked Apple Watch)
- writes `~/.claude/fitness-coach/config.json` (device, region, data folder, coaching tone — direct / gentle / analyst / drill sergeant / training buddy — and language) and, for Xunji users, `secrets.json` with the token (no token yet? paste it to the coach in chat later)
- creates your data folder with **Coach Memory**, **Training Plan** (a weekly skeleton built from your answers) and **Athlete Bio Data**, plus `Logs/` — **existing files are never overwritten**
- shows the one `claude mcp add …` command that connects your watch, with a Copy button

**Not a terminal person?** In the Claude desktop app, paste the repo link and say *"set up Coach Paddy"* — Claude clones it, runs `npm run setup`, and opens the form for you. The remaining `claude mcp add …` command can be pasted back to Claude as well.

Run that command, start `claude` (or open the Code tab in the desktop app), and type:

```
/fitness-coach check
```

The coach tests the watch connection, the files and the strength log, and tells you exactly what to
fix if anything is off. Then, once:

```
/fitness-coach onboard
```

This pulls your watch history — 90 days of activities, 28 days of sleep / HRV / resting HR — and
turns it into your personal baseline (no 28-day cold start), a **first assessment** (volume trend,
intensity split, recovery, risk flags, the gap to your goal), a filled-in first training block, and
a **dashboard** served locally (`npm run dashboard`). About five minutes on Garmin. Tomorrow morning:
`/fitness-coach morning`. Without a watch, the assessment comes from a short interview and the first
28 days build the baseline instead.

> **Installing with an AI agent?** Tell it: *clone the repo, run `npm run setup`, and relay the form
> to me.* If it can't open a browser, the manual steps below do the same thing. Two rules it must not
> get wrong: `fitness-coach.md` is always installed; `apple-watch-fitness-coach.md` is an add-on for
> Apple Watch users only, never a replacement.

> **Upgrading?** Re-run `npm run setup`. It upgrades the skill file, keeps your memory files, and
> prefills the form from your existing config. Older releases kept personal settings inside `SKILL.md`
> and installed to `~/.claude/commands/fitness-coach.md` — point the data-folder field at your existing
> `Fitness/` folder and delete the old command file. The recovery file was renamed
> `Recovery Log.md` → `Athlete Bio Data.md`; the dashboard reads either.

### Manual setup

<details>
<summary>Do the same thing by hand</summary>

1. **Connect your wearable.** User-scoped MCP servers are stored in `~/.claude.json`; add them with the
   CLI, not by editing `settings.json`.

   ```bash
   # Garmin (global accounts)
   claude mcp add --scope user garmin -- uvx --python 3.12 --from git+https://github.com/Taxuspt/garmin_mcp garmin-mcp
   uvx --python 3.12 --from git+https://github.com/Taxuspt/garmin_mcp garmin-mcp-auth      # log in once

   # Garmin China (garmin.cn)
   claude mcp add --scope user --env GARMIN_IS_CN=true garmin -- uvx --python 3.12 --from git+https://github.com/BorisBW/garmin-mcp-cn garmin-mcp
   GARMIN_IS_CN=true uvx --python 3.12 --from git+https://github.com/BorisBW/garmin-mcp-cn garmin-mcp-auth

   # Coros (Chinese accounts must log in with region="cn" — see Device notes)
   claude mcp add --scope user coros -- uvx --python 3.12 --from git+https://github.com/cygnusb/coros-mcp coros-mcp serve

   # WHOOP (needs a developer app from developer.whoop.com)
   npx whoop-ai-mcp setup --client=claude-code --verify
   ```
   Apple Watch needs no MCP server — set up the Shortcut described in
   [`apple-watch-fitness-coach.md`](apple-watch-fitness-coach.md).

2. **Write the config** at `~/.claude/fitness-coach/config.json`:
   ```json
   {
     "version": 1, "language": "en", "tone": "direct",
     "wearable": "garmin", "region": "global",
     "dataDir": "/path/to/Fitness", "appleExportDir": null, "xunji": false
   }
   ```
   Xunji users add `~/.claude/fitness-coach/secrets.json`: `{ "xunjiToken": "xjllm_…" }`.

3. **Create the data folder** from the templates in [`examples/`](examples/): `Coach Memory.md`,
   `Training Plan.md`, `Athlete Bio Data.md`, and an empty `Logs/`.

4. **Install the skill**:
   ```bash
   mkdir -p ~/.claude/skills/fitness-coach
   cp fitness-coach.md   ~/.claude/skills/fitness-coach/SKILL.md
   cp xunji-movements.md ~/.claude/skills/fitness-coach/     # Xunji users only
   # Apple Watch users additionally:
   mkdir -p ~/.claude/skills/apple-watch-fitness-coach
   cp apple-watch-fitness-coach.md ~/.claude/skills/apple-watch-fitness-coach/SKILL.md
   ```

5. `claude` → `/fitness-coach check`.
</details>

### Device notes

<details>
<summary><b>Coros (高驰)</b> — ⚠️ Chinese accounts must use <code>region="cn"</code></summary>

`npm run setup` (or the manual command above) adds the server; the first data call then asks you to authenticate.

**The region gotcha, because it costs everyone an hour:** Chinese Coros accounts live on
`teamcnapi.coros.com`. The auth tool documents `eu` and `us` only, but the underlying client also
accepts `cn`. Logging in with `eu`/`us` **appears to succeed** and hands back a token — then every
data call fails with `Access token is invalid`. Authenticate with `region="cn"`.

Two other quirks worth knowing:
- Calories come back in **milli-kcal** — divide by 1000 (`415951` → 416 kcal).
- `max_hr` is often `null`; `avg_hr` is reliable.

Coros fills `sleep`, `hrv`, `rhr` and `activities`. There is no Body Battery equivalent and no
ACWR, so the Readiness algorithm runs its reduced form (see [Readiness](#core-logic)).
</details>

<details>
<summary><b>WHOOP</b></summary>

Uses [`whoop-ai-mcp`](https://github.com/shashankswe2020-ux/whoop-mcp) (MIT). You need a WHOOP
developer app for the client id/secret — create one at [developer.whoop.com](https://developer.whoop.com/).

The setup wizard writes the config for you:
```bash
npx whoop-ai-mcp setup --client=claude-code --verify
```

A browser opens for authorisation on first launch; tokens are cached locally and refresh
automatically.

⚠️ **WHOOP strain is not ACWR** — it's a 0–21 logarithmic scale. The skill derives a 7d ÷ 28d
*strain ratio* and labels it as such; it behaves like ACWR but the 0.8–1.3 band was calibrated on
Garmin's number, so read it as directional.

⚠️ Collection calls return at most 25 records, so the 28-day HRV baseline is built from
`get_calendar` rather than a single collection call.

⚠️ WHOOP requires an active paid membership — the hardware is inert without one.

> Alternative: [`whoop-mcp-unofficial`](https://github.com/davidmosiah/whoop-mcp) (also MIT) has
> higher npm download volume and ships releases more frequently, but far less independent
> validation. Tool names differ, so the skill's mapping table would need updating if you switch.
</details>

<details>
<summary><b>Apple Watch</b> — no MCP server, uses a free iOS Shortcut</summary>

Apple publishes **no cloud API** for HealthKit — no REST endpoint, no OAuth, no server-side
token. Data can only leave the phone if the phone pushes it. So this route uses the stock,
free **Shortcuts** app to write JSON into iCloud Drive, which syncs to your desktop as an
ordinary file. **No MCP server, no paid app, no server to deploy.**

```
Apple Watch → iPhone HealthKit → Shortcuts (scheduled) → iCloud Drive → desktop → skill
```

Full step-by-step setup is in [`apple-watch-fitness-coach.md`](apple-watch-fitness-coach.md).
Install **both** skills — the Apple one is a data-source adapter that reuses the main coaching
logic rather than duplicating it.

<a name="apple-watch-limitations"></a>
**What Apple Watch can't do** (know this before you set it up):
- **No Body Battery equivalent** → replaced by a required subjective 1-5 energy question
- **No ACWR** → replaced by a plainly-labelled volume ratio
- **No per-km splits, pace curves, HR-zone breakdown, GPS routes, cadence or running power**
- **Sleep is duration-only** — Apple's Sleep Score is a derived metric and isn't exported
- **No structured workout push**
- **Best-effort delivery** — Shortcuts can't read Health data while the phone is locked, so a
  scheduled run can miss. Each export covers the last 48 hours so the next run repairs the gap.
</details>

### Dashboard (optional)

The dashboard parses your Obsidian vault into a visual summary. To run it with your own data:

```bash
cd dashboard

# Point at your vault's Fitness folder:
node scripts/build-data.mjs                          # reads dataDir from ~/.claude/fitness-coach/config.json
# or point it somewhere explicitly:
FITNESS_DIR="/path/to/YourVault/Fitness" node scripts/build-data.mjs

# Preview locally:
npx serve public
```

Without further setup the dashboard uses your `npm run setup` answers (name, goal, race, injuries). For the full picture (macro cycle, weekly plan, PBs, physiology, diet targets) copy the shape of `EXAMPLE_CURATED` in `build-data.mjs` into `scripts/curated.local.mjs` (git-ignored) and `export default` it. Optional: `DASHBOARD_PASSCODE=...` in `dashboard/.env.local` adds a front-end passcode screen.

To deploy with sample data (for demo / public sharing):
```bash
npm run sample          # generates synthetic data
npx vercel deploy --prod
```

Your real `data.json` is git-ignored — the public deploy only ever shows synthetic sample data.

## Commands

| Command | When | What |
|---|---|---|
| `/fitness-coach check` | Right after setup | Tests the watch, files and strength-log connections; says what to fix |
| `/fitness-coach onboard` | Once, after the first green check | Imports 90 days of activities + 28 days of recovery → baseline, first assessment, first plan block, dashboard |
| `/fitness-coach` | Anytime | Free chat — training, nutrition, race strategy |
| `/fitness-coach morning` | Wake up | Readiness Score + today's plan |
| `/fitness-coach evening` | Post-training | Analysis + Race Confidence + injury check + logs to Obsidian (+ Xunji write-back for strength) |
| `/fitness-coach weekly` | End of week | Volume trends + ACWR + Volume Load progress |
| `/fitness-coach plan` | As needed | Generate/update training plan |

## Repo structure

```
claude-fitness-cn/
├── README.md
├── LICENSE
├── package.json                  # `npm run setup`
├── setup/                        # graphical installer: server.mjs · index.html · generate.mjs
├── fitness-coach.md              # Main skill — Garmin / Coros / WHOOP
├── apple-watch-fitness-coach.md  # Apple Watch data-source adapter (install alongside)
├── xunji-movements.md            # Strength movement name reference
├── examples/               # Obsidian memory-file templates
│   ├── coach-memory.md
│   ├── training-plan.md
│   └── athlete-bio-data.md
├── notes/                  # Algorithm theory docs (design rationale + references)
│   ├── training-load-encoding.md  # Two-pool CTL/ATL/TSB model, sRPE/VL layers
│   ├── readiness.md               # Readiness Score, HRV SWC, recovery signals
│   └── nutrition.md               # TDEE reversal, dynamic calorie target, gap logic
└── dashboard/              # Vercel-deployable mobile dashboard
    ├── public/index.html
    ├── scripts/build-data.mjs
    └── scripts/make-sample.mjs
```

---

## 中文说明

基于 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 的数据驱动多项目 AI 健身教练。Coach Paddy 读取你的手表 + 力量训练数据，转化为可执行的教练建议（晨间准备度、训练后复盘、周度回顾、自适应计划），把一切记录在**你自己拥有的纯文本本地文件**里，并通过**可部署到 Vercel 的手机端 dashboard** 随时浏览。

### 支持的设备

教练逻辑不直接对接设备，只读**六个数据槽**（`sleep` / `hrv` / `rhr` / `energy` / `load` / `activities`）。
每个数据源填自己能填的槽，缺槽时准备度算法显式降级。加一块表 = 加一行映射，不需要 fork。

| | 佳明 Garmin | 高驰 Coros | WHOOP | Apple Watch |
|---|:---:|:---:|:---:|:---:|
| 睡眠 | ✅ 评分 | ✅ 评分 | ✅ 评分 | ⚠️ 仅时长 |
| HRV | ✅ | ✅ | ✅ | ✅ |
| 静息心率 | ✅ | ✅ | ✅ | ✅ |
| 能量 / Body Battery | ✅ | ❌ | ✅ recovery % | ❌ |
| ACWR / 训练负荷 | ✅ 真 ACWR | ❌ | ⚠️ strain 比值 | ❌ |
| 活动 | ✅ 含分段 | ✅ 汇总 | ✅ 汇总 | ⚠️ 仅汇总 |
| 推结构化课程到表 | ✅ | ❌ | ❌ | ❌ |
| **不需要手机在场** | ✅ | ✅ | ✅ | ❌ 靠手机推 |

**佳明**是参考实现，六个槽全填。**WHOOP** 最接近——有真正的云端 API + OAuth，recovery % 是 Body
Battery 的对位物（⚠️ 需付费会员，硬件不订阅就是块砖）。**高驰**覆盖恢复和活动，
⚠️ **中国区账号必须用 `region="cn"`**，用 eu/us 登录会"成功"但拉数据时报 token 无效。

**Apple Watch 是例外**：苹果**不提供任何 HealthKit 云端 API**，数据只能由手机推出来。走系统自带
的「快捷指令」定时导出 JSON 到 iCloud 云盘，电脑同步下来当普通文件读——**不需要 MCP、不需要付费
app、不需要建服务器**。它用[独立的适配器 skill](apple-watch-fitness-coach.md)，
且**有多项功能拿不到**：无 Body Battery、无 ACWR、无分段配速/心率区间/GPS 轨迹、睡眠只有时长、
手机锁屏时导出会失败（靠每次导出覆盖 48 小时来补）。装之前先看清楚这张表。

力量层（没有手表能覆盖）：

| 来源 | 提供数据 | 方式 |
|---|---|---|
| **训记 Xunji** | 力量训练记录 — 读写组数/次数/重量，Volume Load 追踪 | 训记开放 API v2（token 走环境变量） |

### 安装

**需要**：[Claude Code](https://docs.anthropic.com/en/docs/claude-code)、[Node.js](https://nodejs.org) 18+；佳明 / 高驰用户还需要 [`uv`](https://docs.astral.sh/uv/getting-started/installation/)（提供 `uvx` 命令）。

```bash
git clone https://github.com/BorisBW/claude-fitness-cn.git
cd claude-fitness-cn
npm run setup
```

浏览器会打开一张表单（中文 / English），五页：教练说话风格 → 戴哪块表 → 关于你（年龄、主项、目标、伤病、每周练几天）→ 数据放哪 → **安装**。按「安装」之前不写任何东西。然后它会：

- 把技能装到 `~/.claude/skills/fitness-coach/`（选了 Apple Watch 会一并装适配器）
- 写入 `~/.claude/fitness-coach/config.json`（设备、区域、数据文件夹、教练风格 5 选 1、语言）；用训记的话 token 存到 `secrets.json`（现在没有 token？以后在对话里发给教练就行）
- 创建数据文件夹和三个记忆文件：**Coach Memory**、按你的答案生成周结构骨架的 **Training Plan**、**Athlete Bio Data**，以及 `Logs/`。**已有文件不会被覆盖**
- 显示那一条把手表接到 Claude Code 的 `claude mcp add …` 命令，带复制按钮

**不习惯用终端？** 在 Claude 桌面 App 里把 repo 链接贴给它，说「帮我安装教练」，Claude 会自己克隆、运行 `npm run setup`、打开表单。剩下那条 `claude mcp add …` 命令也可以直接贴回去让它运行。

运行那条命令，启动 `claude`（或桌面 App 的 Code 标签页），输入 `/fitness-coach check`：教练会测试手表、文件和训记连接，哪里不通直接告诉你怎么修。

然后输入一次 `/fitness-coach onboard`：教练把手表里的历史拉回来（90 天活动、28 天睡眠 / HRV / 静息心率），直接算出你的个人基线（不用等 28 天），写一份**首次评估**（跑量趋势、强度分布、恢复状况、风险点、和目标的差距），把第一个训练块填实，再把 **dashboard** 在本地开起来（`npm run dashboard`）。佳明大约 5 分钟。第二天早上 `/fitness-coach morning`。没有手表的话，评估改成一轮问答，基线靠前 28 天建立。

**让 AI agent 装？** 跟它说：克隆 repo，运行 `npm run setup`，把表单转述给我填。打不开浏览器的话，英文部分的 Manual setup 是同样的步骤。两条不能搞错：`fitness-coach.md` 永远要装；`apple-watch-fitness-coach.md` 只给 Apple Watch 用户加装，不是替代。

**升级？** 重新 `npm run setup`：技能文件升级、记忆文件保留、表单按现有配置预填。旧版本把个人设置写在 `SKILL.md` 里、装在 `~/.claude/commands/`，升级时把数据文件夹指向原来的 `Fitness/` 目录，再删掉旧的 command 文件。

**手动安装 / 设备细节**：见英文部分的 Manual setup 和 Device notes。MCP 服务器要用 `claude mcp add --scope user …` 添加（存在 `~/.claude.json`），不是写进 `settings.json`。高驰中国区账号登录必须 `region="cn"`，用 eu/us 会"成功"但拉数据时报 token 无效。

### 核心逻辑（全部为透明可调的公式，见 `fitness-coach.md`）

- **准备度评分 (1-10)**：基准 5 分，按睡眠、HRV、Body Battery、RHR 趋势、伤病调整 → 决定今天全力/降量/休息。**缺槽时显式降级**：没有 Body Battery 的设备改用必答的主观 1-5 分（能量/酸痛）顶上，且报告里会标注这个分数是几项算出来的
- **HRV 用 SWC 自算**：取自己近 28 天的 μ±0.5SD 作正常带 + 7 日滚动均值，不用厂商的滞后标签。**这套方法与数据源无关**，换表也成立（但换表要重新攒 28 天基线）
- **比赛信心评分 (0-100%)**：伤病(40%) + 负荷(25%) + 竞技状态(25%) + 恢复(10%)，过低触发计划调整
- **训练负荷（两池模型）**：统一的耐力+力量负荷追踪。耐力池（k=7 衰减）和力量池（k=14，恢复慢 2 倍）。CTL 只追踪**耐力体能**；力量进疲劳不进体能（力量进步用 VL 趋势和 PR 追踪）。力量日有 sRPE 时按强度修正。完整设计见 [`notes/training-load-encoding.md`](notes/training-load-encoding.md)
- **ACWR**：用我们自己的负荷模型计算（7 天急性 / 28 天慢性，**两池都算**），捕捉 Garmin HR-based ACWR 系统性低估的力量训练。安全区 0.8–1.3。Dashboard 标注 `含力量`
- **Volume Load**：每个动作 `重量 × 总工作次数`，按周追踪，重量没涨也能看到容量进步；大项与辅助分开追踪

### 本地优先的记录方式

没有私有 app 数据库，所有报告读写自你自己的 Obsidian 笔记库（`Coach Memory.md` / `Training Plan.md` / `Athlete Bio Data.md` / `Logs/`）。数据你拥有、可 git diff、可迁移。模板见 `examples/`。

### 手机端 Dashboard

`dashboard/` 是一个静态单页应用，把上述本地文件解析成手机友好的仪表盘（核心是「脉冲周历」：每周一行、每次跑步一个脉冲，已练的周一路连到计划中的周、直到比赛日；另有大周期、比赛、跑步、力量、恢复、生理、康复、营养），部署到 Vercel 随时随地查看。真实 `data.json` 本地生成且被 git 忽略，公开部署只展示合成示例数据。

---

## License

MIT — see [LICENSE](LICENSE).

## Credits

- [Garmin MCP Server](https://github.com/Taxuspt/garmin_mcp) by Taxuspt
- [python-garminconnect](https://github.com/cyberjunky/python-garminconnect) by cyberjunky
- [whoop-ai-mcp](https://github.com/shashankswe2020-ux/whoop-mcp) by shashankswe2020-ux
- Built with [Claude Code](https://docs.anthropic.com/en/docs/claude-code) by Anthropic
