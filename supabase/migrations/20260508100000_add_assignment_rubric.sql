/*
  Optional rubric support:
  - Teachers define rubric categories at session level.
  - Teachers score each student's document across fixed performance bands.
*/

ALTER TABLE public.sessions
ADD COLUMN IF NOT EXISTS rubric_categories jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS rubric_scores jsonb NOT NULL DEFAULT '{}'::jsonb;

