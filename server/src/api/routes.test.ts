import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app.js';
import { createDb, migrate, type DB } from '../db/index.js';
import { seed } from '../db/seed.js';

let app: Express;
let db: DB;

beforeEach(async () => {
  db = createDb(':memory:');
  await migrate(db);
  await seed(db);
  app = createApp(db);
});

describe('API — authorization boundaries', () => {
  it('401 when no user header is present', async () => {
    const res = await request(app).get('/api/courses/course-ts/feed');
    expect(res.status).toBe(401);
  });

  it('401 when the user id is unknown', async () => {
    const res = await request(app)
      .get('/api/courses/course-ts/feed')
      .set('x-user-id', 'ghost');
    expect(res.status).toBe(401);
  });

  it('403 when a student reads a course they are not enrolled in', async () => {
    // bob is only in course-db
    const res = await request(app)
      .get('/api/courses/course-ts/feed')
      .set('x-user-id', 'bob');
    expect(res.status).toBe(403);
  });

  it('404 when saving a post that does not exist', async () => {
    const res = await request(app)
      .post('/api/posts/nope/save')
      .set('x-user-id', 'alice');
    expect(res.status).toBe(404);
  });
});

describe('API — happy path: feed -> save -> saved list', () => {
  it('alice reads her feed, saves a post, and sees it in her saved list', async () => {
    // 1. feed loads with flags
    const feed = await request(app)
      .get('/api/courses/course-ts/feed')
      .set('x-user-id', 'alice');
    expect(feed.status).toBe(200);
    expect(feed.body.posts.length).toBeGreaterThan(0);
    const first = feed.body.posts[0];
    expect(first.hasSaved).toBe(false);
    expect(first.savesCount).toBe(0);

    // 2. save it (idempotent — call twice)
    await request(app).post(`/api/posts/${first.id}/save`).set('x-user-id', 'alice');
    const second = await request(app)
      .post(`/api/posts/${first.id}/save`)
      .set('x-user-id', 'alice');
    expect(second.status).toBe(200);
    expect(second.body.hasSaved).toBe(true);

    // 3. saved list shows exactly one copy with correct flags
    const saved = await request(app).get('/api/saved').set('x-user-id', 'alice');
    expect(saved.status).toBe(200);
    const match = saved.body.posts.filter((p: { id: string }) => p.id === first.id);
    expect(match).toHaveLength(1); // no duplicate despite saving twice
    expect(match[0].hasSaved).toBe(true);
    expect(match[0].savesCount).toBe(1);

    // 4. un-save removes it from the list
    await request(app).delete(`/api/posts/${first.id}/save`).set('x-user-id', 'alice');
    const after = await request(app).get('/api/saved').set('x-user-id', 'alice');
    expect(after.body.posts.find((p: { id: string }) => p.id === first.id)).toBeUndefined();
  });
});
