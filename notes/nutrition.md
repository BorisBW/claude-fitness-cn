---
title: Nutrition Model
id: nutrition
version: 1
last_synced: 2026-08-17
status: implemented
code_refs:
  - file: dashboard/scripts/build-data.mjs
    function: estimateTdee(), trainingBurn(), parseDiet()
  - file: dashboard/scripts/make-sample.mjs
    function: estimateTdee()
  - file: dashboard/public/index.html
    section: renderDiet()
depends_on:
  - training-load
---

# Nutrition Model

TDEE estimation from food logs and weight trend, dynamic calorie targets that adjust for training load, and deviation-based assessment logic for the dashboard. Designed for athletes who track food intake (via photo recognition, manual entry, or any source) and want to see whether their eating matches their training.

## 1. TDEE Reversal

### Concept

Instead of estimating TDEE from formulas (Harris-Benedict, Mifflin-St Jeor) which are population averages with wide individual error, this model **reverse-engineers actual TDEE from observed data**: if you know how much you ate and how much your weight changed, energy conservation gives you the real number.

Inspired by MacroFactor's approach. The formula:

```
TDEE_est = intake_avg - (delta_kg x 7700 / days)
```

Where:
- `intake_avg` = mean daily caloric intake across all recorded days
- `delta_kg` = weight change (last weigh-in minus first weigh-in within the recording window)
- `7700` = approximate kcal per kg of body mass change (mixed fat + lean)
- `days` = calendar span between first and last weigh-in

### Self-Correcting Property

This estimate improves automatically as more data accumulates. Short-term water weight fluctuations wash out over weeks. Systematic under-recording of food intake shows up as TDEE_est being lower than physiological expectation — the dashboard flags this.

### Requirements

- Minimum 7 days of food log data
- At least 2 weigh-in data points within the recording window

### Code

`estimateTdee(dietDays, weights)` in `build-data.mjs` returns `{ value, coverage, calendarDays }` or `null` if requirements aren't met.

## 2. Coverage Quality

### Problem

TDEE reversal uses `intake_avg` as if every day is recorded. If only 15 out of 30 days have food logs, the average only reflects the logged days — which are often systematically different from unlogged days (people tend to skip logging on "bad" eating days). The resulting TDEE estimate may be significantly off.

### Metric

```
coverage = recorded_days / calendar_span x 100%
```

Where `calendar_span` is the number of days between first and last weigh-in (the denominator of the TDEE formula).

### Threshold

Coverage below **80%** triggers a warning in the dashboard:

> "Recording coverage 65% (20 days recorded / 31 day span) — TDEE estimate may be inaccurate due to missing days"

### Why 80%

At 80%+ coverage, the unrecorded days are few enough that their impact on the average is bounded. Below 80%, the selection bias (which days get skipped) becomes a meaningful source of error. This is a practical threshold, not derived from a specific statistical test — it can be adjusted based on observed accuracy.

## 3. Dynamic Calorie Target

### Problem

A fixed daily calorie target (e.g., 2200 kcal) ignores training load variation. A long run day burns 500-800 kcal more than a rest day. If the target stays flat, athletes either under-fuel on hard days or over-fuel on rest days.

### Formula

```
target_kcal = baseline_kcal + training_burn
```

Where:
- `baseline_kcal` = user-configured daily target from `curated.dietTarget.kcal` (this is NOT TDEE — it may be intentionally below TDEE during a cut, or above during a bulk)
- `training_burn` = actual calories burned during training

### Training Burn Sources (priority order)

1. **Watch calories** (preferred): Parsed from the Evening Training section of weekly logs. The `卡路里` column in the training table contains actual watch-measured calories (e.g., `780 kcal`). Multiple activities on the same day are summed.

2. **Keyword estimate** (fallback): If no watch data exists for a day, estimate from the training type label:
   - Long run / LSD: 500 kcal
   - Strength / Hyrox: 200 kcal
   - Easy run: 250 kcal
   - Rest / unknown: 0 kcal

The fallback exists for users who don't record watch calories in their logs. When watch data is available, it takes precedence — it's device-measured, not estimated.

### Design Decision: Why baseline + burn, not TDEE + burn

The baseline is the user's self-set control value. During a cut, this is deliberately below TDEE (creating a deficit). During maintenance or a bulk, it approximates or exceeds TDEE. Adding training burn on top ensures the **deficit/surplus stays constant** regardless of training volume — a long run day gets a higher target so the athlete eats more, but the gap between intake and expenditure remains the same as a rest day.

If we used TDEE + burn, the target would exceed expenditure on rest days and the entire gap logic would need phase-aware adjustments. Baseline + burn is phase-agnostic.

## 4. Gap Assessment (Deviation-Based)

### Problem (old logic)

The original gap color used a simple positive/negative split: eating under target = green (good), over target = red (bad). This assumed the user is always cutting — it breaks for maintenance (both directions are fine within a band) and bulking (under-eating is the problem, not over-eating).

### Current Logic

Gap color is based on **percentage deviation from target**, regardless of direction:

```
gap = actual_intake - target_kcal
gap_pct = abs(gap) / target_kcal x 100

color:
  gap_pct <= 5%   -> green  (on target)
  gap_pct 5-15%   -> yellow (notable deviation)
  gap_pct > 15%   -> red    (significant miss)
```

This is **phase-agnostic**: whether the user is cutting, maintaining, or bulking, they set their own target (section 3), and the color judges how close they hit it. Over-eating by 20% during a cut is red. Under-eating by 20% during a bulk is also red. Both are meaningful misses relative to the user's stated goal.

### Applied In

1. **Daily gap** in the nutrition table: per-day color based on that day's deviation.
2. **4-week energy balance**: aggregated gap across the window, same percentage thresholds applied to the total.

## 5. Carb Periodization Check

### Concept

Carbohydrate periodization means eating more carbs on training days (to fuel performance) and fewer on rest days (when glycogen demand is lower). This is a widely recommended practice for endurance athletes.

### Logic

From the last 14 days of food data, split days into two groups:
- **Training days**: days with a long run or high-intensity session (matched by label keywords)
- **Rest days**: days with no training or only light activity

Compare average daily carb intake between the two groups:
- Training day carbs > rest day carbs -> "Carb intake increases with training intensity" (positive)
- Training day carbs <= rest day carbs -> "Carb intake does NOT increase with training intensity" (negative)

### Edge Case

If either group (training or rest) has **zero days** in the 14-day window — e.g., the athlete only has long run data but no rest days recorded, or vice versa — the comparison is invalid. Instead of showing a misleading checkmark or cross:

> "Insufficient data for carb periodization assessment"

This prevents false positives from incomplete data.

## 6. Food Log Parsing Robustness

### Problem

`food-log.jsonl` may contain malformed lines (truncated JSON, encoding issues, experimental entries from pipeline development). Silent failures (`catch {}`) hide data quality issues — the dashboard looks fine but is quietly dropping records.

### Current Behavior

Every parse failure is:
1. Counted (`skippedLines` counter)
2. Logged to console with the line number and error message
3. Reported in the output data (`diet.skippedLines`)

This lets users and developers notice when data quality degrades, without crashing the entire pipeline on one bad line.

### Supported Input Formats

The parser handles two formats transparently:

1. **Unified model** (`rec.items[]`): Normalized records from the WeChat food pipeline or agent-formatted data. Fields: name, type, portion, kcal, protein, carb, fat.

2. **Raw app format** (`rec.foods[]`): Direct exports from nutrition tracking apps (e.g., 训记) with per-100g nutritional values (`ntr`) and gram amounts. Automatically converted to per-item totals.

Both formats produce identical internal representations. The dashboard doesn't know or care which format was used.

## References

- MacroFactor methodology — TDEE reversal from intake + weight trend
- 7700 kcal/kg approximation — standard mixed tissue energy density (fat ~7700, lean ~1800, blended estimate for typical composition change)
- Carbohydrate periodization: Impey SG et al. (2018) "Fuel for the Work Required" — periodizing carbohydrate intake around training demands
