import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
export function openDb(path = process.env.DB_PATH || 'data/ashour.sqlite') {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY);
 CREATE TABLE IF NOT EXISTS teams(id INTEGER PRIMARY KEY,code TEXT UNIQUE NOT NULL,name TEXT UNIQUE NOT NULL,color TEXT NOT NULL,status TEXT DEFAULT 'active');
 CREATE TABLE IF NOT EXISTS questions(id INTEGER PRIMARY KEY,json TEXT NOT NULL,is_used INTEGER DEFAULT 0,is_deleted INTEGER DEFAULT 0);
 CREATE TABLE IF NOT EXISTS match_state(id INTEGER PRIMARY KEY CHECK(id=1),json TEXT NOT NULL,version INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS event_log(id INTEGER PRIMARY KEY AUTOINCREMENT,at_wall_ms INTEGER NOT NULL,actor TEXT NOT NULL,type TEXT NOT NULL,payload_json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS score_events(id INTEGER PRIMARY KEY AUTOINCREMENT,round_key TEXT NOT NULL,team_id INTEGER REFERENCES teams(id),question_id INTEGER,kind TEXT NOT NULL,delta INTEGER NOT NULL,reason TEXT,reverses_id INTEGER REFERENCES score_events(id),created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS devices(id TEXT PRIMARY KEY,role TEXT NOT NULL,team_id INTEGER REFERENCES teams(id),token_hash TEXT NOT NULL,seat_no INTEGER,last_seen_at INTEGER,rtt_ms REAL);
 CREATE TABLE IF NOT EXISTS commands(actor TEXT NOT NULL,cmd_id TEXT NOT NULL,result_json TEXT NOT NULL,PRIMARY KEY(actor,cmd_id));
 CREATE TABLE IF NOT EXISTS answers(id TEXT PRIMARY KEY,round_key TEXT NOT NULL,question_id INTEGER,team_id INTEGER REFERENCES teams(id),json TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS idx_scores ON score_events(round_key,team_id);
 CREATE INDEX IF NOT EXISTS idx_answers ON answers(round_key,question_id);
 CREATE VIEW IF NOT EXISTS v_team_round_scores AS SELECT round_key,team_id,SUM(delta) AS score FROM score_events GROUP BY round_key,team_id;
 INSERT OR IGNORE INTO migrations VALUES(1);`);
  const cols = (db.prepare('PRAGMA table_info(teams)').all() as { name: string }[]).map(
    (c) => c.name,
  );
  if (!cols.includes('logo'))
    db.exec('ALTER TABLE teams ADD COLUMN logo BLOB; ALTER TABLE teams ADD COLUMN logo_mime TEXT;');
  if (!cols.includes('logo_v')) db.exec('ALTER TABLE teams ADD COLUMN logo_v INTEGER DEFAULT 0;');
  return db;
}
export type DB = ReturnType<typeof openDb>;
