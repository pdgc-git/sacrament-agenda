-- Sacrament Agenda v2 -- schema `agenda` on the shared self-hosted Supabase Postgres.
-- One schema per project convention (same stack as forwartrans-hr's `hr` schema).
-- Apply with: docker exec -i supabase-db psql -U postgres < this-file
--
-- No public signup on this stack (DISABLE_SIGNUP=true, shared with production forwartrans-hr).
-- Accounts are created out-of-band via the GoTrue admin API with the service-role key; this
-- schema only assumes the resulting rows exist in auth.users.

create schema if not exists agenda;

-- ── Tables ──────────────────────────────────────────────────────────────────

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
  invocation text, benediction text,
  is_fast_sunday boolean not null default false,
  program jsonb not null default '[]',
  recognitions jsonb not null default '[]',
  announcements jsonb not null default '[]',
  releases jsonb not null default '[]',
  callings jsonb not null default '[]',
  attendance jsonb,
  updated_at timestamptz not null default now(),
  primary key (ward_id, date)
);

create index on agenda.ward_users (user_id);
create index on agenda.members (ward_id);
create index on agenda.meetings (ward_id, status);

-- ── Owner bootstrap + protection ────────────────────────────────────────────
-- Inserting a ward auto-creates its owner's active membership row, so `ward_users` can never be
-- empty for a ward the RLS insert policy just allowed to be created.

create function agenda.wards_after_insert() returns trigger
language plpgsql security definer set search_path = agenda, pg_temp as $$
begin
  insert into agenda.ward_users (ward_id, user_id, role, status, email)
  values (new.id, new.owner_id, 'owner', 'active',
          (select email from auth.users where id = new.owner_id));
  return new;
end;
$$;

create trigger wards_after_insert
  after insert on agenda.wards
  for each row execute function agenda.wards_after_insert();

-- The owner can never be demoted, deactivated or removed by anyone (including themselves) --
-- there is no ownership-transfer flow yet, same as v1.

create function agenda.protect_owner() returns trigger
language plpgsql security definer set search_path = agenda, pg_temp as $$
begin
  if old.role = 'owner' and (new.role is distinct from 'owner' or new.status is distinct from 'active') then
    raise exception 'cannot demote or deactivate the ward owner';
  end if;
  return new;
end;
$$;

create trigger ward_users_protect_owner
  before update on agenda.ward_users
  for each row execute function agenda.protect_owner();

create function agenda.protect_owner_delete() returns trigger
language plpgsql security definer set search_path = agenda, pg_temp as $$
begin
  if old.role = 'owner' then
    raise exception 'cannot remove the ward owner';
  end if;
  return old;
end;
$$;

create trigger ward_users_protect_owner_delete
  before delete on agenda.ward_users
  for each row execute function agenda.protect_owner_delete();

-- ── Derived views (replace v1's denormalized last_talk_date/last_prayer_date writes) ───────────

create view agenda.member_last_talk as
select ward_id, (item->>'member_id')::uuid as member_id, max(date) as last_talk_date
from agenda.meetings, jsonb_array_elements(program) as item
where status = 'completed' and item->>'type' = 'speaker' and item->>'member_id' is not null
group by ward_id, (item->>'member_id')::uuid;

create view agenda.member_last_prayer as
select ward_id, member_id, max(date) as last_prayer_date
from (
  select ward_id, invocation_member_id as member_id, date from agenda.meetings
  where status = 'completed' and invocation_member_id is not null
  union all
  select ward_id, benediction_member_id as member_id, date from agenda.meetings
  where status = 'completed' and benediction_member_id is not null
) x
group by ward_id, member_id;

create view agenda.hymn_usage as
select ward_id, date, hymn_number from (
  select ward_id, date, opening_hymn as hymn_number from agenda.meetings where status = 'completed'
  union all
  select ward_id, date, sacrament_hymn as hymn_number from agenda.meetings where status = 'completed'
  union all
  select ward_id, date, closing_hymn as hymn_number from agenda.meetings where status = 'completed'
  union all
  select ward_id, date, intermediate_hymn as hymn_number from agenda.meetings where status = 'completed'
) u
where hymn_number is not null;

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table agenda.wards enable row level security;
alter table agenda.ward_users enable row level security;
alter table agenda.members enable row level security;
alter table agenda.meetings enable row level security;

create function agenda.my_role(ward uuid) returns text
language sql stable security definer set search_path = agenda, pg_temp as $$
  select role from agenda.ward_users
  where ward_id = ward and user_id = auth.uid() and status = 'active';
$$;

-- wards
create policy wards_select on agenda.wards for select
  using (exists (select 1 from agenda.ward_users wu
                 where wu.ward_id = wards.id and wu.user_id = auth.uid() and wu.status = 'active'));

create policy wards_insert on agenda.wards for insert
  with check (owner_id = auth.uid());

create policy wards_update on agenda.wards for update
  using (agenda.my_role(id) in ('owner','admin'));

-- ward_users
create policy ward_users_select on agenda.ward_users for select
  using (
    user_id = auth.uid()
    or exists (select 1 from agenda.ward_users wu
               where wu.ward_id = ward_users.ward_id and wu.user_id = auth.uid() and wu.status = 'active')
  );

create policy ward_users_insert_self on agenda.ward_users for insert
  with check (user_id = auth.uid() and role = 'viewer' and status = 'pending');

create policy ward_users_update on agenda.ward_users for update
  using (agenda.my_role(ward_id) in ('owner','admin'));

create policy ward_users_delete on agenda.ward_users for delete
  using (agenda.my_role(ward_id) in ('owner','admin'));

-- members: select for any active member, writes for editor+
create policy members_select on agenda.members for select
  using (agenda.my_role(ward_id) is not null);

create policy members_insert on agenda.members for insert
  with check (agenda.my_role(ward_id) in ('owner','admin','editor'));

create policy members_update on agenda.members for update
  using (agenda.my_role(ward_id) in ('owner','admin','editor'))
  with check (agenda.my_role(ward_id) in ('owner','admin','editor'));

create policy members_delete on agenda.members for delete
  using (agenda.my_role(ward_id) in ('owner','admin','editor'));

-- meetings: select for any active member, insert/delete for editor+, update for editor+ or music
-- (music is scope-limited to hymn columns by the trigger below).
create policy meetings_select on agenda.meetings for select
  using (agenda.my_role(ward_id) is not null);

create policy meetings_insert on agenda.meetings for insert
  with check (agenda.my_role(ward_id) in ('owner','admin','editor'));

create policy meetings_delete on agenda.meetings for delete
  using (agenda.my_role(ward_id) in ('owner','admin','editor'));

create policy meetings_update on agenda.meetings for update
  using (agenda.my_role(ward_id) in ('owner','admin','editor','music'))
  with check (agenda.my_role(ward_id) in ('owner','admin','editor','music'));

create function agenda.enforce_music_scope() returns trigger
language plpgsql security definer set search_path = agenda, pg_temp as $$
declare v_role text;
begin
  v_role := agenda.my_role(new.ward_id);
  if v_role = 'music' then
    if new.presiding is distinct from old.presiding
       or new.conducting is distinct from old.conducting
       or new.status is distinct from old.status
       or new.invocation_member_id is distinct from old.invocation_member_id
       or new.benediction_member_id is distinct from old.benediction_member_id
       or new.invocation is distinct from old.invocation
       or new.benediction is distinct from old.benediction
       or new.is_fast_sunday is distinct from old.is_fast_sunday
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

create trigger meetings_enforce_music_scope
  before update on agenda.meetings
  for each row execute function agenda.enforce_music_scope();

-- ── RPCs ─────────────────────────────────────────────────────────────────────

-- Look up a ward's public id/name by invite code, before the caller has any membership.
create function agenda.lookup_ward(code text) returns table(id uuid, name text)
language sql stable security definer set search_path = agenda, pg_temp as $$
  select id, name from agenda.wards where invite_code = code;
$$;

-- Join a ward by invite code: inserts a pending, viewer-role membership for the caller.
create function agenda.join_ward(code text) returns agenda.ward_users
language plpgsql security definer set search_path = agenda, pg_temp as $$
declare w agenda.wards; result agenda.ward_users;
begin
  select * into w from agenda.wards where invite_code = code;
  if not found then
    raise exception 'invalid invite code';
  end if;
  insert into agenda.ward_users (ward_id, user_id, role, status, email)
  values (w.id, auth.uid(), 'viewer', 'pending', (select email from auth.users where id = auth.uid()))
  returning * into result;
  return result;
end;
$$;

-- Approve a pending member and assign their role. Owner/admin only -- re-checked here (not just
-- relying on RLS) because this function is security definer and bypasses RLS.
create function agenda.approve_member(p_ward_id uuid, p_user_id uuid, p_role text)
returns agenda.ward_users
language plpgsql security definer set search_path = agenda, pg_temp as $$
declare result agenda.ward_users;
begin
  if agenda.my_role(p_ward_id) not in ('owner','admin') then
    raise exception 'not authorized';
  end if;
  if p_role not in ('admin','editor','music','viewer') then
    raise exception 'invalid role';
  end if;
  update agenda.ward_users set role = p_role, status = 'active'
  where ward_id = p_ward_id and user_id = p_user_id
  returning * into result;
  if not found then
    raise exception 'membership not found';
  end if;
  return result;
end;
$$;

-- Finalize a meeting: draft -> completed. Editor+ only (music cannot finalize).
create function agenda.finalize_meeting(p_ward_id uuid, p_date date)
returns agenda.meetings
language plpgsql security definer set search_path = agenda, pg_temp as $$
declare result agenda.meetings;
begin
  if agenda.my_role(p_ward_id) not in ('owner','admin','editor') then
    raise exception 'not authorized';
  end if;
  update agenda.meetings set status = 'completed', updated_at = now()
  where ward_id = p_ward_id and date = p_date
  returning * into result;
  if not found then
    raise exception 'meeting not found';
  end if;
  return result;
end;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────────
-- PostgREST connects as `authenticator` and switches into `anon`/`authenticated` per the JWT role
-- claim (same pattern as the `hr` schema). Grant schema usage + table/view/function privileges;
-- RLS is the real gate here, these grants just let PostgREST see the objects at all.

grant usage on schema agenda to anon, authenticated;
grant select, insert, update, delete on agenda.wards, agenda.ward_users, agenda.members, agenda.meetings
  to authenticated;
grant select on agenda.member_last_talk, agenda.member_last_prayer, agenda.hymn_usage to authenticated;
grant execute on function agenda.lookup_ward(text) to anon, authenticated;
grant execute on function agenda.join_ward(text) to authenticated;
grant execute on function agenda.approve_member(uuid, uuid, text) to authenticated;
grant execute on function agenda.finalize_meeting(uuid, date) to authenticated;
