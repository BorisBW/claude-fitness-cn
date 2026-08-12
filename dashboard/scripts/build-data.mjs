#!/usr/bin/env node
// Parse local Obsidian training files → public/data.json
// 从本地 Obsidian 训练文件解析数据 → public/data.json
//
// Usage:  FITNESS_DIR="/path/to/vault/Fitness" node scripts/build-data.mjs
//
// The PARSER functions below are generic — they read the markdown table
// formats produced by the Coach Paddy skill (Athlete Bio Data / Training Plan /
// Coach Memory / weekly Logs). The `curated` object at the bottom is the
// hand-maintained data (injuries / goals / PBs / race plans) — edit it for
// your own training, then re-run this script.

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Point this at your Obsidian vault's Fitness folder (or set FITNESS_DIR env).
const FITNESS_DIR = process.env.FITNESS_DIR || '/path/to/your/Obsidian-vault/Fitness';
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const stripMd = (s) =>
  s.replace(/\*\*/g, '').replace(/[✅⚠️🔴🟡🟢🔥🎉🆕🔄⭐🏔️]/gu, '').trim();

const firstNum = (s) => {
  const m = stripMd(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
};

// ---------- 1. Athlete Bio Data: daily recovery rows ----------
// The file was called "Recovery Log.md" in earlier versions of the skill;
// prefer the current name and fall back so existing vaults keep working.
function bioDataPath() {
  const current = join(FITNESS_DIR, 'Athlete Bio Data.md');
  const legacy = join(FITNESS_DIR, 'Recovery Log.md');
  return existsSync(current) ? current : legacy;
}

function parseRecovery() {
  const raw = readFileSync(bioDataPath(), 'utf8');
  const daily = raw.split('## 每日更新')[1] ?? '';
  const rows = [];
  for (const line of daily.split('\n')) {
    const m = line.match(/^\|\s*(\d{4}-\d{2}-\d{2})\s*\|/);
    if (!m) continue;
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 8) continue;
    const note = cells[7] ?? '';
    const statusMatch = stripMd(cells[5]).match(/\b(BALANCED|UNBALANCED|LOW)\b/);
    const readinessMatch = note.match(/Readiness\s*\*{0,2}~?(\d+)/);
    const acwrMatch = note.match(/ACWR[^0-9]*([\d.]+)/);
    const vo2Match = note.match(/VO2max[^0-9]*([\d.]+)/);
    const balMatch = note.match(/(\d+)连BAL/);
    rows.push({
      date: m[1], sleep: firstNum(cells[2]), rhr: firstNum(cells[3]),
      hrv: firstNum(cells[4]), hrvStatus: statusMatch ? statusMatch[1] : null,
      readiness: readinessMatch ? parseInt(readinessMatch[1]) : null,
      acwr: acwrMatch ? parseFloat(acwrMatch[1]) : null,
      vo2: vo2Match ? parseFloat(vo2Match[1]) : null,
      balStreak: balMatch ? parseInt(balMatch[1]) : null,
    });
  }
  return rows;
}

// ---------- 2. Training Plan: strength progress + Volume Load history ----------
function parseStrength() {
  const raw = readFileSync(join(FITNESS_DIR, 'Training Plan.md'), 'utf8');
  const progress = [];
  const progSection = raw.split('## 力量进度追踪')[1]?.split('### Volume Load')[0] ?? '';
  let tier = 'main';
  for (const line of progSection.split('\n')) {
    if (line.startsWith('### ')) tier = line.includes('辅助') ? 'accessory' : 'main';
    if (!line.startsWith('|') || line.includes('---') || line.includes('动作 |')) continue;
    const cells = line.split('|').map((c) => stripMd(c));
    if (cells.length >= 6 && cells[1]) {
      progress.push({ tier, name: cells[1], start: cells[2], current: cells[3], vl: cells[4], next: cells[5] });
    }
  }
  // Main-lift keywords push compound lifts to the front of the dashboard.
  const MAIN_KEYWORDS = ['臀推', '肩推', '划船', '卧推', '保加利亚', 'KB Swing'];
  const vlHistory = [];
  const vlSection = raw.split('### Volume Load 历史')[1]?.split('\n---')[0] ?? '';
  const blocks = vlSection.split(/^#### /m).slice(1);
  for (const block of blocks) {
    const name = stripMd(block.split('\n')[0].split('—')[0]);
    const points = [];
    for (const line of block.split('\n')) {
      const m = line.match(/^\|\s*(W\d+)\s*\|\s*([\d/]+)\s*\|([^|]+)\|([^|]+)\|/);
      if (!m) continue;
      const vl = firstNum(m[4]);
      if (vl === null) continue;
      points.push({ week: m[1], date: m[2].trim(), scheme: stripMd(m[3]), vl });
    }
    if (points.length) {
      const isMain = MAIN_KEYWORDS.some((k) => name.includes(k));
      vlHistory.push({ name, tier: isMain ? 'main' : 'accessory', points });
    }
  }
  vlHistory.sort((a, b) => (a.tier === b.tier ? 0 : a.tier === 'main' ? -1 : 1));
  return { progress, vlHistory };
}

// ---------- 3. Weekly Logs: run volume + recent activities ----------
function parseWeeklyLogs() {
  const logsDir = join(FITNESS_DIR, 'Logs');
  const files = readdirSync(logsDir).filter((f) => f.endsWith('.md')).sort();
  const weeks = [];
  const activities = [];
  const today = new Date();
  for (const f of files) {
    const raw = readFileSync(join(logsDir, f), 'utf8');
    const label = f.match(/(\d{4}-W\d+)/)?.[1] ?? f;
    const year = parseInt(label.slice(0, 4));
    const range = f.match(/\((.+)\)/)?.[1] ?? '';
    let km = 0;
    const summary = raw.split('## Daily Summary')[1]?.split('\n## ')[0] ?? '';
    const isNewFormat = summary.includes('| Training |');
    for (const line of summary.split('\n')) {
      if (!line.startsWith('|') || line.includes('---') || line.includes('| Day |')) continue;
      const cells = line.split('|').map((c) => stripMd(c));
      if (cells.length < 7) continue;
      const dm = cells[2]?.match(/^(\d+)\/(\d+)$/);
      if (dm) {
        const rowDate = new Date(year, parseInt(dm[1]) - 1, parseInt(dm[2]));
        if (rowDate > today) continue; // skip future planned rows
      }
      const distCell = [cells[5], cells[4]].find((c) => /^[~≈]?[\d.]+\s*km$/.test(c ?? ''));
      if (distCell) km += parseFloat(distCell.replace(/[~≈km\s]/g, ''));
      if (isNewFormat && cells[3] && cells[3] !== '—' && cells[3] !== '休息') {
        activities.push({ week: label, day: cells[1], date: cells[2], training: cells[3], duration: cells[4], distance: cells[5], readiness: cells[6] });
      }
    }
    weeks.push({ week: label, range, runKm: Math.round(km * 100) / 100 });
  }
  return { weeks, activities: activities.slice(-14) };
}

// ---------- 3.5 Coach Memory: weight trend + body measurements ----------
function parseBody() {
  const raw = readFileSync(join(FITNESS_DIR, 'Coach Memory.md'), 'utf8');
  const weights = [];
  const wSection = raw.split('### 体重趋势')[1]?.split('###')[0] ?? '';
  for (const line of wSection.split('\n')) {
    const m = line.match(/^\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*([\d.]+)\s*kg\s*\|([^|]*)\|/);
    if (m) weights.push({ date: m[1], kg: parseFloat(m[2]), note: stripMd(m[3]) });
  }
  const measurements = [];
  const mSection = raw.split('### 测量记录')[1]?.split('>')[0] ?? '';
  for (const line of mSection.split('\n')) {
    const m = line.match(/^\|\s*(\d{4}-\d{2}-\d{2})\s*\|/);
    if (!m) continue;
    const c = line.split('|').map((x) => stripMd(x));
    measurements.push({ date: c[1], 肩围: c[2], 胸围: c[3], 上臂松: c[4], 上臂屈: c[5], 前臂: c[6], 腰围: c[7], 臀围: c[8], 大腿: c[9], 小腿: c[10], 体重: c[11] });
  }
  return { weights, measurements };
}

// ============================================================================
// CURATED DATA — hand-maintained. EDIT THIS for your own training.
// Everything below is EXAMPLE data for a fictional marathoner. Replace freely.
// ============================================================================
const curated = {
  phase: 'Example — Marathon build + functional strength',
  weeklyRunTarget: [30, 40],
  weight: { current: 70.0, asOf: '2026-01-01', target: '68-70kg' },
  injuries: [
    { name: 'Example: left calf (soleus)', status: 'resolved', note: 'Cleared after eccentric heel-drop protocol. Monitor on speed work.' },
    { name: 'Example: lower back', status: 'treating', note: 'Daily core (Dead Bug / Bird Dog). Root cause: weak core → pelvic tilt.' },
    { name: 'Example: knee crepitus', status: 'watching', note: 'Benign patellofemoral. TKE daily. No pain.' },
  ],
  goals: {
    firstPriority: [
      'Fix posture (thoracic mobility, deep neck flexors)',
      'Glute-driven running mechanics',
      'Build core + glute + shoulder base',
      'Long-term knee protection (VMO, patellar tracking)',
    ],
    performance: [
      { year: '2026', goal: 'Marathon sub-3:45' },
      { year: '2027', goal: 'Half 1:38 · Marathon 3:35' },
    ],
  },
  pbs: [
    { dist: '5K', time: '20:47', pace: '4:09/km', date: '2025-05-06', note: '' },
    { dist: '10K', time: '44:56', pace: '4:30/km', date: '2025-04-29', note: '' },
    { dist: 'Half', time: '1:39:15', pace: '4:42/km', date: '2026-04-12', note: '' },
    { dist: 'Marathon', time: '3:45:23', pace: '5:21/km', date: '2025-10-26', note: '' },
  ],
  physio: {
    height: 180, age: 35, lthr: 173, maxHr: '184-186',
    hrZones: [
      { zone: 'Z1', bpm: '112-138', use: 'Recovery' },
      { zone: 'Z2', bpm: '138-154', use: 'Easy / Long Run' },
      { zone: 'Z3', bpm: '154-164', use: 'Marathon pace' },
      { zone: 'Z4', bpm: '164-177', use: 'Threshold' },
      { zone: 'Z5', bpm: '>177', use: 'VO2max / race' },
    ],
    ltPace: '4:50-5:00/km', easyPace: '5:50-6:15/km @ HR 145-150',
    baselines: { sleep: '72-87 (avg 77), <70 = watch', rhr: '55-59 bpm, >62 = fatigue', hrv: '38-47ms (avg 41), LOW <35ms' },
    nutrition: {
      protein: '~1.8 g/kg', calories: '~2000-2200 kcal/day · TDEE ~2400',
      deficit: 'Mild deficit → ~1kg/month', notes: 'Example: protein-forward, creatine 3-4g/day, fish oil',
    },
  },
  races: {
    upcoming: [
      { name: 'Trail Race', date: '2026-06-27', detail: '24km · 980m gain · effort-based', tag: 'A race', accent: 'trail', anchor: 'trail' },
      { name: 'Hyrox', date: '2026-08-13', detail: 'Singles · focused block after trail race', tag: 'Prep', accent: 'hyrox', anchor: 'hyrox' },
    ],
  },
  trail: {
    race: { name: 'Trail Race', date: '2026-06-27', distance: 24.28, elevation: 982 },
    longest: { date: '2026-06-07', distance: 15.45, elevation: 1152, note: 'Climb already exceeds race +17%' },
    progression: [
      { label: '5/24', distance: 15.31, elevation: 680, status: 'done' },
      { label: '6/7', distance: 15.45, elevation: 1152, status: 'done' },
      { label: '6/14', distance: 15, elevation: 500, status: 'plan' },
      { label: '6/21', distance: 10, elevation: 200, status: 'plan' },
      { label: 'Race', distance: 24.28, elevation: 982, status: 'race' },
    ],
    plan: [
      { week: 'W21', date: '5/24', target: '15.31km / 680m', status: 'done', note: 'First trail long run' },
      { week: 'W23', date: '6/7', target: '15.45km / 1152m', status: 'done', note: 'TE 5.0 OVERLOAD, RPE 10/10' },
      { week: 'W24', date: '6/14', target: '15km / 500m', status: 'next', note: 'Downhill technique focus' },
      { week: 'W25', date: '6/21', target: '10km easy', status: 'plan', note: 'Taper' },
      { week: 'Race', date: '6/27', target: '24.28km / 982m', status: 'race', note: 'Effort-based' },
    ],
    gaps: [
      { name: 'Downhill technique', sev: 'high', note: 'Main gap — confident uphill, slow downhill' },
      { name: 'Quad eccentric strength', sev: 'high', note: 'Eccentric step-downs now mandatory' },
      { name: 'Distance endurance', sev: 'mid', note: '24km vs longest 15.45km — manageable at effort pace' },
      { name: 'Ankle stability (left)', sev: 'mid', note: 'Daily single-leg balance, target 20s+ both sides' },
    ],
    downhill: ['Short quick steps', 'Lower center of gravity, soft knees', 'Quad + glute braking, not knees', 'Zig-zag steep descents'],
    ankle: [{ date: '5/17', right: 7.5, left: 3.5 }, { date: '5/27', right: 20, left: 12.5 }],
    ankleTarget: 20,
    verdict: 'Climbing validated (1152m > race 982m). Remaining gap = downhill technique + distance endurance.',
  },
  hyrox: {
    status: 'Prep', race: { name: 'Hyrox Singles', date: '2026-08-13', location: 'Example City' },
    statusNote: 'Focused block begins after the trail race (~7 weeks). Until then, classes maintain station feel.',
    estimate: { likely: '1:22 – 1:32', optimistic: '~1:17:40', conservative: '~1:38:00' },
    profile: 'Running top 15% · stations bottom 40%',
    radar: [
      { station: 'Run 8×1km', score: 90 }, { station: 'Rowing', score: 78 }, { station: 'SkiErg', score: 65 },
      { station: 'Farmers Carry', score: 60 }, { station: 'Lunges', score: 55 }, { station: 'Sled Push', score: 35 },
      { station: 'Burpee', score: 35 }, { station: 'Sled Pull', score: 30 }, { station: 'Wall Balls', score: 28 },
    ],
    bottlenecks: [
      { rank: 1, name: 'Lactate clearance between stations', note: 'Cardio debt after erg drags the next strength station' },
      { rank: 2, name: 'Burpee broad jump get-up', note: 'Knee-based slow rise — needs hip-hinge explosiveness' },
      { rank: 3, name: 'Wall ball endurance', note: 'First station to collapse under lactate' },
    ],
    roi: 'Race-weight sled push/pull 3-4 sessions can cut 5-8min',
    baselines: [
      { station: 'Rowing', date: '4/26', detail: '8min all-out 2:03/500m (~2000m)' },
      { station: 'SkiErg', date: '5/16', detail: 'Interval 1min×4 ~2:15/500m' },
      { station: 'Sled Push', date: '5/16', detail: '30kg 40sec×4' },
      { station: 'Farmers Carry', date: '5/16', detail: '24kg 40sec×4' },
    ],
  },
};

// ---------- Assemble ----------
const recovery = parseRecovery();
const strength = parseStrength();
const { weeks, activities } = parseWeeklyLogs();
const body = parseBody();

const latest = [...recovery].reverse();
const latestACWR = latest.find((r) => r.acwr !== null);
const latestVO2 = latest.find((r) => r.vo2 !== null);
const latestBal = latest.find((r) => r.balStreak !== null);
const [lo] = curated.weeklyRunTarget;

const data = {
  generatedAt: new Date().toISOString(),
  ...curated,
  kpi: {
    acwr: latestACWR ? { value: latestACWR.acwr, date: latestACWR.date } : { value: 1.0, date: '' },
    vo2max: latestVO2 ? { value: latestVO2.vo2, date: latestVO2.date } : { value: 52, date: '' },
    balStreak: latestBal ? { value: latestBal.balStreak, date: latestBal.date } : { value: 0, date: '' },
    currentWeekKm: weeks.at(-1)?.runKm ?? 0,
    currentWeekLabel: weeks.at(-1)?.week ?? '',
  },
  recovery: recovery.slice(-35),
  strength,
  weeklyRun: weeks,
  recentActivities: activities,
  body,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'data.json'), JSON.stringify(data, null, 1));
console.log(`✓ data.json — ${recovery.length} recovery days, ${strength.vlHistory.length} VL exercises, ${weeks.length} weeks`);
