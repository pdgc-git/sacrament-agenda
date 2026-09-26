-- Member availability: someone can be away / not able to speak for a while (optionally until a
-- date, with a note), or no longer in the ward. Both keep the member and their history; the
-- pickers leave out whoever moved and push whoever is away to the end.
-- Apply with: docker exec -i supabase-db psql -U postgres < this-file

alter table agenda.members
  add column status text not null default 'active' check (status in ('active', 'away', 'moved')),
  add column status_note text,
  add column away_until date;
