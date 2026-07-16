import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'biz.db');

const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS groups (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    owner_uid   TEXT NOT NULL,
    room_number TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS group_members (
    group_id    TEXT NOT NULL,
    uid         TEXT NOT NULL,
    nickname    TEXT NOT NULL DEFAULT '',
    role        INTEGER NOT NULL DEFAULT 0,
    joined_at   TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (group_id, uid),
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_group_members_uid ON group_members(uid);

  CREATE TABLE IF NOT EXISTS pinned_messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id        TEXT NOT NULL,
    message_id      TEXT NOT NULL DEFAULT '',
    message_seq     INTEGER NOT NULL DEFAULT 0,
    client_msg_no   TEXT NOT NULL DEFAULT '',
    pinned_by_uid   TEXT NOT NULL,
    content_preview TEXT NOT NULL DEFAULT '',
    message_type    INTEGER NOT NULL DEFAULT 0,
    from_uid        TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_pinned_messages_group ON pinned_messages(group_id);

  CREATE TABLE IF NOT EXISTS users (
    uid           TEXT PRIMARY KEY,
    name          TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    department    TEXT NOT NULL DEFAULT '',
    position      TEXT NOT NULL DEFAULT '',
    role          TEXT NOT NULL DEFAULT 'employee',
    status        TEXT NOT NULL DEFAULT 'active',
    preset_password INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS departments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS direct_channels (
    id          TEXT PRIMARY KEY,
    user1_uid   TEXT NOT NULL,
    user2_uid   TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user1_uid) REFERENCES users(uid),
    FOREIGN KEY (user2_uid) REFERENCES users(uid)
  );

  CREATE INDEX IF NOT EXISTS idx_direct_channels_pair ON direct_channels(
    MIN(user1_uid, user2_uid), MAX(user1_uid, user2_uid)
  );

  CREATE TABLE IF NOT EXISTS group_invitations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id    TEXT NOT NULL,
    inviter_uid TEXT NOT NULL,
    invitee_uid TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_group_invitations_unique ON group_invitations(group_id, invitee_uid);
`);

// Migrate existing databases: add new columns if they don't exist
const migrateCol = (table, col, def) => {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); } catch {}
};

migrateCol('users', 'department', "TEXT NOT NULL DEFAULT ''");
migrateCol('users', 'position', "TEXT NOT NULL DEFAULT ''");
migrateCol('users', 'role', "TEXT NOT NULL DEFAULT 'employee'");
migrateCol('users', 'status', "TEXT NOT NULL DEFAULT 'active'");
migrateCol('users', 'preset_password', 'INTEGER NOT NULL DEFAULT 0');
migrateCol('groups', 'room_number', "TEXT NOT NULL DEFAULT ''");

// Seed default department
db.prepare('INSERT OR IGNORE INTO departments (name) VALUES (?)').run('未分配');

export function getDb() {
  return db;
}
