import { requireAuth, demo } from './supabase.js';
import * as db from './data.js';
import { records, fmtClock, fmtDate, fmtNum, esc } from './stats.js';
import { openPlanEditor } from './plan-editor.js';
import { SEED_PLAN } from './seed.js';

await requireAuth();

const DRAFT = 'gym_draft';
const $ = (id) => document.getElementById(id);

let exercises = [];
let workouts = [];
// draft = { startedAt, lastTick, sets: { [exerciseId]: [{ reps, weight, done, rest, completedAt }] } }
let draft = null;

function toast(text) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), 3200);
}

// The active workout is saved on the device on every change and, once started,
// also in the cloud, so it survives closing the browser or switching device.
let pushTimer = null;

function pushDraft() {
  clearTimeout(pushTimer);
  if (draft?.startedAt) db.putDraft(draft).catch((err) => console.error(err));
}

function saveDraft(now = false) {
  draft.updatedAt = Date.now();
  localStorage.setItem(DRAFT, JSON.stringify(draft));
  if (!draft.startedAt) return;
  clearTimeout(pushTimer);
  if (now) pushDraft();
  else pushTimer = setTimeout(pushDraft, 800);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') pushDraft();
});
window.addEventListener('pagehide', pushDraft);

function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT));
  } catch {
    return null;
  }
}

// Seconds of workout so far. A continued workout adds to its saved duration.
function elapsed(now = Date.now()) {
  return (draft.baseDuration || 0) + (now - (draft.resumedAt || draft.startedAt)) / 1000;
}

// Sets from the most recent workout that included this exercise.
function lastSetsFor(ex, excludeId = null) {
  for (const w of workouts) {
    if (w.id === excludeId) continue;
    const sets = w.sets.filter((s) => s.exercise_id === ex.id).sort((a, b) => a.set_number - b.set_number);
    if (sets.length) return sets;
  }
  return [];
}

function buildRows(ex) {
  const prev = lastSetsFor(ex);
  const n = Math.max(ex.default_sets || 3, prev.length);
  return Array.from({ length: n }, (_, i) => {
    // No history yet: fall back to the starting values from the plan.
    const p = prev[i] || prev[prev.length - 1] || { reps: ex.start_reps ?? '', weight: ex.start_weight ?? '' };
    return { reps: String(p.reps), weight: String(p.weight), done: false, rest: null, completedAt: null };
  });
}

// Turns a saved workout back into an active one: its sets come back checked,
// and the remaining sets are prefilled from the workout before it.
function draftFromWorkout(w) {
  const now = Date.now();
  const d = {
    startedAt: new Date(w.started_at).getTime(),
    resumedAt: now,
    baseDuration: w.duration_sec || 0,
    lastTick: now,
    skipRest: true,
    workoutId: w.id,
    sets: {},
    extraSets: [],
  };
  const ids = new Set(exercises.map((e) => e.id));
  for (const ex of exercises) {
    const saved = w.sets.filter((s) => s.exercise_id === ex.id).sort((a, b) => a.set_number - b.set_number);
    const older = lastSetsFor(ex, w.id);
    const n = Math.max(ex.default_sets || 3, saved.length, older.length);
    d.sets[ex.id] = Array.from({ length: n }, (_, i) => {
      const s = saved[i];
      if (s) return { reps: String(s.reps), weight: String(s.weight), done: true, rest: s.rest_before_sec, completedAt: s.completed_at };
      const p = older[i] || saved[saved.length - 1] || older[older.length - 1]
        || { reps: ex.start_reps ?? '', weight: ex.start_weight ?? '' };
      return { reps: String(p.reps), weight: String(p.weight), done: false, rest: null, completedAt: null };
    });
  }
  // Sets of exercises that are no longer in the plan are kept as they were.
  d.extraSets = w.sets.filter((s) => !ids.has(s.exercise_id))
    .map(({ id, workout_id, user_id, ...rest }) => rest);
  return d;
}

function syncDraft() {
  if (!draft) draft = loadDraft() || { startedAt: null, lastTick: null, sets: {} };
  // Until the workout starts, always prefill from the latest saved data.
  if (!draft.startedAt) draft.sets = {};
  for (const ex of exercises) {
    if (!draft.sets[ex.id]) draft.sets[ex.id] = buildRows(ex);
  }
  saveDraft();
}

const doneCount = () => exercises.reduce((n, ex) => n + draft.sets[ex.id].filter((r) => r.done).length, 0);

function render() {
  const box = $('exercises');
  if (!exercises.length) {
    box.innerHTML = '<p class="empty">עדיין אין תרגילים בתוכנית.<br>לחץ על "ערוך תוכנית" כדי להוסיף.</p>';
  } else {
    box.innerHTML = exercises.map((ex) => `
      <section class="card" data-ex="${ex.id}">
        <div class="ex-head"><h2>${esc(ex.name)}</h2></div>
        <div class="set-grid head"><span></span><span>חזרות</span><span>משקל (ק"ג)</span><span></span></div>
        ${draft.sets[ex.id].map((r, i) => `
          <div class="set-grid set-row ${r.done ? 'done' : ''}" data-i="${i}">
            <span class="set-label">סט ${i + 1}</span>
            <input class="reps" inputmode="numeric" value="${esc(r.reps)}" aria-label="חזרות, סט ${i + 1}">
            <input class="weight" inputmode="decimal" value="${esc(r.weight)}" aria-label="משקל, סט ${i + 1}">
            <button class="check" aria-pressed="${r.done}" aria-label="סיום סט ${i + 1}">✓</button>
          </div>`).join('')}
        <button class="add-set">+ סט</button>
      </section>`).join('');
  }
  updateControls();
}

function updateControls() {
  const started = !!draft.startedAt;
  $('startBtn').hidden = started;
  $('discardBtn').hidden = !started;
  $('saveBtn').disabled = doneCount() === 0;
  const resumed = workouts.find((w) => w.id === draft.workoutId);
  $('resumeBanner').hidden = !resumed;
  if (resumed) $('resumeBanner').textContent = `ממשיך את האימון מ${fmtDate(resumed.started_at)}. בסיום, השמירה תעדכן אותו.`;
  tick();
}

function tick() {
  if (!draft?.startedAt) {
    $('timer').textContent = '00:00';
    $('timerLabel').textContent = 'לחץ התחל כדי להתחיל לספור';
    return;
  }
  const now = Date.now();
  $('timer').textContent = fmtClock((now - draft.lastTick) / 1000);
  $('timerLabel').textContent = `${doneCount() ? 'מאז הסט האחרון' : 'מתחילת האימון'} · סה"כ ${fmtClock(elapsed(now))}`;
}

function start() {
  draft.startedAt = draft.resumedAt = draft.lastTick = Date.now();
  saveDraft(true);
  updateControls();
}

const num = (v) => Number(String(v).replace(',', '.'));

function toggleSet(exId, i) {
  const row = draft.sets[exId][i];
  if (row.done) {
    row.done = false;
    row.rest = null;
    row.completedAt = null;
  } else {
    const reps = num(row.reps);
    const weight = num(row.weight);
    if (row.reps === '' || row.weight === '' || !Number.isInteger(reps) || reps <= 0 || !(weight >= 0)) {
      toast('צריך למלא חזרות ומשקל לפני שמסמנים את הסט');
      return;
    }
    const now = Date.now();
    if (!draft.startedAt) draft.startedAt = draft.resumedAt = draft.lastTick = now;
    // The first set after continuing a saved workout has no meaningful rest time.
    row.rest = doneCount() && !draft.skipRest ? Math.round((now - draft.lastTick) / 1000) : null;
    draft.skipRest = false;
    row.done = true;
    row.completedAt = new Date(now).toISOString();
    draft.lastTick = now;
  }
  saveDraft(true);
  render();
}

$('exercises').addEventListener('input', (e) => {
  const rowEl = e.target.closest('.set-row');
  if (!rowEl) return;
  const row = draft.sets[rowEl.closest('[data-ex]').dataset.ex][rowEl.dataset.i];
  row[e.target.classList.contains('reps') ? 'reps' : 'weight'] = e.target.value.trim();
  saveDraft();
});

$('exercises').addEventListener('click', (e) => {
  const card = e.target.closest('[data-ex]');
  if (!card) return;
  const exId = card.dataset.ex;
  if (e.target.closest('.check')) {
    toggleSet(exId, Number(e.target.closest('.set-row').dataset.i));
  } else if (e.target.closest('.add-set')) {
    const rows = draft.sets[exId];
    const last = rows[rows.length - 1];
    rows.push({ reps: last?.reps ?? '', weight: last?.weight ?? '', done: false, rest: null, completedAt: null });
    saveDraft();
    render();
  }
});

$('startBtn').addEventListener('click', start);

$('discardBtn').addEventListener('click', () => {
  const text = draft.workoutId
    ? 'לבטל את ההמשך? האימון השמור יישאר כמו שהיה, והשינויים מעכשיו לא יישמרו.'
    : 'לבטל את האימון הנוכחי? מה שמילאת לא יישמר.';
  if (!confirm(text)) return;
  resetDraft();
});

function resetDraft() {
  clearTimeout(pushTimer);
  localStorage.removeItem(DRAFT);
  db.clearDraft().catch((err) => console.error(err));
  draft = null;
  syncDraft();
  render();
}

$('saveBtn').addEventListener('click', async () => {
  const now = Date.now();
  const sets = [];
  for (const ex of exercises) {
    let n = 0;
    for (const r of draft.sets[ex.id]) {
      if (!r.done) continue;
      sets.push({
        exercise_id: ex.id,
        exercise_name: ex.name,
        set_number: ++n,
        reps: num(r.reps),
        weight: num(r.weight),
        rest_before_sec: r.rest,
        completed_at: r.completedAt,
      });
    }
  }
  if (!sets.length) return;
  if (!confirm('לסיים את האימון ולשמור?')) return;

  const resumeId = draft.workoutId || null;
  sets.push(...(draft.extraSets || []));
  const before = records(workouts.filter((w) => w.id !== resumeId));
  const duration = Math.round(elapsed(now));
  const payload = {
    started_at: new Date(draft.startedAt).toISOString(),
    ended_at: new Date(now).toISOString(),
    duration_sec: duration,
    sets,
  };
  $('saveBtn').disabled = true;
  try {
    if (resumeId && workouts.some((w) => w.id === resumeId)) await db.replaceWorkout(resumeId, payload);
    else await db.saveWorkout(payload);
  } catch (err) {
    console.error(err);
    $('saveBtn').disabled = false;
    toast('השמירה נכשלה. בדוק את החיבור לאינטרנט ונסה שוב. הנתונים נשארו על המסך.');
    return;
  }

  // New personal records: heavier than anything saved before for that exercise.
  const prs = [];
  for (const ex of exercises) {
    const best = Math.max(-1, ...sets.filter((s) => s.exercise_id === ex.id).map((s) => s.weight));
    const old = before.get(ex.id);
    if (old && best > old.weight) prs.push(`${esc(ex.name)}: ${fmtNum(best)} ק"ג (היה ${fmtNum(old.weight)})`);
  }
  $('summaryBody').innerHTML = `
    <p>משך האימון: <b>${fmtClock(duration)}</b><br>סטים שבוצעו: <b>${sets.length}</b></p>
    ${prs.length ? `<p><b>שיאים חדשים</b><br>${prs.join('<br>')}</p>` : ''}`;
  $('summaryDialog').showModal();

  try {
    workouts = await db.getWorkouts();
  } catch (err) {
    console.error(err);
  }
  resetDraft();
});

$('summaryClose').addEventListener('click', () => $('summaryDialog').close());

$('editPlanBtn').addEventListener('click', () => {
  openPlanEditor(async () => {
    exercises = await db.getExercises();
    syncDraft();
    render();
  });
});

async function init() {
  $('demoBanner').hidden = !demo;
  try {
    let cloud = null;
    [exercises, workouts, cloud] = await Promise.all([
      db.getExercises(),
      db.getWorkouts(),
      db.getDraft().catch((err) => { console.error(err); return null; }),
    ]);
    // Use the cloud copy of the active workout when this device has none or an older one.
    const local = loadDraft();
    if (cloud?.startedAt && (!local?.startedAt || (cloud.updatedAt || 0) > (local.updatedAt || 0))) draft = cloud;
    if (!exercises.length && !workouts.length) {
      await db.addExercises(SEED_PLAN.map((e, i) => ({
        name: e.name, position: i, start_weight: e.weight ?? null, start_reps: e.reps ?? null,
      })));
      exercises = await db.getExercises();
    }
  } catch (err) {
    console.error(err);
    $('exercises').innerHTML = '<p class="empty">לא הצלחתי לטעון את הנתונים. בדוק את החיבור לאינטרנט ורענן.</p>';
    return;
  }
  syncDraft();

  // "Continue workout" from the history page.
  const resumeId = localStorage.getItem('gym_resume');
  localStorage.removeItem('gym_resume');
  const target = workouts.find((w) => w.id === resumeId);
  if (target && draft.workoutId !== target.id
      && (!draft.startedAt || confirm('יש אימון פעיל שעוד לא נשמר. להחליף אותו באימון שבחרת להמשיך?'))) {
    draft = draftFromWorkout(target);
    saveDraft(true);
  }
  render();
  setInterval(tick, 500);
}

init();
