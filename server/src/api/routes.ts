import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { DB } from '../db/index.js';
import { AppError, getFeed, getSavedList, savePost, unsavePost } from '../logic/savedPosts.js';

/**
 * API LAYER
 * ---------
 * Thin translator between HTTP and the pure business logic. Its jobs:
 *   - validate/parse input with Zod (query params, route params),
 *   - call the matching logic function,
 *   - map thrown AppError -> exact status codes (401/403/404),
 *   - shape the JSON response.
 * No business rules live here — that's all in logic/savedPosts.ts.
 */

const pageSchema = z.coerce.number().int().positive().default(1);
const courseIdSchema = z.string().min(1);
const postIdSchema = z.string().min(1);

/** Wrap an async handler so any thrown AppError becomes the right HTTP status. */
function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'invalid request', details: err.flatten() });
        return;
      }
      console.error(err);
      res.status(500).json({ error: 'internal error' });
    }
  };
}

export function buildRoutes(db: DB): Router {
  const r = Router();

  // GET /api/courses/:courseId/feed?page=1
  r.get(
    '/courses/:courseId/feed',
    handle(async (req, res) => {
      const courseId = courseIdSchema.parse(req.params.courseId);
      const page = pageSchema.parse(req.query.page);
      res.json(await getFeed(db, req.actor!, courseId, page));
    }),
  );

  // POST /api/posts/:postId/save   (idempotent)
  r.post(
    '/posts/:postId/save',
    handle(async (req, res) => {
      const postId = postIdSchema.parse(req.params.postId);
      res.json(await savePost(db, req.actor!, postId));
    }),
  );

  // DELETE /api/posts/:postId/save  (soft delete, idempotent)
  r.delete(
    '/posts/:postId/save',
    handle(async (req, res) => {
      const postId = postIdSchema.parse(req.params.postId);
      res.json(await unsavePost(db, req.actor!, postId));
    }),
  );

  // GET /api/saved?page=1  (current user's own saved list only)
  r.get(
    '/saved',
    handle(async (req, res) => {
      const page = pageSchema.parse(req.query.page);
      res.json(await getSavedList(db, req.actor!, page));
    }),
  );

  return r;
}
