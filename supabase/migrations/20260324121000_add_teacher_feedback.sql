-- Teacher feedback submitted after CSV export
CREATE TABLE IF NOT EXISTS teacher_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  satisfaction_rating smallint NOT NULL CHECK (satisfaction_rating BETWEEN 1 AND 4),
  navigation_ease_rating smallint NOT NULL CHECK (navigation_ease_rating BETWEEN 1 AND 4),
  off_task_detection_rating smallint NOT NULL CHECK (off_task_detection_rating BETWEEN 1 AND 4),
  distraction_elimination_rating smallint NOT NULL CHECK (distraction_elimination_rating BETWEEN 1 AND 4),
  ai_usage_detection_rating smallint NOT NULL CHECK (ai_usage_detection_rating BETWEEN 1 AND 4),
  classroom_effectiveness_rating smallint NOT NULL CHECK (classroom_effectiveness_rating BETWEEN 1 AND 5),
  classroom_changes_text text NOT NULL DEFAULT '',
  redundant_features_text text NOT NULL DEFAULT '',
  wished_features_text text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teacher_feedback_unique_session_teacher UNIQUE (session_id, teacher_id)
);

ALTER TABLE teacher_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can insert their own feedback"
  ON teacher_feedback FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can view their own feedback"
  ON teacher_feedback FOR SELECT
  TO authenticated
  USING (auth.uid() = teacher_id);

CREATE INDEX IF NOT EXISTS idx_teacher_feedback_session ON teacher_feedback(session_id);
CREATE INDEX IF NOT EXISTS idx_teacher_feedback_teacher ON teacher_feedback(teacher_id);
