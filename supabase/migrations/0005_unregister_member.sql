-- Take someone off the roster without losing what they did: visitors (stake leaders, missionaries,
-- family from another ward) keep their talks and prayers on past meetings by name only.
-- Apply with: docker exec -i supabase-db psql -U postgres < this-file

create function agenda.unregister_member(p_member_id uuid) returns void
language plpgsql security definer set search_path = agenda, pg_temp as $$
declare v_ward uuid; v_name text;
begin
  select ward_id, name into v_ward, v_name from agenda.members where id = p_member_id;
  if v_ward is null then raise exception 'member not found'; end if;
  if agenda.my_role(v_ward) is distinct from 'owner'
     and agenda.my_role(v_ward) is distinct from 'admin'
     and agenda.my_role(v_ward) is distinct from 'editor' then
    raise exception 'not allowed';
  end if;

  -- Talks: keep the item and its name, drop the link.
  update agenda.meetings m set program = (
      select jsonb_agg(case when i->>'member_id' = p_member_id::text
                            then jsonb_set(i, '{member_id}', 'null'::jsonb) else i end order by o)
      from jsonb_array_elements(m.program) with ordinality as x(i, o))
    where m.ward_id = v_ward and m.program @> jsonb_build_array(jsonb_build_object('member_id', p_member_id::text));

  -- Prayers: keep the name as text.
  update agenda.meetings set invocation = coalesce(nullif(invocation, ''), v_name), invocation_member_id = null
    where ward_id = v_ward and invocation_member_id = p_member_id;
  update agenda.meetings set benediction = coalesce(nullif(benediction, ''), v_name), benediction_member_id = null
    where ward_id = v_ward and benediction_member_id = p_member_id;

  delete from agenda.members where id = p_member_id; -- absences go with it (on delete cascade)
end;
$$;

revoke all on function agenda.unregister_member(uuid) from public;
grant execute on function agenda.unregister_member(uuid) to authenticated;
