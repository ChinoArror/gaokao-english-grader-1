PRAGMA foreign_keys=OFF;

-- 1. Create new table Drop if exists
DROP TABLE IF EXISTS users_new;
DROP TABLE IF EXISTS history_new;

CREATE TABLE history_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  topic TEXT,
  original_content TEXT,
  feedback TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
INSERT INTO history_new (id, user_id, timestamp, topic, original_content, feedback) SELECT id, user_id, timestamp, topic, original_content, feedback FROM history;
DROP TABLE history;
ALTER TABLE history_new RENAME TO history;

-- 1. Create the new structure
CREATE TABLE IF NOT EXISTS users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  user_id INTEGER,
  name TEXT,
  username TEXT,
  token TEXT,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL
);

-- Insert admin record to preserve admin's name and stamp. ID is 0 to match old history user_id=0
INSERT INTO users_new (id, uuid, user_id, name, username, token, first_seen, last_seen)
VALUES (0, 'admin-uuid-placeholder', 0, 'Admin', 'admin', '', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

-- Insert the fallback user for all non-admin history. ID = 99999. Name = '99262bd4-452c-4803-8869-bedc6c839e29'
INSERT INTO users_new (id, uuid, user_id, name, username, token, first_seen, last_seen)
VALUES (99999, '99262bd4-452c-4803-8869-bedc6c839e29', 99999, '99262bd4-452c-4803-8869-bedc6c839e29', 'legacy_users', '', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

-- Migrate history and logs to the new fallback user if user_id != 0
UPDATE history SET user_id = 99999 WHERE user_id != 0;
UPDATE usage_logs SET user_id = 99999 WHERE user_id != 0;
UPDATE audio_uploads SET user_id = 99999 WHERE user_id != 0;

-- Drop old and rename
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

PRAGMA foreign_keys=ON;
