# Rebuild Plan — Sacrament Agenda v2

**Status:** approved by Paulo on 2026-09-05. This document is the handoff for the executing agent: it contains all context, decisions, findings, and phased tasks. Read `AGENTS.md` too — its rules still apply except where this plan overrides them (backend is now Supabase, not Firebase).

## 0. Decisions already made (do not re-litigate)

1. **Backend migrates from Firebase (Auth + Firestore) to self-hosted Supabase** on Paulo's netcup VPS (`ssh forwartrans-vps`, key-only root, Debian 13). One schema for this project, per the platform convention (same pattern as forwartrans-hr).
2. **Full UI redesign** — new visual language and rethought flows, not a polish pass. Keep vanilla JS (ES modules, no frameworks) per `AGENTS.md`.
3. **Hosting moves off Netlify** — static files served by the VPS's Caddy.
4. Docs/comments in English; UI strings in pt-PT.

## 1. Current state (verified 2026-09-05)

### What the app is
Two tiers:
- `simple.html` + `js/simple-ui.js` — anonymous localStorage agenda editor with PDF export. **Complete and working; keep as-is** (minor XSS-safe already).
- `planner.html` + `js/planner-ui.js` (2,370 lines) — authenticated multi-user "Ward Planner": dashboard, 3-month timeline, agenda editor (PLAN/FULL modes), member roster with PDF bulk import, admin view. **~70% built, gated off** — `index.html` shows it as a disabled "Em Desenvolvimento" card.

### Assets to preserve (port, don't rewrite)
- `js/hymns.js` — Portuguese hymn database (standard + 2024+ new hymns).
- `js/utils/pdfParser.js` — spatial PDF parser that reconstructs member/calling tables from LCR-style PDF exports by Y-coordinate grouping. Tested, works.
- Domain rules embedded in `planner-ui.js`: speaker rotation (never-spoke first, then oldest `last_talk_date`), hymn-repetition warning (same hymn within 3 months of a *completed* meeting), fast-Sunday mode (hides speakers/intermediate hymn), business section auto-hide.
- `firestore.rules` role model — owner / admin / editor / music / viewer, membership status active/pending. This is the blueprint for the Postgres RLS policies.
- Test suite: 80 tests (`tests/`), 79 passing. Jest + jsdom + `__mocks__/`.

### Known bugs and gaps (fix during rebuild, don't patch v1)
| # | Issue | Location |
|---|---|---|
| 1 | Join-ward flow dead end: `joinWard` creates `status: 'pending'` membership but the admin "Gerir" button is `alert('em breve')` — no approval UI exists, multi-user is broken | `js/planner-ui.js:2326`, `js/dataManager.js:108` |
| 2 | Meetings never finalized: UI only calls `saveFuturePlan` (status `draft`); `saveMeeting` (status `completed`, updates `last_talk_date`/`last_prayer_date`) is never called. So rotation suggestions, hymn warnings (`checkHymnHistory` filters `status=='completed'`), and member history always see empty data | `js/planner-ui.js:1356` (btn-finalize handler), `js/dataManager.js:369` |
| 3 | PDF export is a stub: `renderPrintView` covers only basic fields, ignores business section/recognitions/full-mode layout | `js/planner-ui.js:229-304` |
| 4 | `initUser(null)` returns before resetting `currentWardId` → ward state leaks after logout. This is the 1 failing test (`tests/dataManager.test.js:185`) | `js/dataManager.js:13` |
| 5 | Stored XSS regressions: `renderMemberPool`, `renderSmartRecommendations`, `renderRoster`, `renderSmartPreview` inject `m.name`/`m.calling` unescaped into `innerHTML` (member names are user/PDF-supplied). Use `escapeHtml` from `js/utils/security.js` everywhere | `js/planner-ui.js:841, 1143, 1836, 2254` |
| 6 | `formatDate` string branch returns `"DD -MM -YYYY "` with stray spaces | `js/planner-ui.js:2292` |
| 7 | Duplicate listeners: `roster-tbody` bound twice (actions fire 2×); `renderPlanSpeakers` re-attaches delegation on every render | `js/planner-ui.js:120` + `1857`; `1079` |
| 8 | Firebase web config committed in `js/firebase-config.js` (normal for Firebase, but the project `ward-planner-agenda` still holds live data — see §5 data migration) | |

### VPS state (verified 2026-09-05)
- Caddy active on the host, config `/etc/caddy/Caddyfile` + snippets in `/etc/caddy/fwhr/`. Existing site `89-58-18-212.nip.io` serves forwartrans-hr with strict security headers — **use it as the template** for the new vhost.
- Supabase stack: `/srv/supabase/docker-compose.yml`; containers `supabase-db` (Postgres), `supabase-auth` (GoTrue), `supabase-rest` (PostgREST), `supabase-kong` (gateway, `127.0.0.1:8000`), `supabase-storage`, `supabase-studio`, `supabase-meta`. Kong is reached through Caddy, never exposed directly.
- forwartrans-hr (`fwhr-api`, port 3000) already follows the one-schema-per-project pattern — check how its schema is exposed via PostgREST (`db-schemas` in the Supabase config) before adding a new one.

## 2. Target architecture

- **Static frontend** (vanilla JS ES modules, no build step) served by Caddy from `/var/www/sacrament-agenda/` on the VPS.
- **Supabase** for auth + data: schema `agenda` in the shared Postgres. Client uses `@supabase/supabase-js` v2 (pin an exact version, load as ESM from jsdelivr or vendor the file — no bundler).
- **New hostname**: `agenda.89-58-18-212.nip.io` (nip.io for now, per Paulo's convention; a real domain can alias later). Caddy proxies `/supabase/*` (or a dedicated `api-agenda.*` host) to Kong at `127.0.0.1:8000` so the frontend talks same-origin.

### Schema (`agenda`)

```sql
create table agenda.wards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null default substr(md5(random()::text), 1, 8),
  created_at timestamptz not null default now(),
  owner_id uuid not null references auth.users(id)
);

create table agenda.ward_users (
  ward_id uuid not null references agenda.wards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer'
    check (role in ('owner','admin','editor','music','viewer')),
  status text not null default 'pending' check (status in ('pending','active')),
  name text, email text,
  joined_at timestamptz not null default now(),
  primary key (ward_id, user_id)
);

create table agenda.members (
  id uuid primary key default gen_random_uuid(),
  ward_id uuid not null references agenda.wards(id) on delete cascade,
  name text not null,
  gender text check (gender in ('M','F')),
  "group" text not null default 'Adult'
    check ("group" in ('Adult','Young Adult','Youth','Primary')),
  calling text,
  created_at timestamptz not null default now()
);

create table agenda.meetings (
  ward_id uuid not null references agenda.wards(id) on delete cascade,
  date date not null,
  status text not null default 'draft' check (status in ('draft','completed')),
  presiding text, conducting text, organist text, chorister text,
  opening_hymn text, sacrament_hymn text, closing_hymn text, intermediate_hymn text,
  invocation_member_id uuid references agenda.members(id),
  benediction_member_id uuid references agenda.members(id),
  invocation text, benediction text,           -- free-text fallback
  is_fast_sunday boolean not null default false,
  program jsonb not null default '[]',          -- ordered [{type:'speaker'|'hymn', name, member_id?, topic?}]
  recognitions jsonb not null default '[]',
  announcements jsonb not null default '[]',
  releases jsonb not null default '[]',
  callings jsonb not null default '[]',
  attendance jsonb,
  updated_at timestamptz not null default now(),
  primary key (ward_id, date)
);
```

**Derived data replaces denormalization** — no more `last_talk_date` writes; create views:
- `agenda.member_last_talk` / `member_last_prayer`: last completed-meeting date per member (from `program` JSONB / prayer columns).
- `agenda.hymn_usage`: (ward_id, hymn_number, date) unnested from completed meetings — powers the 3-month repetition warning with one query.

### RLS (port of `firestore.rules` semantics)
Enable RLS on all four tables. Helper: `agenda.my_role(ward uuid)` security-definer function returning the caller's role where `status='active'`.
- `wards`: select for active members; insert for any authenticated user (trigger sets `owner_id` and inserts the owner row into `ward_users`); update for owner/admin. Also allow `select` of `id,name` by `invite_code` via a security-definer RPC `agenda.lookup_ward(code text)` so joining doesn't require membership.
- `ward_users`: select for active members + always your own row; insert only your own row with `role='viewer', status='pending'`; update/delete for owner/admin (never allow demoting/removing the owner; enforce with a trigger).
- `members`: select for active members; write for editor/admin/owner.
- `meetings`: select for active members; insert/delete for editor+; update for editor+ **or** role `music` (music can only touch hymn columns — enforce via trigger or a dedicated RPC).

## 3. Phases and tasks

Work in a feature branch (`v2-supabase`), PR per phase. Run `npx jest` before every commit (deps: `npm install` first — jsdom env is a devDependency).

### Phase 1 — Supabase foundation (VPS)
1. On the VPS, inspect `/srv/supabase/docker-compose.yml` / `.env`: find how forwartrans-hr's schema is exposed (`PGRST_DB_SCHEMAS` or Kong config). Add `agenda` to the exposed schemas list; restart only the affected containers (`supabase-rest`, maybe `kong`). **Do not touch fwhr data or containers otherwise — it is a production HR app.**
2. Create schema, tables, views, RLS policies, RPCs (`lookup_ward`, `join_ward`, `approve_member`, `finalize_meeting`) as migration SQL committed to the repo under `supabase/migrations/`. Apply with `docker exec -i supabase-db psql -U postgres`.
3. Auth: email/password via GoTrue (already running). Google OAuth is optional/later — do not block on it; email auth first.
4. Caddy: new site block `agenda.89-58-18-212.nip.io` serving `/var/www/sacrament-agenda` + `handle_path /supabase/*` reverse-proxy to `127.0.0.1:8000`. Copy the fwhr site's security-header and log-redaction blocks; CSP must allow `'self'`, Google Fonts, and the pinned CDN for supabase-js and html2pdf. Validate with `caddy validate` before reload.
5. **Acceptance:** `curl https://agenda.89-58-18-212.nip.io/supabase/rest/v1/` answers; anonymous select on `agenda.wards` returns empty (RLS working); a test user can sign up, create a ward via RPC, and read it back.

### Phase 2 — data layer port
1. New `js/api/supabase-client.js` (URL + anon key; anon key is public by design, same as the Firebase config was) and `js/api/dataManager.js` re-implementing the **same exported function names** as the current `js/dataManager.js` (`initUser, createWard, joinWard, getWardUsers, updateUserRole, getMembers, saveMember, deleteMember, getMemberHistory, checkHymnHistory, saveFuturePlan, saveMeeting, getPlanByDate, getFuturePlans, getHistory, getMeetingsInRange, deletePlan`) so the test suite ports with mock swaps only.
2. Fix the known logic bugs in the port: reset ward state on `initUser(null)` (bug #4); `checkHymnHistory` queries the `hymn_usage` view; history/rotation read the `member_last_talk` view.
3. Port `tests/dataManager.test.js` and `tests/security.test.js` to mock supabase-js instead of Firestore. All 80 tests green, including the currently-failing one.
4. **Acceptance:** `npx jest` fully green; manual smoke against the live VPS: create ward → add member → save draft → finalize → hymn warning fires on reuse.

### Phase 3 — full UI redesign
Design first, then build. Load the `frontend-design` skill (and follow `AGENTS.md` styling rules: plain CSS, CSS variables, no inline styles).
1. Produce mockups for the 6 screens before coding: **Entrada/auth, Dashboard (next Sunday hero + 4-week list), Timeline (3 months), Editor (unify today's PLAN/FULL split — one editor with a live preview pane; PLAN/FULL duplication in v1 was the main source of code bloat), Roster (+ PDF import wizard), Admin (member approval + role management — the missing feature #1).**
2. New flows that must exist:
   - Join by **invite code** (replaces "paste ward ID"); pending screen; admin approve/reject with role assignment.
   - **"Finalizar reunião"** as a first-class action on past-dated drafts (calls `finalize_meeting` RPC) — this is what makes rotation/history/hymn-warnings come alive (bug #2).
   - Complete print/PDF view: full agenda including business section, recognitions, announcements; A4; also used by browser print (`@media print`).
   - Mobile-first: bishopric members use phones in meetings.
3. Rebuild `planner.html` + split `planner-ui.js` into modules ≤400 lines each (`views/dashboard.js`, `views/timeline.js`, `views/editor.js`, `views/roster.js`, `views/admin.js`, shared `render.js`). Every dynamic string through `escapeHtml` (bug #5); single event-delegation setup per view (bug #7); fix `formatDate` (bug #6).
4. Keep `simple.html` working untouched (it has no backend). Re-enable the Planner card on `index.html`.
5. **Acceptance:** all v1 features reachable; the four unfinished flows above work end-to-end; Jest green including new tests for approval + finalization; no unescaped interpolation into `innerHTML` (grep check).

### Phase 4 — deploy + data migration + cutover
1. Deploy script (`deploy/deploy.sh`): rsync the static files to `/var/www/sacrament-agenda/` on `forwartrans-vps`. No build step.
2. **Firestore export**: one-off Node script (`scripts/export-firestore.mjs`) using the committed web config + Paulo's login to read `wards/*` (users, members, meetings subcollections) and emit SQL/CSV; import into `agenda` schema. Coordinate with Paulo for auth — he must run the login step. If the existing data is trivial (likely one ward), manual re-entry is an acceptable fallback — ask him.
3. Point users at the new URL; leave Netlify up read-only for a week, then Paulo deletes the Netlify site and (later) the Firebase project.
4. Update `README.md` (new stack, local dev with `npx serve` + a `.env.local`-style config file for the Supabase URL/key, how to run migrations) and prune `AGENTS.md`'s Firebase references.
5. **Acceptance:** production URL serves the app over HTTPS with the fwhr-grade security headers; existing ward data visible; backup story confirmed (the VPS Supabase backup already covers the shared Postgres — verify the `agenda` schema is included).

## 4. Constraints & gotchas for the executing agent
- The VPS hosts **production forwartrans-hr**. Never restart `supabase-db` casually; schema changes via `psql` only; Caddy reloads with `systemctl reload caddy` after `caddy validate`.
- No bundler/build step is a hard constraint — supabase-js must load as a pinned ESM/UMD from CDN or be vendored into `js/vendor/`.
- pt-PT everywhere in UI (existing strings are the reference); code/comments/docs in English.
- `hymns.js` numbers include the new 1000-series hymns — keep search matching on both number and normalized title.
- The PDF parser (`js/utils/pdfParser.js`) depends on pdf.js loaded globally in `planner.html` — preserve that wiring.
- Don't delete the Firebase files until Phase 4 data migration is confirmed done.
