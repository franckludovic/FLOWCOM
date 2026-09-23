-- Enforce the role model at the database boundary. Viewers can read company
-- data; editors, admins, and owners can write it.

begin;

create or replace function public.prevent_company_owner_reference_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'The legacy company owner reference cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_company_owner_reference_change on public.companies;
create trigger prevent_company_owner_reference_change
  before update on public.companies
  for each row execute procedure public.prevent_company_owner_reference_change();

drop policy if exists "Company members manage products" on public.products;
drop policy if exists "Company members view products" on public.products;
create policy "Company members view products" on public.products
  for select using (public.is_company_member(company_id));
create policy "Company editors manage products" on public.products
  for all
  using (public.has_company_role(company_id, array['owner', 'admin', 'editor']))
  with check (public.has_company_role(company_id, array['owner', 'admin', 'editor']));

drop policy if exists "Company members manage segments" on public.audience_segments;
drop policy if exists "Company members view segments" on public.audience_segments;
create policy "Company members view segments" on public.audience_segments
  for select using (public.is_company_member(company_id));
create policy "Company editors manage segments" on public.audience_segments
  for all
  using (public.has_company_role(company_id, array['owner', 'admin', 'editor']))
  with check (public.has_company_role(company_id, array['owner', 'admin', 'editor']));

drop policy if exists "Company members manage key messages" on public.key_messages;
drop policy if exists "Company members view key messages" on public.key_messages;
create policy "Company members view key messages" on public.key_messages
  for select using (public.is_company_member(company_id));
create policy "Company editors manage key messages" on public.key_messages
  for all
  using (public.has_company_role(company_id, array['owner', 'admin', 'editor']))
  with check (public.has_company_role(company_id, array['owner', 'admin', 'editor']));

drop policy if exists "Company members manage calendar" on public.calendar_items;
drop policy if exists "Company members view calendar" on public.calendar_items;
create policy "Company members view calendar" on public.calendar_items
  for select using (public.is_company_member(company_id));
create policy "Company editors manage calendar" on public.calendar_items
  for all
  using (public.has_company_role(company_id, array['owner', 'admin', 'editor']))
  with check (public.has_company_role(company_id, array['owner', 'admin', 'editor']));

drop policy if exists "Company members manage library" on public.library_items;
drop policy if exists "Company members view library" on public.library_items;
create policy "Company members view library" on public.library_items
  for select using (public.is_company_member(company_id));
create policy "Company editors manage library" on public.library_items
  for all
  using (public.has_company_role(company_id, array['owner', 'admin', 'editor']))
  with check (public.has_company_role(company_id, array['owner', 'admin', 'editor']));

drop policy if exists "Company members manage roadmap" on public.roadmap_milestones;
drop policy if exists "Company members view roadmap" on public.roadmap_milestones;
create policy "Company members view roadmap" on public.roadmap_milestones
  for select using (public.is_company_member(company_id));
create policy "Company editors manage roadmap" on public.roadmap_milestones
  for all
  using (public.has_company_role(company_id, array['owner', 'admin', 'editor']))
  with check (public.has_company_role(company_id, array['owner', 'admin', 'editor']));

drop policy if exists "Company members manage reports" on public.weekly_reports;
drop policy if exists "Company members view reports" on public.weekly_reports;
create policy "Company members view reports" on public.weekly_reports
  for select using (public.is_company_member(company_id));
create policy "Company editors manage reports" on public.weekly_reports
  for all
  using (public.has_company_role(company_id, array['owner', 'admin', 'editor']))
  with check (public.has_company_role(company_id, array['owner', 'admin', 'editor']));

drop policy if exists "Company members manage content scores" on public.content_scores;
drop policy if exists "Company members view content scores" on public.content_scores;
create policy "Company members view content scores" on public.content_scores
  for select using (public.is_company_member(company_id));
create policy "Company editors manage content scores" on public.content_scores
  for all
  using (public.has_company_role(company_id, array['owner', 'admin', 'editor']))
  with check (public.has_company_role(company_id, array['owner', 'admin', 'editor']));

commit;
