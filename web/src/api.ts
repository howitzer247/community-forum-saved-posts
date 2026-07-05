/**
 * TYPED API CLIENT
 * ----------------
 * The single place that knows HTTP verbs, paths, and headers. Every network call
 * goes through here and returns typed data. The React Query hooks call these
 * functions; UI components never touch fetch directly.
 *
 * Auth is stubbed the same way the server expects it: an x-user-id header. In a
 * real app this would be a token from a session; here a header keeps the demo
 * simple while still exercising the server's 401/403 rules.
 */

export interface Post {
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

export interface Page {
  posts: Post[];
  page: number;
  pageSize: number;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Current stubbed identity. Swappable via the user switcher in the UI. */
let currentUserId = 'alice';
export function setCurrentUser(id: string) {
  currentUserId = id;
}
export function getCurrentUser(): string {
  return currentUserId;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-user-id': currentUserId,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new ApiError(res.status, msg);
  }
  return (await res.json()) as T;
}

export const api = {
  getFeed: (courseId: string, page = 1) =>
    req<Page>(`/api/courses/${courseId}/feed?page=${page}`),
  getSaved: (page = 1) => req<Page>(`/api/saved?page=${page}`),
  save: (postId: string) =>
    req<{ hasSaved: true }>(`/api/posts/${postId}/save`, { method: 'POST' }),
  unsave: (postId: string) =>
    req<{ hasSaved: false }>(`/api/posts/${postId}/save`, { method: 'DELETE' }),
};
