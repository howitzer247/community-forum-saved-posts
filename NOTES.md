# NOTES

A small, layered vertical slice of a course-forum "Saved Posts" feature. The goal
was correctness under the edge cases the brief calls out (idempotency, soft-delete
history, exact auth codes, efficient flag hydration) with clean separation between
layers, rather than breadth.

## Stack (and where I substituted)

| Layer        | Brief preferred            | What I used                    | Why |
|--------------|----------------------------|--------------------------------|-----|
| Language     | TypeScript (strict)        | **TypeScript, strict**         | as asked; compiles clean |
| Runtime      | Bun or Node                | **Node**                       | most familiar; no Bun-only APIs used |
| API          | Elysia / typed router      | **Express + Zod**              | substituted — Express is where I'm fastest; Zod restores typed, validated I/O at the boundary |
| Database     | Postgres + Drizzle         | **libSQL (SQLite) + Drizzle**  | substituted — zero infra for the reviewer; same Drizzle schema/queries port to Postgres by swapping only the driver |
| Client state | React Query v5             | **React Query v5**             | as asked |
| UI           | React 19 + Next (App Router)| **React 18 + Vite**           | substituted — Vite keeps it a simple SPA; the layering the brief cares about is identical |
| Validation   | Zod                        | **Zod**                        | as asked |
| Tests        | Vitest + 1 API test        | **Vitest + supertest**         | as asked |

These substitutions are all on the brief's "acceptable" list except Express/Vite,
which the brief explicitly allows ("If you're much stronger elsewhere and want to
substitute, that's fine; just note it").

## Architecture (matches the brief's diagram)

```
schema.ts ──► logic/savedPosts.ts ──► api/routes.ts ──► (HTTP)
 (data model)   (pure business logic)   (auth · zod · I/O)
                                              │
web: api.ts (typed client) ──► hooks.ts (query-key factory + React Query) ──► components.tsx (presentation only)
```

- **Business logic is DB-aware but HTTP-free.** `logic/savedPosts.ts` has no Express
  imports. It throws typed `AppError(status, msg)`; the API layer is the only place
  that knows those map to 401/403/404. That's what makes the rules unit-testable
  without spinning up a server (see `logic/savedPosts.test.ts`).
- **Auth lives in one middleware.** `api/auth.ts` resolves identity from an
  `x-user-id` header (stubbed, per brief) and looks up the **role from the DB** so a
  caller can't spoof `moderator`. Swapping in real token/session auth touches only
  this file.

## Key design decisions

### 1. The bookmark model — one row, soft delete, unique index
`saves` has **one row per `(userId, postId)`** guarded by a `UNIQUE` index, plus a
nullable `deletedAt`:
- active save → `deletedAt IS NULL`
- un-saved → `deletedAt = <ts>` (row kept = history preserved)
- re-save → set `deletedAt = NULL` on the same row (reactivate, never duplicate)

This makes **idempotency a database-level guarantee**, not a code convention: even a
race can't produce two active rows for the same pair. `savePost` branches on the
existing row's state; `unsavePost` only flips an active row. Both are no-ops when
there's nothing to change.

### 2. Efficient flag hydration (no N+1)
`hasSaved` and `savesCount` for a page of posts are fetched in a **fixed number of
batched queries** regardless of page size: one `GROUP BY` count over all post ids,
one "which of these did I save" lookup, one author-name lookup — run in parallel.
Adding posts to a page never adds queries.

### 3. Exact status codes
`401` unauthenticated (missing/unknown user), `403` student acting on a course
they're not enrolled in, `404` post doesn't exist. Moderators bypass enrollment.
The saved-list endpoint takes the **actor's own id only** — there's no parameter to
request another user's list, so the "own list only" rule holds by construction.

### 4. Saved-list ordering
Most-recently-saved first via `ORDER BY savedAt DESC`, with `saves.id` as a stable
tiebreaker so two saves in the same millisecond still have a deterministic order.
Re-saving bumps `savedAt`, so a re-saved post returns to the top.

### 5. Client cache consistency
The toggle is **optimistic**: the bookmark flips and the count nudges immediately
from a query-key-factory-scoped cache entry; on error we roll back to the snapshot;
on settle we invalidate both feed and saved lists so the **server's authoritative
counts and ordering win**. Query keys are scoped by user id so switching users can't
show stale data from another user.

## Tests (18)
- Unit (logic): save once / save twice (idempotent) / un-save soft-delete / re-save
  reactivation / un-save-when-absent no-op / multi-user count / 403 feed / 403 save /
  404 save / moderator bypass / saved-list order / re-save bump / un-save drops out.
- API (supertest): 401 (no user), 401 (unknown user), 403 (wrong course), 404
  (missing post), and the full happy path feed → save (twice) → saved list → un-save.

## Trade-offs / deliberately descoped (given the 4–6h box)
- **Pagination is offset-based** with a fixed page size (10). Fine for this scale;
  cursor pagination would be the next step for large feeds.
- **No comments/likes/views UI.** The brief says build "enough forum" — I built the
  post feed and the Saved feature end to end and left the other interactions out.
- **Auth is header-stubbed** by design. No login, tokens, or password handling.
- **Concurrency**: idempotency is protected by the unique index. A save+unsave firing
  at the exact same instant would resolve to last-writer-wins on `deletedAt`, which is
  acceptable here; a stricter version would wrap read-modify-write in a transaction.
- **No client-side tests** — the brief asks for unit + one API test; I put the testing
  budget on the business logic and the auth/happy-path API boundary where correctness
  matters most.

## What I'd do next with another day
- Cursor-based pagination + a real `hasMore` flag.
- Move save/un-save into a single DB transaction to harden the same-instant race.
- Add a comments count and a "remove post" moderator action (schema already supports
  it — moderators bypass enrollment).
- A couple of React Testing Library tests for the optimistic toggle + rollback.
- Postgres driver swap + a Docker Compose, keeping SQLite as the zero-infra default.
