#!/usr/bin/env node
// Generate public/data.sample.json — fully synthetic demo data (no real person).
// The dashboard falls back to this when data.json is absent (e.g. the public
// template's Vercel deploy). Run: node scripts/make-sample.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

// 30 synthetic recovery days (deterministic, seeded, no real biometrics)
const recovery = [];
const base = new Date('2026-07-18');
let seed = 20260816;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
let balStreak = 14, vo2 = 58.0;
for (let i = 0; i < 30; i++) {
  const d = new Date(base); d.setDate(base.getDate() + i);
  const dip = (i >= 16 && i <= 19) ? 1 : 0; // heavy trap-bar/hip-thrust week fatigue dip
  const sleep = Math.round(Math.min(95, Math.max(70, 86 + (rand() * 13 - 7) - dip * 3)));
  const rhr = Math.round(Math.min(54, Math.max(40, 45 + (rand() * 6 - 3) + dip * 4)));
  const hrv = Math.round(Math.min(82, Math.max(48, 68 + (rand() * 16 - 8) - dip * 14)));
  const hrvStatus = hrv >= 60 ? 'BALANCED' : 'UNBALANCED';
  balStreak = hrvStatus === 'BALANCED' ? balStreak + 1 : 0;
  const acwr = Math.round((1.0 + (rand() * 0.4 - 0.2) + (i >= 14 && i <= 17 ? 0.15 : 0)) * 100) / 100;
  if (i % 6 === 0 && i > 0) vo2 = Math.round((vo2 + 0.2) * 10) / 10;
  let readiness = 5;
  readiness += sleep >= 88 ? 2 : sleep >= 80 ? 1 : sleep >= 70 ? 0 : -1;
  readiness += hrvStatus === 'BALANCED' ? 1 : -1;
  readiness += rhr <= 45 ? 1 : 0;
  readiness = Math.max(3, Math.min(10, readiness));
  recovery.push({
    date: d.toISOString().slice(0, 10),
    sleep, rhr, hrv, hrvStatus, readiness, acwr, vo2, balStreak,
  });
}

const vlPts = (name, tier, arr) => ({ name, tier, points: arr.map(([week, date, scheme, vl]) => ({ week, date, scheme, vl })) });
const strength = {
  progress: [
    { tier: 'main', name: 'Barbell Hip Thrust', start: '40kg', current: '70kg×4×10', vl: '1,200→2,800 (+133%)', next: 'Try 75kg×3×10' },
    { tier: 'main', name: 'Trap Bar Deadlift', start: '60kg×3×8', current: '100kg×4×6', vl: '1,440→2,400 (+67%)', next: 'Add 3rd heavy set @105kg' },
    { tier: 'main', name: 'Weighted Pull-up', start: '+5kg×4×6', current: '+15kg×4×8', vl: '120→480 (+300%)', next: 'Hold volume, chase +17.5kg' },
    { tier: 'accessory', name: 'DB Shoulder Press', start: '10kg×3×10', current: '16kg×4×8', vl: '300→512 (+71%)', next: 'Add 5th rep at 16kg' },
    { tier: 'accessory', name: 'Lateral Raise', start: '5kg×12×3', current: '7kg×3×15', vl: '180→315 (+75%)', next: '15 reps clean then 8kg' },
  ],
  vlHistory: [
    vlPts('Barbell Hip Thrust', 'main', [['W25', '6/14', '40×10×3', 1200], ['W27', '6/28', '50×10×3', 1500], ['W29', '7/12', '55×10×4', 2200], ['W30', '7/19', '60×10×4', 2400], ['W32', '8/2', '65×10×4', 2600], ['W33', '8/9', '70×10×4', 2800]]),
    vlPts('Trap Bar Deadlift', 'main', [['W25', '6/14', '60×8×3', 1440], ['W27', '6/28', '70×8×3', 1680], ['W29', '7/12', '80×6×4', 1920], ['W30', '7/19', '85×6×4', 2040], ['W32', '8/2', '90×6×4', 2160], ['W33', '8/9', '100×6×4', 2400]]),
    vlPts('Weighted Pull-up', 'main', [['W25', '6/14', '+5kg×6×4', 120], ['W27', '6/28', '+7.5kg×6×4', 180], ['W29', '7/12', '+10kg×7×4', 280], ['W30', '7/19', '+10kg×8×4', 320], ['W32', '8/2', '+12.5kg×8×4', 400], ['W33', '8/9', '+15kg×8×4', 480]]),
    vlPts('DB Shoulder Press', 'accessory', [['W25', '6/14', '10×10×3', 300], ['W28', '7/5', '12×10×3', 360], ['W30', '7/19', '14×9×3', 378], ['W33', '8/9', '16×8×4', 512]]),
    vlPts('Lateral Raise', 'accessory', [['W25', '6/14', '5×12×3', 180], ['W28', '7/5', '6×12×3', 216], ['W31', '7/26', '6×15×3', 270], ['W33', '8/9', '7×15×3', 315]]),
  ],
};

const weeklyRun = [
  { week: '2026-W26', range: 'Jun22-Jun28', runKm: 48 },
  { week: '2026-W27', range: 'Jun29-Jul05', runKm: 52 },
  { week: '2026-W28', range: 'Jul06-Jul12', runKm: 58 },
  { week: '2026-W29', range: 'Jul13-Jul19', runKm: 45 },
  { week: '2026-W30', range: 'Jul20-Jul26', runKm: 60 },
  { week: '2026-W31', range: 'Jul27-Aug02', runKm: 65 },
  { week: '2026-W32', range: 'Aug03-Aug09', runKm: 68 },
  { week: '2026-W33', range: 'Aug10-Aug16', runKm: 62 },
];
const recentActivities = [
  { week: '2026-W33', day: 'Mon', date: '8/10', training: 'Strength (Hyrox lower + hip thrust)', duration: '70min', distance: '—', readiness: '8/10' },
  { week: '2026-W33', day: 'Tue', date: '8/11', training: 'Easy Run', duration: '55min', distance: '11.5km', readiness: '8/10' },
  { week: '2026-W33', day: 'Wed', date: '8/12', training: 'Strength (pull + carries)', duration: '65min', distance: '—', readiness: '7/10' },
  { week: '2026-W33', day: 'Thu', date: '8/13', training: 'Tempo Run', duration: '50min', distance: '12.0km', readiness: '8/10' },
  { week: '2026-W33', day: 'Fri', date: '8/14', training: 'Strength (trap bar + sled)', duration: '75min', distance: '—', readiness: '6/10' },
  { week: '2026-W33', day: 'Sat', date: '8/15', training: 'Long Run', duration: '95min', distance: '20.0km', readiness: '7/10' },
];
const body = {
  weights: [
    { date: '2026-06-14', kg: 68.0, note: 'Block start' },
    { date: '2026-07-15', kg: 67.2, note: '-0.8kg' },
    { date: '2026-08-15', kg: 66.5, note: '-1.5kg total' },
  ],
  measurements: [
    { date: '2026-06-14', 肩围: '108', 胸围: '92', 上臂松: '27', 上臂屈: '29', 前臂: '—', 腰围: '76', 臀围: '91', 大腿: '50', 小腿: '36', 体重: '68.0' },
    { date: '2026-08-04', 肩围: '109', 胸围: '93', 上臂松: '28', 上臂屈: '30', 前臂: '—', 腰围: '74', 臀围: '90', 大腿: '51', 小腿: '36', 体重: '66.8' },
  ],
};

const data = {
  generatedAt: new Date().toISOString(),
  phase: 'Sample — UTMB + Hyrox + Marathon triple-block build (synthetic demo data, no real athlete)',
  weeklyRunTarget: [55, 70],
  weight: { current: 66.5, asOf: '2026-08-15', target: '65-67kg' },
  injuries: [
    { name: 'Right Achilles tendinopathy', status: 'resolved', note: 'Cleared after 8-week eccentric loading block. Monitor under speed work.' },
    { name: 'Hip flexor tightness (L)', status: 'treating', note: 'Post-Hyrox sled/lunge soreness. Daily couch stretch + hip CARs.' },
    { name: 'Plantar fasciitis (L), mild', status: 'watching', note: 'AM stiffness only, pain-free running. Calf raises + frozen-bottle roll.' },
  ],
  goals: {
    firstPriority: ['Vertical durability + ultra fueling (UTMB)', 'Hyrox station-transfer strength', 'Marathon-specific aerobic base (London)', 'Injury-free across a 3-race season'],
    performance: [
      { year: '2026', goal: 'UTMB Chiang Mai 50K (Nov 28) — first ultra finish, target sub-9:00' },
      { year: '2026', goal: 'Hyrox Paris (Dec 20) — sub-1:10 Open' },
      { year: '2027', goal: 'London Marathon — sub-2:55 (current PB 2:58:32)' },
    ],
  },
  pbs: [
    { dist: '5K', time: '16:58', pace: '3:24/km', date: '2025-10-12', note: '' },
    { dist: '10K', time: '35:12', pace: '3:31/km', date: '2025-11-09', note: '' },
    { dist: 'Half', time: '1:18:40', pace: '3:44/km', date: '2026-02-01', note: '' },
    { dist: 'Marathon', time: '2:58:32', pace: '4:14/km', date: '2026-03-15', note: 'Sub-3 debut' },
  ],
  physio: {
    lthr: 175, maxHr: '190-192',
    hrZones: [
      { zone: 'Z1', bpm: '125-142', use: 'Recovery' }, { zone: 'Z2', bpm: '142-158', use: 'Easy / Long Run' },
      { zone: 'Z3', bpm: '158-168', use: 'Marathon pace' }, { zone: 'Z4', bpm: '168-182', use: 'Threshold' },
      { zone: 'Z5', bpm: '>182', use: 'VO2max / race' },
    ],
    ltPace: '3:58-4:05/km', easyPace: '4:45-5:10/km @ HR 148-155',
    baselines: { sleep: '78-93 (avg 86)', rhr: '42-48 bpm', hrv: '58-78ms (avg 68)' },
    nutrition: { protein: '~2.0 g/kg', calories: '~3100-3400 kcal/day (high-volume weeks)', deficit: 'Maintenance — Hyrox strength phase, no cut', notes: 'Beetroot juice pre-race, creatine 5g/day, iron + vitamin D' },
  },
  races: {
    upcoming: [
      { name: 'UTMB Chiang Mai 50K', date: '2026-11-28', detail: '50km · 3600m gain · First 50K', tag: 'A race', accent: 'trail', anchor: 'trail' },
      { name: 'Hyrox Paris', date: '2026-12-20', detail: 'Open division · 8km run + 8 stations · 3wk after UTMB', tag: 'B race', accent: 'hyrox', anchor: 'hyrox' },
      { name: 'London Marathon', date: '2027-04-25', detail: 'World Marathon Major · Target sub-2:55', tag: 'Season goal', accent: 'marathon', anchor: 'races' },
    ],
  },
  trail: {
    race: { name: 'UTMB Chiang Mai 50K', date: '2026-11-28', distance: 50, elevation: 3600 },
    longest: { date: '2026-08-02', distance: 18.4, elevation: 540, note: 'Longest single run so far — 15% of race vert' },
    progression: [
      { label: '7/12', distance: 14.2, elevation: 320, status: 'done' }, { label: '7/26', distance: 16.5, elevation: 460, status: 'done' },
      { label: '8/2', distance: 18.4, elevation: 540, status: 'done' }, { label: '9/6', distance: 25, elevation: 900, status: 'next' },
      { label: '10/4', distance: 32, elevation: 1500, status: 'plan' }, { label: '11/1', distance: 38, elevation: 2200, status: 'plan' },
      { label: 'Race', distance: 50, elevation: 3600, status: 'race' },
    ],
    plan: [
      { week: 'W29', date: '7/12', target: '14.2km / 320m', status: 'done', note: 'First hill long run of the block' },
      { week: 'W31', date: '7/26', target: '16.5km / 460m', status: 'done', note: 'Uphill effort-based, downhill form drill' },
      { week: 'W32', date: '8/2', target: '18.4km / 540m', status: 'done', note: 'Longest to date, clean legs next day' },
      { week: 'W36', date: '9/6', target: '25km / 900m', status: 'next', note: 'Vertical-focused long run, poles introduced' },
      { week: 'W40', date: '10/4', target: '32km / 1500m', status: 'plan', note: 'Back-to-back long run weekend, day-2 tired-legs practice' },
      { week: 'W44', date: '11/1', target: '38km / 2200m', status: 'plan', note: 'Final big vert weekend before taper, race-nutrition test' },
      { week: 'Race', date: '11/28', target: '50km / 3600m', status: 'race', note: 'UTMB Chiang Mai — effort-based, not chasing time' },
    ],
    gaps: [
      { name: 'Vertical gain durability', sev: 'high', note: 'Longest run elevation (540m) is 15% of race total (3600m) — needs 3-4 more big vert weekends' },
      { name: 'Ultra fueling / pacing', sev: 'high', note: 'No run past 3h yet; race is likely an 8-11h effort' },
      { name: 'Downhill braking economy', sev: 'mid', note: 'Quad eccentric load still fatigues faster than uphill' },
    ],
    downhill: ['Short quick steps', 'Lower CoG, soft knees', 'Quad + glute braking', 'Poles on steep climbs to save legs for the back half'],
    ankle: [{ date: '7/19', right: 24, left: 21 }, { date: '8/9', right: 29, left: 27 }],
    ankleTarget: 30,
    verdict: 'Vertical volume is the limiter, not distance. Need 3-4 more big elevation weekends before Nov 28 — downhill economy and multi-hour fueling are the other two gaps.',
  },
  hyrox: {
    status: 'Prep', race: { name: 'Hyrox Paris', date: '2026-12-20', location: 'Paris, France' },
    statusNote: 'Only 3 weeks between UTMB Chiang Mai (Nov 28) and Hyrox Paris (Dec 20) — this block is recovery-then-sharpen, not a fitness peak. Open division, not chasing a time.',
    estimate: { likely: '1:08:00 – 1:12:00 (assumes normal UTMB recovery)', optimistic: '~1:05:30', conservative: '~1:16:00' },
    profile: 'Running top 8% · stations top 40%',
    radar: [
      { station: 'Run 8×1km', score: 95 }, { station: 'Rowing', score: 85 }, { station: 'SkiErg', score: 72 },
      { station: 'Farmers Carry', score: 68 }, { station: 'Lunges', score: 60 }, { station: 'Sled Push', score: 45 },
      { station: 'Burpee Broad Jump', score: 40 }, { station: 'Sled Pull', score: 38 }, { station: 'Wall Balls', score: 35 },
    ],
    bottlenecks: [
      { rank: 1, name: 'Sled push/pull power', note: 'Lower-body max-strength ceiling caps sled speed' },
      { rank: 2, name: 'Wall ball endurance', note: 'Shoulder/quad fatigue resistance under high HR' },
      { rank: 3, name: 'Burpee broad jump transitions', note: 'Technical efficiency + hip power' },
    ],
    roi: 'Heavy sled + wall-ball EMOM 2x/week can cut 6-9min off the finish estimate',
    baselines: [
      { station: 'Rowing', date: '7/10', detail: '1000m time trial 3:28 (1:44/500m)' },
      { station: 'SkiErg', date: '7/24', detail: '1000m time trial 3:52 (1:56/500m)' },
    ],
  },
  kpi: {
    acwr: { value: recovery.at(-1).acwr, date: recovery.at(-1).date }, vo2max: { value: recovery.at(-1).vo2, date: recovery.at(-1).date },
    balStreak: { value: recovery.at(-1).balStreak, date: recovery.at(-1).date },
    currentWeekKm: 62, currentWeekLabel: '2026-W33',
  },
  recovery, strength, weeklyRun, recentActivities, body,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'data.sample.json'), JSON.stringify(data, null, 1));
