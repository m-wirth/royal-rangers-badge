-- Im Supabase SQL Editor einmalig ausführen.
-- Das Schema erlaubt anonymes Lesen und ausschliesslich validierte Statusänderungen per RPC.

create table if not exists public.badge_state (
  id smallint primary key default 1 check (id = 1),
  holder_name text check (holder_name is null or char_length(holder_name) between 1 and 60),
  location text check (location is null or location in ('GLZ', 'youpj', 'abwesend')),
  updated_by text not null,
  updated_at timestamptz not null default now(),
  check (
    (holder_name is null and (location is null or location in ('GLZ', 'youpj')))
    or (holder_name is not null and location is not null)
  )
);

create table if not exists public.badge_history (
  id bigint generated always as identity primary key,
  actor_name text not null check (char_length(actor_name) between 1 and 60),
  holder_name text check (holder_name is null or char_length(holder_name) between 1 and 60),
  location text check (location is null or location in ('GLZ', 'youpj', 'abwesend')),
  action text not null check (action in ('claimed', 'released')),
  created_at timestamptz not null default now()
);

alter table public.badge_state enable row level security;
alter table public.badge_history enable row level security;

drop policy if exists "Status ist öffentlich lesbar" on public.badge_state;
create policy "Status ist öffentlich lesbar"
  on public.badge_state for select
  to anon, authenticated
  using (true);

drop policy if exists "Logbuch ist öffentlich lesbar" on public.badge_history;
create policy "Logbuch ist öffentlich lesbar"
  on public.badge_history for select
  to anon, authenticated
  using (true);

create or replace function public.claim_badge(p_holder_name text, p_location text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := left(trim(regexp_replace(p_holder_name, '\s+', ' ', 'g')), 60);
begin
  if clean_name is null or char_length(clean_name) < 1 then
    raise exception 'Name fehlt';
  end if;
  if p_location not in ('GLZ', 'youpj', 'abwesend') then
    raise exception 'Ungültiger Standort';
  end if;

  insert into public.badge_state (id, holder_name, location, updated_by, updated_at)
  values (1, clean_name, p_location, clean_name, now())
  on conflict (id) do update set
    holder_name = excluded.holder_name,
    location = excluded.location,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  insert into public.badge_history (actor_name, holder_name, location, action)
  values (clean_name, clean_name, p_location, 'claimed');
end;
$$;

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

revoke all on function public.claim_badge(text, text) from public;
revoke all on function public.release_badge(text, text) from public;
grant execute on function public.claim_badge(text, text) to anon, authenticated;
grant execute on function public.release_badge(text, text) to anon, authenticated;

grant select on public.badge_state to anon, authenticated;
grant select on public.badge_history to anon, authenticated;

insert into public.badge_state (id, holder_name, location, updated_by)
values (1, null, null, 'System')
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'badge_state'
  ) then
    alter publication supabase_realtime add table public.badge_state;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'badge_history'
  ) then
    alter publication supabase_realtime add table public.badge_history;
  end if;
end $$;
