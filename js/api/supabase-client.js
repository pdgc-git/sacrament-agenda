// Supabase client for the self-hosted stack on forwartrans-vps. Caddy proxies /supabase/* to Kong
// same-origin, so this file works unmodified in production and in local dev (npx serve) against
// the same host. The anon key is public by design (same as the old Firebase web config) — RLS is
// the real access boundary, not key secrecy.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const SUPABASE_URL = 'https://agenda.89-58-18-212.nip.io';
const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg3NjY4NTE5LCJleHAiOjE5NDUzNDg1MTl9.NvsqXwSFADIQe84sM0rfaZE1WVKb-0AtpKudJApfa7U';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: 'agenda' },
});
