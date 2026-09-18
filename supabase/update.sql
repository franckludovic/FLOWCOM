ALTER TABLE public.calendar_items ADD COLUMN IF NOT EXISTS channel text not null default 'linkedin'; ALTER TABLE public.calendar_items ADD COLUMN IF NOT EXISTS status text not null default 'idea';

-- Keep the AI secret inaccessible to browser roles. The deployed Edge Function
-- reads it with SUPABASE_SERVICE_ROLE_KEY after authenticating the user.
REVOKE SELECT (api_key) ON public.profiles FROM anon, authenticated;

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
	FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
	FOR INSERT WITH CHECK (auth.uid() = id);

-- Make ownership checks explicit for tables that accept writes.
DROP POLICY IF EXISTS "Users manage own companies" ON public.companies;
CREATE POLICY "Users manage own companies" ON public.companies
	FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own products" ON public.products;
CREATE POLICY "Users manage own products" ON public.products
	FOR ALL USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()))
	WITH CHECK (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users manage own segments" ON public.audience_segments;
CREATE POLICY "Users manage own segments" ON public.audience_segments
	FOR ALL USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()))
	WITH CHECK (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users manage own library" ON public.library_items;
CREATE POLICY "Users manage own library" ON public.library_items
	FOR ALL USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()))
	WITH CHECK (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users manage own calendar" ON public.calendar_items;
CREATE POLICY "Users manage own calendar" ON public.calendar_items
	FOR ALL USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()))
	WITH CHECK (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users manage own roadmap" ON public.roadmap_milestones;
CREATE POLICY "Users manage own roadmap" ON public.roadmap_milestones
	FOR ALL USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()))
	WITH CHECK (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users manage own key messages" ON public.key_messages;
CREATE POLICY "Users manage own key messages" ON public.key_messages
	FOR ALL USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()))
	WITH CHECK (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users manage own reports" ON public.weekly_reports;
CREATE POLICY "Users manage own reports" ON public.weekly_reports
	FOR ALL USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()))
	WITH CHECK (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()));

-- ─── CONTENT SCORES ──────────────────────────────────────────
-- AI-generated quality scores for library items.
-- Kept separate from library_items to avoid schema churn on the main table.
create table if not exists public.content_scores (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references public.companies(id) on delete cascade not null,
  item_id     uuid not null,   -- references library_items.id (soft ref — no FK so deletes don't cascade errors)
  score       text not null,   -- 'ready' | 'good' | 'needs-work'
  scored_at   timestamptz not null default now(),
  unique(company_id, item_id)
);

alter table public.content_scores enable row level security;
create policy "Users manage own content scores" on public.content_scores for all
  using (exists (select 1 from public.companies c where c.id = company_id and c.user_id = auth.uid()));
