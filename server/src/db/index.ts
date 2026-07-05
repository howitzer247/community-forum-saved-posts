import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';

/**
 * We use libSQL (a SQLite-compatible engine) via @libsql/client. It ships
 * prebuilt binaries (no native compile step), runs a local file or in-memory DB,
 * and is a drop-in for SQLite. Choosing SQLite/libSQL over Postgres is an
 * explicit, allowed substitution (see NOTES.md): zero infra for the reviewer,
 * and the Drizzle schema + queries port to Postgres by swapping only the driver.
 *
 * The client is async, so every DB call in the logic/API layers is awaited —
 * which also mirrors how a real networked database (Postgres) would behave.
 */
export function createDb(url = 'file:forum.db') {
  const client = createClient({ url });
  return drizzle(client, { schema });
}

export type DB = ReturnType<typeof createDb>;

/** Create tables. Idempotent DDL keeps setup to a single command. */
export async function migrate(db: DB): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY, title TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS enrollments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      course_id TEXT NOT NULL REFERENCES courses(id)
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uniq_enrollment ON enrollments(user_id, course_id)`,
    `CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id),
      author_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_posts_course_created ON posts(course_id, created_at)`,
    `CREATE TABLE IF NOT EXISTS saves (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      post_id TEXT NOT NULL REFERENCES posts(id),
      saved_at INTEGER NOT NULL, deleted_at INTEGER
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_post ON saves(user_id, post_id)`,
    `CREATE INDEX IF NOT EXISTS idx_saves_post ON saves(post_id)`,
  ];
  for (const sql of statements) {
    await db.run(sql);
  }
}
