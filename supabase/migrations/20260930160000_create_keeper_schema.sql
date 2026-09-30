-- Supabase Keeper - schema do control plane
-- Pode ser aplicado em um projeto Supabase dedicado no futuro.

create table if not exists public.keeper_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  password_hash text not null,
  password_salt text not null,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.keeper_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.keeper_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.keeper_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.keeper_users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  project_url text not null check (project_url ~ '^https://'),
  key_ciphertext text not null,
  ping_path text not null default '/rest/v1/rpc/keeper_ping'
    check (ping_path ~ '^/'),
  enabled boolean not null default true,
  last_status text not null default 'never'
    check (last_status in ('never', 'online', 'error')),
  last_ping_at timestamptz,
  last_success_at timestamptz,
  last_latency_ms integer check (last_latency_ms is null or last_latency_ms >= 0),
  last_http_status integer check (last_http_status is null or last_http_status between 100 and 599),
  last_error text,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, project_url)
);

create table if not exists public.keeper_ping_logs (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.keeper_projects(id) on delete cascade,
  user_id uuid not null references public.keeper_users(id) on delete cascade,
  status text not null check (status in ('online', 'error')),
  source text not null default 'scheduled'
    check (source in ('scheduled', 'manual')),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  http_status integer check (http_status is null or http_status between 100 and 599),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists keeper_sessions_user_id_idx
  on public.keeper_sessions(user_id);

create index if not exists keeper_sessions_expires_at_idx
  on public.keeper_sessions(expires_at);

create index if not exists keeper_projects_user_id_idx
  on public.keeper_projects(user_id);

create index if not exists keeper_projects_enabled_idx
  on public.keeper_projects(enabled)
  where enabled = true;

create index if not exists keeper_ping_logs_project_created_idx
  on public.keeper_ping_logs(project_id, created_at desc);

create index if not exists keeper_ping_logs_user_created_idx
  on public.keeper_ping_logs(user_id, created_at desc);

alter table public.keeper_users enable row level security;
alter table public.keeper_sessions enable row level security;
alter table public.keeper_projects enable row level security;
alter table public.keeper_ping_logs enable row level security;

revoke all on table public.keeper_users from anon, authenticated;
revoke all on table public.keeper_sessions from anon, authenticated;
revoke all on table public.keeper_projects from anon, authenticated;
revoke all on table public.keeper_ping_logs from anon, authenticated;

drop policy if exists "keeper_users_server_only" on public.keeper_users;
drop policy if exists "keeper_sessions_server_only" on public.keeper_sessions;
drop policy if exists "keeper_projects_server_only" on public.keeper_projects;
drop policy if exists "keeper_ping_logs_server_only" on public.keeper_ping_logs;

create policy "keeper_users_server_only"
on public.keeper_users
for all
to anon, authenticated
using (false)
with check (false);

create policy "keeper_sessions_server_only"
on public.keeper_sessions
for all
to anon, authenticated
using (false)
with check (false);

create policy "keeper_projects_server_only"
on public.keeper_projects
for all
to anon, authenticated
using (false)
with check (false);

create policy "keeper_ping_logs_server_only"
on public.keeper_ping_logs
for all
to anon, authenticated
using (false)
with check (false);
