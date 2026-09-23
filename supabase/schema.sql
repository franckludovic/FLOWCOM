-- ============================================================
-- FlowCom - Supabase Database Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ─── PROFILES ────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid references auth.users on delete cascade primary key,
  name        text not null default '',
  email       text not null default '',
  api_key     text,
  lang        text not null default 'fr',
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "Users can view own profile"   on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.email, '')
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── COMPANIES ───────────────────────────────────────────────
create table if not exists public.companies (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.profiles(id) on delete cascade not null,
  name          text not null,
  is_active     boolean not null default false,
  -- Step 1: General Info
  industry      text not null default '',
  website       text not null default '',
  founded_year  text not null default '',
  team_size     text not null default '',
  location      text not null default '',
  short_desc    text not null default '',
  -- Step 2: Brand Identity
  mission       text not null default '',
  vision        text not null default '',
  values        text not null default '',
  -- Step 5: Communication
  tone          text not null default '',
  targets       text not null default '',
  channels      text not null default '',
  frequency     text not null default '',
  created_at    timestamptz not null default now()
);

alter table public.companies enable row level security;
create policy "Users manage own companies" on public.companies for all using (auth.uid() = user_id);

-- ─── PRODUCTS ────────────────────────────────────────────────
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references public.companies(id) on delete cascade not null,
  name        text not null default '',
  description text not null default '',
  created_at  timestamptz not null default now()
);

alter table public.products enable row level security;
create policy "Users manage own products" on public.products for all
  using (exists (select 1 from public.companies c where c.id = company_id and c.user_id = auth.uid()));

-- ─── AUDIENCE SEGMENTS ───────────────────────────────────────
create table if not exists public.audience_segments (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references public.companies(id) on delete cascade not null,
  name        text not null default '',
  pain_points text not null default '',
  interests   text not null default '',
  created_at  timestamptz not null default now()
);

alter table public.audience_segments enable row level security;
create policy "Users manage own segments" on public.audience_segments for all
  using (exists (select 1 from public.companies c where c.id = company_id and c.user_id = auth.uid()));

-- ─── KEY MESSAGES ────────────────────────────────────────────
create table if not exists public.key_messages (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references public.companies(id) on delete cascade not null,
  content     text not null default '',
  created_at  timestamptz not null default now()
);

alter table public.key_messages enable row level security;
create policy "Users manage own key messages" on public.key_messages for all
  using (exists (select 1 from public.companies c where c.id = company_id and c.user_id = auth.uid()));

-- ─── CALENDAR ITEMS ──────────────────────────────────────────
create table if not exists public.calendar_items (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references public.companies(id) on delete cascade not null,
  month       text not null,            -- e.g. "2026-10"
  post_date   date not null,
  topic       text not null default '',
  goal        text not null default '',
  format      text not null default '',
  created_at  timestamptz not null default now()
);

alter table public.calendar_items enable row level security;
create policy "Users manage own calendar" on public.calendar_items for all
  using (exists (select 1 from public.companies c where c.id = company_id and c.user_id = auth.uid()));

-- ─── LIBRARY ITEMS ───────────────────────────────────────────
create table if not exists public.library_items (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid references public.companies(id) on delete cascade not null,
  title           text not null default '',
  hook            text not null default '',
  episode_context text not null default '',
  body            text not null default '',
  conclusion      text not null default '',
  reward          text not null default '',
  cta             text not null default '',
  hashtags        text not null default '',
  visual_idea     text not null default '',
  video_script    text not null default '',
  channel         text not null default '',
  format          text not null default 'post',  -- post | carousel | video
  tone            text not null default 'professional',
  status          text not null default 'Draft', -- Draft | Validated | Published | Archived
  publish_date    date,
  created_at      timestamptz not null default now()
);

alter table public.library_items enable row level security;
create policy "Users manage own library" on public.library_items for all
  using (exists (select 1 from public.companies c where c.id = company_id and c.user_id = auth.uid()));

-- ─── ROADMAP MILESTONES ──────────────────────────────────────
create table if not exists public.roadmap_milestones (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references public.companies(id) on delete cascade not null,
  milestone_id  text not null,   -- 'm1' ... 'm15'
  completed     boolean not null default false,
  updated_at    timestamptz not null default now(),
  unique(company_id, milestone_id)
);

alter table public.roadmap_milestones enable row level security;
create policy "Users manage own roadmap" on public.roadmap_milestones for all
  using (exists (select 1 from public.companies c where c.id = company_id and c.user_id = auth.uid()));

-- ─── WEEKLY REPORTS ──────────────────────────────────────────
create table if not exists public.weekly_reports (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid references public.companies(id) on delete cascade not null,
  week_label       text not null default '',
  posts            jsonb not null default '[]',
  flowcom_score    numeric not null default 0,
  score_breakdown  jsonb,
  ai_analysis      jsonb,
  created_at       timestamptz not null default now()
);

alter table public.weekly_reports enable row level security;
create policy "Users manage own reports" on public.weekly_reports for all
  using (exists (select 1 from public.companies c where c.id = company_id and c.user_id = auth.uid()));
