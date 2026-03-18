/*
  Adds teacher-managed assignment instructions + docx template.
  Students can read instructions/template and edit the document content as usual.
*/

ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS assignment_instructions_html text NOT NULL DEFAULT '';

ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS assignment_instructions_text text NOT NULL DEFAULT '';

ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS assignment_template_html text NOT NULL DEFAULT '';

ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS assignment_template_text text NOT NULL DEFAULT '';

-- Teacher can update assignment instructions/template for their session documents
CREATE POLICY "Teachers can update assignment instructions/template"
  ON public.documents
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.sessions s
      WHERE s.id = documents.session_id
        AND s.teacher_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.sessions s
      WHERE s.id = documents.session_id
        AND s.teacher_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_documents_assignment_template_text ON public.documents(assignment_template_text);
