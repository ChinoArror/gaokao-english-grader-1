-- Drop existing tables if they exist
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS history;
DROP TABLE IF EXISTS users;

-- Users table (excluding admin, who is stored in env vars)
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Essay grading history
CREATE TABLE history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  topic TEXT,
  original_content TEXT,
  feedback TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
