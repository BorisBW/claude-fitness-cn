#!/usr/bin/env node
// Generate public/data.sample.json — fully synthetic demo data (no real person).
// The dashboard falls back to this when data.json is absent (e.g. the public
// template's Vercel deploy). Run: node scripts/make-sample.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

// 14 synthetic recovery days (deterministic, no real biometrics)
const recovery = [];
const base = new Date('2026-05-30');
const sleeps = [82, 78, 85, 90, 76, 88, 80, 84, 91, 79, 86, 82, 88, 83];
const hrvs = [44, 41, 47, 52, 38, 50, 43, 46, 55, 40, 48, 45, 50, 47];
const rhrs = [56, 57, 55, 54, 58, 55, 56, 55, 54, 57, 55, 56, 55, 57];
for (let i = 0; i < 14; i++) {
  const d = new Date(base); d.setDate(base.getDate() + i);
  recovery.push({
    date: d.toISOString().slice(0, 10),
    sleep: sleeps[i], rhr: rhrs[i], hrv: hrvs[i],
    hrvStatus: hrvs[i] >= 41 ? 'BALANCED' : 'UNBALANCED',
    readiness: Math.max(4, Math.min(10, Math.round(hrvs[i] / 6))),
    acwr: 0.9 + (i % 4) * 0.1, vo2: 52, balStreak: 10 + i,
  });
}

const vlPts = (name, tier, arr) => ({ name, tier, points: arr.map(([week, date, scheme, vl]) => ({ week, date, scheme, vl })) });
const strength = {
  progress: [
    { tier: 'main', name: 'Barbell Hip Thrust', start: '25kg', current: '60kg×4×12', vl: '900→2,880 (+220%)', next: 'Try 65kg×3×12' },
    { tier: 'main', name: 'DB Shoulder Press', start: '10-12kg', current: '14kg×4×10', vl: '440→560 (+27%)', next: 'Hold then 16kg' },
    { tier: 'main', name: 'Single-arm Row', start: '12kg', current: '18kg×4×10', vl: '432→720 (+67%)', next: 'Hold then 20kg' },
    { tier: 'accessory', name: 'Lateral Raise', start: '6kg×12', current: '6kg×4×15', vl: '216→360 (+67%)', next: '15 reps then 8kg' },
  ],
  vlHistory: [
    vlPts('Barbell Hip Thrust', 'main', [['W16', '4/16', '25×12×3', 900], ['W18', '4/29', '40×12×4', 1920], ['W19', '5/6', '50×12×4', 2400], ['W22', '5/27', '55×12×3', 1980], ['W23', '6/3', '60×12×3', 2160], ['W24', '6/10', '60×12×4', 2880]]),
    vlPts('DB Shoulder Press', 'main', [['W16', '4/16', '10-12kg', 440], ['W19', '5/6', '12kg×43', 516], ['W22', '5/27', '14×10×3', 564], ['W24', '6/12', '14×4×10', 560]]),
    vlPts('Single-arm Row', 'main', [['W17', '4/24', '12×12×3', 432], ['W19', '5/8', '16×10×4', 640], ['W24', '6/12', '18×10×4', 720]]),
    vlPts('Lateral Raise', 'accessory', [['W19', '5/8', '6×12×3', 216], ['W20', '5/15', '6×15×3', 270], ['W23', '6/6', '6×15×4', 360]]),
  ],
};

const weeklyRun = [
  { week: '2026-W18', range: 'Apr27-May03', runKm: 26.0 },
  { week: '2026-W19', range: 'May04-May10', runKm: 38.2 },
  { week: '2026-W20', range: 'May11-May17', runKm: 19.1 },
  { week: '2026-W21', range: 'May18-May24', runKm: 47.0 },
  { week: '2026-W22', range: 'May25-May31', runKm: 26.0 },
  { week: '2026-W23', range: 'Jun01-Jun07', runKm: 38.5 },
  { week: '2026-W24', range: 'Jun08-Jun14', runKm: 33.0 },
];
const recentActivities = [
  { week: '2026-W24', day: 'Mon', date: '6/8', training: 'Strength B+C', duration: '87min', distance: '—', readiness: '5/10' },
  { week: '2026-W24', day: 'Tue', date: '6/9', training: 'Easy Run', duration: '60min', distance: '10.0km', readiness: '9/10' },
  { week: '2026-W24', day: 'Wed', date: '6/10', training: 'Strength A (legs)', duration: '75min', distance: '—', readiness: '9/10' },
  { week: '2026-W24', day: 'Thu', date: '6/11', training: 'Easy Run', duration: '49min', distance: '8.0km', readiness: '7/10' },
  { week: '2026-W24', day: 'Fri', date: '6/12', training: 'Strength B+C', duration: '96min', distance: '—', readiness: '7/10' },
];
const body = {
  weights: [{ date: '2026-04-20', kg: 71.5, note: 'Baseline' }, { date: '2026-06-06', kg: 70.0, note: '-1.5kg' }],
  measurements: [{ date: '2026-04-20', 肩围: '112', 胸围: '97', 上臂松: '28', 上臂屈: '30', 前臂: '—', 腰围: '88', 臀围: '98', 大腿: '52', 小腿: '38', 体重: '71.5' }],
};

const data = {
  generatedAt: new Date().toISOString(),
  phase: 'Sample — Marathon build + functional strength (synthetic demo data)',
  weeklyRunTarget: [30, 40],
  weight: { current: 70.0, asOf: '2026-06-06', target: '68-70kg' },
  injuries: [
    { name: 'Left calf (soleus)', status: 'resolved', note: 'Cleared. Monitor on speed work.' },
    { name: 'Lower back', status: 'treating', note: 'Daily core work. Weak core → pelvic tilt.' },
    { name: 'Knee crepitus', status: 'watching', note: 'Benign. TKE daily, no pain.' },
  ],
  goals: {
    firstPriority: ['Fix posture', 'Glute-driven mechanics', 'Build core + glute + shoulder base', 'Knee protection'],
    performance: [{ year: '2026', goal: 'Marathon sub-3:45' }, { year: '2027', goal: 'Half 1:38 · Marathon 3:35' }],
  },
  pbs: [
    { dist: '5K', time: '20:47', pace: '4:09/km', date: '2025-05-06', note: '' },
    { dist: '10K', time: '44:56', pace: '4:30/km', date: '2025-04-29', note: '' },
    { dist: 'Half', time: '1:39:15', pace: '4:42/km', date: '2026-04-12', note: '' },
    { dist: 'Marathon', time: '3:45:23', pace: '5:21/km', date: '2025-10-26', note: '' },
  ],
  physio: {
    lthr: 173, maxHr: '184-186',
    hrZones: [
      { zone: 'Z1', bpm: '112-138', use: 'Recovery' }, { zone: 'Z2', bpm: '138-154', use: 'Easy / Long Run' },
      { zone: 'Z3', bpm: '154-164', use: 'Marathon pace' }, { zone: 'Z4', bpm: '164-177', use: 'Threshold' },
      { zone: 'Z5', bpm: '>177', use: 'VO2max / race' },
    ],
    ltPace: '4:50-5:00/km', easyPace: '5:50-6:15/km @ HR 145-150',
    baselines: { sleep: '72-87 (avg 77)', rhr: '55-59 bpm', hrv: '38-47ms (avg 41)' },
    nutrition: { protein: '~1.8 g/kg', calories: '~2000-2200 kcal/day', deficit: '~1kg/month', notes: 'Creatine, fish oil' },
  },
  races: {
    upcoming: [
      { name: 'Trail Race', date: '2026-06-27', detail: '24km · 980m gain', tag: 'A race', accent: 'trail', anchor: 'trail' },
      { name: 'Hyrox', date: '2026-08-13', detail: 'Singles · block after trail', tag: 'Prep', accent: 'hyrox', anchor: 'hyrox' },
    ],
  },
  trail: {
    race: { name: 'Trail Race', date: '2026-06-27', distance: 24.28, elevation: 982 },
    longest: { date: '2026-06-07', distance: 15.45, elevation: 1152, note: 'Climb exceeds race +17%' },
    progression: [
      { label: '5/24', distance: 15.31, elevation: 680, status: 'done' }, { label: '6/7', distance: 15.45, elevation: 1152, status: 'done' },
      { label: '6/14', distance: 15, elevation: 500, status: 'plan' }, { label: '6/21', distance: 10, elevation: 200, status: 'plan' },
      { label: 'Race', distance: 24.28, elevation: 982, status: 'race' },
    ],
    plan: [
      { week: 'W21', date: '5/24', target: '15.31km / 680m', status: 'done', note: 'First trail long run' },
      { week: 'W23', date: '6/7', target: '15.45km / 1152m', status: 'done', note: 'OVERLOAD' },
      { week: 'W24', date: '6/14', target: '15km / 500m', status: 'next', note: 'Downhill focus' },
      { week: 'Race', date: '6/27', target: '24.28km / 982m', status: 'race', note: 'Effort-based' },
    ],
    gaps: [
      { name: 'Downhill technique', sev: 'high', note: 'Confident uphill, slow downhill' },
      { name: 'Quad eccentric strength', sev: 'high', note: 'Eccentric step-downs mandatory' },
      { name: 'Distance endurance', sev: 'mid', note: '24km vs longest 15.45km' },
    ],
    downhill: ['Short quick steps', 'Lower CoG, soft knees', 'Quad + glute braking', 'Zig-zag steep descents'],
    ankle: [{ date: '5/17', right: 7.5, left: 3.5 }, { date: '5/27', right: 20, left: 12.5 }],
    ankleTarget: 20,
    verdict: 'Climbing validated. Remaining gap = downhill technique + distance endurance.',
  },
  hyrox: {
    status: 'Prep', race: { name: 'Hyrox Singles', date: '2026-08-13', location: 'Example City' },
    statusNote: 'Focused block begins after the trail race (~7 weeks).',
    estimate: { likely: '1:22 – 1:32', optimistic: '~1:17:40', conservative: '~1:38:00' },
    profile: 'Running top 15% · stations bottom 40%',
    radar: [
      { station: 'Run 8×1km', score: 90 }, { station: 'Rowing', score: 78 }, { station: 'SkiErg', score: 65 },
      { station: 'Farmers Carry', score: 60 }, { station: 'Lunges', score: 55 }, { station: 'Sled Push', score: 35 },
      { station: 'Burpee', score: 35 }, { station: 'Sled Pull', score: 30 }, { station: 'Wall Balls', score: 28 },
    ],
    bottlenecks: [
      { rank: 1, name: 'Lactate clearance between stations', note: 'Cardio debt drags next strength station' },
      { rank: 2, name: 'Burpee broad jump get-up', note: 'Needs hip-hinge explosiveness' },
      { rank: 3, name: 'Wall ball endurance', note: 'First to collapse under lactate' },
    ],
    roi: 'Race-weight sled push/pull 3-4 sessions can cut 5-8min',
    baselines: [
      { station: 'Rowing', date: '4/26', detail: '8min all-out 2:03/500m' },
      { station: 'SkiErg', date: '5/16', detail: 'Interval ~2:15/500m' },
    ],
  },
  kpi: {
    acwr: { value: 0.9, date: recovery.at(-1).date }, vo2max: { value: 52, date: recovery.at(-1).date },
    balStreak: { value: recovery.at(-1).balStreak, date: recovery.at(-1).date },
    currentWeekKm: 33.0, currentWeekLabel: '2026-W24',
  },
  recovery, strength, weeklyRun, recentActivities, body,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'data.sample.json'), JSON.stringify(data, null, 1));
console.log('✓ data.sample.json written (synthetic demo data)');
