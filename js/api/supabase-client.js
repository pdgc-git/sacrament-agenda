// Supabase client for the self-hosted stack on forwartrans-vps. Caddy proxies /auth/*, /rest/* and
// /storage/* to Kong same-origin, so this file works unmodified in production and in local dev
// (npx serve) against the same host. The anon key is public by design (same as the old Firebase web
// config) — RLS is the real access boundary, not key secrecy.
//
// supabase-js is vendored as a UMD build (js/vendor/supabase.js, loaded by a <script> tag before
// this module) because the production CSP only allows scripts from 'self' + cdnjs + unpkg, and
// there is no bundler in this project by design.
// Same-origin in production (Caddy proxies /auth, /rest, /storage on whatever hostname serves the
// app), so a domain change needs no code edit. Local dev (npx serve / file://) talks to the VPS.
const PROD_FALLBACK = 'https://agenda.89-58-18-212.nip.io';
const isLocal = !window.location.protocol.startsWith('http') || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
const SUPABASE_URL = isLocal ? PROD_FALLBACK : window.location.origin;
const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg3NjY4NTE5LCJleHAiOjE5NDUzNDg1MTl9.NvsqXwSFADIQe84sM0rfaZE1WVKb-0AtpKudJApfa7U';

if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    throw new Error('supabase-js not loaded: include js/vendor/supabase.js before the app modules.');
}

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: 'agenda' },
});
