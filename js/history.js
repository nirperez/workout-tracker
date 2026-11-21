import { requireAuth } from './supabase.js';
import * as db from './data.js';
import { exKey, volume, fmtClock, fmtDate, fmtNum, esc } from './stats.js';

await requireAuth();

const list = document.getElementById('list');
let workouts = [];
let editing = null; // id of the workout being edited
const open = new Set(); // ids of expanded workouts

function groupSets(w) {
  const groups = new Map();
  const sorted = [...w.sets].sort((a, b) => (a.completed_at || '').localeCompare(b.completed_at || '') || a.set_number - b.set_number);
  for (const s of sorted) {
    const k = exKey(s);
    if (!groups.has(k)) groups.set(k, { name: s.exercise_name, sets: [] });
    groups.get(k).sets.push(s);
  }
  for (const g of groups.values()) g.sets.sort((a, b) => a.set_number - b.set_number);
  return [...groups.values()];
}

function setRow(s, edit) {
  if (edit) {
    return `
      <div class="w-set" data-set="${s.id}">
        <span class="muted">סט ${s.set_number}</span>
        <input class="reps" inputmode="numeric" value="${s.reps}" aria-label="חזרות">
        <input class="weight" inputmode="decimal" value="${s.weight}" aria-label="משקל">
      </div>`;
  }
  return `
    <div class="w-set">
      <span class="muted">סט ${s.set_number}</span>
      <span>${s.reps} חזרות × ${fmtNum(s.weight)} ק"ג</span>
      <span class="muted small">${s.rest_before_sec != null ? `מנוחה ${fmtClock(s.rest_before_sec)}` : ''}</span>
    </div>`;
}

function render() {
  if (!workouts.length) {
    list.innerHTML = '<p class="empty">עדיין אין אימונים שמורים.<br>האימון הראשון שתשמור יופיע כאן.</p>';
    return;
  }
  list.innerHTML = workouts.map((w) => {
    const edit = editing === w.id;
    return `
      <details class="card workout" data-id="${w.id}" ${open.has(w.id) ? 'open' : ''}>
        <summary>
          <span>
            <span class="w-date">${fmtDate(w.started_at)}</span><br>
            <span class="muted small">${fmtClock(w.duration_sec)} · ${w.sets.length} סטים · נפח ${fmtNum(volume(w))} ק"ג</span>
          </span>
          <span class="muted" aria-hidden="true">▾</span>
        </summary>
        <div class="w-body">
          ${groupSets(w).map((g) => `
            <div class="w-ex">
              <div class="w-ex-name">${esc(g.name)}</div>
              ${edit ? '<div class="w-set muted small"><span></span><span style="text-align:center">חזרות</span><span style="text-align:center">משקל (ק"ג)</span></div>' : ''}
              ${g.sets.map((s) => setRow(s, edit)).join('')}
            </div>`).join('')}
          <div class="w-actions">
            ${edit
              ? '<button class="primary" data-act="save">שמור שינויים</button><button data-act="cancel">ביטול</button>'
              : '<button class="primary" data-act="resume">המשך אימון</button><button data-act="edit">ערוך</button><button class="danger ghost" data-act="delete">מחק אימון</button>'}
          </div>
        </div>
      </details>`;
  }).join('');
}

const num = (v) => Number(String(v).replace(',', '.'));

async function saveEdits(card, w) {
  const changes = [];
  for (const row of card.querySelectorAll('[data-set]')) {
    const s = w.sets.find((x) => x.id === row.dataset.set);
    const reps = num(row.querySelector('.reps').value);
    const weight = num(row.querySelector('.weight').value);
    if (!Number.isInteger(reps) || reps <= 0 || !(weight >= 0)) {
      alert('יש ערך לא תקין באחד הסטים. חזרות חייבות להיות מספר שלם, ומשקל מספר.');
      return;
    }
    if (reps !== s.reps || weight !== s.weight) changes.push([s.id, { reps, weight }]);
  }
  await Promise.all(changes.map(([id, patch]) => db.updateSet(id, patch)));
  editing = null;
  await reload();
}

list.addEventListener('toggle', (e) => {
  const card = e.target.closest('details.workout');
  if (!card) return;
  if (card.open) open.add(card.dataset.id);
  else open.delete(card.dataset.id);
}, true);

list.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const card = btn.closest('details.workout');
  const w = workouts.find((x) => x.id === card.dataset.id);
  try {
    switch (btn.dataset.act) {
      case 'resume':
        localStorage.setItem('gym_resume', w.id);
        location.href = 'index.html';
        break;
      case 'edit': editing = w.id; render(); break;
      case 'cancel': editing = null; render(); break;
      case 'save': await saveEdits(card, w); break;
      case 'delete':
        if (confirm(`למחוק את האימון מ${fmtDate(w.started_at)}? אי אפשר לשחזר.`)) {
          await db.deleteWorkout(w.id);
          await reload();
        }
        break;
    }
  } catch (err) {
    console.error(err);
    alert('הפעולה נכשלה. בדוק את החיבור לאינטרנט ונסה שוב.');
  }
});

async function reload() {
  workouts = await db.getWorkouts();
  render();
}

reload().catch((err) => {
  console.error(err);
  list.innerHTML = '<p class="empty">לא הצלחתי לטעון את האימונים. בדוק את החיבור לאינטרנט ורענן.</p>';
});
