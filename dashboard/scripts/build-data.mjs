#!/usr/bin/env node
// Parse local Obsidian training files → public/data.json
// 从本地 Obsidian 训练文件解析数据 → public/data.json
//
// Usage:  node scripts/build-data.mjs   (vault path: FITNESS_DIR, scripts/curated.local.mjs, or `npm run setup` config)
//
// The PARSER functions below are generic — they read the markdown table
// formats produced by the Coach Paddy skill (Athlete Bio Data / Training Plan /
// Coach Memory / weekly Logs). The `curated` object at the bottom is the
// hand-maintained data (injuries / goals / PBs / race plans) — edit it for
// your own training, then re-run this script.

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
// Personal data lives in scripts/curated.local.mjs (git-ignored); without it the example block below is used.
const LOCAL_FILE = join(HERE, 'curated.local.mjs');
const LOCAL = existsSync(LOCAL_FILE) ? (await import(pathToFileURL(LOCAL_FILE).href)).default : null;
// Optional front-end passcode: DASHBOARD_PASSCODE env var or a line in .env.local / .env.
function envFile(key) {
  for (const f of ['.env.local', '.env']) {
    const p = join(HERE, '..', f);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(new RegExp('^' + key + '=(.*)$', 'm'));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}
// Point this at your Obsidian vault's Fitness folder (FITNESS_DIR env, or fitnessDir in curated.local.mjs).
// `npm run setup` writes ~/.claude/fitness-coach/config.json (dataDir + athlete answers).
function setupConfig() {
  try { return JSON.parse(readFileSync(join(homedir(), '.claude', 'fitness-coach', 'config.json'), 'utf8')); } catch { return null; }
}
const SETUP = setupConfig();
// Where the markdown files live: FITNESS_DIR env → curated.local.mjs → setup config → placeholder.
const FITNESS_DIR = process.env.FITNESS_DIR || LOCAL?.fitnessDir || SETUP?.dataDir || '/path/to/your/vault/Fitness';
if (!existsSync(FITNESS_DIR)) {
  console.error(`No vault folder at ${FITNESS_DIR}.\nSet FITNESS_DIR, or fitnessDir in scripts/curated.local.mjs. To preview with demo data instead: npm run sample && npx serve public`);
  process.exit(1);
}
// Diet log written by the WeChat food pipeline (food.mjs / food-live.mjs).
// Point DIET_LOG at your food-log.jsonl, e.g. DIET_LOG=/path/to/weixin-test/food-log.jsonl
const DIET_LOG = process.env.DIET_LOG || join(FITNESS_DIR, '..', '..', 'weixin-test', 'food-log.jsonl');
const OUT_DIR = join(HERE, '..', 'public');

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
  const daily = (raw.split(/^## (?:每日更新|Daily Updates)/m)[1] ?? '').split('\n## ')[0];
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
  const byDate = new Map(rows.map((r) => [r.date, r]));
  return [...byDate.values()].sort((x, y) => x.date.localeCompare(y.date));
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
// Header-driven: the Daily Summary table has changed shape many times
// (Activity|Distance… / Training|Duration|Distance… / Training|Sleep|HRV…),
// so columns are located by name and km/min are pulled from the text when
// there is no dedicated column. Rows are de-duplicated by date across files.
const pad2 = (n) => String(n).padStart(2, '0');
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function isoWeek(d) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return `${x.getUTCFullYear()}-W${pad2(Math.ceil(((x - y0) / 864e5 + 1) / 7))}`;
}
function mondayOf(d) { const m = new Date(d); m.setHours(0, 0, 0, 0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m; }
const stripParens = (s) => s.replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '');
const RUN_RE = /半马|全马|马拉松|🏁|Easy|跑|Run|长距离|LSD|Long|节奏|间歇|Tempo|Threshold|Interval|VO2|马配|越野|Trail|Jog|Recovery|恢复/i;
function splitChunks(text) {
  // "Upper A 74min/… RPE 6 + Easy 5.0km/31.8min/…" → two activities
  return stripParens(text).split(/\s\+\s|＋/).map((c) => c.trim()).filter(Boolean);
}
function parseWeeklyLogs() {
  const logsDir = join(FITNESS_DIR, 'Logs');
  const files = readdirSync(logsDir).filter((f) => f.endsWith('.md')).sort();
  const byDate = new Map();
  const today = new Date();
  for (const f of files) {
    const raw = readFileSync(join(logsDir, f), 'utf8');
    const year = parseInt(f.slice(0, 4));
    const summary = raw.split('## Daily Summary')[1]?.split('\n## ')[0] ?? '';
    let cols = null;
    for (const line of summary.split('\n')) {
      if (!line.startsWith('|') || /^\|[\s|:-]+$/.test(line)) continue;
      const cells = line.split('|').slice(1, -1).map((c) => stripMd(c));
      if (/^(Day|日)$/i.test(cells[0])) { cols = cells.map((c) => c.toLowerCase()); continue; }
      if (!cols) continue;
      const col = (...names) => { const i = cols.findIndex((c) => names.includes(c)); return i >= 0 ? cells[i] ?? '' : ''; };
      const dm = col('date', '日期').match(/(\d{1,2})[\/-](\d{1,2})/);
      if (!dm) continue;
      const date = new Date(year, parseInt(dm[1]) - 1, parseInt(dm[2]));
      if (date > today) continue;
      const training = col('training', 'activity', 'type', '训练');
      if (!training || training === '—' || /^休息$/.test(training)) continue;
      const iso = `${year}-${pad2(dm[1])}-${pad2(dm[2])}`;
      byDate.set(iso, {
        iso, date, label: f.match(/(\d{4}-W\d+)/)?.[1], day: cells[0], md: `${parseInt(dm[1])}/${parseInt(dm[2])}`, training,
        distCol: col('distance', '跑量'), durCol: col('duration'), readiness: col('readiness'),
      });
    }
  }
  const rows = [...byDate.values()].sort((a, b) => a.iso.localeCompare(b.iso));
  const allActs = [], keyWorkouts = [], watchKcalByDate = new Map();
  const dailyKm = new Map(), dailyMin = new Map(), effSeries = [];
  const weekMap = new Map();
  for (const r of rows) {
    const week = r.label || isoWeek(r.date);
    const w = weekMap.get(week) || { km: 0, easy: 0, hard: 0, vert: 0, mon: mondayOf(r.date) };
    const chunks = splitChunks(r.training);
    let dayKm = 0;
    for (const c of chunks) {
      const kmM = c.match(/([\d.]+)\s*km(?!\/h)/i);
      const minM = c.match(/([\d.]+)\s*min/i);
      const isRun = RUN_RE.test(c) && kmM && !/骑行|Cycling|Bike/i.test(c);
      const km = isRun ? parseFloat(kmM[1]) : 0;
      dayKm += km;
      allActs.push({ week, day: r.day, date: r.md, training: c,
        duration: minM ? String(Math.round(parseFloat(minM[1]))) : '',
        distance: km ? `${km}km` : '', readiness: r.readiness });
      if (km) {
        if (/节奏|Tempo|Threshold|阈值|间歇|Interval|VO2|马配|变速/i.test(c)) w.hard += km; else w.easy += km;
        if (/长距离|长跑|Long|LSD|节奏|Tempo|间歇|Interval|VO2|阈值|Threshold/i.test(c) && minM) {
          const hrM = c.match(/(\d{3})\s*bpm/);
          keyWorkouts.push({ week, date: r.md,
            type: /Interval|间歇|VO2/i.test(c) ? 'Interval' : /Tempo|节奏|阈值|Threshold/i.test(c) ? 'Tempo' : 'Long Run',
            distKm: km, paceSec: Math.round(parseFloat(minM[1]) * 60 / km), hr: hrM ? parseInt(hrM[1]) : null });
        }
      }
      const kc = c.match(/(\d+)\s*kcal/i);
      if (kc) watchKcalByDate.set(r.iso, (watchKcalByDate.get(r.iso) || 0) + parseInt(kc[1]));
      // minutes per day, split into run vs strength (load-mix chart)
      // (older logs often omit minutes: runs fall back to km × 6.3, strength sessions to 70 min)
      {
        const m = dailyMin.get(r.iso) || { run: 0, str: 0 };
        if (km) m.run += minM ? parseFloat(minM[1]) : km * 6.3;
        else if (/力量|Upper|Lower|Strength|Hyrox/i.test(c)) m.str += minM ? parseFloat(minM[1]) : 70;
        dailyMin.set(r.iso, m);
      }
      // Easy-run efficiency: metres per minute per heartbeat
      const hrE = c.match(/(\d{3})\s*bpm|HR\s*(\d{3})/i);
      if (km >= 4 && minM && hrE && /Easy|轻松|恢复|Recovery|长距离/i.test(c) && !/马配|MP|节奏|间歇|Tempo|Interval/i.test(c)) {
        const hr = parseInt(hrE[1] || hrE[2]);
        if (hr >= 125) effSeries.push({ date: r.iso, eff: Math.round(km * 1000 / parseFloat(minM[1]) / hr * 100) / 100, hr, paceSec: Math.round(parseFloat(minM[1]) * 60 / km) });
      }
    }
    // Old formats keep km in a Distance column instead of the text
    if (!dayKm) {
      const dc = (r.distCol || '').match(/^[~≈]?([\d.]+)\s*km/i);
      if (dc && RUN_RE.test(r.training)) dayKm = parseFloat(dc[1]);
      if (dayKm) w.easy += dayKm;
    }
    w.km += dayKm;
    if (dayKm) dailyKm.set(r.iso, Math.round(((dailyKm.get(r.iso) || 0) + dayKm) * 10) / 10);
    weekMap.set(week, w);
  }
  const weeks = [...weekMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([week, w]) => {
    const sun = new Date(w.mon); sun.setDate(sun.getDate() + 6);
    const fmt = (d) => `${MON[d.getMonth()]}${pad2(d.getDate())}`;
    return { week, range: `${fmt(w.mon)}-${fmt(sun)}`, runKm: Math.round(w.km * 10) / 10, vert: 0,
      intensity: { easyKm: Math.round(w.easy * 10) / 10, hardKm: Math.round(w.hard * 10) / 10 } };
  });
  // Make sure the current week exists even before the first run of the week
  const cw = isoWeek(today);
  const lastMon = weekMap.size ? [...weekMap.values()].sort((a, b) => a.mon - b.mon).at(-1).mon : null;
  if (!lastMon || lastMon < mondayOf(today)) {
    const mon = mondayOf(today), sun = new Date(mon); sun.setDate(sun.getDate() + 6);
    weeks.push({ week: cw, range: `${MON[mon.getMonth()]}${pad2(mon.getDate())}-${MON[sun.getMonth()]}${pad2(sun.getDate())}`, runKm: 0, vert: 0, intensity: { easyKm: 0, hardKm: 0 } });
  }
  return { weeks, activities: allActs, recentActivities: allActs.slice(-14), keyWorkouts, watchKcalByDate, dailyKm, dailyMin, effSeries };
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
  // Fasted morning weigh-ins from the body-composition table in Athlete Bio Data
  const raw = readFileSync(bioDataPath(), 'utf8');
  const sec = (raw.split('## 体成分记录')[1] ?? '').split('\n## ')[0];
  const weights = [];
  for (const line of sec.split('\n')) {
    const m = line.match(/^\|\s*(\d{4}-\d{2}-\d{2})\s*\|/);
    if (!m) continue;
    const c = line.split('|').map((x) => stripMd(x));
    if (!/空腹/.test(c[3]) || /不入趋势/.test(c[3])) continue;
    const kg = firstNum(c[4]);
    if (kg) weights.push({ date: m[1], kg, note: c[3] });
  }
  return { weights, measurements: [] };
}

// ============================================================================
// CURATED DATA — example only. Put your own in scripts/curated.local.mjs
// (same shape, `export default { fitnessDir, athlete, ...this }`, git-ignored).
// ============================================================================
const EXAMPLE_CURATED = {
  athlete: { name: 'Demo Runner' },
  phase: 'Block 2 · Specific build',
  weeklyRunTarget: [40, 50],
  weight: { target: '66-68kg' },
  tdeeExpected: 2800,
  strCtlContribution: 0,
  injuries: [
    { name: 'Example: left calf', status: 'watching', note: 'Tight after long runs. Weekly bent-knee calf-raise test to failure.', test: 'L 30 / R 32' },
    { name: 'Example: right shoulder', status: 'treating', note: 'Pressing load frozen until reassessment; pulling volume unchanged.', test: 'Press frozen' },
  ],
  goals: {
    firstPriority: ['Health over performance', 'Glute-driven running mechanics', 'Core, hip and shoulder durability'],
    performance: [{ year: '2027.03', goal: 'Example Marathon — sub 3:30' }, { year: '2027', goal: 'Half 1:35' }],
  },
  pbs: [
    { dist: '5K', time: '21:30', pace: '4:18/km', date: '2025-05-01', note: '' },
    { dist: '10K', time: '45:10', pace: '4:31/km', date: '2025-04-20', note: '' },
    { dist: 'Half', time: '1:41:00', pace: '4:47/km', date: '2026-04-12', note: '' },
    { dist: 'Marathon', time: '3:39:00', pace: '5:11/km', date: '2025-10-26', note: '' },
  ],
  physio: {
    height: 178, age: 35, lthr: 172, maxHr: '—', vo2max: 51,
    predicted: { marathon: '3:35:00', half: '1:40:00', '10k': '45:00', '5k': '21:30' },
    hrZones: [
      { zone: 'Z1', bpm: '110-135', use: 'Recovery' }, { zone: 'Z2', bpm: '135-152', use: 'Easy / long run' },
      { zone: 'Z3', bpm: '152-162', use: 'Marathon pace' }, { zone: 'Z4', bpm: '162-174', use: 'Threshold' }, { zone: 'Z5', bpm: '>174', use: 'VO2max' },
    ],
    ltPace: '4:35-4:45/km', easyPace: '5:50-6:20/km',
    baselines: { sleep: 'typical 78-88', rhr: '50-58', hrv: 'band 42-52 ms (28-day μ±0.5SD)' },
    nutrition: { protein: '1.6-1.8 g/kg', calories: '~2400 kcal/day', deficit: 'maintenance', notes: 'Edit scripts/curated.local.mjs' },
  },
  dietTarget: { kcal: 2400, protein: 120, carb: 300, fat: 70 },
  races: { upcoming: [{ name: 'Example Marathon', date: '2027-03-07', detail: 'Target sub 3:30', tag: 'A race', anchor: 'macro' }] },
  macro: {
    name: 'Road to Race Day', start: '2026-10-05', race: '2027-03-07', target: '3:30', targetPace: '4:58/km', pb: '3:39:00',
    phases: [
      { n: 1, name: 'Base', start: '2026-10-05', end: '2026-11-29', km: '25→35', long: '14→20' },
      { n: 2, name: 'Build', start: '2026-11-30', end: '2027-01-31', km: '35→50', long: '22→32' },
      { n: 3, name: 'Specific', start: '2027-02-01', end: '2027-02-21', km: '45→50', long: '28→32' },
      { n: 4, name: 'Taper', start: '2027-02-22', end: '2027-03-07', km: '35→race', long: '18' },
    ],
    longRuns: [{ date: '2026-12-13', km: 24 }, { date: '2027-01-17', km: 30, mp: 10 }, { date: '2027-02-14', km: 32, mp: 14 }, { date: '2027-03-07', km: 42.2, race: 'Race' }],
    weekPlan: [], // { mon: 'YYYY-MM-DD', kind: 'plan' | 'est', days: [Mon..Sun km], race? } — fills the pulse ledger after this week
    ledgerPhases: [{ from: '2026-10-05', to: '2026-11-29', t: 'Base' }, { from: '2026-11-30', to: '2027-02-21', t: 'Build' }, { from: '2027-03-01', to: '2027-03-07', t: 'Race', race: 'A' }],
    milestones: [{ date: '2027-01-17', label: 'First 30 km', note: 'Fuel every 40 min' }, { date: '2027-03-07', label: 'Example Marathon', note: 'A race' }],
    strategy: [{ race: 'Example Marathon', text: 'Even splits at goal pace; reassess at 30 km.' }],
  },
};

// Without curated.local.mjs, personalise the example from the `npm run setup` answers: profile-shaped
// fields only (phase, goals, injuries, race, macro target). Edit curated.local.mjs for the full plan.
function applySetup(c, cfg) {
  const a = cfg?.athlete;
  if (!a) return c;
  c = structuredClone(c);
  if (a.name) c.athlete = { name: a.name };
  if (a.goal) c.phase = a.goal;
  c.pbs = [];
  c.injuries = (a.injuries || []).map((name) => ({ name, status: 'watching', note: '' }));
  c.goals = {
    firstPriority: a.goal ? [a.goal] : [],
    performance: a.raceName ? [{ year: (a.raceDate || '').slice(0, 4) || '—', goal: `${a.raceName}${a.raceTarget ? ' · ' + a.raceTarget : ''}` }] : [],
  };
  if (a.age) c.physio = { ...c.physio, age: a.age };
  if (a.raceName && a.raceDate) {
    const today = new Date().toISOString().slice(0, 10);
    c.races = { upcoming: [{ name: a.raceName, date: a.raceDate, detail: a.raceTarget ? `目标 ${a.raceTarget}` : '', tag: 'A race', anchor: 'macro' }] };
    c.macro = {
      ...c.macro, name: `Road to ${a.raceName}`, start: today, race: a.raceDate, target: a.raceTarget || '—', pb: '—',
      phases: [{ n: 1, name: 'Build', start: today, end: a.raceDate, km: '—', long: '—' }],
      longRuns: [{ date: a.raceDate, km: 0, race: a.raceName }],
      ledgerPhases: [{ from: today, to: a.raceDate, t: a.raceName, race: 'A' }],
      milestones: [{ date: a.raceDate, label: a.raceName, note: 'A race' }],
      strategy: [],
    };
  }
  return c;
}
const curated = LOCAL ?? applySetup(EXAMPLE_CURATED, SETUP);

// ---------- Assemble ----------
const recovery = parseRecovery();
const strength = parseStrength();
const { weeks, activities, recentActivities, keyWorkouts, watchKcalByDate, dailyKm, dailyMin, effSeries } = parseWeeklyLogs();
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
    if (/^Lower|下肢/i.test(s)) return ['str', 1.3];
    if (/^Upper|上肢/i.test(s)) return ['str', 1.0];
    if (/长距离/.test(s)) return ['run', 1.1];
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

// ---------- Pulse ledger: one row per week, Mon→Sun, km per day ----------
// 13 weeks of logs, this week (logged so far + plan for the rest), then the week plan up to the race.
const isoOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
function buildPulse() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const thisMon = mondayOf(today);
  const planByMon = new Map((curated.macro.weekPlan || []).map((w) => [w.mon, w]));
  const rows = [];
  for (let k = -13; ; k++) {
    const mon = new Date(thisMon); mon.setDate(mon.getDate() + k * 7);
    const monIso = isoOf(mon);
    if (monIso > curated.macro.race) break;
    const plan = planByMon.get(monIso);
    if (k > 0 && !plan) continue; // nothing planned for that week yet
    const days = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(mon); day.setDate(day.getDate() + d);
      days.push(day <= today ? (dailyKm.get(isoOf(day)) || 0) : (plan ? plan.days[d] : 0));
    }
    rows.push({ mon: monIso, days, kind: k < 0 ? 'actual' : k === 0 ? 'now' : plan.kind || 'plan', race: plan?.race || null });
  }
  return { rows, phases: curated.macro.ledgerPhases || [], today: isoOf(today) };
}
const pulse = buildPulse();
const weeklyMinutes = pulse.rows.filter((r) => r.kind === 'actual' || r.kind === 'now').map((r) => {
  const mon = new Date(r.mon + 'T00:00:00'); let run = 0, str = 0;
  for (let d = 0; d < 7; d++) { const day = new Date(mon); day.setDate(day.getDate() + d); const m = dailyMin.get(isoOf(day)); if (m) { run += m.run; str += m.str; } }
  return { mon: r.mon, run: Math.round(run), str: Math.round(str) };
});

const latest = [...recovery].reverse();
const latestACWR = latest.find((r) => r.acwr !== null);
const latestVO2 = latest.find((r) => r.vo2 !== null);
const latestBal = latest.find((r) => r.balStreak !== null);
const [lo] = curated.weeklyRunTarget;

const data = {
  generatedAt: new Date().toISOString(),
  ...curated,
  fitnessDir: undefined,
  passcode: process.env.DASHBOARD_PASSCODE || envFile('DASHBOARD_PASSCODE') || null,
  kpi: {
    // Garmin ACWR first: the two-pool model needs ~6 unbroken weeks of logs and the vault has gaps (W30-W34)
    acwr: latestACWR ? { value: latestACWR.acwr, date: latestACWR.date, source: 'garmin' }
      : load.acwr != null ? { value: load.acwr, date: load.days.at(-1)?.date ?? '', source: 'model' } : { value: 1.0, date: '' },
    vo2max: latestVO2 ? { value: latestVO2.vo2, date: latestVO2.date } : { value: '—', date: '' },
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
  pulse,
  weeklyMinutes,
  effSeries: effSeries.slice(-40),
  weightLatest: body.weights.at(-1) || null,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'data.json'), JSON.stringify(data, null, 1));
console.log(`✓ data.json — ${recovery.length} recovery days, ${strength.vlHistory.length} VL exercises, ${weeks.length} weeks, ${diet.days.length} diet days`);
