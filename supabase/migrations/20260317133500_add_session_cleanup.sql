/*
  Session cleanup:
  - Add sessions.ended_at
  - Allow teachers to delete ended sessions (and their dependent rows) after the grace period
*/

ALTER TABLE public.sessions
ADD COLUMN IF NOT EXISTS ended_at timestamptz;

-- Teachers can delete their own sessions (used by client-side cleanup timer).
CREATE POLICY "Teachers can delete their own sessions"
  ON public.sessions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = teacher_id);

-- Teachers can delete documents in sessions they own.
CREATE POLICY "Teachers can delete documents in their sessions"
  ON public.documents
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.sessions s
      WHERE s.id = documents.session_id
        AND s.teacher_id = auth.uid()
    )
  );

-- Teachers can delete suggestions for documents in sessions they own.
CREATE POLICY "Teachers can delete suggestions in their sessions"
  ON public.document_suggestions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.documents d
      JOIN public.sessions s ON s.id = d.session_id
      WHERE d.id = document_suggestions.document_id
        AND s.teacher_id = auth.uid()
    )
  );

