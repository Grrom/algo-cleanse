CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  channel_handle TEXT,
  matched_rule_ids TEXT NOT NULL,
  score INTEGER NOT NULL,
  strictness TEXT NOT NULL,
  patterns_revision INTEGER NOT NULL,
  extension_version TEXT NOT NULL,
  browser TEXT NOT NULL
);
