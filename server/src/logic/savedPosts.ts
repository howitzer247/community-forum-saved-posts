import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { DB } from '../db/index.js';
import { enrollments, posts, saves, users } from '../db/schema.js';

/**
 * BUSINESS LOGIC LAYER
 * --------------------
 * Plain async functions that take a `db` handle. No Express, no req/res, no HTTP.
 * The brief wants idempotency, count behaviour, and reactivation to live "in code
 * you can test without a database" — so the API layer stays a thin translator and
 * these rules are unit-tested directly (see logic/savedPosts.test.ts).
 *
 * Errors are thrown as typed AppError so the API layer can map them to exact HTTP
 * status codes without this layer knowing anything about HTTP.
 */

export type Role = 'student' | 'moderator';

export class AppError extends Error {
  constructor(
    public status: 401 | 403 | 404,
    message: string,
  ) {
    super(message);
  }
}

export interface Actor {
  userId: string;
  role: Role;
}

/** Shape returned to the client for each post, with per-user hydrated flags. */
export interface HydratedPost {
  id: string;
  courseId: string;
  authorId: string;
  authorName: string;
  title: string;
  body: string;
  createdAt: number;
  hasSaved: boolean;
  savesCount: number;
  savedAt?: number;
}

const PAGE_SIZE = 10;

/** True if the user is enrolled in the course. Moderators bypass enrollment. */
async function isEnrolled(db: DB, userId: string, courseId: string): Promise<boolean> {
  const rows = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)));
  return rows.length > 0;
}

/**
 * Load a post and enforce access in one place:
 *   - 404 if the post doesn't exist.
 *   - 403 if a student isn't enrolled in the post's course. Moderators may see any.
 */
async function loadVisiblePost(db: DB, actor: Actor, postId: string) {
  const found = await db.select().from(posts).where(eq(posts.id, postId));
  const post = found[0];
  if (!post) throw new AppError(404, 'Post not found');

  if (actor.role !== 'moderator' && !(await isEnrolled(db, actor.userId, post.courseId))) {
    throw new AppError(403, 'You are not enrolled in this course');
  }
  return post;
}

/** Count only ACTIVE saves (deletedAt IS NULL) for a set of posts. */
async function savesCountFor(db: DB, postIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (postIds.length === 0) return counts;
  const rows = await db
    .select({ postId: saves.postId, n: sql<number>`count(*)` })
    .from(saves)
    .where(and(inArray(saves.postId, postIds), isNull(saves.deletedAt)))
    .groupBy(saves.postId);
  for (const r of rows) counts.set(r.postId, Number(r.n));
  return counts;
}

/** Which of these posts does THIS user currently have actively saved? */
async function hasSavedFor(db: DB, userId: string, postIds: string[]): Promise<Set<string>> {
  const set = new Set<string>();
  if (postIds.length === 0) return set;
  const rows = await db
    .select({ postId: saves.postId })
    .from(saves)
    .where(
      and(eq(saves.userId, userId), inArray(saves.postId, postIds), isNull(saves.deletedAt)),
    );
  for (const r of rows) set.add(r.postId);
  return set;
}

/**
 * Hydrate raw posts with authorName + per-user hasSaved + savesCount.
 * Does the flag lookups in a fixed number of BATCHED queries (counts, this-user
 * saves, authors) rather than N queries per post — the "efficiently" the brief
 * calls out. O(1) queries regardless of page size.
 */
async function hydrate(
  db: DB,
  userId: string,
  rawPosts: (typeof posts.$inferSelect)[],
): Promise<HydratedPost[]> {
  const ids = rawPosts.map((p) => p.id);
  const [counts, saved] = await Promise.all([savesCountFor(db, ids), hasSavedFor(db, userId, ids)]);

  const authorIds = [...new Set(rawPosts.map((p) => p.authorId))];
  const authors = new Map<string, string>();
  if (authorIds.length) {
    const rows = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, authorIds));
    for (const r of rows) authors.set(r.id, r.name);
  }

  return rawPosts.map((p) => ({
    id: p.id,
    courseId: p.courseId,
    authorId: p.authorId,
    authorName: authors.get(p.authorId) ?? 'Unknown',
    title: p.title,
    body: p.body,
    createdAt: p.createdAt,
    hasSaved: saved.has(p.id),
    savesCount: counts.get(p.id) ?? 0,
  }));
}

/** FEED: paginated posts for a course the student belongs to, newest first. */
export async function getFeed(
  db: DB,
  actor: Actor,
  courseId: string,
  page = 1,
): Promise<{ posts: HydratedPost[]; page: number; pageSize: number }> {
  if (actor.role !== 'moderator' && !(await isEnrolled(db, actor.userId, courseId))) {
    throw new AppError(403, 'You are not enrolled in this course');
  }
  const offset = (Math.max(1, page) - 1) * PAGE_SIZE;
  const rows = await db
    .select()
    .from(posts)
    .where(eq(posts.courseId, courseId))
    .orderBy(desc(posts.createdAt))
    .limit(PAGE_SIZE)
    .offset(offset);
  return { posts: await hydrate(db, actor.userId, rows), page: Math.max(1, page), pageSize: PAGE_SIZE };
}

/**
 * SAVE — idempotent + reactivating.
 *   - New pair                  => insert an active row.
 *   - Existing active row       => no-op (idempotent).
 *   - Existing soft-deleted row => reactivate (deletedAt=NULL) and bump savedAt.
 */
export async function savePost(db: DB, actor: Actor, postId: string): Promise<{ hasSaved: true }> {
  await loadVisiblePost(db, actor, postId);

  const found = await db
    .select()
    .from(saves)
    .where(and(eq(saves.userId, actor.userId), eq(saves.postId, postId)));
  const existing = found[0];
  const now = Date.now();

  if (!existing) {
    await db
      .insert(saves)
      .values({ id: randomUUID(), userId: actor.userId, postId, savedAt: now, deletedAt: null });
    return { hasSaved: true };
  }

  if (existing.deletedAt === null) {
    return { hasSaved: true }; // already active — true no-op
  }

  await db.update(saves).set({ deletedAt: null, savedAt: now }).where(eq(saves.id, existing.id));
  return { hasSaved: true };
}

/** UN-SAVE — soft delete. Never destroys the row. Idempotent. */
export async function unsavePost(
  db: DB,
  actor: Actor,
  postId: string,
): Promise<{ hasSaved: false }> {
  await loadVisiblePost(db, actor, postId);

  const found = await db
    .select()
    .from(saves)
    .where(and(eq(saves.userId, actor.userId), eq(saves.postId, postId)));
  const existing = found[0];

  if (existing && existing.deletedAt === null) {
    await db.update(saves).set({ deletedAt: Date.now() }).where(eq(saves.id, existing.id));
  }
  return { hasSaved: false };
}

/**
 * SAVED LIST — the current user's active saves, most-recently-saved first.
 * Takes the actor's OWN userId and never accepts a target user, so cross-user
 * reads are impossible by construction (the "OWN" rule in the brief).
 */
export async function getSavedList(
  db: DB,
  actor: Actor,
  page = 1,
): Promise<{ posts: HydratedPost[]; page: number; pageSize: number }> {
  const offset = (Math.max(1, page) - 1) * PAGE_SIZE;
  const rows = await db
    .select({ post: posts, savedAt: saves.savedAt })
    .from(saves)
    .innerJoin(posts, eq(saves.postId, posts.id))
    .where(and(eq(saves.userId, actor.userId), isNull(saves.deletedAt)))
    // Primary sort: most-recently-saved first. Tiebreaker: saves.id, so two saves
    // in the same millisecond still get a deterministic, stable order instead of
    // whatever the engine returns. (Real ordering guarantee, not just for tests.)
    .orderBy(desc(saves.savedAt), desc(saves.id))
    .limit(PAGE_SIZE)
    .offset(offset);

  const hydrated = await hydrate(
    db,
    actor.userId,
    rows.map((r) => r.post),
  );
  const withSavedAt = hydrated.map((h, i) => ({ ...h, savedAt: rows[i]!.savedAt }));
  return { posts: withSavedAt, page: Math.max(1, page), pageSize: PAGE_SIZE };
}
