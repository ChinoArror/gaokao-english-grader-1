-- Drop existing tables if they exist
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS history;
DROP TABLE IF EXISTS users;

-- Users table (excluding admin, who is stored in env vars)
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT DEFAULT 'active'
);

-- Usage statistics logs
CREATE TABLE usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  timestamp INTEGER NOT NULL,
  action_type TEXT NOT NULL,
  tokens INTEGER DEFAULT 0,
  error_details TEXT
);

-- Essay grading history
CREATE TABLE history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  topic TEXT,
  original_content TEXT,
  feedback TEXT,
  task_uuid TEXT UNIQUE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE grading_tasks (
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

CREATE TABLE task_user_locks (
  user_id INTEGER PRIMARY KEY,
  task_uuid TEXT NOT NULL,
  locked_at INTEGER NOT NULL
);

-- Session management
CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER,
  role TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Create indexes for better performance
CREATE INDEX idx_history_user_id ON history(user_id);
CREATE INDEX idx_grading_tasks_user_created_at ON grading_tasks(user_id, created_at DESC);
CREATE INDEX idx_grading_tasks_status_created_at ON grading_tasks(status, created_at DESC);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
