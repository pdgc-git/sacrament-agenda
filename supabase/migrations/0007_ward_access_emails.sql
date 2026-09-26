-- Administração › Acessos showed the e-mail copied into ward_users when someone joined, which goes
-- stale when their login e-mail changes. This reads the current login e-mail from auth.users,
-- only for members of the caller's own ward. ward_users.email is no longer read by the app.
-- Apply with: docker exec -i supabase-db psql -U postgres < this-file

create function agenda.ward_access(p_ward_id uuid)
returns table (user_id uuid, role text, status text, name text, email text, joined_at timestamptz)
language sql stable security definer set search_path = agenda, pg_temp as $$
  select wu.user_id, wu.role, wu.status, wu.name, u.email::text, wu.joined_at
  from agenda.ward_users wu
  join auth.users u on u.id = wu.user_id
  where wu.ward_id = p_ward_id
    and agenda.my_role(p_ward_id) is not null;
$$;

revoke all on function agenda.ward_access(uuid) from public;
grant execute on function agenda.ward_access(uuid) to authenticated;

update agenda.ward_users wu set email = u.email from auth.users u where u.id = wu.user_id and wu.email is distinct from u.email;
