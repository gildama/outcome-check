import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export class Store {
  constructor(directory) {
    mkdirSync(directory, { recursive: true });
    const file = join(directory, 'notes.sqlite');
    this.writer = new DatabaseSync(file);
    this.writer.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, candidate TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, workspace TEXT NOT NULL, text TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS notes_workspace ON notes(workspace);`);
    this.observer = new DatabaseSync(file, { readOnly: true });
  }
  create(candidate) {
    const id = randomUUID();
    this.writer.prepare('INSERT INTO workspaces VALUES (?, ?, ?)').run(id, candidate, Date.now());
    return id;
  }
  workspace(id) { return this.writer.prepare('SELECT * FROM workspaces WHERE id = ?').get(id); }
  save(workspace, text) {
    if (!this.workspace(workspace)) throw new Error('Unknown workspace');
    const id = randomUUID();
    this.writer.prepare('INSERT INTO notes VALUES (?, ?, ?)').run(id, workspace, text);
    return { id, text };
  }
  list(workspace) { return this.writer.prepare('SELECT id, text FROM notes WHERE workspace = ? ORDER BY rowid').all(workspace); }
  observe(workspace) { return this.observer.prepare('SELECT id, text FROM notes WHERE workspace = ? ORDER BY rowid').all(workspace); }
  cleanup() {
    const cutoff = Date.now() - 60 * 60 * 1000;
    this.writer.prepare('DELETE FROM notes WHERE workspace IN (SELECT id FROM workspaces WHERE created < ?)').run(cutoff);
    this.writer.prepare('DELETE FROM workspaces WHERE created < ?').run(cutoff);
  }
  close() { this.observer.close(); this.writer.close(); }
}
