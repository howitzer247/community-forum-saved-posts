import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

/**
 * DATA MODEL
 * ----------
 * Five tables: users, courses, enrollments (who is in which course),
 * posts, and saves (the bookmark relationship).
 *
 * The interesting table is `saves`. The brief demands three things at once:
 *   1. Saving is idempotent — saving twice must NOT create a duplicate.
 *   2. Un-saving is a SOFT delete — history is preserved, never destroyed.
 *   3. Re-saving must REACTIVATE the existing row, not insert a new one.
 *
 * We satisfy all three with ONE row per (user, post) pair plus a nullable
 * `deletedAt` timestamp:
 *   - active save   => deletedAt IS NULL
 *   - un-saved      => deletedAt IS a timestamp (row still exists = history kept)
 *   - re-save       => set deletedAt back to NULL on the same row
 *
 * A UNIQUE index on (userId, postId) guarantees we can never end up with two
 * rows for the same pair, which is what makes idempotency a database-level
 * guarantee rather than something we hope the code gets right.
 */

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  // 'student' | 'moderator' — enforced in app code (SQLite has no enum type)
  role: text('role', { enum: ['student', 'moderator'] }).notNull(),
});

export const courses = sqliteTable('courses', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
});

/** Join table: which users are enrolled in which courses. */
export const enrollments = sqliteTable(
  'enrollments',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id),
  },
  (t) => ({
    // A user can't be enrolled in the same course twice.
    uniqEnrollment: uniqueIndex('uniq_enrollment').on(t.userId, t.courseId),
  }),
);

export const posts = sqliteTable(
  'posts',
  {
    id: text('id').primaryKey(),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id),
    title: text('title').notNull(),
    body: text('body').notNull(),
    // Unix epoch millis. Used for "newest first" feed ordering.
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    // Feed queries filter by course and order by createdAt — index both.
    byCourseCreated: index('idx_posts_course_created').on(t.courseId, t.createdAt),
  }),
);

export const saves = sqliteTable(
  'saves',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    postId: text('post_id')
      .notNull()
      .references(() => posts.id),
    // When the user (re)saved. Drives "most-recently-saved first" ordering.
    savedAt: integer('saved_at').notNull(),
    // NULL = active save. Non-null = soft-deleted (un-saved) but history kept.
    deletedAt: integer('deleted_at'),
  },
  (t) => ({
    // ONE row per (user, post). This is the guardrail behind idempotency:
    // re-saving updates this row; it can never duplicate it.
    uniqUserPost: uniqueIndex('uniq_user_post').on(t.userId, t.postId),
    // savesCount aggregation filters by postId — index it.
    byPost: index('idx_saves_post').on(t.postId),
  }),
);

// Inferred TypeScript types, used across the business + API layers.
export type User = typeof users.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type Save = typeof saves.$inferSelect;
