import express, { type Express } from 'express';
import cors from 'cors';
import type { DB } from './db/index.js';
import { authMiddleware } from './api/auth.js';
import { buildRoutes } from './api/routes.js';

/**
 * Build the Express app around a given DB handle. Kept as a factory (rather than
 * a module-level singleton) so tests can inject an in-memory DB and get an
 * isolated app instance per test file.
 */
export function createApp(db: DB): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Every /api route is behind auth => unauthenticated calls get 401.
  app.use('/api', authMiddleware(db), buildRoutes(db));

  app.get('/health', (_req, res) => res.json({ ok: true }));
  return app;
}
