---
title: Training Load Model
id: training-load
version: 3
last_synced: 2026-08-17
status: partial
code_refs:
  - file: dashboard/scripts/build-data.mjs
    function: parseLoad()
  - file: dashboard/scripts/make-sample.mjs
    section: LOAD_COEF through load.days
depends_on: []
---

# Training Load Model

Endurance fitness (CTL) tracked via standard PMC; strength enters only the fatigue side (ATL_str, k=14) — not CTL, not TSB. sRPE modifies strength load when reported. HR/EPOC from watches systematically underestimates strength training load; this model addresses that gap with a 4-tier degradation chain (base -> sRPE -> VL -> e1RM).

## 1. Problem

Traditional CTL/ATL (TrainingPeaks) is driven by running/cycling TSS — strength training is invisible. Garmin/COROS use HR/EPOC, which also underestimates strength (COROS heavy-day loads of 7-15 are typical community complaints, 2024-2026). Root cause: **HR/EPOC cannot capture neuromuscular fatigue from resistance training**. Any whole-body load model must build its own strength component.

## 2. Two-Pool Classification

| Endurance Pool (ATL k=7) | Strength Pool (ATL k=14, 2x slower recovery) |
|---|---|
| Running, Trail running | Strength, Hyrox |
| Future: swimming, cycling | |

- Trail running is fundamentally aerobic endurance -> endurance pool.
- Hyrox has dominant neuromuscular fatigue -> strength pool.
- New sports need one line added to the mapping table.
- **This split only affects ATL (short-term fatigue) decay rate** — it does NOT mean the two pools have independent fitness or readiness. See section 4.

## 3. Base Load Formula (v1, current implementation)

```
session_load = duration(minutes) x intensity_coefficient
```

| Type | Pool | Coefficient |
|---|---|---|
| Easy / Recovery run | endurance | 0.8 |
| Cycling / Bike / Spin | endurance | 0.8 |
| Long run / Endurance | endurance | 1.1 |
| Rowing / SkiErg / Elliptical | endurance | 1.0 |
| Trail (with elevation) | endurance | 1.3 |
| Stair Stepper / Combat / Boxing | endurance | 1.3 |
| Tempo / Threshold | endurance | 1.5 |
| Interval / VO2max | endurance | 1.7 |
| Yoga / Stretch | endurance | 0.3 |
| Strength upper body / light | strength | 1.0 |
| Strength lower body / heavy | strength | 1.3 |
| Hyrox / mixed | strength | 1.3 |

Coefficients are determined by **keyword matching** on training labels in the weekly log (e.g., Long/LSD -> 1.1, Tempo -> 1.5, Strength+legs -> 1.3). No subjective input required.

**Known limitation**: Strength load only sees duration and an upper/lower body classification. Two sessions of equal duration but vastly different intensity (consolidation day vs. max-effort day) score identically. The VL modifier layer (section 5) addresses this.

## 4. EMA Formulas

```
ATL_run = ATL_run_prev x e^(-1/7)  + runLoad  x (1 - e^(-1/7))
ATL_str = ATL_str_prev x e^(-1/14) + strLoad  x (1 - e^(-1/14))
CTL     = CTL_prev     x e^(-1/42) + enduranceLoad x (1 - e^(-1/42))
TSB     = CTL - ATL_run
```

- **ATL_run (k=7)**: Endurance fatigue, 7-day time constant.
- **ATL_str (k=14)**: Strength fatigue, 14-day time constant — encodes 2x slower recovery. Shown on the chart but NOT subtracted from TSB.
- **CTL (k=42)**: Endurance fitness. **Only endurance load feeds CTL** by default. Configurable via `strCtlContribution` (0 = endurance-only, 0.5 = hybrid, 1.0 = legacy full contribution).
- **TSB**: Endurance Form = Endurance Fitness - Endurance Fatigue. Strength fatigue is tracked and displayed separately.

The EMA iterates over **every calendar day** from first to last training day. Rest days contribute load = 0 and the EMA decays naturally. This ensures proper fatigue decay across rest periods.

### Why Strength Does Not Enter CTL or TSB

The CTL/ATL/TSB model (Performance Management Chart) was designed for endurance: consistent volume builds cardiovascular fitness (CTL), recent volume creates fatigue (ATL), and the gap is your "form" (TSB). This assumption holds for running — maintaining mileage maintains aerobic fitness.

**Strength fitness does not follow this model.** Strength progress is driven by progressive overload (heavier weights over weeks/months), not by maintaining a running average of session load. A 42-day EMA of strength load measures "how much strength work have I been doing" — not "how strong am I." Strength "fitness" is better tracked by VL trends and PR records (separate dashboard card).

**Mathematical necessity**: TSB = CTL - ATL is only meaningful when CTL and ATL receive the same inputs. If CTL receives endurance-only but ATL includes both pools, TSB becomes permanently negative for any concurrent athlete — producing constant false "deep fatigue" warnings. The solution: TSB compares endurance fitness to endurance fatigue only.

**Concurrent interference is still captured** — just not through TSB:
1. **Readiness Score** (see [readiness](readiness.md)): drops when strength fatigue impacts HRV, sleep quality, or body battery — this is the actual physiological signal.
2. **ATL_str on the chart**: visually present as a separate colored area, so the user sees when strength fatigue is high.
3. **Load composition donut**: shows the balance between endurance and strength work.

Reference: Wilson et al. 2012 (JSCR meta-analysis on concurrent training interference) — the interference is real, but it's captured by physiological markers (Readiness), not by subtracting arbitrary units from a PMC chart.

## 5. TSB Interpretation

| TSB | Meaning |
|---|---|
| <= -30 | Deep fatigue, prioritize recovery |
| -30 to -10 | Fatigue accumulating (normal during training blocks) |
| -10 to +25 | Good form |
| >= +25 | Possibly too much deload, fitness eroding |

Pre-race taper target: bring fatigue down faster than fitness, TSB reaching +5 to +25.

CTL needs ~42 days of history to stabilize; new users see a ramp-up period (expected).

### Threshold Calibration Caveat

These thresholds are borrowed from TrainingPeaks' TSS system, calibrated around 1 hour at FTP = 100 points/day. This model's coefficients (0.8-1.7 x minutes) are a different unit system with no equivalence calibration. Direction is likely correct; exact trigger points are not guaranteed.

**Planned improvement**: Adopt relative percentile thresholds ("ranks in the bottom 10% of past 90 days") instead of fixed absolute values — avoids the calibration problem entirely and is consistent with the self-calibration philosophy used elsewhere (see [readiness](readiness.md) HRV SWC method).

**Exception**: ACWR 0.8-1.3 safety zone is validated in functional/mixed training literature (PMC6409702), not cycling-specific — safe to use as-is.

## 6. VL Ratio Modifier (optional, v2, not yet implemented)

### Why VL Before sRPE

Comparative research (PubMed 24552797): raw VL correlation with cortisol is weak (r=0.01), sRPE methods are better but modest (r=0.19-0.25). Neither is perfect, but VL is already objectively tracked by many athletes (via apps or manual records) without adding a subjective judgment step. This aligns with the "zero subjective input" base-layer principle.

### Data Collection

No specific app or API required. Whether data arrives via API or the athlete typing a number into the terminal, the information is identical. The fork is "does this person track VL", not "do they have an API".

Collection follows the existing optional conversational prompt pattern (like daily weigh-ins):

> "Did you track total VL (weight x reps) for this session? Just the number — skip if you didn't record it."

Recorded in weekly log as `VL 4320` (parsed by regex).

### Calculation

```
strength_load = duration x coefficient x VL_ratio
VL_ratio = session_VL / rolling_baseline_VL
         = session_VL / mean(last 3-4 same-type sessions)
VL_ratio clamped to [0.7, 1.5]; outside range -> 1.0 (assumed recording error)
```

- Rolling baseline uses 3-4 sessions (not single previous — one deload week as denominator would skew).
- "Same type" matched by training label (e.g., all "Strength A" sessions).
- **No VL record -> ratio = 1.0**, falling back to base formula (section 3).

## 7. e1RM Relative Intensity Weighting (optional, v2, not yet implemented)

Relative Volume Load (sets x reps x %1RM) better reflects true training intensity than raw tonnage (PMC8869395). Prilepin's chart confirms: at 95%1RM you handle 7 total reps, at 55-65% you handle 24 — body tolerance varies 3x+ at different relative intensities.

### Free e1RM from AMRAP

This skill's main lifts use AMRAP autoregulation (last set to technical failure). This is a natural e1RM test at zero extra cost:

```
e1RM = AMRAP_weight x (1 + AMRAP_reps / 30)    [Epley formula]
relative_intensity = working_weight / e1RM
weighted_VL = sum(reps x relative_intensity)    (replaces raw VL in section 6)
```

### Graceful Degradation (4 tiers)

1. Has VL + AMRAP this session -> e1RM weighted (most accurate)
2. Has VL, no AMRAP -> raw VL ratio (section 6)
3. **Has sRPE, no VL -> sRPE modifier (section 8)** — implemented, fills the gap for most users
4. Nothing -> base formula (section 3)

Four layers, no blocking dependencies. Each missing layer degrades to the one above. **Most users will operate at tier 3 or 4** — sRPE is the lowest-friction way to capture session intensity variation without requiring any tracking app.

## 8. sRPE: Strength Load Modifier + Divergence Check

sRPE (Foster 2001) serves **two roles** in this model:

### 8.1 Strength Load Modifier (tier 3, implemented)

When no VL data is available (the common case), sRPE is the only per-session intensity signal for strength. Without it, a deload session and a max-effort session of equal duration produce identical load scores — a 2-3x error in real physiological cost.

**Formula**:
```
strength_load = duration x coefficient x sRPE_modifier
sRPE_modifier = sRPE / 5, clamped to [0.6, 1.8]
```

Examples:
- RPE 5 (moderate): modifier = 1.0 (no change from base)
- RPE 3 (deload): modifier = 0.6 (load reduced 40%)
- RPE 8 (hard): modifier = 1.6 (load increased 60%)
- RPE 9 (near-max): modifier = 1.8 (capped)

**Why sRPE / 5 and not sRPE / 10**: The base formula (duration x coefficient) already assumes a "typical" session. RPE 5 = "typical effort" should map to modifier = 1.0 (no change). This anchors the scale so the base formula remains valid when no RPE is reported.

**Why capped at [0.6, 1.8]**: Prevents extreme RPE values (1 or 10) from producing unreasonable load swings. The capping is intentionally asymmetric — harder sessions get more credit (1.8x) than easy sessions get discounted (0.6x), reflecting that the physiological cost curve is steeper on the hard end.

**Collection**: Evening recap strength day prompt: "How hard was that, 1-10?" Recorded in weekly log training text as `RPE 7` (parsed by regex). No response = no modifier applied = base formula.

**Applied to strength only**: Endurance load already has good intensity signals from training type labels (Easy 0.8 vs Interval 1.7 = 2.1x range) and watch HR data. sRPE adds little value for endurance but is the single most impactful signal for strength.

### 8.2 Divergence Check (when VL is available)

When VL IS present, sRPE shifts from load modifier to cross-validation:

- VL ratio says light (~1.0) but sRPE 8-9: flag "Data shows normal volume but high subjective exhaustion — possible sleep/stress/unrecorded factors"
- VL ratio says heavy (>1.3) but sRPE 3-4: flag "High load but felt easy — likely good day"

This mirrors the Hooper simplified pattern (see [readiness](readiness.md) section 5): capped influence, cross-validation, neither subjective nor objective gets unilateral authority.

### 8.3 Why sRPE Is Bounded, Not The Primary Driver

Subjective effort estimation has systematic bias that varies by individual with no built-in correction mechanism. The modifier is deliberately capped and centered at 1.0 — it adjusts the base estimate, never replaces it. When VL data exists (objective, self-correcting), VL takes priority and sRPE reverts to divergence checking only.

## 9. Physiological Basis for Strength k=14

| Fatigue Type | Recovery Timeline |
|---|---|
| Aerobic / glycogen (running) | 24-48h |
| Strength neuromuscular (Thomas 2018) | ~72h for heavy sessions |
| DOMS (eccentric-dominant) | Peak 24-72h, up to 1 week |
| Training to failure (Sousa 2024) | Extended further |

Strength fatigue recovery is approximately 2-3x running fatigue. k=14 encodes the 2x rule.

References: Thomas K et al. 2018 (PubMed 30067591); Sousa CA et al. 2024 (PMC11057610).

## 10. Data Requirements

| Data | Source | Status |
|---|---|---|
| Daily load | Auto-computed | v1 implemented |
| Run distance + type | Weekly log activity rows | Available |
| Elevation gain (m) | Weekly log activity rows | Not yet parsed |
| Session VL | Weekly log text `VL 4320` | Not implemented (v2) |
| Session sRPE | Weekly log text `RPE 7` | Not implemented (v2) |

v2 layers are purely additive and optional. Default behavior with no VL/sRPE is identical to v1. No historical data migration needed.

## 11. Implementation Status

- [x] `make-sample.mjs` — synthetic load generator (30-day, two-pool EMA, sRPE modifier)
- [x] `build-data.mjs` `parseLoad()` — keyword -> pool/coefficient, sRPE modifier for strength, daily calendar-day EMA
- [x] CTL = endurance only (`strCtlContribution` config, default 0)
- [x] TSB = CTL - ATL_run (strength fatigue shown but not subtracted)
- [x] sRPE modifier for strength (tier 3, `RPE N` regex in training text)
- [x] Dashboard: "Endurance Fitness" / "Endurance Form" labels, updated note text
- [ ] VL ratio modifier (section 6)
- [ ] e1RM relative intensity (section 7)
- [ ] sRPE divergence check when VL present (section 8.2)
- [ ] Dashboard: divergence alerts, VL/sRPE source indicators

## References

**v1**:
- TrainingPeaks "What is the Performance Management Chart?" — CTL/ATL/TSB definition
- TrainingPeaks "A Coach's Guide to ATL, CTL & TSB" (Andrew Simmons)
- Intervals.icu forum "Calculate Needed Training Load?" — EMA exact formula
- Thomas K et al. (2018, PubMed 30067591) — neuromuscular fatigue recovery
- Sousa CA et al. (2024, PMC11057610) — resistance training recovery
- PMC7927075 — volume load as training stimulus indicator
- Wilson et al. 2012 (JSCR) — concurrent training interference meta-analysis

**v2**:
- [Workload quantification methods vs. physiological responses](https://pubmed.ncbi.nlm.nih.gov/24552797/) (PubMed 24552797)
- [Training Load, HRV, Functional-Fitness Case Study](https://pmc.ncbi.nlm.nih.gov/articles/PMC6409702/) (PMC6409702)
- [Prilepin's Chart Guide](https://torokhtiy.com/blogs/guides/prilepins-chart)
- [Relative Intensity in Bench Press](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8869395/) (PMC8869395)
