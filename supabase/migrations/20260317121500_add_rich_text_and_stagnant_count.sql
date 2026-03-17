/*
  Adds:
  - documents.content_text: plain text mirror of content (for snippets/selection/search)
  - documents.stagnant_count: number of times student became stagnant (crossed inactivity threshold)
*/

ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS content_text text NOT NULL DEFAULT '';

ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS stagnant_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_documents_stagnant_count ON public.documents(stagnant_count);
