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
  // vert = 每周爬升量(m)。比赛 UTMB 50K = 3600m(72 m/km), 训练周按 50-100% 比赛爬升逐步逼近
  { week: '2026-W26', range: 'Jun22-Jun28', runKm: 48, vert: 1100 },
  { week: '2026-W27', range: 'Jun29-Jul05', runKm: 52, vert: 1400 },
  { week: '2026-W28', range: 'Jul06-Jul12', runKm: 58, vert: 1800 },
  { week: '2026-W29', range: 'Jul13-Jul19', runKm: 45, vert: 950 },  // 恢复周
  { week: '2026-W30', range: 'Jul20-Jul26', runKm: 60, vert: 2100 },
  { week: '2026-W31', range: 'Jul27-Aug02', runKm: 65, vert: 2400 },
  { week: '2026-W32', range: 'Aug03-Aug09', runKm: 68, vert: 2600 },
  { week: '2026-W33', range: 'Aug10-Aug16', runKm: 62, vert: 2300 },
];
const recentActivities = [
  { week: '2026-W33', day: 'Mon', date: '8/10', training: 'Strength (Hyrox lower + hip thrust)', duration: '70min', distance: '—', readiness: '8/10', kcal: 385 },
  { week: '2026-W33', day: 'Tue', date: '8/11', training: 'Easy Run', duration: '55min', distance: '11.5km', readiness: '8/10', kcal: 520 },
  { week: '2026-W33', day: 'Wed', date: '8/12', training: 'Strength (pull + carries)', duration: '65min', distance: '—', readiness: '7/10', kcal: 340 },
  { week: '2026-W33', day: 'Thu', date: '8/13', training: 'Tempo Run', duration: '50min', distance: '12.0km', readiness: '8/10', kcal: 610 },
  { week: '2026-W33', day: 'Fri', date: '8/14', training: 'Strength (trap bar + sled)', duration: '75min', distance: '—', readiness: '6/10', kcal: 450 },
  { week: '2026-W33', day: 'Sat', date: '8/15', training: 'Long Run', duration: '95min', distance: '20.0km', readiness: '7/10', kcal: 780 },
];

// ---- 强度分布 (80/20 极化训练检查): 每周 轻松(Zone1-2) vs 高强度(Zone3+) 占比 ----
// hardPct 逐周从 ~22% 收敛到 ~14%, 讲一个“从过训走向规范 80/20”的周期化故事
const hardPct = [22, 20, 18, 15, 16, 15, 15, 14];
const intensityDist = weeklyRun.map((w, i) => {
  const hardKm = Math.round(w.runKm * hardPct[i] / 100 * 10) / 10;
  return { week: w.week, easyKm: Math.round((w.runKm - hardKm) * 10) / 10, hardKm };
});

// ---- 关键训练配速趋势 (长跑/节奏/间歇): 每次关键课的 date/distKm/paceSec/avgHr ----
// paceSec = 每公里秒数(越小越快); avgHr 来自 Garmin(仅心率数据存在时才有)
const KW = [
  // [week, date, type, distKm, paceSec, hr]
  ['W26', '6/25', 'Tempo', 10.5, 255, 176], ['W26', '6/27', 'Long Run', 14.0, 315, 152],
  ['W27', '7/2', 'Tempo', 11.0, 252, 175], ['W27', '7/3', 'Interval', 7.5, 235, 184], ['W27', '7/4', 'Long Run', 15.0, 310, 151],
  ['W28', '7/9', 'Tempo', 11.5, 250, 174], ['W28', '7/11', 'Long Run', 16.0, 305, 152],
  ['W29', '7/16', 'Tempo', 9.0, 254, 172], ['W29', '7/18', 'Long Run', 12.0, 308, 148], // 恢复周, 都放缓
  ['W30', '7/23', 'Tempo', 12.0, 248, 175], ['W30', '7/24', 'Interval', 8.0, 228, 185], ['W30', '7/25', 'Long Run', 18.0, 302, 153],
  ['W31', '7/30', 'Tempo', 12.0, 246, 174], ['W31', '8/1', 'Long Run', 19.0, 300, 152],
  ['W32', '8/6', 'Tempo', 12.5, 244, 175], ['W32', '8/7', 'Interval', 8.5, 224, 186], ['W32', '8/8', 'Long Run', 20.0, 297, 153],
  ['W33', '8/13', 'Tempo', 12.0, 242, 176], ['W33', '8/15', 'Long Run', 20.0, 295, 154],
];
const keyWorkouts = KW.map(([week, date, type, distKm, paceSec, hr]) => ({ week, date, type, distKm, paceSec, hr }));
const body = {
  weights: [
    { date: '2026-06-14', kg: 68.0, note: 'Block start' },
    { date: '2026-07-15', kg: 67.2, note: '-0.8kg' },
    { date: '2026-07-21', kg: 67.1, note: '周初' },
    { date: '2026-08-05', kg: 66.9, note: '训练周' },
    { date: '2026-08-15', kg: 66.5, note: '-1.5kg total' },
  ],
  measurements: [
    { date: '2026-06-14', 肩围: '108', 胸围: '92', 上臂松: '27', 上臂屈: '29', 前臂: '—', 腰围: '76', 臀围: '91', 大腿: '50', 小腿: '36', 体重: '68.0' },
    { date: '2026-08-04', 肩围: '109', 胸围: '93', 上臂松: '28', 上臂屈: '30', 前臂: '—', 腰围: '74', 臀围: '90', 大腿: '51', 小腿: '36', 体重: '66.8' },
  ],
};

// ---- 28 天合成饮食 (UTMB+Hyrox+马拉松三周期人设, 微信 ClawBot 采集的数据形态) ----
// 模板: [餐次, 时间, ...([名称, 类型, 份量, kcal, 蛋白g, 碳水g, 脂肪g] 元组)];
// 每天由若干餐模板组成, 按训练类型(休息/力量/轻松跑/长跑/聚餐)循环 4 遍, 热量与宏量呈真实波动
const T = {
  早餐A: ['早餐', '07:40', ['全麦面包', '主食', '2片', 180, 7, 32, 2], ['水煮蛋', '菜', '2个', 160, 13, 1, 11], ['香蕉', '菜', '1根', 90, 1, 23, 0.3], ['黑咖啡', '饮料', '1杯', 5, 0, 1, 0]],
  早餐B: ['早餐', '07:35', ['牛肉面', '主食', '1碗', 420, 24, 58, 8], ['煎蛋', '菜', '1个', 80, 6, 0.5, 6]],
  早餐C: ['早餐', '07:50', ['全麦吐司', '主食', '2片', 180, 7, 32, 2], ['花生酱', '菜', '1勺', 90, 3.5, 3.5, 7.5], ['牛奶', '饮料', '1杯', 150, 8, 12, 8]],
  早餐D: ['早餐', '08:05', ['小米粥', '主食', '1碗', 130, 3, 28, 0.5], ['肉包子', '主食', '2个', 360, 14, 52, 9], ['茶叶蛋', '菜', '1个', 80, 7, 0.5, 5.5]],
  午餐A: ['午餐', '12:30', ['米饭', '主食', '1碗', 240, 4.5, 53, 0.6], ['香煎鸡胸', '菜', '中', 280, 52, 1, 6], ['炒西兰花', '菜', '中', 90, 4, 8, 4.5], ['番茄蛋汤', '汤', '1碗', 90, 4, 6, 5]],
  午餐B: ['午餐', '12:40', ['米饭', '主食', '1.5碗', 360, 6.8, 80, 0.9], ['番茄炖牛腩', '菜', '中', 380, 30, 12, 22], ['炒青菜', '菜', '中', 90, 3, 6, 6]],
  午餐C: ['午餐', '12:35', ['荞麦面', '主食', '1碗', 350, 13, 68, 3.5], ['卤牛肉', '菜', '中', 250, 40, 4, 6], ['拌黄瓜', '菜', '少', 60, 1, 4, 4]],
  午餐D: ['午餐', '12:20', ['米饭', '主食', '1碗', 240, 4.5, 53, 0.6], ['清蒸鲈鱼', '菜', '中', 260, 40, 1, 10], ['蒜蓉菠菜', '菜', '中', 80, 3, 6, 4.5], ['紫菜汤', '汤', '1碗', 60, 2, 6, 2]],
  晚餐A: ['晚餐', '18:40', ['米饭', '主食', '1碗', 240, 4.5, 53, 0.6], ['红烧鸡腿', '菜', '中', 300, 28, 6, 18], ['炒时蔬', '菜', '中', 90, 3, 7, 5], ['冬瓜汤', '汤', '1碗', 60, 0.5, 3, 0.5]],
  晚餐B: ['晚餐', '18:50', ['杂粮饭', '主食', '1碗', 260, 6, 55, 1.5], ['香煎三文鱼', '菜', '中', 320, 32, 1, 21], ['清炒芦笋', '菜', '中', 70, 3, 4, 5]],
  晚餐C: ['晚餐', '19:00', ['红薯', '主食', '1个', 130, 2, 30, 0.2], ['烤鸡胸', '菜', '中', 280, 52, 1, 5.5], ['蔬菜沙拉', '菜', '中', 140, 3, 10, 9.5]],
  晚餐D: ['晚餐', '18:30', ['米饭', '主食', '1碗', 240, 4.5, 53, 0.6], ['青椒肉丝', '菜', '中', 320, 20, 12, 21], ['凉拌豆腐', '菜', '中', 90, 8, 3, 5], ['海带汤', '汤', '1碗', 50, 1, 6, 1.5]],
  下午加餐A: ['下午加餐', '15:20', ['拿铁', '饮料', '1杯', 180, 7, 16, 10], ['苹果', '菜', '1个', 80, 0.4, 21, 0.3]],
  下午加餐B: ['下午加餐', '15:40', ['酸奶', '饮料', '1杯', 190, 9, 21, 7], ['蓝莓', '菜', '1把', 40, 0.5, 10, 0.2]],
  练后加餐: ['夜宵', '20:30', ['蛋白粉', '饮料', '1勺', 120, 24, 3, 1.5], ['香蕉', '菜', '1根', 90, 1, 23, 0.3]],
  火锅聚餐: ['午餐', '12:30', ['牛肉火锅', '菜', '多', 800, 55, 20, 50], ['毛肚', '菜', '中', 150, 22, 2, 6], ['蔬菜拼盘', '菜', '中', 120, 4, 16, 4], ['麻酱蘸料', '菜', '少', 100, 4, 6, 7]],
  晚餐聚餐: ['晚餐', '19:30', ['米饭', '主食', '1.5碗', 360, 6.8, 80, 0.9], ['红烧肉', '菜', '中', 480, 22, 12, 38], ['清炒时蔬', '菜', '中', 90, 3, 7, 5], ['啤酒', '饮料', '1罐', 140, 1, 11, 0]],
};
const DIET_DAYS = [
  { type: '休息日', meals: ['早餐A', '午餐D', '下午加餐A', '晚餐C'] },            // ~1885 × SCALE
  { type: '力量日', meals: ['早餐B', '午餐A', '下午加餐A', '晚餐D'] },            // ~2160 × SCALE
  { type: '轻松跑', meals: ['早餐C', '午餐C', '下午加餐B', '晚餐A'] },            // ~2000 × SCALE
  { type: '力量日', meals: ['早餐D', '午餐B', '练后加餐', '晚餐A'] },             // ~2300 × SCALE
  { type: '轻松跑', meals: ['早餐A', '午餐A', '下午加餐A', '晚餐C'] },            // ~1945 × SCALE
  { type: '聚餐日', meals: ['早餐B', '火锅聚餐', '下午加餐B', '晚餐聚餐'] },       // ~2970 × SCALE
  { type: '长跑日', meals: ['早餐D', '练后加餐', '午餐B', '下午加餐A', '晚餐C'] }, // ~2420 × SCALE
];
// 动态目标: 基线热量 + 当天训练消耗估算(反映“高训练日是否吃够”)
// 人设为大训练量(55-70km/周, 66.5kg)运动员, 基线 ~3000 kcal/day(physio.nutrition: 3100-3400)
const DIET_TARGET = { kcal: 3000, protein: 150, carb: 380, fat: 85 };
const BURN = { 休息日: 0, 力量日: 200, 轻松跑: 250, 长跑日: 500, 聚餐日: 250 };
const WATCH_KCAL = { 休息日: null, 力量日: 385, 轻松跑: 520, 长跑日: 780, 聚餐日: null };
const SCALE = 1.4; // 把旧人设(~2200 kcal/天)放大到大训练量人设的食量
const r1 = (x) => Math.round(x * 10) / 10;
const dietBase = new Date('2026-07-20'); // 28 天, 结束于 08-16(与恢复数据最后一天对齐)
const DIET_DAYS_COUNT = 28; // 4 周整, 让“近4周能量平衡”名副其实
const diet = { source: 'sample', note: '', days: [] };
for (let i = 0; i < DIET_DAYS_COUNT; i++) {
  const spec = DIET_DAYS[i % DIET_DAYS.length];
  const d = new Date(dietBase); d.setDate(dietBase.getDate() + i);
  const meals = spec.meals.map((k) => {
    const [meal, time, ...tups] = T[k];
    const items = tups.map(([name, type, portion, kcal, protein, carb, fat]) => ({
      name, type, portion,
      kcal: r1(kcal * SCALE), protein: r1(protein * SCALE), carb: r1(carb * SCALE), fat: r1(fat * SCALE),
    }));
    return {
      meal, time,
      kcal: r1(items.reduce((s, it) => s + it.kcal, 0)),
      protein: r1(items.reduce((s, it) => s + it.protein, 0)),
      carb: r1(items.reduce((s, it) => s + it.carb, 0)),
      fat: r1(items.reduce((s, it) => s + it.fat, 0)),
      items,
    };
  });
  diet.days.push({
    date: d.toISOString().slice(0, 10),
    totalKcal: r1(meals.reduce((s, m) => s + m.kcal, 0)),
    totalProtein: r1(meals.reduce((s, m) => s + m.protein, 0)),
    totalCarb: r1(meals.reduce((s, m) => s + m.carb, 0)),
    totalFat: r1(meals.reduce((s, m) => s + m.fat, 0)),
    meals,
    targetKcal: DIET_TARGET.kcal + (WATCH_KCAL[spec.type] ?? BURN[spec.type] ?? 0),
    train: spec.type,
    ...(WATCH_KCAL[spec.type] != null ? { watchKcal: WATCH_KCAL[spec.type] } : {}),
  });
}
// TDEE 反推: 用体重趋势 + 记录摄入估算真实维持热量(能量守恒, 每 kg 体脂 ≈ 7700 kcal)
//   TDEE_est = 摄入均值 − Δkg × 7700 / 天数
//   记录系统性偏低时 TDEE_est 会低于生理预估 → 提示可能少记
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
diet.tdeeExpected = 3300; // 生理预估维持热量(66.5kg 大训练量, physio.nutrition 3100-3400)
diet.skippedLines = 0;

// ---- 整体训练负荷 (两池: 耐力 k=7 / 力量 k=14, 无主观输入) ----
// 负荷 = 时长(分钟) × 强度系数(按训练标签) × sRPE修正(力量,可选)
//   耐力池(k=7 疲劳衰减): 轻松/长跑/节奏/间歇/越野 —— 未来游泳/骑车也归入此池
//   力量池(k=14, 恢复 2 倍慢): 力量-上肢/力量-下肢/Hyrox
// 公式(Intervals.icu / TrainingPeaks 同款指数加权):
//   ATL_run = ATL_run_前日 × e^(−1/7)   + runLoad  × (1−e^(−1/7))
//   ATL_str = ATL_str_前日 × e^(−1/14)  + strLoad  × (1−e^(−1/14))
//   CTL     = CTL_前日     × e^(−1/42)  + 耐力负荷 × (1−e^(−1/42))  [力量不进CTL, 只进ATL疲劳]
//   TSB     = CTL − (ATL_run + ATL_str)
const LOAD_COEF = { '轻松跑': 0.8, '恢复跑': 0.8, '长跑': 1.1, '越野': 1.3, '节奏跑': 1.5, '间歇': 1.7, '力量-上肢': 1.0, '力量-下肢': 1.3, 'Hyrox': 1.3 };
// 每周模式(和 recentActivities 的 W33 一致): 3 力量 + 3 跑 + 1 休息
const WEEK_PATTERN = [
  null,                                                   // Sun 休息
  { type: '力量-下肢', min: 70, bucket: 'str', rpe: 7 },  // Mon
  { type: '轻松跑',   min: 55, bucket: 'run' },           // Tue
  { type: '力量-上肢', min: 65, bucket: 'str', rpe: 6 },  // Wed
  { type: '节奏跑',   min: 50, bucket: 'run' },           // Thu
  { type: '力量-下肢', min: 75, bucket: 'str', rpe: 8 },  // Fri
  { type: '长跑',     min: 95, bucket: 'run' },           // Sat
];
const loadBase = new Date('2026-07-18'); // 30 天, 和恢复数据同窗口
const loadDays = 30;
const fRun = 1 - Math.exp(-1 / 7), fStr = 1 - Math.exp(-1 / 14), fCtl = 1 - Math.exp(-1 / 42);
let atlRun = 0, atlStr = 0, ctl = 0;
const load = { unit: 'au', buckets: { endurance: '跑步/越野(未来: 游泳/骑车)', strength: '力量/Hyrox' }, days: [] };
for (let i = 0; i < loadDays; i++) {
  const d = new Date(loadBase); d.setDate(loadBase.getDate() + i);
  let sess = WEEK_PATTERN[d.getDay()];
  // 每第 4 个周六换成越野长跑(含爬升, 系数更高)
  if (sess && sess.type === '长跑' && Math.floor(i / 7) % 4 === 2) sess = { type: '越野', min: 100, bucket: 'run' };
  let runLoad = 0, strLoad = 0;
  if (sess) {
    let l = sess.min * LOAD_COEF[sess.type];
    if (sess.bucket === 'str' && sess.rpe) l *= Math.max(0.6, Math.min(1.8, sess.rpe / 5));
    if (sess.bucket === 'run') runLoad = Math.round(l); else strLoad = Math.round(l);
  }
  atlRun = atlRun * Math.exp(-1 / 7) + runLoad * fRun;
  atlStr = atlStr * Math.exp(-1 / 14) + strLoad * fStr;
  ctl = ctl * Math.exp(-1 / 42) + runLoad * fCtl;
  load.days.push({
    date: d.toISOString().slice(0, 10),
    type: sess ? sess.type : '休息',
    runLoad, strLoad,
    atlRun: Math.round(atlRun), atlStr: Math.round(atlStr),
    ctl: Math.round(ctl), tsb: Math.round(ctl - atlRun),
  });
}
const acute7 = load.days.slice(-7).reduce((s, d) => s + d.runLoad + d.strLoad, 0) / 7;
const chronic28 = load.days.reduce((s, d) => s + d.runLoad + d.strLoad, 0) / load.days.length;
load.acwr = chronic28 > 0 ? Math.round(acute7 / chronic28 * 100) / 100 : null;

const data = {
  generatedAt: new Date().toISOString(),
  phase: 'Sample — UTMB + Hyrox + Marathon triple-block build (synthetic demo data, no real athlete)',
  weeklyRunTarget: [55, 70],
  weight: { current: 66.5, asOf: '2026-08-15', target: '65-67kg' },
  dietTarget: DIET_TARGET,
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
      { station: 'Run 8×1km', date: '7/31', detail: '8×1km @ 3:55-4:05, 组间慢跑1分 — 全场最强项', value: 240, target: 225, unit: 'min/km', dir: 'lower' },
      { station: 'Rowing', date: '7/10', detail: '1000m time trial 3:28 (1:44/500m)', value: 208, target: 190, unit: 's', dir: 'lower' },
      { station: 'SkiErg', date: '7/24', detail: '1000m time trial 3:52 (1:56/500m)', value: 232, target: 210, unit: 's', dir: 'lower' },
      { station: 'Farmers Carry', date: '7/19', detail: '2×40m @ 40kg/手, 未计时, 握力无感', value: 40, target: 48, unit: 'kg', dir: 'higher' },
      { station: 'Lunges', date: '7/26', detail: '行走箭步蹲 8×25m @ 20kg, 后半程臀发力不足', value: 20, target: 30, unit: 'kg', dir: 'higher' },
      { station: 'Sled Push', date: '8/2', detail: '10m @ 75kg (体重+9kg), 起步慢, 末段顶髋', value: 75, target: 90, unit: 'kg', dir: 'higher' },
      { station: 'Burpee Broad Jump', date: '7/31', detail: '10次, 最远 2.1m, 落地缓冲慢', value: 2.1, target: 2.5, unit: 'm', dir: 'higher' },
      { station: 'Sled Pull', date: '8/6', detail: '10m @ 70kg, 拉绳拖拽, 步频掉', value: 70, target: 85, unit: 'kg', dir: 'higher' },
      { station: 'Wall Balls', date: '7/28', detail: '30次 @ 6kg, 计时 62s, 深蹲位不稳', value: 62, target: 45, unit: 's', dir: 'lower' },
    ],
  },
  kpi: {
    acwr: load.acwr != null
      ? { value: load.acwr, date: load.days.at(-1).date, source: 'model' }
      : { value: recovery.at(-1).acwr, date: recovery.at(-1).date, source: 'garmin' }, vo2max: { value: recovery.at(-1).vo2, date: recovery.at(-1).date },
    balStreak: { value: recovery.at(-1).balStreak, date: recovery.at(-1).date },
    currentWeekKm: 62, currentWeekLabel: '2026-W33',
  },
  recovery, strength, weeklyRun, intensityDist, keyWorkouts, recentActivities, body, diet, load,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'data.sample.json'), JSON.stringify(data, null, 1));
