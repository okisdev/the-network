import { join } from 'node:path';
import Database from 'better-sqlite3';
import { runMigrations } from './store.ts';

export type HubDatabase = Database.Database;

export function migrate(db: HubDatabase): void {
  runMigrations(db);
}

export function openDatabase(dataDir: string): HubDatabase {
  const db = new Database(join(dataDir, 'hub.db'));
  db.pragma('journal_mode = WAL');
  migrate(db);
  return db;
}
