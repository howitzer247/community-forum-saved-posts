import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';

/**
 * Database via @libsql/client (SQLite-compatible).
 *
 * - Local dev / tests: a local file (or :memory:) — zero infra.
 * - Production (Turso): set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN and the same
 *   code talks to a hosted libSQL database. No query changes needed — libSQL is
 *   the same engine locally and in the cloud. This is why SQLite/libSQL was a good
 *   substitution: it scales from a local file to a hosted DB by swapping only the
 *   connection URL + token.
 */
export function createDb(url?: string) {
  const dbUrl = url ?? process.env.TURSO_DATABASE_URL ?? 'file:forum.db';
  const authToken = process.env.TURSO_AUTH_TOKEN;
  const client = createClient(authToken ? { url: dbUrl, authToken } : { url: dbUrl });
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
