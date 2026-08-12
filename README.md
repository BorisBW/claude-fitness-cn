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
- **ACWR** — Acute:Chronic Workload Ratio read **directly from Garmin** (HR + training-effect based, not mileage-estimated). Safe band 0.8–1.3. ⚠️ No other device exposes a true ACWR — WHOOP substitutes a strain ratio, Apple Watch a volume ratio, and **both are labelled as such** rather than being read against the 0.8–1.3 band.
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

The [`dashboard/`](dashboard/) folder is a static single-page app that parses those same local files into a phone-friendly dashboard — race countdowns, Volume Load charts, recovery trends, a Hyrox station radar, trail-prep tracker, and more. Deploy it to Vercel and check your training from anywhere.

```bash
cd dashboard
npm run sample          # synthetic demo data
npx vercel deploy --prod
```

Your real `data.json` is generated locally and git-ignored — the public deploy only ever shows synthetic sample data. See [`dashboard/README.md`](dashboard/README.md).

---

## Setup

> **Installing this with an AI agent?** Point it at this repo and it can do the whole thing.
> The two rules it must not get wrong:
>
> 1. **`fitness-coach.md` is always installed.** It holds all the coaching logic.
> 2. **`apple-watch-fitness-coach.md` is an add-on, never a replacement.** It only overrides the
>    data source and the Readiness formula, and is useless on its own. Install it *in addition to*
>    the main skill, and only for Apple Watch users.
>
> | Wearable | Install | Then connect |
> |---|---|---|
> | Garmin / Coros / WHOOP | `fitness-coach.md` | the matching MCP server (step 1) |
> | Apple Watch | `fitness-coach.md` **and** `apple-watch-fitness-coach.md` | no MCP — set up the Shortcut (step 1) |
>
> Ask the user which wearable they own before choosing. If they own more than one, ask which is
> the primary — recovery metrics must all come from a single device or the SWC baselines drift.

### 1. Connect your wearable

Pick the one you actually wear. Only Apple Watch needs a different route.

<details open>
<summary><b>Garmin (佳明)</b></summary>

```bash
# Global accounts
uvx --python 3.12 --from git+https://github.com/Taxuspt/garmin_mcp garmin-mcp-auth

# China accounts (garmin.cn)
GARMIN_IS_CN=true uvx --python 3.12 --from git+https://github.com/BorisBW/garmin-mcp-cn garmin-mcp-auth
```
Then in `~/.claude/settings.json`:
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
</details>

<details>
<summary><b>Coros (高驰)</b> — ⚠️ Chinese accounts must use <code>region="cn"</code></summary>

Add the Coros MCP server to `~/.claude/settings.json` the same way, then authenticate.

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

Or configure it by hand:
```json
{
  "mcpServers": {
    "whoop": {
      "command": "npx",
      "args": ["whoop-ai-mcp"],
      "env": {
        "WHOOP_CLIENT_ID": "your_client_id",
        "WHOOP_CLIENT_SECRET": "your_client_secret"
      }
    }
  }
}
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

### 3. (Optional) Xunji strength logging

Set your Xunji API token as an environment variable — **never hard-code it**:
```bash
export XUNJI_TOKEN="xjllm_xxxxxxxx"
```
The skill calls the Xunji Open API with `Authorization: Bearer $XUNJI_TOKEN`. Movement-name mappings are in [`xunji-movements.md`](xunji-movements.md).

### 4. Install the skill

```bash
mkdir -p ~/.claude/skills/fitness-coach
cp fitness-coach.md   ~/.claude/skills/fitness-coach/SKILL.md
cp xunji-movements.md ~/.claude/skills/fitness-coach/     # only if you use Xunji
```

**Apple Watch users — install the adapter as well:**
```bash
mkdir -p ~/.claude/skills/apple-watch-fitness-coach
cp apple-watch-fitness-coach.md ~/.claude/skills/apple-watch-fitness-coach/SKILL.md
```
It layers on top of the main skill (overriding only the data source and the Readiness formula),
so keep both installed.

Then edit the **Athlete Profile** and **Memory Files** paths in your installed `SKILL.md` to match
your sport and vault.

> **Upgrading from an earlier version?** Older releases installed to
> `~/.claude/commands/fitness-coach.md`. That still works, but the `skills/` layout above is the
> current mechanism — move it over and delete the old file so you don't run two copies.
>
> The recovery file was also renamed `Recovery Log.md` → `Athlete Bio Data.md`. Rename yours to
> match; the dashboard reads either, preferring the new name.

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
├── LICENSE
├── fitness-coach.md              # Main skill — Garmin / Coros / WHOOP
├── apple-watch-fitness-coach.md  # Apple Watch data-source adapter (install alongside)
├── xunji-movements.md            # Strength movement name reference
├── examples/               # Obsidian memory-file templates
│   ├── coach-memory.md
│   ├── training-plan.md
│   └── athlete-bio-data.md
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

### 安装（两个 skill 的关系）

大多数人是直接把这个 repo 链接丢给 agent 让它自己装。两条不能搞错：

1. **`fitness-coach.md` 永远要装**，教练逻辑全在里面
2. **`apple-watch-fitness-coach.md` 是附加，不是替代**——它只覆盖数据源和 Readiness 公式，单独装等于空转。Apple Watch 用户要**两个都装**

| 设备 | 装哪些 | 再连什么 |
|---|---|---|
| 佳明 / 高驰 / WHOOP | `fitness-coach.md` | 对应的 MCP server |
| Apple Watch | `fitness-coach.md` **+** `apple-watch-fitness-coach.md` | 不用 MCP，配快捷指令 |

装之前先问用户戴哪块表。戴不止一块的话要问哪块是主表——恢复类指标必须全部来自同一块，否则 SWC 基线会漂。

### 核心逻辑（全部为透明可调的公式，见 `fitness-coach.md`）

- **准备度评分 (1-10)**：基准 5 分，按睡眠、HRV、Body Battery、RHR 趋势、伤病调整 → 决定今天全力/降量/休息。**缺槽时显式降级**：没有 Body Battery 的设备改用必答的主观 1-5 分（能量/酸痛）顶上，且报告里会标注这个分数是几项算出来的
- **HRV 用 SWC 自算**：取自己近 28 天的 μ±0.5SD 作正常带 + 7 日滚动均值，不用厂商的滞后标签。**这套方法与数据源无关**，换表也成立（但换表要重新攒 28 天基线）
- **比赛信心评分 (0-100%)**：伤病(40%) + 负荷(25%) + 竞技状态(25%) + 恢复(10%)，过低触发计划调整
- **ACWR**：急性:慢性负荷比，直接读 Garmin（基于心率+训练效果，比里程估算准），安全区 0.8–1.3。⚠️ 其他设备没有真 ACWR——WHOOP 用 strain 比值、Apple Watch 用里程比值代替，**都会明确标注不是 ACWR**，不套用 0.8–1.3 这条线
- **Volume Load**：每个动作 `重量 × 总工作次数`，按周追踪，重量没涨也能看到容量进步；大项与辅助分开追踪

### 本地优先的记录方式

没有私有 app 数据库，所有报告读写自你自己的 Obsidian 笔记库（`Coach Memory.md` / `Training Plan.md` / `Athlete Bio Data.md` / `Logs/`）。数据你拥有、可 git diff、可迁移。模板见 `examples/`。

### 手机端 Dashboard

`dashboard/` 是一个静态单页应用，把上述本地文件解析成手机友好的仪表盘（比赛倒计时、Volume Load 图表、恢复趋势、Hyrox 站点雷达、越野备赛追踪等），部署到 Vercel 随时随地查看。真实 `data.json` 本地生成且被 git 忽略，公开部署只展示合成示例数据。

---

## License

MIT — see [LICENSE](LICENSE).

## Credits

- [Garmin MCP Server](https://github.com/Taxuspt/garmin_mcp) by Taxuspt
- [python-garminconnect](https://github.com/cyberjunky/python-garminconnect) by cyberjunky
- [whoop-ai-mcp](https://github.com/shashankswe2020-ux/whoop-mcp) by shashankswe2020-ux
- Built with [Claude Code](https://docs.anthropic.com/en/docs/claude-code) by Anthropic
