/*
  Session-level assignment template so teachers can set it before students join.
*/

ALTER TABLE public.sessions
ADD COLUMN IF NOT EXISTS assignment_template_html text NOT NULL DEFAULT '';

ALTER TABLE public.sessions
ADD COLUMN IF NOT EXISTS assignment_template_text text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_sessions_assignment_template_text ON public.sessions(assignment_template_text);

