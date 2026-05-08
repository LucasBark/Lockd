-- When sessions are removed after the grace-period cleanup, keep teacher_feedback rows.
-- Detach feedback from the deleted session (session_id → NULL) instead of CASCADE delete.

ALTER TABLE teacher_feedback DROP CONSTRAINT teacher_feedback_unique_session_teacher;
ALTER TABLE teacher_feedback DROP CONSTRAINT teacher_feedback_session_id_fkey;

ALTER TABLE teacher_feedback ALTER COLUMN session_id DROP NOT NULL;

ALTER TABLE teacher_feedback
  ADD CONSTRAINT teacher_feedback_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE SET NULL;

-- One feedback row per (session, teacher) while the session still exists.
CREATE UNIQUE INDEX teacher_feedback_session_teacher_unique
  ON public.teacher_feedback (session_id, teacher_id)
  WHERE session_id IS NOT NULL;
