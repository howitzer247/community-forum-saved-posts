import { createDb, migrate, type DB } from './index.js';
import { courses, enrollments, posts, users } from './schema.js';

/**
 * Deterministic seed so the reviewer sees the same data and can "log in" as known
 * users via the x-user-id header.
 *
 * Enrollment shape (this is what makes the 403 rule demonstrable):
 *   - alice   (student)  -> enrolled in course-ts ONLY
 *   - bob     (student)  -> enrolled in course-db ONLY
 *   - carol   (student)  -> enrolled in BOTH courses
 *   - mod     (moderator)-> enrolled in nothing, but may see/remove anything
 *
 * So: alice reading course-db's feed => 403. mod reading it => 200.
 */
export async function seed(db: DB): Promise<void> {
  await db.delete(enrollments);
  await db.delete(posts);
  await db.delete(users);
  await db.delete(courses);

  await db.insert(courses).values([
    { id: 'course-ts', title: 'TypeScript Fundamentals' },
    { id: 'course-db', title: 'Database Design' },
  ]);

  await db.insert(users).values([
    { id: 'alice', name: 'Alice', role: 'student' },
    { id: 'bob', name: 'Bob', role: 'student' },
    { id: 'carol', name: 'Carol', role: 'student' },
    { id: 'mod', name: 'Morgan (Moderator)', role: 'moderator' },
  ]);

  await db.insert(enrollments).values([
    { id: 'e1', userId: 'alice', courseId: 'course-ts' },
    { id: 'e2', userId: 'bob', courseId: 'course-db' },
    { id: 'e3', userId: 'carol', courseId: 'course-ts' },
    { id: 'e4', userId: 'carol', courseId: 'course-db' },
  ]);

  const base = Date.parse('2024-01-01T00:00:00Z');
  const hour = 3600_000;
  await db.insert(posts).values([
    { id: 'p1', courseId: 'course-ts', authorId: 'alice', title: 'What is a discriminated union?', body: 'Trying to model API responses cleanly.', createdAt: base + 1 * hour },
    { id: 'p2', courseId: 'course-ts', authorId: 'carol', title: 'strict mode gotchas', body: 'noUncheckedIndexedAccess bit me today.', createdAt: base + 2 * hour },
    { id: 'p3', courseId: 'course-ts', authorId: 'alice', title: 'Generics vs any', body: 'When is a generic actually worth it?', createdAt: base + 3 * hour },
    { id: 'p4', courseId: 'course-db', authorId: 'bob', title: 'When to add an index', body: 'Composite index question for a feed query.', createdAt: base + 4 * hour },
    { id: 'p5', courseId: 'course-db', authorId: 'carol', title: 'Soft delete vs hard delete', body: 'Preserving history without duplicates.', createdAt: base + 5 * hour },
  ]);

  console.log('Seeded 2 courses, 4 users, 4 enrollments, 5 posts.');
}

const isMain = process.argv[1]?.endsWith('seed.ts');
if (isMain) {
  const db = createDb('file:forum.db');
  await migrate(db);
  await seed(db);
}
