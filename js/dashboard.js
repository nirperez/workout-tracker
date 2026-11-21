import { requireAuth, signOut, demo } from './supabase.js';
import * as db from './data.js';
import {
  exKey, weeklyCounts, streakWeeks, volume, records, avgRest,
  fmtClock, fmtShortDate, fmtNum, esc,
} from './stats.js';

await requireAuth();

const $ = (id) => document.getElementById(id);
const ACCENT = '#a930f2';
const GRID = '#33294a';
const MUTED = '#9d93b3';

let workouts = []; // newest first
let asc = []; // oldest first
let exChart = null;
let calMonth = new Date();

$('logout').hidden = demo;
$('logout').addEventListener('click', signOut);

function baseOptions(extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: MUTED, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
      y: { grid: { color: GRID }, ticks: { color: MUTED, precision: 0 }, beginAtZero: true, position: 'right' },
    },
    ...extra,
  };
}

function renderStats() {
  const weeks = weeklyCounts(workouts, 12);
  const last8 = weeks.slice(-8);
  $('sWeek').textContent = weeks[weeks.length - 1].count;
  $('sAvg').textContent = fmtNum(last8.reduce((a, w) => a + w.count, 0) / 8);
  $('sStreak').textContent = streakWeeks(workouts);
  $('sTotal').textContent = workouts.length;

  new Chart($('weeksChart'), {
    type: 'bar',
    data: {
      labels: weeks.map((w) => fmtShortDate(w.start)),
      datasets: [{ data: weeks.map((w) => w.count), backgroundColor: ACCENT, borderRadius: 6 }],
    },
    options: baseOptions(),
  });

  $('sDur').textContent = fmtClock(workouts.reduce((a, w) => a + w.duration_sec, 0) / workouts.length);
  const rest = avgRest(workouts);
  $('sRest').textContent = rest == null ? 'אין נתון' : fmtClock(rest);

  const recent = asc.slice(-20);
  new Chart($('volChart'), {
    type: 'line',
    data: {
      labels: recent.map((w) => fmtShortDate(w.started_at)),
      datasets: [{ data: recent.map(volume), borderColor: ACCENT, backgroundColor: 'rgba(169,48,242,0.18)', fill: true, tension: 0.3, pointRadius: 3 }],
    },
    options: baseOptions(),
  });
}

function renderCalendar() {
  const y = calMonth.getFullYear();
  const m = calMonth.getMonth();
  $('calTitle').textContent = calMonth.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
  const days = new Set(workouts
    .map((w) => new Date(w.started_at))
    .filter((d) => d.getFullYear() === y && d.getMonth() === m)
    .map((d) => d.getDate()));
  const today = new Date();
  const first = new Date(y, m, 1).getDay();
  const count = new Date(y, m + 1, 0).getDate();
  let html = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].map((d) => `<div class="dow">${d}</div>`).join('');
  html += '<div></div>'.repeat(first);
  for (let d = 1; d <= count; d++) {
    const isToday = today.getFullYear() === y && today.getMonth() === m && today.getDate() === d;
    html += `<div class="day ${days.has(d) ? 'on' : ''} ${isToday ? 'today' : ''}">${d}</div>`;
  }
  $('cal').innerHTML = html;
}

$('calPrev').addEventListener('click', () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); renderCalendar(); });
$('calNext').addEventListener('click', () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); renderCalendar(); });

function renderExercise() {
  const key = $('exSelect').value;
  const points = [];
  for (const w of asc) {
    const sets = w.sets.filter((s) => exKey(s) === key);
    if (sets.length) points.push({ date: w.started_at, max: Math.max(...sets.map((s) => s.weight)) });
  }
  const first = points[0]?.max;
  const last = points[points.length - 1]?.max;
  if (points.length < 2) {
    $('exImprove').textContent = 'צריך לפחות שני אימונים כדי לראות מגמה.';
  } else {
    const diff = last - first;
    const pct = first > 0 ? ` (${diff >= 0 ? '+' : ''}${fmtNum((diff / first) * 100)}%)` : '';
    $('exImprove').innerHTML = `מ-${fmtNum(first)} ק"ג ל-${fmtNum(last)} ק"ג: <span class="improve">${diff >= 0 ? '+' : ''}${fmtNum(diff)} ק"ג${pct}</span> ב-${points.length} אימונים`;
  }
  exChart?.destroy();
  exChart = new Chart($('exChart'), {
    type: 'line',
    data: {
      labels: points.map((p) => fmtShortDate(p.date)),
      datasets: [{ data: points.map((p) => p.max), borderColor: ACCENT, backgroundColor: ACCENT, tension: 0.25, pointRadius: 4 }],
    },
    options: baseOptions({
      scales: {
        x: { grid: { display: false }, ticks: { color: MUTED, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
        y: { grid: { color: GRID }, ticks: { color: MUTED }, position: 'right', grace: '10%' },
      },
    }),
  });
}

function renderRecords() {
  const recs = records(workouts);
  $('exSelect').innerHTML = [...recs].map(([k, r]) => `<option value="${esc(k)}">${esc(r.name)}</option>`).join('');
  $('prBody').innerHTML = [...recs.values()].map((r) => `
    <tr><td>${esc(r.name)}</td><td><b>${fmtNum(r.weight)}</b> ק"ג</td><td>${r.reps}</td><td class="muted">${fmtShortDate(r.date)}</td></tr>`).join('');
  $('exSelect').addEventListener('change', renderExercise);
  renderExercise();
}

async function init() {
  try {
    workouts = await db.getWorkouts();
  } catch (err) {
    console.error(err);
    $('empty').hidden = false;
    $('empty').textContent = 'לא הצלחתי לטעון את הנתונים. בדוק את החיבור לאינטרנט ורענן.';
    return;
  }
  if (!workouts.length) {
    $('empty').hidden = false;
    return;
  }
  asc = [...workouts].reverse();
  $('content').hidden = false;
  Chart.defaults.font.family = '"Heebo", "Segoe UI", system-ui, sans-serif';
  renderStats();
  renderCalendar();
  renderRecords();
}

init();
