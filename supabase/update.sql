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
