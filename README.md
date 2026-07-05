# Community Forum — Saved Posts

A layered full-stack slice: a course discussion feed plus an end-to-end
bookmark ("Saved Posts") feature. See **NOTES.md** for design decisions and
trade-offs.

## Stack
- **Server:** Node + TypeScript (strict), Express, Zod, Drizzle ORM, libSQL (SQLite)
- **Web:** React 18 + Vite, TanStack React Query v5, Intl-based i18n (en/es)
- **Tests:** Vitest + supertest (18 tests)

## Prerequisites
- Node 18+ and npm. No database to install — libSQL runs from a local file.

## Setup

Run these from the repo root.

```bash
# 1. install everything (root, server, web via npm workspaces)
npm install

# 2. create schema + seed data (2 courses, 4 users, 5 posts)
npm run seed

# 3. start the API (http://localhost:4000)
npm run dev:server

# 4. in a second terminal, start the web app (http://localhost:5173)
npm run dev:web

# 5. run unit + API tests (from repo root)
npm test
```

The web dev server proxies `/api` to the server on port 4000, so just open
**http://localhost:5173**.

## Trying it out

There's no login (auth is stubbed per the brief). Use the **user switcher** in the
top-right to act as different seeded users; the API reads identity from an
`x-user-id` header.

| User    | Role      | Enrolled in            | Try this |
|---------|-----------|------------------------|----------|
| Alice   | student   | TypeScript Fundamentals| save/un-save posts, open **Saved** |
| Bob     | student   | Database Design        | switch course to TS → feed shows an error (403) |
| Carol   | student   | both courses           | save across both, watch ordering |
| Morgan  | moderator | (none)                 | can read any course |

The **locale switcher** (EN/ES) swaps every string, including the correctly
pluralized saves count ("1 save" / "12 saves").

## API

All routes are under `/api` and require an `x-user-id` header (else `401`).

| Method + path                          | Purpose                          |
|----------------------------------------|----------------------------------|
| `GET /api/courses/:courseId/feed?page=`| paginated feed, newest first     |
| `POST /api/posts/:postId/save`         | save (idempotent)                |
| `DELETE /api/posts/:postId/save`       | un-save (soft delete, idempotent)|
| `GET /api/saved?page=`                 | current user's saved list        |

Status codes: `401` unauthenticated · `403` course not enrolled · `404` post not found.
