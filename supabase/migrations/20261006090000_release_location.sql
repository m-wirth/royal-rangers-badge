alter table public.badge_state
  drop constraint if exists badge_state_check;

alter table public.badge_state
  add constraint badge_state_check check (
    (holder_name is null and (location is null or location in ('GLZ', 'youpj')))
    or (holder_name is not null and location is not null)
  );

drop function if exists public.release_badge(text);

create or replace function public.release_badge(p_actor_name text, p_location text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := left(trim(regexp_replace(p_actor_name, '\s+', ' ', 'g')), 60);
begin
  if clean_name is null or char_length(clean_name) < 1 then
    raise exception 'Name fehlt';
  end if;
  if p_location not in ('GLZ', 'youpj') then
    raise exception 'Ungültiger Ablageort';
  end if;

  insert into public.badge_state (id, holder_name, location, updated_by, updated_at)
  values (1, null, p_location, clean_name, now())
  on conflict (id) do update set
    holder_name = null,
    location = excluded.location,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  insert into public.badge_history (actor_name, holder_name, location, action)
  values (clean_name, null, p_location, 'released');
end;
$$;

revoke all on function public.release_badge(text, text) from public;
grant execute on function public.release_badge(text, text) to anon, authenticated;
