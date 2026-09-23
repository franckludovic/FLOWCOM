-- Company-scoped provider connections.
-- Metadata is readable by members; access tokens are service-role-only.

begin;

create table if not exists public.company_integrations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade not null,
  provider text not null check (provider in ('buffer', 'groq')),
  external_account_id text,
  external_account_name text,
  status text not null default 'connected' check (status in ('connected', 'disabled', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, provider)
);

create table if not exists public.company_integration_secrets (
  company_id uuid references public.companies(id) on delete cascade not null,
  provider text not null check (provider in ('buffer', 'groq')),
  access_token text not null,
  updated_at timestamptz not null default now(),
  primary key (company_id, provider)
);

create index if not exists company_integrations_company_idx
  on public.company_integrations(company_id);

alter table public.company_integrations enable row level security;
alter table public.company_integration_secrets enable row level security;

drop policy if exists "Company members can view integrations" on public.company_integrations;
create policy "Company members can view integrations" on public.company_integrations
  for select using (public.is_company_member(company_id));

drop policy if exists "Company admins can create integrations" on public.company_integrations;
create policy "Company admins can create integrations" on public.company_integrations
  for insert with check (public.has_company_role(company_id, array['owner', 'admin']));

drop policy if exists "Company admins can update integrations" on public.company_integrations;
create policy "Company admins can update integrations" on public.company_integrations
  for update
  using (public.has_company_role(company_id, array['owner', 'admin']))
  with check (public.has_company_role(company_id, array['owner', 'admin']));

drop policy if exists "Company admins can delete integrations" on public.company_integrations;
create policy "Company admins can delete integrations" on public.company_integrations
  for delete using (public.has_company_role(company_id, array['owner', 'admin']));

-- Deliberately no authenticated policies exist on this table. Provider tokens
-- can only be read or written by a trusted Edge Function using the service role.

commit;
