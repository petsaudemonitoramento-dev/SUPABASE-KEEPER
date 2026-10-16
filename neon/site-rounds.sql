-- Monitoring rounds: three individual HTTP samples per site and cycle.
-- Existing keeper_site_logs records are retained; their round_id stays NULL.
create table if not exists keeper_site_rounds (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references keeper_sites(id) on delete cascade,
  user_id uuid not null references keeper_users(id) on delete cascade,
  source text not null check (source in ('scheduled', 'manual')),
  status text not null check (status in ('online', 'protected', 'error')),
  sample_count smallint not null default 3 check (sample_count = 3),
  success_count smallint not null check (success_count between 0 and 3),
  median_ms integer check (median_ms is null or median_ms >= 0),
  mean_ms integer check (mean_ms is null or mean_ms >= 0),
  min_ms integer check (min_ms is null or min_ms >= 0),
  max_ms integer check (max_ms is null or max_ms >= 0),
  error_message text,
  created_at timestamptz not null default now()
);

alter table keeper_sites add column if not exists check_started_at timestamptz;
alter table keeper_site_logs add column if not exists round_id uuid
  references keeper_site_rounds(id) on delete cascade;
alter table keeper_site_logs add column if not exists sample_index smallint
  check (sample_index between 1 and 3);

create index if not exists keeper_site_rounds_site_created_idx
  on keeper_site_rounds(site_id, created_at desc);
create index if not exists keeper_site_rounds_user_created_idx
  on keeper_site_rounds(user_id, created_at desc);
create unique index if not exists keeper_site_logs_round_sample_idx
  on keeper_site_logs(round_id, sample_index) where round_id is not null;
