-- Fix: `ward_users_select` queried `agenda.ward_users` from inside its own USING clause, which
-- re-triggers the same policy and Postgres rejects it as infinite recursion (42P17). Route through
-- `agenda.my_role()` instead -- it's SECURITY DEFINER (owned by the migration-running superuser),
-- so it bypasses RLS rather than re-entering it. `wards_select` switches to the same helper for
-- consistency, though it wasn't actually recursive (different table).

drop policy ward_users_select on agenda.ward_users;
create policy ward_users_select on agenda.ward_users for select
  using (user_id = auth.uid() or agenda.my_role(ward_id) is not null);

drop policy wards_select on agenda.wards;
create policy wards_select on agenda.wards for select
  using (agenda.my_role(id) is not null);
