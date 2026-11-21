import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const demo = !SUPABASE_URL || !SUPABASE_ANON_KEY;
export let sb = null;

if (!demo) {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Redirects to the login page when there is no session. Resolves once the user is known.
export async function requireAuth() {
  if (demo) return;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    location.replace('login.html');
    await new Promise(() => {});
  }
}

export async function signOut() {
  if (!demo) await sb.auth.signOut();
  location.replace('login.html');
}
