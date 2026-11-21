// All reads and writes go through here. Two backends with the same API:
// Supabase (real) and localStorage (demo mode, when config.js is empty).
import { sb, demo } from './supabase.js';

const KEY = 'gym_demo_db';
const load = () => JSON.parse(localStorage.getItem(KEY) || '{"exercises":[],"workouts":[]}');
const store = (db) => localStorage.setItem(KEY, JSON.stringify(db));
const uid = () => crypto.randomUUID();

function ok({ data, error }) {
  if (error) throw error;
  return data;
}

const sortSets = (w) => {
  w.sets = (w.sets || []).map((s) => ({ ...s, weight: Number(s.weight), reps: Number(s.reps) }));
  return w;
};

export async function getExercises() {
  if (demo) return load().exercises.filter((e) => !e.archived).sort((a, b) => a.position - b.position);
  return ok(await sb.from('gym_exercises').select('*').eq('archived', false).order('position'));
}

export async function addExercise(name, position) {
  await addExercises([{ name, position }]);
}

// rows: [{ name, position, start_weight?, start_reps? }]
export async function addExercises(rows) {
  if (demo) {
    const db = load();
    for (const r of rows) db.exercises.push({ id: uid(), default_sets: 3, archived: false, ...r });
    return store(db);
  }
  ok(await sb.from('gym_exercises').insert(rows));
}

export async function updateExercise(id, patch) {
  if (demo) {
    const db = load();
    Object.assign(db.exercises.find((e) => e.id === id), patch);
    return store(db);
  }
  ok(await sb.from('gym_exercises').update(patch).eq('id', id));
}

export async function reorderExercises(ids) {
  await Promise.all(ids.map((id, i) => updateExercise(id, { position: i })));
}

// Newest first, each with its sets.
export async function getWorkouts() {
  if (demo) {
    return load().workouts.map(sortSets).sort((a, b) => b.started_at.localeCompare(a.started_at));
  }
  const rows = ok(await sb.from('gym_workouts')
    .select('*, sets:gym_workout_sets(*)')
    .order('started_at', { ascending: false }));
  return rows.map(sortSets);
}

export async function saveWorkout({ started_at, ended_at, duration_sec, sets }) {
  if (demo) {
    const db = load();
    const id = uid();
    db.workouts.push({ id, started_at, ended_at, duration_sec, sets: sets.map((s) => ({ ...s, id: uid(), workout_id: id })) });
    return store(db);
  }
  const w = ok(await sb.from('gym_workouts').insert({ started_at, ended_at, duration_sec }).select().single());
  const res = await sb.from('gym_workout_sets').insert(sets.map((s) => ({ ...s, workout_id: w.id })));
  if (res.error) {
    await sb.from('gym_workouts').delete().eq('id', w.id);
    throw res.error;
  }
}

// Replaces the sets of an already saved workout (used when continuing it).
export async function replaceWorkout(id, { ended_at, duration_sec, sets }) {
  if (demo) {
    const db = load();
    const w = db.workouts.find((x) => x.id === id);
    Object.assign(w, { ended_at, duration_sec, sets: sets.map((s) => ({ ...s, id: uid(), workout_id: id })) });
    return store(db);
  }
  // Insert the new sets before removing the old ones, so a failure never loses data.
  const old = ok(await sb.from('gym_workout_sets').select('id').eq('workout_id', id)).map((r) => r.id);
  ok(await sb.from('gym_workout_sets').insert(sets.map((s) => ({ ...s, workout_id: id }))));
  if (old.length) ok(await sb.from('gym_workout_sets').delete().in('id', old));
  ok(await sb.from('gym_workouts').update({ ended_at, duration_sec }).eq('id', id));
}

// The workout in progress, kept in the cloud so it survives closing the browser.
const DRAFT_KEY = 'gym_demo_cloud_draft';

async function userId() {
  const { data: { session } } = await sb.auth.getSession();
  return session?.user.id;
}

export async function getDraft() {
  if (demo) return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
  const row = ok(await sb.from('gym_drafts').select('data').maybeSingle());
  return row?.data ?? null;
}

export async function putDraft(draft) {
  if (demo) return localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  ok(await sb.from('gym_drafts').upsert({ user_id: await userId(), data: draft, updated_at: new Date().toISOString() }));
}

export async function clearDraft() {
  if (demo) return localStorage.removeItem(DRAFT_KEY);
  ok(await sb.from('gym_drafts').delete().eq('user_id', await userId()));
}

export async function updateSet(id, patch) {
  if (demo) {
    const db = load();
    for (const w of db.workouts) {
      const s = w.sets.find((x) => x.id === id);
      if (s) Object.assign(s, patch);
    }
    return store(db);
  }
  ok(await sb.from('gym_workout_sets').update(patch).eq('id', id));
}

export async function deleteWorkout(id) {
  if (demo) {
    const db = load();
    db.workouts = db.workouts.filter((w) => w.id !== id);
    return store(db);
  }
  ok(await sb.from('gym_workouts').delete().eq('id', id));
}
