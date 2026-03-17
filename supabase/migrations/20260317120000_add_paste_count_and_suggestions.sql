/*
  Adds:
  - documents.paste_count: track number of paste events
  - document_suggestions: teacher suggestions/comments on a document
*/

ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS paste_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.document_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES public.documents(id) ON DELETE CASCADE NOT NULL,
  teacher_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  selected_text text NOT NULL DEFAULT '',
  context text NOT NULL DEFAULT '',
  suggestion text NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.document_suggestions ENABLE ROW LEVEL SECURITY;

-- Teachers can read suggestions for documents in sessions they own.
CREATE POLICY "Teachers can view suggestions for their session documents"
  ON public.document_suggestions FOR SELECT
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

-- Students can read suggestions for their own document.
CREATE POLICY "Students can view suggestions for their document"
  ON public.document_suggestions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.documents d
      WHERE d.id = document_suggestions.document_id
        AND d.student_id = auth.uid()
    )
  );

-- Teachers can create suggestions for documents in sessions they own.
CREATE POLICY "Teachers can create suggestions for their session documents"
  ON public.document_suggestions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = teacher_id
    AND EXISTS (
      SELECT 1
      FROM public.documents d
      JOIN public.sessions s ON s.id = d.session_id
      WHERE d.id = document_suggestions.document_id
        AND s.teacher_id = auth.uid()
    )
  );

-- Teachers can update (resolve) suggestions they created.
CREATE POLICY "Teachers can update their suggestions"
  ON public.document_suggestions FOR UPDATE
  TO authenticated
  USING (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.document_suggestions;

CREATE INDEX IF NOT EXISTS idx_documents_paste_count ON public.documents(paste_count);
CREATE INDEX IF NOT EXISTS idx_suggestions_document_id ON public.document_suggestions(document_id);
