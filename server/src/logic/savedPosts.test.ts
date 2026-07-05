import { beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createDb, migrate, type DB } from '../db/index.js';
import { seed } from '../db/seed.js';
import { saves } from '../db/schema.js';
import { AppError, getFeed, getSavedList, savePost, unsavePost, type Actor } from './savedPosts.js';

const alice: Actor = { userId: 'alice', role: 'student' };
const bob: Actor = { userId: 'bob', role: 'student' };
const carol: Actor = { userId: 'carol', role: 'student' };
const mod: Actor = { userId: 'mod', role: 'moderator' };

let db: DB;
beforeEach(async () => {
  db = createDb(':memory:'); // fresh, isolated DB per test
  await migrate(db);
  await seed(db);
});

/** How many save rows exist for a (user, post), regardless of active/deleted. */
async function rowCount(userId: string, postId: string): Promise<number> {
  const rows = await db
    .select()
    .from(saves)
    .where(and(eq(saves.userId, userId), eq(saves.postId, postId)));
  return rows.length;
}

describe('savePost — idempotency & reactivation', () => {
  it('saving once creates one active row and count = 1', async () => {
    await savePost(db, alice, 'p1');
    const feed = await getFeed(db, alice, 'course-ts');
    const p1 = feed.posts.find((p) => p.id === 'p1')!;
    expect(p1.hasSaved).toBe(true);
    expect(p1.savesCount).toBe(1);
    expect(await rowCount('alice', 'p1')).toBe(1);
  });

  it('saving twice is a no-op: no duplicate row, count stays 1', async () => {
    await savePost(db, alice, 'p1');
    await savePost(db, alice, 'p1');
    expect(await rowCount('alice', 'p1')).toBe(1);
    const p1 = (await getFeed(db, alice, 'course-ts')).posts.find((p) => p.id === 'p1')!;
    expect(p1.savesCount).toBe(1);
  });

  it('un-save soft-deletes (row preserved) and count drops to 0', async () => {
    await savePost(db, alice, 'p1');
    await unsavePost(db, alice, 'p1');
    expect(await rowCount('alice', 'p1')).toBe(1); // history preserved
    const p1 = (await getFeed(db, alice, 'course-ts')).posts.find((p) => p.id === 'p1')!;
    expect(p1.hasSaved).toBe(false);
    expect(p1.savesCount).toBe(0);
  });

  it('re-save reactivates the SAME row (still one row), count back to 1', async () => {
    await savePost(db, alice, 'p1');
    await unsavePost(db, alice, 'p1');
    await savePost(db, alice, 'p1'); // reactivate
    expect(await rowCount('alice', 'p1')).toBe(1); // not duplicated
    const p1 = (await getFeed(db, alice, 'course-ts')).posts.find((p) => p.id === 'p1')!;
    expect(p1.hasSaved).toBe(true);
    expect(p1.savesCount).toBe(1);
  });

  it('un-saving something never saved is a no-op', async () => {
    await expect(unsavePost(db, alice, 'p1')).resolves.toBeDefined();
    expect(await rowCount('alice', 'p1')).toBe(0);
  });

  it('savesCount reflects multiple distinct users', async () => {
    await savePost(db, alice, 'p1');
    await savePost(db, mod, 'p1'); // moderator can save too
    const p1 = (await getFeed(db, alice, 'course-ts')).posts.find((p) => p.id === 'p1')!;
    expect(p1.savesCount).toBe(2);
    expect(p1.hasSaved).toBe(true); // for alice
  });
});

describe('access control', () => {
  it('student cannot read a feed for a course they are not enrolled in (403)', async () => {
    await expect(getFeed(db, bob, 'course-ts')).rejects.toBeInstanceOf(AppError);
    try {
      await getFeed(db, bob, 'course-ts');
    } catch (e) {
      expect((e as AppError).status).toBe(403);
    }
  });

  it('student cannot save a post in a course they are not enrolled in (403)', async () => {
    try {
      await savePost(db, bob, 'p1'); // p1 is in course-ts
    } catch (e) {
      expect((e as AppError).status).toBe(403);
    }
  });

  it('saving a non-existent post is 404', async () => {
    try {
      await savePost(db, alice, 'does-not-exist');
    } catch (e) {
      expect((e as AppError).status).toBe(404);
    }
  });

  it('moderator can read any course feed regardless of enrollment', async () => {
    const feed = await getFeed(db, mod, 'course-db');
    expect(feed.posts.length).toBeGreaterThan(0);
  });
});

describe('saved list', () => {
  it("returns only the current user's active saves, most-recent first", async () => {
    await savePost(db, carol, 'p1');
    await new Promise((r) => setTimeout(r, 2)); // ensure a distinct savedAt tick
    await savePost(db, carol, 'p5');
    const list = await getSavedList(db, carol);
    expect(list.posts.map((p) => p.id)).toEqual(['p5', 'p1']); // p5 saved later => first
  });

  it('re-saving moves a post back to the top of the saved list', async () => {
    await savePost(db, carol, 'p1');
    await new Promise((r) => setTimeout(r, 2));
    await savePost(db, carol, 'p5'); // p5 now on top
    await new Promise((r) => setTimeout(r, 2));
    await unsavePost(db, carol, 'p1');
    await savePost(db, carol, 'p1'); // re-save p1 => bumped to top
    const list = await getSavedList(db, carol);
    expect(list.posts[0]!.id).toBe('p1');
  });

  it('un-saved posts drop out of the saved list', async () => {
    await savePost(db, carol, 'p1');
    await unsavePost(db, carol, 'p1');
    const list = await getSavedList(db, carol);
    expect(list.posts.find((p) => p.id === 'p1')).toBeUndefined();
  });
});
