-- GORA Build 4: Chama targets, meeting frequency, attendance foundation
ALTER TABLE public.chamas
  ADD COLUMN IF NOT EXISTS meeting_frequency text NOT NULL DEFAULT 'weekly'
    CHECK (meeting_frequency IN ('weekly','biweekly','monthly')),
  ADD COLUMN IF NOT EXISTS weekly_savings_target numeric(12,2) NOT NULL DEFAULT 100
    CHECK (weekly_savings_target > 0);

CREATE TABLE IF NOT EXISTS public.chama_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chama_id uuid NOT NULL REFERENCES public.chamas(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  attendance_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL CHECK (status IN ('present','absent','excused')),
  recorded_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chama_id, member_id, attendance_date)
);

ALTER TABLE public.chama_attendance ENABLE ROW LEVEL SECURITY;

-- Active staff may view attendance. Admin and loan officers may record it.
DROP POLICY IF EXISTS "Active staff read chama attendance" ON public.chama_attendance;
CREATE POLICY "Active staff read chama attendance"
ON public.chama_attendance FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.id = auth.uid() AND p.active = true
  AND p.role IN ('admin','loan_officer','cashier','accountant')
));

DROP POLICY IF EXISTS "Authorised staff record chama attendance" ON public.chama_attendance;
CREATE POLICY "Authorised staff record chama attendance"
ON public.chama_attendance FOR INSERT TO authenticated
WITH CHECK (recorded_by = auth.uid() AND EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.id = auth.uid() AND p.active = true
  AND p.role IN ('admin','loan_officer')
));

GRANT SELECT, INSERT ON public.chama_attendance TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.chamas TO authenticated;


-- Allow active admin and loan officers to register members.
DROP POLICY IF EXISTS "Authorised staff register members" ON public.members;
CREATE POLICY "Authorised staff register members"
ON public.members FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.id = auth.uid() AND p.active = true
  AND p.role IN ('admin','loan_officer')
));

-- Active staff may view applications; only admin and loan officers may submit.
DROP POLICY IF EXISTS "Active staff read loan applications" ON public.loan_applications;
CREATE POLICY "Active staff read loan applications"
ON public.loan_applications FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.id = auth.uid() AND p.active = true
  AND p.role IN ('admin','loan_officer','cashier','accountant')
));

DROP POLICY IF EXISTS "Authorised staff submit loan applications" ON public.loan_applications;
CREATE POLICY "Authorised staff submit loan applications"
ON public.loan_applications FOR INSERT TO authenticated
WITH CHECK (
  status = 'pending'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.active = true
    AND p.role IN ('admin','loan_officer')
  )
);

GRANT SELECT, INSERT ON public.members TO authenticated;
GRANT SELECT, INSERT ON public.loan_applications TO authenticated;
