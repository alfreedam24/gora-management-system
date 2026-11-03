-- GORA: Chama creation and member assignment policies
-- Run in Supabase SQL Editor while signed in as the project owner.
-- These policies allow active admins to create/update groups and assign members.
-- Active authenticated staff can read groups and membership links.
ALTER TABLE public.chamas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chama_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "GORA staff read chamas" ON public.chamas;
CREATE POLICY "GORA staff read chamas" ON public.chamas
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.active=true));

DROP POLICY IF EXISTS "GORA admin create chamas" ON public.chamas;
CREATE POLICY "GORA admin create chamas" ON public.chamas
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.active=true AND p.role='admin'));

DROP POLICY IF EXISTS "GORA admin update chamas" ON public.chamas;
CREATE POLICY "GORA admin update chamas" ON public.chamas
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.active=true AND p.role='admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.active=true AND p.role='admin'));

DROP POLICY IF EXISTS "GORA staff read chama members" ON public.chama_members;
CREATE POLICY "GORA staff read chama members" ON public.chama_members
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.active=true));

DROP POLICY IF EXISTS "GORA admin add chama members" ON public.chama_members;
CREATE POLICY "GORA admin add chama members" ON public.chama_members
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.active=true AND p.role='admin'));

DROP POLICY IF EXISTS "GORA admin update chama members" ON public.chama_members;
CREATE POLICY "GORA admin update chama members" ON public.chama_members
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.active=true AND p.role='admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.active=true AND p.role='admin'));

-- Member list is visible to active authenticated staff; member creation remains a separate controlled workflow.
DROP POLICY IF EXISTS "GORA staff read members" ON public.members;
CREATE POLICY "GORA staff read members" ON public.members
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.active=true));
