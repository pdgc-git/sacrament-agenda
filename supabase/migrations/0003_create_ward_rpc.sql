-- Fix: a plain `insert into agenda.wards (...) returning *` (what supabase-js's
-- `.insert().select()` generates) fails RLS with "new row violates row-level security policy for
-- table wards". Cause: RETURNING re-checks the table's SELECT policy against the new row, and
-- `wards_select` depends on `agenda.my_role(id)`, which depends on the owner's `ward_users` row --
-- the one the `wards_after_insert` AFTER trigger creates. That check races the trigger's own
-- command-counter bump and loses. Verified directly in psql: the plain INSERT (no RETURNING)
-- succeeds and `my_role()` resolves correctly in a follow-up SELECT in the same transaction; only
-- the RETURNING variant fails.
--
-- Fix: wrap ward creation in a SECURITY DEFINER RPC, which bypasses RLS entirely (same pattern
-- already used for join_ward/approve_member/finalize_meeting) instead of relying on a raw client
-- insert. `wards_insert` policy stays as defense-in-depth for direct inserts with
-- `Prefer: return=minimal` (no RETURNING), but `create_ward` is the supported path.

create function agenda.create_ward(p_name text) returns agenda.wards
language plpgsql security definer set search_path = agenda, pg_temp as $$
declare result agenda.wards;
begin
  insert into agenda.wards (name, owner_id) values (p_name, auth.uid())
  returning * into result;
  return result;
end;
$$;

grant execute on function agenda.create_ward(text) to authenticated;
