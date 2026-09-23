-- Allow a member to display the names/emails of teammates in the same
-- company, without making all profiles directory-readable.

begin;

drop policy if exists "Company members can view teammate profiles" on public.profiles;
create policy "Company members can view teammate profiles" on public.profiles
  for select using (
    auth.uid() = id
    or exists (
      select 1
      from public.company_members target_membership
      where target_membership.user_id = public.profiles.id
        and public.is_company_member(target_membership.company_id)
    )
  );

commit;
