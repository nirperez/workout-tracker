// Pure helpers shared by all pages.

export const exKey = (s) => s.exercise_id || s.exercise_name;

export const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Week starts on Sunday.
export function weekStart(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

export function weeklyCounts(workouts, n = 12) {
  const cur = weekStart(new Date());
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(cur);
    start.setDate(start.getDate() - 7 * i);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const count = workouts.filter((w) => {
      const t = new Date(w.started_at);
      return t >= start && t < end;
    }).length;
    out.push({ start, count });
  }
  return out;
}

// Consecutive weeks with at least one workout. The current week does not break
// the streak while it is still empty.
export function streakWeeks(workouts) {
  const weeks = new Set(workouts.map((w) => weekStart(w.started_at).getTime()));
  const cur = weekStart(new Date());
  if (!weeks.has(cur.getTime())) cur.setDate(cur.getDate() - 7);
  let n = 0;
  while (weeks.has(cur.getTime())) {
    n++;
    cur.setDate(cur.getDate() - 7);
  }
  return n;
}

export const volume = (w) => w.sets.reduce((a, s) => a + s.reps * s.weight, 0);

// Heaviest set per exercise: Map key -> { name, weight, reps, date }.
export function records(workouts) {
  const map = new Map();
  const asc = [...workouts].sort((a, b) => a.started_at.localeCompare(b.started_at));
  for (const w of asc) {
    for (const s of w.sets) {
      const k = exKey(s);
      const r = map.get(k);
      if (!r || s.weight > r.weight || (s.weight === r.weight && s.reps > r.reps)) {
        map.set(k, { name: s.exercise_name, weight: s.weight, reps: s.reps, date: w.started_at });
      } else {
        r.name = s.exercise_name;
      }
    }
  }
  return map;
}

export function avgRest(workouts) {
  const rests = workouts.flatMap((w) => w.sets.map((s) => s.rest_before_sec)).filter((r) => r != null);
  return rests.length ? rests.reduce((a, b) => a + b, 0) / rests.length : null;
}

const pad = (n) => String(n).padStart(2, '0');

export function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export const fmtDate = (iso) => new Date(iso).toLocaleDateString('he-IL', {
  weekday: 'long', day: 'numeric', month: 'numeric', year: '2-digit',
});

export const fmtShortDate = (iso) => new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });

export const fmtNum = (n) => Number(n).toLocaleString('he-IL', { maximumFractionDigits: 1 });
