/*
  Session-level class setup:
  - assignment_instructions_html/text
  - todo_list_json (array of tasks with completed status)
*/

ALTER TABLE public.sessions
ADD COLUMN IF NOT EXISTS assignment_instructions_html text NOT NULL DEFAULT '';

ALTER TABLE public.sessions
ADD COLUMN IF NOT EXISTS assignment_instructions_text text NOT NULL DEFAULT '';

ALTER TABLE public.sessions
ADD COLUMN IF NOT EXISTS todo_list_json jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS todo_list_json jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Teachers can update per-student todo list.
-- (We intentionally allow UPDATE so teachers can override tasks; students are still limited by their own UI.)
CREATE POLICY "Teachers can update student todo list"
  ON public.documents FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = documents.session_id
        AND s.teacher_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = documents.session_id
        AND s.teacher_id = auth.uid()
    )
  );

