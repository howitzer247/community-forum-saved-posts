import type { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import type { DB } from '../db/index.js';
import { users } from '../db/schema.js';
import type { Actor } from '../logic/savedPosts.js';

/**
 * STUBBED AUTHENTICATION (per brief: "Authentication may be stubbed").
 *
 * We read identity from an `x-user-id` header and look the user up to get their
 * real role from the DB — rather than trusting a header-supplied role — so the
 * role can't be spoofed by the caller. In a real system this middleware would
 * verify a signed token/session instead; everything downstream (the Actor) stays
 * identical, so swapping in real auth later touches only this file.
 *
 * Any forum endpoint with no/invalid user => 401 (the brief's first auth rule).
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor?: Actor;
    }
  }
}

export function authMiddleware(db: DB) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.header('x-user-id');
    if (!userId) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    const rows = await db.select().from(users).where(eq(users.id, userId));
    const user = rows[0];
    if (!user) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    req.actor = { userId: user.id, role: user.role };
    next();
  };
}
