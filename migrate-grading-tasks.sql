CREATE TABLE IF NOT EXISTS grading_tasks (
  task_uuid TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  essay_type TEXT NOT NULL,
  input_method TEXT NOT NULL,
  summary_title TEXT,
  topic TEXT,
  original_content TEXT,
  transcription TEXT,
  report_json TEXT,
  error_message TEXT,
  payload_r2_key TEXT,
  history_id INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (history_id) REFERENCES history(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS task_user_locks (
  user_id INTEGER PRIMARY KEY,
  task_uuid TEXT NOT NULL,
  locked_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_grading_tasks_user_created_at
  ON grading_tasks(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_grading_tasks_status_created_at
  ON grading_tasks(status, created_at DESC);

ALTER TABLE history ADD COLUMN task_uuid TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_history_task_uuid
  ON history(task_uuid)
  WHERE task_uuid IS NOT NULL;
