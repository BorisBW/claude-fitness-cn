---
title: Readiness & Recovery Signals
id: readiness
version: 1
last_synced: 2026-08-17
status: implemented
code_refs:
  - file: skills/fitness-coach (skill definition)
    section: Readiness Score algorithm, Recovery Signal Thresholds
  - file: dashboard/scripts/build-data.mjs
    function: parseRecovery()
depends_on: []
---

# Readiness & Recovery Signals

Daily readiness scoring (1-10) from wearable data, combining sleep, HRV, body battery, resting heart rate, injury history, and optional subjective input. The score drives training intensity decisions in morning reports.

## 1. Overview

Watches provide individual recovery metrics but no unified "should I train hard today" signal that accounts for all of them (Garmin Training Readiness exists only on 265/965/Fenix, not on the 255 or most mid-tier devices). This system synthesizes multiple signals into a single actionable score.

**Design principles**:
- Wearable data drives the score; subjective input is a bounded correction, not a driver.
- Self-calibrating baselines (HRV SWC) over vendor-provided labels.
- Conservative: when signals conflict, lean toward caution.

## 2. Readiness Score Algorithm

```
base = 5

# Sleep
if sleep_score >= 90: base += 2
elif sleep_score >= 80: base += 1
elif sleep_score < 60: base -= 2
elif sleep_score < 70: base -= 1

# HRV (SWC method, see section 3)
if today_hrv >= swc_low AND roll7 >= swc_low:    base += 1   # in band = normal
elif today_hrv < swc_low AND roll7 >= swc_low:   base += 0   # single-day dip = noise
elif roll7 < swc_low:                             base -= 1   # 7-day mean below band
if roll7 < swc_low AND 3 consecutive days below:  base -= 2   # deep sink (replaces -1)

# Corrections:
# - Low HRV + last night < 8h sleep -> halve penalty (-2 -> -1, -1 -> 0)
#   Rationale: sleep-driven noise, not true autonomic decline
# - today_hrv > swc_high -> no bonus, flag "above normal band"
#   May indicate rebound or parasympathetic saturation; interpret with context

# Body Battery (current level, not charge amount)
if current_level >= 80: base += 2
elif current_level >= 60: base += 1
elif current_level < 30: base -= 2
elif current_level < 50: base -= 1

# Resting Heart Rate
if rhr <= last_7d_avg: base += 1
elif rhr > last_7d_avg + 5: base -= 1

# Injury
if injury_signal_yesterday: base -= 1

# Subjective (Hooper simplified, see section 5)
# Asked AFTER presenting the score; applied only if soreness >= 4
if soreness >= 4: base -= 1

readiness = clamp(base, 1, 10)
```

### Data Sources

| Input | Source | Tool |
|---|---|---|
| Sleep score | Garmin | `get_sleep_summary(date)` |
| HRV | Athlete Bio Data daily table (raw values) | Parsed from markdown |
| Body Battery | Garmin | `get_body_battery(date, date)` |
| RHR | Garmin | `get_heart_rates_summary(date)` |
| Injury signals | Previous day's log | Parsed from markdown |
| Soreness | Athlete self-report | Conversational prompt |

## 3. HRV: SWC Self-Calibration

### Why Not Vendor Labels

Garmin provides BALANCED/UNBALANCED/LOW status labels based on a 60-day internal baseline. In practice these labels lag significantly — every time HRV rebounds after a dip, the label stays UNBALANCED/LOW for days while the actual values are already back to normal. This required repeated manual overrides ("label says UNBALANCED but actually BALANCED") and provided no additional signal beyond what the raw number already conveyed.

### SWC Method (Smallest Worthwhile Change)

Data source: Athlete Bio Data daily table, raw HRV values (not Garmin status labels).

```
baseline_window = 28 days (skip days with no measurement)
mu = mean(baseline_window)
SD = stddev(baseline_window)
SWC_band = mu +/- 0.5 * SD
roll7 = 7-day rolling mean of daily HRV
```

**Scoring logic** (used in Readiness section 2):
- Today's value AND roll7 both within band -> normal (+1)
- Today below band but roll7 still in band -> single-day noise, ignore (+0)
- roll7 drops below band -> genuine decline (-1)
- roll7 below band AND 3 consecutive days below -> deep sink (-2, replaces -1)

**Reporting format**: `41ms (7d avg 38 / normal band 36-45)` — Garmin label shown as side note only, not used for scoring.

**Fallback**: If fewer than 14 data points available in the 28-day window, fall back to Garmin status labels until enough data accumulates.

### Why 0.5 SD

The Smallest Worthwhile Change threshold of 0.5 SD is an established method in sports science for detecting meaningful (non-noise) changes in day-to-day variable metrics. It filters out normal biological variation while catching genuine physiological shifts. This is the same approach used by HRV4Training and validated in applied sports monitoring research.

## 4. Recovery Signal Thresholds

Traffic-light system for individual metrics, independent of the composite Readiness score:

| Metric | Green | Yellow | Red |
|---|---|---|---|
| Sleep score | >= 80 | 60-79 | < 60 |
| HRV (SWC) | Today + 7d avg in band | Today below, 7d avg in band | 7d avg below band |
| Body Battery (current) | >= 60 | 30-59 | < 30 |
| RHR vs 7-day average | <= average | +1 to +4 | >= +5 |

These thresholds are used in morning report tables to give per-metric visual status alongside the composite score.

## 5. Subjective Correction: Hooper Simplified

Wrist-based sensors cannot detect DOMS or neuromuscular fatigue — Readiness often reads artificially high the day after a heavy strength session. The subjective check fills this blind spot.

### Protocol

After presenting the computed Readiness score, ask one question:

> "Muscle soreness 1-5? (1 = nothing, 5 = stairs hurt)"

- Soreness >= 4: Readiness -= 1, revise training recommendation accordingly.
- Soreness <= 3: No change.
- No response: Do not follow up. Execute at original score.

When an active injury is being monitored, append a targeted question about that specific body part.

### Design Rationale

- **Asked after, not before**: The computed score is the anchor. Subjective input adjusts, not drives.
- **Capped at -1**: Prevents subjective perception from dominating. One point changes the recommendation zone (e.g., 6 -> 5 shifts from "execute plan" to "reduce intensity") but cannot swing from "full send" to "rest day".
- **Consistent with sRPE philosophy**: See [training-load](training-load-encoding.md) section 8 — neither subjective nor objective gets unilateral authority.

## 6. Action Thresholds

| Score | Assessment | Action |
|---|---|---|
| 8-10 | Excellent | Full-intensity training day |
| 6-7 | Normal | Execute plan as written |
| 4-5 | Fatigued | Reduce: strength lowers weight/sets, running shortens or becomes a walk |
| 1-3 | Needs rest | Stretching only or complete rest |

## 7. ACWR (Acute:Chronic Workload Ratio)

ACWR is read directly from `get_training_status` (Garmin's own HR-based calculation), **not manually estimated** from RPE x duration or mileage.

| ACWR | Status |
|---|---|
| 0.8-1.3 | Optimal (safe zone) |
| > 1.3 | Caution |
| > 1.5 | Danger |
| < 0.8 | Detraining |

**Caveat**: Garmin weights HR lower for strength, so ACWR may underestimate total load on strength-heavy weeks. Subjective fatigue on strength days with ACWR showing "LOW" is expected, not contradictory.

The 0.8-1.3 zone is validated in functional/mixed training literature (PMC6409702), not cycling-specific.

## References

- Foster C (2001) — session RPE method for monitoring training load
- HRV4Training methodology — SWC (0.5 SD) thresholds for meaningful change detection
- [PMC6409702](https://pmc.ncbi.nlm.nih.gov/articles/PMC6409702/) — Monitoring Training Load, Well-Being, HRV in Functional-Fitness (ACWR 0.8-1.3 validation)
- Hooper SL et al. (1995) — Monitoring overtraining in athletes (fatigue/stress/soreness/DOMS questionnaire)
- Garmin Training Readiness documentation (device compatibility: 265/965/Fenix only)
