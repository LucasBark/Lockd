-- Ensure teacher feedback survives session cleanup while preserving upsert support.
-- The app uses: upsert(..., { onConflict: 'session_id,teacher_id' }).

-- Keep feedback rows when the parent session is deleted.
ALTER TABLE public.teacher_feedback DROP CONSTRAINT IF EXISTS teacher_feedback_session_id_fkey;
ALTER TABLE public.teacher_feedback ALTER COLUMN session_id DROP NOT NULL;
ALTER TABLE public.teacher_feedback
  ADD CONSTRAINT teacher_feedback_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE SET NULL;

-- onConflict('session_id,teacher_id') requires a full unique constraint on those columns.
DROP INDEX IF EXISTS public.teacher_feedback_session_teacher_unique;
ALTER TABLE public.teacher_feedback DROP CONSTRAINT IF EXISTS teacher_feedback_unique_session_teacher;
ALTER TABLE public.teacher_feedback
  ADD CONSTRAINT teacher_feedback_unique_session_teacher UNIQUE (session_id, teacher_id);

-- upsert may perform UPDATE on conflict; allow teachers to update their own feedback.
DROP POLICY IF EXISTS "Teachers can update their own feedback" ON public.teacher_feedback;
CREATE POLICY "Teachers can update their own feedback"
  ON public.teacher_feedback
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);
