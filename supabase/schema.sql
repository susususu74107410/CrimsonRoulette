-- ============================================================================
-- 칩 게임 (Chip Game) — Supabase/Postgres 스키마
-- Supabase 대시보드 > SQL Editor 에서 이 파일 전체를 그대로 실행하세요.
--
-- 보안 모델:
--   모든 테이블은 Row Level Security(RLS)를 켜두고 정책은 하나도 만들지 않습니다.
--   즉 anon/authenticated 키로는 어떤 테이블도 직접 읽거나 쓸 수 없고,
--   오직 서비스 롤 키(SUPABASE_SERVICE_ROLE_KEY)를 쓰는 Edge Function에서만
--   접근이 가능합니다. 칩 가치처럼 숨겨야 하는 값은 이 방식으로만 보호됩니다.
--   (프론트엔드는 절대 service role 키를 포함해서는 안 됩니다.)
-- ============================================================================

-- 팀 -------------------------------------------------------------------------
create table if not exists teams (
  id serial primary key,
  name text not null unique
);

-- 러너(참여자) -----------------------------------------------------------------
create table if not exists runners (
  id text primary key,                 -- 로그인 ID (관리자가 발급)
  password_hash text not null,         -- bcrypt 해시
  display_name text not null,
  team_id int references teams(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 로그인 세션(자체 토큰 방식) -----------------------------------------------------
create table if not exists sessions (
  token text primary key,
  runner_id text not null references runners(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists idx_sessions_expires on sessions(expires_at);

-- 관리자 세션 ------------------------------------------------------------------
create table if not exists admin_sessions (
  token text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- 칩 색상별 설정 & 현재 가치(비공개) ------------------------------------------------
create table if not exists chip_config (
  color text primary key check (color in ('red','blue','green','yellow','white')),
  value numeric not null default 1 check (value > 0),
  min_value numeric not null default 1,
  max_value numeric not null default 100
);
insert into chip_config (color, value, min_value, max_value) values
  ('red', 5, 1, 100),
  ('blue', 8, 1, 100),
  ('green', 12, 1, 100),
  ('yellow', 20, 1, 100),
  ('white', 3, 1, 100)
on conflict (color) do nothing;

-- 러너별 칩 보유량 --------------------------------------------------------------
create table if not exists chip_balances (
  runner_id text not null references runners(id) on delete cascade,
  color text not null references chip_config(color),
  count int not null default 0 check (count >= 0),
  primary key (runner_id, color)
);

-- NVP(시스템 상대) 플레이 기록 — 일일 3회 제한 계산용 --------------------------------
create table if not exists nvp_play_log (
  id bigserial primary key,
  runner_id text not null references runners(id) on delete cascade,
  game text not null check (game in ('highlow','roulette','redblack','blackjack','russian')),
  play_date date not null default (now() at time zone 'utc')::date,
  bet_color text references chip_config(color),
  bet_amount int not null default 0,
  outcome text not null,          -- 'win' | 'lose' | 'push'
  chip_delta int not null,        -- 순증감 (음수 가능)
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_nvp_runner_game_date on nvp_play_log(runner_id, game, play_date);

-- PVP(러너 대 러너) 세션 --------------------------------------------------------
create table if not exists pvp_sessions (
  code text primary key,
  game text not null check (game in ('blackjack','highlow')),
  creator_id text not null references runners(id) on delete cascade,
  bet_color text not null references chip_config(color),
  bet_amount int not null check (bet_amount > 0),
  joiner_id text references runners(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting','finished','expired','cancelled')),
  result jsonb,
  winner_id text references runners(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  finished_at timestamptz
);
create index if not exists idx_pvp_status on pvp_sessions(status);

-- 칩 환전 기록 -----------------------------------------------------------------
create table if not exists exchange_log (
  id bigserial primary key,
  runner_id text not null references runners(id) on delete cascade,
  from_color text not null references chip_config(color),
  from_amount int not null,
  to_color text not null references chip_config(color),
  to_amount int not null,
  created_at timestamptz not null default now()
);

-- 상점(아이템) 전역 사용 횟수 — 5개 아이템 공통 누적치 ---------------------------------
create table if not exists shop_usage (
  id int primary key default 1,
  global_use_count int not null default 0,
  constraint single_row check (id = 1)
);
insert into shop_usage (id, global_use_count) values (1, 0) on conflict (id) do nothing;

-- 쿨다운이 있는 두 아이템의 마지막 사용 시각(전원 공유) --------------------------------
create table if not exists shop_cooldowns (
  item_key text primary key check (item_key in ('change_value','full_swap')),
  last_used_by text references runners(id),
  last_used_at timestamptz
);
insert into shop_cooldowns (item_key, last_used_at) values
  ('change_value', null),
  ('full_swap', null)
on conflict (item_key) do nothing;

-- 아이템 사용 로그 (전체 공개 로그 + 개인 로그의 원천) --------------------------------
create table if not exists item_log (
  id bigserial primary key,
  item_key text not null check (item_key in ('change_value','full_swap','check_total','check_values','check_ranking')),
  actor_id text not null references runners(id) on delete cascade,
  target_id text references runners(id),      -- 지정 대상이 있는 아이템만
  paid_color text references chip_config(color),
  paid_amount int not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_item_log_created on item_log(created_at desc);

-- 고정 아이템 순위(1=최고가 배정) — 색상은 실행 시점의 현재 가치 순위로 동적으로 정해짐 -------
-- (item_key, rank) 는 코드에서 상수로 관리하므로 별도 테이블 불필요.

-- RLS 활성화, 정책 없음 = anon/authenticated 로는 전부 차단 ---------------------------
alter table teams enable row level security;
alter table runners enable row level security;
alter table sessions enable row level security;
alter table admin_sessions enable row level security;
alter table chip_config enable row level security;
alter table chip_balances enable row level security;
alter table nvp_play_log enable row level security;
alter table pvp_sessions enable row level security;
alter table exchange_log enable row level security;
alter table shop_usage enable row level security;
alter table shop_cooldowns enable row level security;
alter table item_log enable row level security;
