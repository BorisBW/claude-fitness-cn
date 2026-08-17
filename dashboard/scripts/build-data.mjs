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
// Diet log written by the WeChat food pipeline (food.mjs / food-live.mjs).
// Point DIET_LOG at your food-log.jsonl, e.g. DIET_LOG=/path/to/weixin-test/food-log.jsonl
const DIET_LOG = process.env.DIET_LOG || join(FITNESS_DIR, '..', '..', 'weixin-test', 'food-log.jsonl');
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
  const allActs = [];
  const keyWorkouts = [];
  const easyByWeek = {}, hardByWeek = {};
  const watchKcalByDate = new Map();
  const today = new Date();
  for (const f of files) {
    const raw = readFileSync(join(logsDir, f), 'utf8');
    const label = f.match(/(\d{4}-W\d+)/)?.[1] ?? f;
    const year = parseInt(label.slice(0, 4));
    const range = f.match(/\((.+)\)/)?.[1] ?? '';
    let km = 0, weekVert = 0;
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
      // 爬升(vert): 从距离列或训练文本里取 '爬升 1800m' / 'vert 1800' / '1800m' 形态, 没有则 0
      const vertM = (() => {
        const cell = [cells[5], cells[4]].find((c) => /^[~≈]?[\d.]+\s*m$/.test(c ?? ''));
        if (cell) return parseFloat(cell.replace(/[~≈m\s]/g, ''));
        const t = cells[3] ?? '';
        const mt = t.match(/爬升\s*([\d.]+)\s*m|vert\s*([\d.]+)/i);
        return mt ? parseFloat(mt[1] || mt[2]) : 0;
      })();
      weekVert += vertM;
      if (isNewFormat && cells[3] && cells[3] !== '—' && cells[3] !== '休息') {
        const act = { week: label, day: cells[1], date: cells[2], training: cells[3], duration: cells[4], distance: cells[5], readiness: cells[6] };
        allActs.push(act);
        // 强度分布(80/20): 按训练标签关键词分 轻松(Zone1-2) vs 高强度(Zone3+)
        const t = cells[3];
        const isHard = /节奏|Tempo|Threshold|阈值|间歇|Interval|VO2|变速|Fartlek/i.test(t);
        const isEasy = /轻松|Easy|恢复|Recovery|长跑|Long|越野|Trail|慢跑|Jog/i.test(t);
        const rKm = distCell ? parseFloat(distCell.replace(/[~≈km\s]/g, '')) : 0;
        if (rKm > 0) {
          if (isHard) hardByWeek[label] = (hardByWeek[label] || 0) + rKm;
          else if (isEasy) easyByWeek[label] = (easyByWeek[label] || 0) + rKm;
        }
        // 关键训练配速趋势: 长跑/节奏/间歇 + 距离+时长可解析 → paceSec; HR 从训练文本取(Garmin), 没有则 null
        if (/长跑|Long|节奏|Tempo|间歇|Interval|VO2|阈值|Threshold/i.test(t)) {
          const kmM = /^[~≈]?([\d.]+)\s*km$/i.exec(cells[5]);
          const minM = /^[~≈]?([\d.]+)\s*min$/i.exec(cells[4]);
          if (kmM && minM) {
            const hrM = t.match(/HR\s*(\d+)|心率\s*(\d+)|avg\s*(\d+)/i);
            keyWorkouts.push({
              week: label, date: cells[2],
              type: /Interval|间歇|VO2/i.test(t) ? 'Interval' : /Tempo|节奏|阈值|Threshold/i.test(t) ? 'Tempo' : 'Long Run',
              distKm: parseFloat(kmM[1]),
              paceSec: Math.round(parseFloat(minM[1]) * 60 / parseFloat(kmM[1])),
              hr: hrM ? parseInt(hrM[1] || hrM[2]) : null,
            });
          }
        }
      }
    }
    // Parse Evening Training sections for actual watch calories (卡路里 column)
    const daySections = raw.split(/^## /m).slice(1);
    for (const section of daySections) {
      const dayMatch = section.split('\n')[0].match(/(\d{1,2})-(\d{1,2})/);
      if (!dayMatch) continue;
      const dayIso = `${year}-${dayMatch[1].padStart(2, '0')}-${dayMatch[2].padStart(2, '0')}`;
      const etMatch = section.match(/### Evening Training[^\n]*/);
      if (!etMatch) continue;
      const etBlock = section.slice(section.indexOf(etMatch[0])).split(/^### /m)[0];
      const tableLines = etBlock.split('\n').filter(l => l.startsWith('|'));
      if (tableLines.length < 3) continue;
      const headerCells = tableLines[0].split('|').map(c => c.trim());
      const kcalIdx = headerCells.findIndex(c => c.includes('卡路里'));
      if (kcalIdx < 0) continue;
      let dayKcal = 0;
      for (const tl of tableLines.slice(1)) {
        if (tl.includes('---')) continue;
        const cells = tl.split('|').map(c => c.trim());
        const km = (cells[kcalIdx] ?? '').match(/(\d+)\s*kcal/i);
        if (km) dayKcal += parseInt(km[1]);
      }
      if (dayKcal > 0) watchKcalByDate.set(dayIso, (watchKcalByDate.get(dayIso) || 0) + dayKcal);
    }
    weeks.push({ week: label, range, runKm: Math.round(km * 100) / 100, vert: Math.round(weekVert),
      intensity: { easyKm: Math.round((easyByWeek[label] || 0) * 10) / 10, hardKm: Math.round((hardByWeek[label] || 0) * 10) / 10 } });
  }
  return { weeks, activities: allActs, recentActivities: allActs.slice(-14), keyWorkouts, watchKcalByDate };
}

// ---------- 3.4 Diet: 统一饮食日志 → 每日摄入 ----------
// 统一数据模型(无论来源是微信管线还是训记,agent 记录时都写成此格式):
//   { date, meal, meal_time, source, items:[{name,type,portion,kcal,protein,carb,fat}],
//     total_kcal, total_protein, total_carb, total_fat }
// 防御性兼容: 训记原始记录(foods[].ntr 每100g营养 + amount 克)也能直接解析。
const MEAL_TYPE_MAP = { breakfast: '早餐', brunch: '早餐', lunch: '午餐', dinner: '晚餐', supper: '夜宵', snack: '加餐' };
const r1 = (x) => Math.round((x ?? 0) * 10) / 10;
function parseDiet() {
  if (!existsSync(DIET_LOG)) return { days: [], source: DIET_LOG, note: '未找到 food-log.jsonl' };
  const lines = readFileSync(DIET_LOG, 'utf8').split('\n').filter(Boolean);
  const byDate = new Map();
  let skippedLines = 0;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    try {
      const rec = JSON.parse(line);
      // 新格式带 date; 旧格式只有 time(ISO), 从 time 推断日期
      const date = rec.date || (rec.time ? rec.time.slice(0, 10) : null);
      if (!date) continue;
      let day = byDate.get(date);
      if (!day) { day = { date, totalKcal: 0, totalProtein: 0, totalCarb: 0, totalFat: 0, meals: [] }; byDate.set(date, day); }
      const mealName = MEAL_TYPE_MAP[rec.meal_type] || rec.meal || '餐';
      let meal = { meal: mealName, time: rec.meal_time || '', kcal: 0, protein: 0, carb: 0, fat: 0, items: [] };
      // 格式A: 统一模型 rec.items[] (微信管线 / agent 归一化后的训记数据)
      if (Array.isArray(rec.items)) {
        meal.items = rec.items.map((it) => ({
          name: it.name, type: it.type, portion: it.portion, kcal: it.kcal ?? 0,
          protein: it.protein ?? null, carb: it.carb ?? null, fat: it.fat ?? null,
        }));
        meal.kcal = rec.total_kcal ?? meal.items.reduce((s, it) => s + (it.kcal || 0), 0);
        meal.protein = rec.total_protein ?? meal.items.reduce((s, it) => s + (it.protein || 0), 0);
        meal.carb = rec.total_carb ?? meal.items.reduce((s, it) => s + (it.carb || 0), 0);
        meal.fat = rec.total_fat ?? meal.items.reduce((s, it) => s + (it.fat || 0), 0);
      }
      // 格式B: 训记原始记录 rec.foods[] (ntr 每100g + amount 克) —— 防御性兼容
      else if (Array.isArray(rec.foods)) {
        meal.items = rec.foods.map((f) => {
          const ntr = f.ntr || {};
          const mult = (f.amount || 0) / 100;
          return {
            name: f.name, type: f.type || '', portion: f.amount ? `${f.amount}${f.unit || 'g'}` : '',
            kcal: r1((ntr.cal || 0) * mult), protein: r1((ntr.protein || 0) * mult),
            carb: r1((ntr.carb || 0) * mult), fat: r1((ntr.fat || 0) * mult),
          };
        });
        meal.kcal = meal.items.reduce((s, it) => s + it.kcal, 0);
        meal.protein = r1(meal.items.reduce((s, it) => s + it.protein, 0));
        meal.carb = r1(meal.items.reduce((s, it) => s + it.carb, 0));
        meal.fat = r1(meal.items.reduce((s, it) => s + it.fat, 0));
      } else continue;
      meal.kcal = r1(meal.kcal); meal.protein = r1(meal.protein); meal.carb = r1(meal.carb); meal.fat = r1(meal.fat);
      day.meals.push(meal);
      day.totalKcal += meal.kcal; day.totalProtein += meal.protein; day.totalCarb += meal.carb; day.totalFat += meal.fat;
    } catch (err) {
      skippedLines++;
      console.warn(`⚠ food-log.jsonl line ${li + 1} skipped: ${err.message}`);
    }
  }
  const days = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const d of days) { d.totalKcal = r1(d.totalKcal); d.totalProtein = r1(d.totalProtein); d.totalCarb = r1(d.totalCarb); d.totalFat = r1(d.totalFat); }
  return { days, source: DIET_LOG, note: days.length ? '' : 'food-log.jsonl 暂无记录', skippedLines };
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
  tdeeExpected: 2400, // 生理预估维持热量, 用于 TDEE 反推对比(按体重/活动量改)
  strCtlContribution: 0, // 0 = endurance-only CTL; 0.5 = hybrid (Hyrox); 1.0 = legacy (full contribution)
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
  // 每日营养目标(供饮食看板: 热量缺口 / 宏量进度 / 完成度)。按自己情况改。
  dietTarget: { kcal: 2200, protein: 126, carb: 240, fat: 70 },
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
      { station: 'Run 8×1km', date: '4/18', detail: '8×1km @ 4:10 avg, 组间慢跑1分', value: 250, target: 235, unit: 'min/km', dir: 'lower' },
      { station: 'Rowing', date: '4/26', detail: '8min all-out 2:03/500m (~2000m)', value: 246, target: 228, unit: 's', dir: 'lower' },
      { station: 'SkiErg', date: '5/16', detail: 'Interval 1min×4 ~2:15/500m', value: 270, target: 250, unit: 's', dir: 'lower' },
      { station: 'Farmers Carry', date: '5/16', detail: '24kg 40sec×4', value: 24, target: 32, unit: 'kg', dir: 'higher' },
      { station: 'Lunges', date: '5/9', detail: '20kg 行走箭步蹲 8×20m', value: 20, target: 28, unit: 'kg', dir: 'higher' },
      { station: 'Sled Push', date: '5/16', detail: '30kg 40sec×4', value: 30, target: 45, unit: 'kg', dir: 'higher' },
      { station: 'Burpee', date: '4/28', detail: 'Burpee broad jump 10次 计时 44s', value: 44, target: 38, unit: 's', dir: 'lower' },
      { station: 'Sled Pull', date: '5/12', detail: '25kg 40sec×4', value: 25, target: 40, unit: 'kg', dir: 'higher' },
      { station: 'Wall Balls', date: '5/2', detail: '6kg 20次 计时 58s', value: 58, target: 45, unit: 's', dir: 'lower' },
    ],
  },
};

// ---------- Assemble ----------
const recovery = parseRecovery();
const strength = parseStrength();
const { weeks, activities, recentActivities, keyWorkouts, watchKcalByDate } = parseWeeklyLogs();
const body = parseBody();
const diet = parseDiet();

// TDEE 反推: 用体重趋势 + 记录摄入估算真实维持热量(能量守恒, 每 kg 体脂 ≈ 7700 kcal)
//   TDEE_est = 摄入均值 − Δkg × 7700 / 天数
//   记录系统性偏低时 TDEE_est 会低于生理预估 → 提示可能少记(拍照低估是常见原因)
function estimateTdee(dietDays, weights) {
  const days = dietDays.length;
  if (days < 7 || !weights?.length) return null;
  const first = dietDays[0].date, last = dietDays.at(-1).date;
  const inWin = weights.filter((w) => w.date >= first && w.date <= last).sort((a, b) => a.date.localeCompare(b.date));
  if (inWin.length < 2) return null;
  const nDays = Math.max(1, (new Date(inWin.at(-1).date) - new Date(inWin[0].date)) / 86400000);
  const calendarDays = Math.round(nDays);
  const intakeAvg = dietDays.reduce((s, d) => s + d.totalKcal, 0) / days;
  const value = Math.round(intakeAvg - (inWin.at(-1).kg - inWin[0].kg) * 7700 / nDays);
  const coverage = Math.round(days / Math.max(1, calendarDays) * 100);
  return { value, coverage, calendarDays };
}
const tdeeResult = estimateTdee(diet.days, body.weights);
diet.tdeeEst = tdeeResult?.value ?? null;
diet.tdeeCoverage = tdeeResult?.coverage ?? null;
diet.tdeeCalendarDays = tdeeResult?.calendarDays ?? null;
// 生理预估维持热量(体重×活动系数或 curated); 用于判断记录是否系统性偏低
diet.tdeeExpected = curated.tdeeExpected ?? null;

// ---------- 3.5 Load: 整体训练负荷(两池, 无主观输入) ----------
// 负荷 = 时长(分钟) × 强度系数(按训练标签关键词, 固定常数; 不依赖 RPE 打分)
//   耐力池(k=7 疲劳衰减): 轻松/长跑/节奏/间歇/越野 —— 未来游泳/骑车也归入此池
//   力量池(k=14, 恢复 2 倍慢): 力量/Hyrox
// 公式(Intervals.icu / TrainingPeaks 同款指数加权):
//   ATL_run = ATL_run_前日 × e^(−1/7)   + runLoad × (1−e^(−1/7))
//   ATL_str = ATL_str_前日 × e^(−1/14)  + strLoad × (1−e^(−1/14))
//   CTL     = CTL_前日     × e^(−1/42)  + 总负荷  × (1−e^(−1/42))
//   TSB     = CTL − (ATL_run + ATL_str)
function parseLoad(activities, opts = {}) {
  const strCtlContribution = opts.strCtlContribution ?? 0;
  const coef = (t) => {
    const s = t ?? '';
    if (/Hyrox/i.test(s)) return ['str', 1.3];
    if (/力量|Strength/i.test(s)) return /腿|下肢|leg|squat|trap|sled|lunge|hip|deadlift|深蹲|硬拉/i.test(s) ? ['str', 1.3] : ['str', 1.0];
    if (/越野|Trail|Hill|爬升|Vert/i.test(s)) return ['run', 1.3];
    if (/长跑|Long|LSD|耐力/i.test(s)) return ['run', 1.1];
    if (/节奏|Tempo|Threshold|LT|阈值/i.test(s)) return ['run', 1.5];
    if (/间歇|Interval|VO2/i.test(s)) return ['run', 1.7];
    if (/Stair|Stepper|爬楼|登山机|Combat|Boxing|搏击/i.test(s)) return ['run', 1.3];
    if (/Rowing|SkiErg|划船机|滑雪机|Elliptical|椭圆/i.test(s)) return ['run', 1.0];
    if (/Cycling|骑行|单车|Bike|Spin/i.test(s)) return ['run', 0.8];
    if (/Yoga|瑜伽|Stretch|拉伸/i.test(s)) return ['run', 0.3];
    if (/跑|Run|Easy|恢复|Recovery|轻松/i.test(s)) return ['run', 0.8];
    return null;
  };
  const byDay = new Map();
  for (const a of activities) {
    const y = parseInt((a.week || '').slice(0, 4));
    const md = (a.date || '').match(/^(\d{1,2})\/(\d{1,2})$/);
    const dur = parseInt((a.duration || '').replace(/[^\d]/g, ''));
    const c = coef(a.training);
    if (!y || !md || !dur || !c) continue;
    const iso = `${y}-${String(parseInt(md[1])).padStart(2, '0')}-${String(parseInt(md[2])).padStart(2, '0')}`;
    const e = byDay.get(iso) || { run: 0, str: 0 };
    let load = Math.round(dur * c[1]);
    if (c[0] === 'str') {
      const rpeM = (a.training || '').match(/(?:s?RPE)\s*(\d+)/i);
      if (rpeM) load = Math.round(load * Math.max(0.6, Math.min(1.8, parseInt(rpeM[1]) / 5)));
    }
    if (c[0] === 'run') e.run += load; else e.str += load;
    byDay.set(iso, e);
  }
  const sorted = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const fRun = 1 - Math.exp(-1 / 7), fStr = 1 - Math.exp(-1 / 14), fCtl = 1 - Math.exp(-1 / 42);
  let atlRun = 0, atlStr = 0, ctl = 0;
  const days = [];
  if (sorted.length) {
    const cur = new Date(sorted[0][0] + 'T00:00:00');
    const end = new Date(sorted.at(-1)[0] + 'T00:00:00');
    const pad2 = (n) => String(n).padStart(2, '0');
    while (cur <= end) {
      const iso = `${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}-${pad2(cur.getDate())}`;
      const e = byDay.get(iso) || { run: 0, str: 0 };
      atlRun = atlRun * Math.exp(-1 / 7) + e.run * fRun;
      atlStr = atlStr * Math.exp(-1 / 14) + e.str * fStr;
      ctl = ctl * Math.exp(-1 / 42) + (e.run + e.str * strCtlContribution) * fCtl;
      days.push({
        date: iso, runLoad: e.run, strLoad: e.str,
        atlRun: Math.round(atlRun), atlStr: Math.round(atlStr),
        ctl: Math.round(ctl), tsb: Math.round(ctl - atlRun),
      });
      cur.setDate(cur.getDate() + 1);
    }
  }
  let acwr = null;
  if (days.length >= 7) {
    const acute7 = days.slice(-7).reduce((s, d) => s + d.runLoad + d.strLoad, 0) / 7;
    const chronicSlice = days.slice(-Math.min(28, days.length));
    const chronic28 = chronicSlice.reduce((s, d) => s + d.runLoad + d.strLoad, 0) / chronicSlice.length;
    if (chronic28 > 0) acwr = Math.round(acute7 / chronic28 * 100) / 100;
  }
  return { unit: 'au', buckets: { endurance: '跑步/越野(未来: 游泳/骑车)', strength: '力量/Hyrox' }, days, acwr };
}
const load = parseLoad(activities, { strCtlContribution: curated.strCtlContribution ?? 0 });

// 动态目标: 基线热量 + 当天训练消耗估算 —— 让目标线随训练日浮动,
// 反映“高训练日是否吃够”(长跑日目标更高, 休息日回到基线)。
// 训练类型从 weekly logs 的当天记录按关键词推断; 无记录则按基线。
function trainingBurn(training) {
  const t = training ?? '';
  if (/长跑|LSD|Long|耐力/.test(t)) return 500;
  if (/力量|Strength|Hyrox/i.test(t)) return 200;
  if (/跑|Run|Easy/i.test(t)) return 250;
  return 0;
}
// activities 的日期是 'M/D' 格式, 补上年份(取自周标签 2026-W18)转成 ISO 日期
const actByDate = new Map();
for (const a of activities) {
  const y = parseInt((a.week || '').slice(0, 4));
  const md = (a.date || '').match(/^(\d{1,2})\/(\d{1,2})$/);
  if (y && md) {
    const iso = new Date(y, parseInt(md[1]) - 1, parseInt(md[2])).toISOString().slice(0, 10);
    actByDate.set(iso, a);
  }
}
for (const day of diet.days) {
  const act = actByDate.get(day.date);
  const watchBurn = watchKcalByDate.get(day.date);
  const estimatedBurn = act ? trainingBurn(act.training) : 0;
  day.targetKcal = (curated.dietTarget?.kcal || 2200) + (watchBurn ?? estimatedBurn);
  if (act) day.train = act.training;
  if (watchBurn != null) day.watchKcal = watchBurn;
}

const latest = [...recovery].reverse();
const latestACWR = latest.find((r) => r.acwr !== null);
const latestVO2 = latest.find((r) => r.vo2 !== null);
const latestBal = latest.find((r) => r.balStreak !== null);
const [lo] = curated.weeklyRunTarget;

const data = {
  generatedAt: new Date().toISOString(),
  ...curated,
  kpi: {
    acwr: load.acwr != null
      ? { value: load.acwr, date: load.days.at(-1)?.date ?? '', source: 'model' }
      : latestACWR ? { value: latestACWR.acwr, date: latestACWR.date, source: 'garmin' } : { value: 1.0, date: '' },
    vo2max: latestVO2 ? { value: latestVO2.vo2, date: latestVO2.date } : { value: 52, date: '' },
    balStreak: latestBal ? { value: latestBal.balStreak, date: latestBal.date } : { value: 0, date: '' },
    currentWeekKm: weeks.at(-1)?.runKm ?? 0,
    currentWeekLabel: weeks.at(-1)?.week ?? '',
  },
  recovery: recovery.slice(-35),
  strength,
  weeklyRun: weeks,
  intensityDist: weeks.map((w) => ({ week: w.week, easyKm: w.intensity?.easyKm ?? 0, hardKm: w.intensity?.hardKm ?? 0 })),
  keyWorkouts,
  recentActivities,
  body,
  diet,
  load,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'data.json'), JSON.stringify(data, null, 1));
console.log(`✓ data.json — ${recovery.length} recovery days, ${strength.vlHistory.length} VL exercises, ${weeks.length} weeks, ${diet.days.length} diet days`);
