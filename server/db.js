// SQLite database (sql.js / WebAssembly — no native build tools required).
// The whole DB lives in memory and is flushed to disk atomically after writes.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);

let SQL = null;
let db = null;
let filePath = null;
let saveTimer = null;
let dirty = false;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL DEFAULT 0,
  coins INTEGER NOT NULL DEFAULT 300,
  wins INTEGER NOT NULL DEFAULT 0,
  matches INTEGER NOT NULL DEFAULT 0,
  elims INTEGER NOT NULL DEFAULT 0,
  avatar_color TEXT NOT NULL DEFAULT '#4cc9f0',
  avatar_hat TEXT NOT NULL DEFAULT 'none',
  avatar_face TEXT NOT NULL DEFAULT 'happy'
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS friendships (
  requester_id INTEGER NOT NULL,
  addressee_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (requester_id, addressee_id)
);
CREATE INDEX IF NOT EXISTS idx_friend_addr ON friendships(addressee_id);
CREATE TABLE IF NOT EXISTS blocks (
  blocker_id INTEGER NOT NULL,
  blocked_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);
CREATE TABLE IF NOT EXISTS mutes (
  user_id INTEGER NOT NULL,
  muted_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, muted_id)
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL,
  reported_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  message TEXT,
  channel TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS skins_owned (
  user_id INTEGER NOT NULL,
  skin_id TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  acquired_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, skin_id)
);
CREATE TABLE IF NOT EXISTS skins_equipped (
  user_id INTEGER NOT NULL,
  weapon TEXT NOT NULL,
  skin_id TEXT NOT NULL,
  PRIMARY KEY (user_id, weapon)
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  request_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  amount INTEGER NOT NULL,
  result TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, request_id)
);
CREATE TABLE IF NOT EXISTS match_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  match_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  map TEXT NOT NULL,
  placement INTEGER NOT NULL,
  won INTEGER NOT NULL,
  elims INTEGER NOT NULL,
  coins INTEGER NOT NULL,
  practice INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, match_id)
);
CREATE INDEX IF NOT EXISTS idx_history_user ON match_history(user_id, created_at);
CREATE TABLE IF NOT EXISTS mode_stats (
  user_id INTEGER NOT NULL,
  mode TEXT NOT NULL,
  wins INTEGER NOT NULL DEFAULT 0,
  matches INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, mode)
);
`;

export async function openDb(file) {
  if (!SQL) {
    const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
    SQL = await initSqlJs({ locateFile: () => wasmPath });
  }
  filePath = file;
  if (file && file !== ':memory:' && fs.existsSync(file)) {
    db = new SQL.Database(fs.readFileSync(file));
  } else {
    db = new SQL.Database();
  }
  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec(SCHEMA);
  if (file && file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    flush();
  }
  return api;
}

function scheduleSave() {
  dirty = true;
  if (!filePath || filePath === ':memory:') return;
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; flush(); }, 250);
}

export function flush() {
  if (!db || !filePath || filePath === ':memory:') return;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  const data = db.export();
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, Buffer.from(data));
  fs.renameSync(tmp, filePath);
  dirty = false;
}

let inTx = 0;

function run(sql, params = []) {
  db.run(sql, params);
  const changes = db.getRowsModified();
  let lastId = 0;
  if (/^\s*insert/i.test(sql)) {
    const r = db.exec('SELECT last_insert_rowid() AS id');
    lastId = r.length ? r[0].values[0][0] : 0;
  }
  if (!inTx) scheduleSave();
  return { changes, lastId };
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

function get(sql, params = []) {
  return all(sql, params)[0];
}

// Runs fn inside a transaction. Throwing rolls everything back.
function tx(fn) {
  if (inTx) return fn();
  db.exec('BEGIN');
  inTx++;
  try {
    const r = fn();
    db.exec('COMMIT');
    inTx--;
    scheduleSave();
    return r;
  } catch (e) {
    inTx--;
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw e;
  }
}

export const api = { run, all, get, tx, flush, isDirty: () => dirty };
export default api;
