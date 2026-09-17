ALTER TABLE public.calendar_items ADD COLUMN IF NOT EXISTS channel text not null default 'linkedin'; ALTER TABLE public.calendar_items ADD COLUMN IF NOT EXISTS status text not null default 'idea';
