-- Support for the accounts service (server/agenda-accounts): ward admins create logins and reset
-- passwords from Administração without anyone touching the server.
-- Apply with: docker exec -i supabase-db psql -U postgres < this-file

-- The service needs to find an existing login by e-mail (GoTrue's admin API has no lookup by
-- e-mail). Only the service role may call it.
create function agenda.find_user_id(p_email text) returns uuid
language sql stable security definer set search_path = auth, pg_temp as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;
revoke all on function agenda.find_user_id(text) from public, anon, authenticated;
grant execute on function agenda.find_user_id(text) to service_role;

-- Acessos also says whether a login was created from this app (app_metadata.agenda_managed, which
-- only the service role can set): only those can have their password reset by a ward admin, so a
-- ward admin can never reset the password of someone's forwartrans-hr login.
drop function agenda.ward_access(uuid);
create function agenda.ward_access(p_ward_id uuid)
returns table (user_id uuid, role text, status text, name text, email text, joined_at timestamptz, managed boolean)
language sql stable security definer set search_path = agenda, pg_temp as $$
  select wu.user_id, wu.role, wu.status, coalesce(wu.name, u.raw_user_meta_data->>'name'), u.email::text, wu.joined_at,
         coalesce((u.raw_app_meta_data->>'agenda_managed')::boolean, false)
  from agenda.ward_users wu
  join auth.users u on u.id = wu.user_id
  where wu.ward_id = p_ward_id
    and agenda.my_role(p_ward_id) is not null;
$$;
revoke all on function agenda.ward_access(uuid) from public;
grant execute on function agenda.ward_access(uuid) to authenticated;
