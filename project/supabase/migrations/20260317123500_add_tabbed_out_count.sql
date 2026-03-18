/*
  Adds:
  - documents.tabbed_out_count: number of times student became inactive via browser tab switch.
*/

ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS tabbed_out_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_documents_tabbed_out_count ON public.documents(tabbed_out_count);

