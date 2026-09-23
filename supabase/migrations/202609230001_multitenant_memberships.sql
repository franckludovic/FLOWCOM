-- FlowCom multi-tenant foundation
-- Adds company membership and role-based access while preserving existing
-- companies.user_id rows as the legacy owner reference.

begin;

create table if not exists public.company_members (
  company_id uuid references public.companies(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text not null default 'editor' check (role in ('owner', 'admin', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create index if not exists company_members_user_idx on public.company_members(user_id);
create index if not exists company_members_company_idx on public.company_members(company_id);

alter table public.company_members enable row level security;

create or replace function public.is_company_member(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members
    where company_id = target_company_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.has_company_role(
  target_company_id uuid,
  required_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members
    where company_id = target_company_id
      and user_id = auth.uid()
      and role = any(required_roles)
  );
$$;

-- Existing company owners become owner members without changing their data.
insert into public.company_members (company_id, user_id, role)
select id, user_id, 'owner'
from public.companies
on conflict (company_id, user_id) do nothing;

create or replace function public.seed_company_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.company_members (company_id, user_id, role)
  values (new.id, new.user_id, 'owner')
  on conflict (company_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists seed_company_owner_membership on public.companies;
create trigger seed_company_owner_membership
  after insert on public.companies
  for each row execute procedure public.seed_company_owner_membership();

drop policy if exists "Company members can view memberships" on public.company_members;
create policy "Company members can view memberships" on public.company_members
  for select using (public.is_company_member(company_id));

drop policy if exists "Company admins can add memberships" on public.company_members;
create policy "Company admins can add memberships" on public.company_members
  for insert with check (
    (role <> 'owner' and public.has_company_role(company_id, array['owner', 'admin']))
    or (role = 'owner' and public.has_company_role(company_id, array['owner']))
  );

drop policy if exists "Company admins can update memberships" on public.company_members;
create policy "Company admins can update memberships" on public.company_members
  for update
  using (
    (role <> 'owner' and public.has_company_role(company_id, array['owner', 'admin']))
    or (role = 'owner' and public.has_company_role(company_id, array['owner']))
  )
  with check (
    (role <> 'owner' and public.has_company_role(company_id, array['owner', 'admin']))
    or (role = 'owner' and public.has_company_role(company_id, array['owner']))
  );

drop policy if exists "Company admins can remove memberships" on public.company_members;
create policy "Company admins can remove memberships" on public.company_members
  for delete using (
    (role <> 'owner' and public.has_company_role(company_id, array['owner', 'admin']))
    or (role = 'owner' and public.has_company_role(company_id, array['owner']))
  );

-- Companies are now visible to members. Only owners/admins can edit them;
-- only owners can delete them.
drop policy if exists "Users manage own companies" on public.companies;
drop policy if exists "Company members can view companies" on public.companies;
create policy "Company members can view companies" on public.companies
  for select using (public.is_company_member(id));

drop policy if exists "Users can create companies" on public.companies;
create policy "Users can create companies" on public.companies
  for insert with check (auth.uid() = user_id);

drop policy if exists "Company admins can update companies" on public.companies;
create policy "Company admins can update companies" on public.companies
  for update
  using (public.has_company_role(id, array['owner', 'admin']))
  with check (public.is_company_member(id));

drop policy if exists "Company owners can delete companies" on public.companies;
create policy "Company owners can delete companies" on public.companies
  for delete using (public.has_company_role(id, array['owner']));

-- All company-owned product data now follows membership instead of the
-- single-owner companies.user_id check.
drop policy if exists "Users manage own products" on public.products;
create policy "Company members manage products" on public.products
  for all using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

drop policy if exists "Users manage own segments" on public.audience_segments;
create policy "Company members manage segments" on public.audience_segments
  for all using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

drop policy if exists "Users manage own key messages" on public.key_messages;
create policy "Company members manage key messages" on public.key_messages
  for all using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

drop policy if exists "Users manage own calendar" on public.calendar_items;
create policy "Company members manage calendar" on public.calendar_items
  for all using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

drop policy if exists "Users manage own library" on public.library_items;
create policy "Company members manage library" on public.library_items
  for all using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

drop policy if exists "Users manage own roadmap" on public.roadmap_milestones;
create policy "Company members manage roadmap" on public.roadmap_milestones
  for all using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

drop policy if exists "Users manage own reports" on public.weekly_reports;
create policy "Company members manage reports" on public.weekly_reports
  for all using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

create table if not exists public.content_scores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade not null,
  item_id uuid not null,
  score text not null,
  scored_at timestamptz not null default now(),
  unique(company_id, item_id)
);
alter table public.content_scores enable row level security;
drop policy if exists "Users manage own content scores" on public.content_scores;
create policy "Company members manage content scores" on public.content_scores
  for all using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

commit;
