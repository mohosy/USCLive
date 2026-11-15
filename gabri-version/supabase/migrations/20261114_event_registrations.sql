-- Event registration: table definitions matching src/lib/types.ts (RegistrationType, Registration).
--
-- IMPORTANT: the app does not read these tables yet. Today all state, registrations included, is kept in
-- the single `app_state` row (src/lib/state.ts), so registration already persists whenever Supabase is
-- configured. These tables are the normalised shape to move to when events leave that row.
--
-- Access: row level security is on and there are no policies, so only the server (service role key)
-- can read or write. The browser never talks to these tables.

do $$ begin
  create type public.registration_type as enum ('native', 'handshake', 'engage', 'external');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.registration_status as enum ('registered', 'waitlisted', 'self-reported', 'cancelled');
exception when duplicate_object then null; end $$;

-- One row per event that takes registrations (the registration fields of CampusEvent).
create table if not exists public.event_registration_settings (
  event_id               text primary key,
  registration_type      public.registration_type not null,
  capacity               integer check (capacity is null or capacity > 0),
  registration_deadline  timestamptz,
  -- handshake / engage / external: the official sign-up page. native: the original listing ("Official page").
  external_url           text check (external_url is null or external_url ~ '^https://'),
  updated_at             timestamptz not null default now()
);

-- One row per person per event. Cancelling keeps the row (status 'cancelled'); registering again reuses it.
create table if not exists public.registrations (
  id          text primary key,
  event_id    text not null references public.event_registration_settings (event_id) on delete cascade,
  user_id     text not null,
  status      public.registration_status not null,
  -- when this person last joined the list: the waitlist is served in this order
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (event_id, user_id)
);

create index if not exists registrations_event_status_idx on public.registrations (event_id, status, created_at);
create index if not exists registrations_user_idx on public.registrations (user_id);

alter table public.event_registration_settings enable row level security;
alter table public.registrations enable row level security;
