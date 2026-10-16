-- Incremental migration: public Vercel entry-point monitoring.
-- Existing Supabase projects and their logs remain unchanged.
create table if not exists keeper_sites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references keeper_users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  site_url text not null check (site_url ~ '^https://[a-z0-9-]+[.]vercel[.]app$'),
  enabled boolean not null default true,
  last_status text not null default 'never'
    check (last_status in ('never', 'online', 'protected', 'error')),
  last_check_at timestamptz,
  last_success_at timestamptz,
  last_latency_ms integer check (last_latency_ms is null or last_latency_ms >= 0),
  last_http_status integer check (last_http_status is null or last_http_status between 100 and 599),
  last_error text,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, site_url)
);

create table if not exists keeper_site_logs (
  id bigint generated always as identity primary key,
  site_id uuid not null references keeper_sites(id) on delete cascade,
  user_id uuid not null references keeper_users(id) on delete cascade,
  status text not null check (status in ('online', 'protected', 'error')),
  source text not null check (source in ('scheduled', 'manual')),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  http_status integer check (http_status is null or http_status between 100 and 599),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists keeper_sites_user_idx on keeper_sites(user_id);
create index if not exists keeper_sites_enabled_idx on keeper_sites(enabled) where enabled = true;
create index if not exists keeper_site_logs_site_created_idx on keeper_site_logs(site_id, created_at desc);
create index if not exists keeper_site_logs_user_created_idx on keeper_site_logs(user_id, created_at desc);

-- Run for the keeper account owner(s) of the current installation.
insert into keeper_sites (user_id, name, site_url)
select id, 'MAE APS', 'https://maeaps.vercel.app' from keeper_users
on conflict (user_id, site_url) do nothing;
insert into keeper_sites (user_id, name, site_url)
select id, 'Gestário APS', 'https://gestarioaps.vercel.app' from keeper_users
on conflict (user_id, site_url) do nothing;
