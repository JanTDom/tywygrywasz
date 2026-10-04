-- TyWygrywasz.pl: durable account/session storage and zero-knowledge sync envelopes.
-- The API uses the server-only Supabase service role. Public client roles receive no grants.
create table if not exists public.app_users (
  id text primary key,
  name text not null check (char_length(name) between 2 and 120),
  email text not null,
  email_normalized text not null unique,
  password_hash text not null,
  password_salt text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists app_users_email_normalized_idx
  on public.app_users (email_normalized);

create table if not exists public.app_sessions (
  token_hash text primary key,
  user_id text not null references public.app_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists app_sessions_user_id_idx on public.app_sessions (user_id);
create index if not exists app_sessions_expires_at_idx on public.app_sessions (expires_at);

create table if not exists public.sync_records (
  record_id text primary key,
  user_id text not null references public.app_users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists sync_records_user_id_idx on public.sync_records (user_id);
create index if not exists sync_records_updated_at_idx on public.sync_records (updated_at);

alter table public.app_users enable row level security;
alter table public.app_sessions enable row level security;
alter table public.sync_records enable row level security;

revoke all on table public.app_users from anon, authenticated;
revoke all on table public.app_sessions from anon, authenticated;
revoke all on table public.sync_records from anon, authenticated;
