import * as db from './data.js';
import { esc } from './stats.js';

const $ = (id) => document.getElementById(id);

// Opens the plan dialog. onClose runs after the dialog is closed.
export function openPlanEditor(onClose) {
  const dialog = $('planDialog');
  const list = $('planList');
  let items = [];

  async function refresh() {
    items = await db.getExercises();
    list.innerHTML = items.length
      ? items.map((e, i) => `
        <div class="plan-row" data-id="${e.id}">
          <input value="${esc(e.name)}" aria-label="שם התרגיל">
          <button data-act="up" aria-label="הזז למעלה" ${i === 0 ? 'disabled' : ''}>▲</button>
          <button data-act="down" aria-label="הזז למטה" ${i === items.length - 1 ? 'disabled' : ''}>▼</button>
          <button data-act="del" class="danger" aria-label="מחק תרגיל">✕</button>
        </div>`).join('')
      : '<p class="muted">עדיין אין תרגילים. הוסף את הראשון למטה.</p>';
  }

  async function run(fn) {
    try {
      await fn();
      await refresh();
    } catch (err) {
      console.error(err);
      alert('הפעולה נכשלה. בדוק את החיבור לאינטרנט ונסה שוב.');
    }
  }

  list.onclick = (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.closest('.plan-row').dataset.id;
    const i = items.findIndex((x) => x.id === id);
    const act = btn.dataset.act;
    if (act === 'del') {
      if (confirm(`למחוק את "${items[i].name}" מהתוכנית? ההיסטוריה שלו נשמרת.`)) {
        run(() => db.updateExercise(id, { archived: true }));
      }
      return;
    }
    const j = act === 'up' ? i - 1 : i + 1;
    const ids = items.map((x) => x.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    run(() => db.reorderExercises(ids));
  };

  list.onchange = (e) => {
    if (e.target.tagName !== 'INPUT') return;
    const id = e.target.closest('.plan-row').dataset.id;
    const name = e.target.value.trim();
    if (name) run(() => db.updateExercise(id, { name }));
  };

  $('planAdd').onsubmit = (e) => {
    e.preventDefault();
    const name = $('planNew').value.trim();
    if (!name) return;
    $('planNew').value = '';
    const position = items.length ? Math.max(...items.map((x) => x.position)) + 1 : 0;
    run(() => db.addExercise(name, position));
  };

  $('planClose').onclick = () => dialog.close();
  dialog.onclose = () => onClose();

  refresh().then(() => dialog.showModal());
}
