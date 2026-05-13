/*
  At most one document row per student per session.
  - Deletes older duplicate rows first so the index always applies cleanly.
  - Keeps the row with latest updated_at (then created_at, then id) per (session_id, student_id).
  - document_suggestions CASCADE from documents; orphaned suggestions for deleted rows are removed.
*/
DELETE FROM public.documents d
WHERE d.id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY session_id, student_id
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
      ) AS rn
    FROM public.documents
  ) ranked
  WHERE ranked.rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS documents_session_student_unique
  ON public.documents (session_id, student_id);
