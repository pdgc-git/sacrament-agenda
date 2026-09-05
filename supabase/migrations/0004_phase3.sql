-- Phase 3 (UI redesign) schema additions. See PLAN.md §3 Phase 3.
-- Apply with: docker exec -i supabase-db psql -U postgres < this-file
--
-- 1. meetings.kind replaces the boolean is_fast_sunday (kept, derived by trigger, for compat).
-- 2. Speaker items inside meetings.program gain topic / invite_status / asked_at / position.
--    Program item shape: {type:'speaker'|'hymn', name, member_id?, topic?, invite_status?, asked_at?, position?}
--    No schema change needed for JSONB, but finalize_meeting now accepts the confirmed program.
-- 3. agenda.ward_settings: per-ward defaults that prefill Domingo (presiding, conducting rotation, music).
-- 4. agenda.absences: who was marked absent from the stand on a given Sunday (only absences are stored).
-- 5. finalize_meeting takes the confirmed list of who actually spoke/prayed + attendance.

-- ── 1. Meeting kind ─────────────────────────────────────────────────────────

alter table agenda.meetings
  add column kind text not null default 'normal'
    check (kind in ('normal','fast','conference','primary','stake'));

update agenda.meetings set kind = 'fast' where is_fast_sunday;

-- Keep is_fast_sunday in sync so v1-era readers (and the music-scope trigger) keep working.
create function agenda.meetings_sync_kind() returns trigger
language plpgsql as $$
begin
  new.is_fast_sunday := (new.kind = 'fast');
  return new;
end;
$$;

create trigger meetings_sync_kind
  before insert or update on agenda.meetings
  for each row execute function agenda.meetings_sync_kind();

-- Music role may not change the meeting kind either.
create or replace function agenda.enforce_music_scope() returns trigger
language plpgsql security definer set search_path = agenda, pg_temp as $$
declare v_role text;
begin
  v_role := agenda.my_role(new.ward_id);
  if v_role = 'music' then
    if new.presiding is distinct from old.presiding
       or new.conducting is distinct from old.conducting
       or new.status is distinct from old.status
       or new.kind is distinct from old.kind
       or new.invocation_member_id is distinct from old.invocation_member_id
       or new.benediction_member_id is distinct from old.benediction_member_id
       or new.invocation is distinct from old.invocation
       or new.benediction is distinct from old.benediction
       or new.program is distinct from old.program
       or new.recognitions is distinct from old.recognitions
       or new.announcements is distinct from old.announcements
       or new.releases is distinct from old.releases
       or new.callings is distinct from old.callings
       or new.attendance is distinct from old.attendance
    then
      raise exception 'role music may only edit hymn fields';
    end if;
  end if;
  return new;
end;
$$;

-- ── 3. Ward settings ────────────────────────────────────────────────────────

create table agenda.ward_settings (
  ward_id uuid primary key references agenda.wards(id) on delete cascade,
  presiding text,
  conducting_rotation jsonb not null default '[]',   -- ["Bispo X", "Cons. Y", "Cons. Z"] in order
  organist text,
  chorister text,
  default_speakers int not null default 3 check (default_speakers between 1 and 6),
  absence_alert_after int not null default 3 check (absence_alert_after between 1 and 12),
  hymn_repeat_months int not null default 3 check (hymn_repeat_months between 1 and 24),
  updated_at timestamptz not null default now()
);

alter table agenda.ward_settings enable row level security;

create policy ward_settings_select on agenda.ward_settings for select
  using (agenda.my_role(ward_id) is not null);

create policy ward_settings_insert on agenda.ward_settings for insert
  with check (agenda.my_role(ward_id) in ('owner','admin','editor'));

create policy ward_settings_update on agenda.ward_settings for update
  using (agenda.my_role(ward_id) in ('owner','admin','editor'))
  with check (agenda.my_role(ward_id) in ('owner','admin','editor'));

-- ── 4. Absences ─────────────────────────────────────────────────────────────

create table agenda.absences (
  ward_id uuid not null references agenda.wards(id) on delete cascade,
  meeting_date date not null,
  member_id uuid not null references agenda.members(id) on delete cascade,
  marked_by uuid references auth.users(id),
  marked_at timestamptz not null default now(),
  primary key (ward_id, meeting_date, member_id)
);

create index on agenda.absences (ward_id, member_id, meeting_date);

alter table agenda.absences enable row level security;

create policy absences_select on agenda.absences for select
  using (agenda.my_role(ward_id) is not null);

create policy absences_insert on agenda.absences for insert
  with check (agenda.my_role(ward_id) in ('owner','admin','editor'));

create policy absences_delete on agenda.absences for delete
  using (agenda.my_role(ward_id) in ('owner','admin','editor'));

-- ── 5. finalize_meeting with the confirmed program ──────────────────────────
-- The Púlpito "Terminar reunião" step pre-checks everyone on the program and lets the conductor
-- uncheck no-shows. What arrives here is what actually happened, so history views stay honest.
-- All extra parameters default to null so the Phase 2 two-argument call keeps working.

drop function agenda.finalize_meeting(uuid, date);

create function agenda.finalize_meeting(
  p_ward_id uuid,
  p_date date,
  p_program jsonb default null,
  p_invocation_member_id uuid default null,
  p_benediction_member_id uuid default null,
  p_attendance jsonb default null
) returns agenda.meetings
language plpgsql security definer set search_path = agenda, pg_temp as $$
declare result agenda.meetings;
begin
  if agenda.my_role(p_ward_id) not in ('owner','admin','editor') then
    raise exception 'not authorized';
  end if;
  update agenda.meetings set
    status = 'completed',
    program = coalesce(p_program, program),
    invocation_member_id = case when p_program is null then invocation_member_id else p_invocation_member_id end,
    benediction_member_id = case when p_program is null then benediction_member_id else p_benediction_member_id end,
    attendance = coalesce(p_attendance, attendance),
    updated_at = now()
  where ward_id = p_ward_id and date = p_date
  returning * into result;
  if not found then
    raise exception 'meeting not found';
  end if;
  return result;
end;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────────

grant select, insert, update on agenda.ward_settings to authenticated;
grant select, insert, delete on agenda.absences to authenticated;
grant execute on function agenda.finalize_meeting(uuid, date, jsonb, uuid, uuid, jsonb) to authenticated;

-- Infra gap from the Phase 2 smoke test: service_role (admin tooling via PostgREST) had no schema
-- access. The app itself never uses the service key.
grant usage on schema agenda to service_role;
grant all on all tables in schema agenda to service_role;
grant execute on all functions in schema agenda to service_role;
