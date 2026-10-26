import Database from 'better-sqlite3'
import { ISSUANCE_TTL_MS, type Channel } from './config.js'

/**
 * One proven sign in. The verifier writes one per OAuth login, the judge spends
 * it against exactly one judgement. Both processes open the same file, WAL keeps
 * them out of each other's way.
 */
export interface Issuance {
  id: number
  address: string
  channel: Channel
  handle: string
  expiresAt: number
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS issuance (
  id INTEGER PRIMARY KEY,
  address TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('telegram', 'discord')),
  handle TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  consumed_block INTEGER
);
CREATE INDEX IF NOT EXISTS issuance_open ON issuance (address) WHERE consumed_at IS NULL;
CREATE TABLE IF NOT EXISTS cursor (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  height INTEGER NOT NULL
);
`

export class Store {
  private db: Database.Database

  constructor(path: string) {
    this.db = new Database(path)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('busy_timeout = 5000')
    this.db.exec(SCHEMA)
  }

  /** A fresh login replaces whatever open issuance the channel already had. */
  issue(address: string, channel: Channel, handle: string, now = Date.now()): number {
    const expiresAt = now + ISSUANCE_TTL_MS
    this.db.transaction(() => {
      this.db
        .prepare('DELETE FROM issuance WHERE address = ? AND channel = ? AND consumed_at IS NULL')
        .run(address, channel)
      this.db
        .prepare(
          'INSERT INTO issuance (address, channel, handle, issued_at, expires_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(address, channel, handle, now, expiresAt)
    })()
    return expiresAt
  }

  openFor(address: string, now = Date.now()): Issuance[] {
    return this.db
      .prepare(
        'SELECT id, address, channel, handle, expires_at AS expiresAt FROM issuance WHERE address = ? AND consumed_at IS NULL AND issued_at <= ? AND expires_at > ?',
      )
      .all(address, now, now) as Issuance[]
  }

  consume(ids: number[], block: number, now = Date.now()): void {
    const mark = this.db.prepare(
      'UPDATE issuance SET consumed_at = ?, consumed_block = ? WHERE id = ?',
    )
    this.db.transaction(() => {
      for (const id of ids) mark.run(now, block, id)
    })()
  }

  /** Expired open issuances are dead weight, spent ones stay as the audit trail. */
  prune(now = Date.now()): void {
    this.db.prepare('DELETE FROM issuance WHERE consumed_at IS NULL AND expires_at <= ?').run(now)
  }

  cursor(): number | null {
    const row = this.db.prepare('SELECT height FROM cursor WHERE id = 1').get() as
      | { height: number }
      | undefined
    return row?.height ?? null
  }

  advance(height: number): void {
    this.db
      .prepare(
        'INSERT INTO cursor (id, height) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET height = excluded.height',
      )
      .run(height)
  }

  close(): void {
    this.db.close()
  }
}
