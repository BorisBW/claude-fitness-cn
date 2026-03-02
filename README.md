# Claude Fitness Coach (Coach Paddy)

A data-driven fitness coaching skill for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) powered by Garmin data via MCP.

Coach Paddy pulls your sleep, HRV, heart rate, body battery, and training data from Garmin Connect and turns it into actionable coaching — morning readiness reports, evening training recaps, weekly reviews, and adaptive training plans.

**[中文说明见下方](#中文说明)**

## What It Does

| Command | When | What |
|---|---|---|
| `/fitness-coach` | Anytime | Free chat — training, nutrition, race strategy |
| `/fitness-coach morning` | Wake up | Readiness Score (1-10) + today's plan + nutrition tips |
| `/fitness-coach evening` | Post-training | Training analysis + Race Confidence Score + injury check |
| `/fitness-coach weekly` | End of week | Volume trends + ACWR + next week plan |
| `/fitness-coach plan` | As needed | Generate/update training plan |

### Key Features
- **Readiness Score** (1-10): Combines sleep, HRV, RHR, Body Battery, and injury status
- **Race Confidence Score** (0-100%): 4-factor formula tracking injury (40%), load compliance (25%), fitness (25%), recovery (10%)
- **ACWR Monitoring**: Acute:Chronic Workload Ratio to prevent overtraining
- **Obsidian Integration**: All data persisted in markdown files for full ownership
- **Multilingual**: Responds in whatever language you write in

## Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (CLI)
- A Garmin watch + Garmin Connect account
- [Garmin MCP Server](https://github.com/Taxuspt/garmin_mcp) (or [China fork](https://github.com/bifeiwang-hub/garmin-mcp-cn) for `garmin.cn` users)
- [Obsidian](https://obsidian.md/) (optional but recommended for persistent memory)

## Setup

### 1. Install Garmin MCP Server

**Global users:**
```bash
uvx --python 3.12 --from git+https://github.com/Taxuspt/garmin_mcp garmin-mcp-auth
```

**China (garmin.cn) users:**
```bash
GARMIN_IS_CN=true uvx --python 3.12 --from git+https://github.com/bifeiwang-hub/garmin-mcp-cn garmin-mcp-auth
```

### 2. Configure MCP in Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "garmin": {
      "command": "uvx",
      "args": [
        "--python", "3.12",
        "--from", "git+https://github.com/Taxuspt/garmin_mcp",
        "garmin-mcp"
      ]
    }
  }
}
```

> For China users, replace the repo URL with `git+https://github.com/bifeiwang-hub/garmin-mcp-cn` and add `"env": {"GARMIN_IS_CN": "true"}`.

### 3. Install the Skill

Copy the skill file to your Claude Code commands directory:

```bash
cp fitness-coach.md ~/.claude/commands/fitness-coach.md
```

### 4. Set Up Memory Files (Optional)

Create your Obsidian vault structure:

```
Fitness/
├── Coach Memory.md      # Persistent athlete profile & history
├── Training Plan.md     # Current training plan
├── Recovery Log.md      # Daily recovery tracking
└── Logs/                # Weekly training logs
    └── 2026-W10 (Mar02-Mar08).md
```

Templates for each file are in the `examples/` directory. Copy them to your vault and customize.

Then update the file paths in `fitness-coach.md` under "Memory Files" to match your vault location.

### 5. Use It

```bash
claude
> /fitness-coach morning
```

## File Structure

```
claude-fitness-cn/
├── README.md
├── fitness-coach.md           # The main skill (copy to ~/.claude/commands/)
└── examples/
    ├── coach-memory.md        # Template: athlete profile & history
    ├── training-plan.md       # Template: weekly training plan
    └── recovery-log.md        # Template: daily recovery tracking
```

## How It Works

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Garmin MCP  │────▶│  Coach Paddy │────▶│   Obsidian   │
│  (95+ tools) │     │  (Skill .md) │     │  (Memory)    │
└─────────────┘     └──────────────┘     └──────────────┘
      │                     │                     │
  Sleep, HRV,         Readiness Score,      Coach Memory,
  HR, Battery,        Race Confidence,      Training Plan,
  Activities          ACWR, Analysis        Recovery Log
```

**Data flow:**
1. Garmin watch → Garmin Connect → Garmin MCP Server → Claude Code
2. Claude Code + Coach Paddy skill → reads memory files → pulls Garmin data → generates report
3. Report → displayed to user + written to Obsidian files

## Customization

The skill is designed to be customized. Key sections to edit in `fitness-coach.md`:

| Section | What to Change |
|---|---|
| Athlete Profile | Your sport, cross-training, injury history |
| Memory Files | Paths to your Obsidian vault |
| RPE Estimation Rules | HR zones for your fitness level |
| Recovery Thresholds | Baseline values for your metrics |
| Race Confidence factors | Weight and thresholds for your goals |

## Algorithms

### Readiness Score (1-10)
Base score of 5, adjusted by: sleep quality (+2 to -2), HRV status (+1 to -2), Body Battery charge (+2 to -2), RHR trend (+1/-1), and active injury (-1). See full algorithm in the skill file.

### Race Confidence Score (0-100%)
```
Confidence = Injury(40%) + Load(25%) + Fitness(25%) + Recovery(10%)
```
- **Injury**: Pain scale → percentage (cleared = 100%, pain 4+/10 = 20%)
- **Load**: Average weekly volume completion rate
- **Fitness**: Session completion (40%) + threshold quality (30%) + long run efficiency (30%)
- **Recovery**: 7-day HRV trend

### ACWR (Acute:Chronic Workload Ratio)
- ATL = 7-day average session load
- CTL = 28-day average session load
- Safe range: 0.8–1.3

---

## 中文说明

这是一个基于 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 的 AI 健身教练技能，通过 Garmin MCP 服务器读取你的手表数据（睡眠、HRV、心率、Body Battery、训练记录），提供数据驱动的教练服务。

### 功能

| 命令 | 时机 | 内容 |
|---|---|---|
| `/fitness-coach` | 随时 | 自由聊天 — 训练、营养、比赛策略 |
| `/fitness-coach morning` | 起床后 | 准备度评分 (1-10) + 今日计划 + 营养建议 |
| `/fitness-coach evening` | 训练后 | 训练分析 + 比赛信心评分 + 伤病检查 |
| `/fitness-coach weekly` | 周末 | 周度趋势 + ACWR + 下周计划 |
| `/fitness-coach plan` | 需要时 | 生成/更新训练计划 |

### 安装步骤

1. **安装 Garmin MCP 服务器**（中国区用户）：
   ```bash
   GARMIN_IS_CN=true uvx --python 3.12 --from git+https://github.com/bifeiwang-hub/garmin-mcp-cn garmin-mcp-auth
   ```

2. **配置 Claude Code MCP**：在 `~/.claude/settings.json` 添加 Garmin MCP 服务器（见上方英文说明）

3. **安装技能文件**：
   ```bash
   cp fitness-coach.md ~/.claude/commands/fitness-coach.md
   ```

4. **设置记忆文件**（可选）：将 `examples/` 下的模板复制到你的 Obsidian 笔记库，修改 `fitness-coach.md` 中的文件路径

5. **开始使用**：
   ```bash
   claude
   > /fitness-coach morning
   ```

### 核心算法

- **准备度评分 (1-10)**：综合睡眠、HRV、RHR、Body Battery 和伤病状态
- **比赛信心评分 (0-100%)**：伤病 (40%) + 训练量达标率 (25%) + 竞技状态 (25%) + 恢复质量 (10%)
- **ACWR 监控**：急性-慢性负荷比，安全区间 0.8-1.3

---

## License

MIT

## Credits

- [Garmin MCP Server](https://github.com/Taxuspt/garmin_mcp) by Taxuspt
- [python-garminconnect](https://github.com/cyberjunky/python-garminconnect) by cyberjunky
- Built with [Claude Code](https://docs.anthropic.com/en/docs/claude-code) by Anthropic
