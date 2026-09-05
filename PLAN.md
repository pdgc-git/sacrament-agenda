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
**Design approved 2026-09-05.** The mockup is `docs/mockups-phase3.html` (open it in a browser; it is the spec — copy its structure, labels, and palette, don't reinterpret). Follow `AGENTS.md` styling rules: plain CSS, CSS variables, no inline styles. pt-PT strings as in the mockup.

**Design decisions (settled, don't re-litigate):**
- The app is organised by the three moments of the meeting, not by data type. Screens: **Plano** (weeks ahead), **Domingo** (the week of), **Púlpito** (Sunday, at the stand), **Ausências** (Sunday, from the stand), plus **Membros**, **Administração**, **Entrada**. No Dashboard, no generic Editor.
- **Plano**: monthly grid, rows = Sundays, columns = tipo·dirige, Orador 1–3 (4th appears on demand), 1.ª Oração, Última Oração, Hinos. Each speaker cell = name + topic + invite status dot (`to_ask` · `asked` · `confirmed` · `declined`). Row status = what's missing ("Falta N"), not "Rascunho". Meeting kind: normal · fast · conference · primary · stake. Picker opens from any cell: candidates sorted never-spoke first then oldest last talk, **filter chips by gender (H/M) and group (Jovens/JA/Adultos)** (port of v1 `renderMemberPool` filters), footer shows the H·M·jovens balance for the Sunday and the month. Same picker for prayers (by last prayer) and hymns (by last sung, 3-month warning).
- **Domingo**: opens on the next Sunday. Presidência/música prefilled from ward settings (conducting rotates), program prefilled from Plano (read-only here, link to Plano). Editable here: Reconhecimentos, Anúncios, Assuntos da Ala (Desobrigações, Chamados). Right pane = A4 agenda at A4 proportion. Actions: PDF, Partilhar, Modo púlpito.
- **Agenda render is one shared function** (`js/render-agenda.js`) used by `simple.html`, Domingo's preview, and the PDF. Order is fixed: header + meta-grid (Preside, Dirige, Pianista, Regente) → Reconhecimentos → Anúncios → Hino de Abertura → Primeira Oração → Assuntos da Ala (Desobrigações, Chamados) → Hino Sacramental (`highlight-box`) → "Administração do Sacramento" → Programa (oradores antes · Hino Intermediário · oradores depois; fast Sunday = "Testemunhos da Congregação") → Hino de Encerramento → Última Oração. Empty sections hidden. Markup/classes exactly as `simple.html` + `style.css` `.agenda-paper`.
- **Púlpito**: the primary output (the agenda is read from phone/tablet, never printed). Dark surface, large type, exact meeting order, current-item marker (tap advances). Tap a speaker → move before/after the hymn, remove ("não veio"), substitute. Changes persist to the meeting. Footer: Ausências, **Terminar reunião** → total count + pre-checked list of who spoke/prayed (uncheck no-shows) + hymns sung → `finalize_meeting` (bug #2). Must work offline once loaded (cache the meeting in localStorage).
- **Ausências**: member list with one toggle each; only absences are stored (unmarked = present). Filters: all / missed last week / marked. Desktop view: 8-Sunday dot history, consecutive-absence count, threshold alert (ward setting).
- **Administração**: ward settings (presiding, conducting rotation list, organist, chorister, default speaker count, absence threshold, hymn-repeat window) + pending approvals + invite code + roles. Accounts are admin-created (no public signup).
- **Palette**: single accent = the shipped navy `#1E3A8A` on cool neutral greys; dark theme is neutral graphite with accent `#8FB4F0`. **No warm/brass/amber tones** except the hymn-repeat warning. Grey pills for "Falta N". Fonts as mockup (Fraunces headings, Source Sans 3 body, IBM Plex Mono labels; the agenda itself stays Inter).

**Schema additions (migration `0002_phase3.sql`, before building):**
- `meetings.program` items gain `topic text`, `invite_status text` (to_ask|asked|confirmed|declined, default to_ask), `asked_at date`, `position` (`before`|`after` the intermediate hymn).
- `meetings.kind text not null default 'normal' check (kind in ('normal','fast','conference','primary','stake'))` — replaces `is_fast_sunday` (keep the column, derive it, or migrate and drop).
- `agenda.absences (ward_id, meeting_date, member_id, marked_by uuid, marked_at timestamptz, primary key (ward_id, meeting_date, member_id))` + RLS like `meetings`; view `agenda.member_absence_streak`.
- `agenda.ward_settings (ward_id pk, presiding text, conducting_rotation jsonb, organist text, chorister text, default_speakers int default 3, absence_alert_after int default 3, hymn_repeat_months int default 3)`.
- `finalize_meeting` RPC takes the confirmed list (who actually spoke/prayed) and writes `program`/prayer columns accordingly before setting `status='completed'`.

**Build:**
1. Migration above; extend `dataManager.js` (`getWardSettings/saveWardSettings`, `getAbsences/markAbsence/unmarkAbsence`, `getAbsenceStreaks`, `finalizeMeeting(confirmed)`); tests.
2. Rebuild `planner.html` + split `planner-ui.js` into modules ≤400 lines: `views/plano.js`, `views/domingo.js`, `views/pulpito.js`, `views/ausencias.js`, `views/membros.js`, `views/admin.js`, `views/entrada.js`, shared `render-agenda.js`, `components/picker.js` (the filtered, ranked picker used by Plano for speakers/prayers/hymns). Every dynamic string through `escapeHtml` (bug #5); single event-delegation setup per view (bug #7); fix `formatDate` (bug #6).
3. `simple.html` switches to `render-agenda.js` but keeps its behaviour and look; re-enable the Planner card on `index.html`.
4. **Acceptance:** all v1 features reachable; join-by-code + approval, Plano grid with filtered picker, Domingo preview identical to `simple.html` output for the same data (snapshot test), Púlpito swap/remove + Terminar reunião end-to-end (history views populate), Ausências mark + streaks; Jest green with new tests for approval, finalization, render-agenda order, picker sorting/filters; no unescaped interpolation into `innerHTML` (grep check).

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
