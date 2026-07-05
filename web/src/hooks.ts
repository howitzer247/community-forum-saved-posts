import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { api, getCurrentUser, type Page, type Post } from './api';

/**
 * QUERY-KEY FACTORY
 * -----------------
 * One source of truth for cache keys. Keys are scoped by the current user so
 * switching users never shows another user's cached data. Centralizing keys is
 * what makes cache invalidation after a mutation reliable — no stringly-typed
 * keys scattered across components.
 */
export const keys = {
  feed: (userId: string, courseId: string) => ['feed', userId, courseId] as const,
  saved: (userId: string) => ['saved', userId] as const,
};

/** DATA HOOK: feed for a course. */
export function useFeed(courseId: string) {
  const userId = getCurrentUser();
  return useQuery({
    queryKey: keys.feed(userId, courseId),
    queryFn: () => api.getFeed(courseId),
  });
}

/** DATA HOOK: the current user's saved list. */
export function useSaved() {
  const userId = getCurrentUser();
  return useQuery({
    queryKey: keys.saved(userId),
    queryFn: () => api.getSaved(),
  });
}

/** Patch a single post's flags inside any cached Page, immutably. */
function patchPostInPage(page: Page | undefined, postId: string, next: Partial<Post>): Page | undefined {
  if (!page) return page;
  return { ...page, posts: page.posts.map((p) => (p.id === postId ? { ...p, ...next } : p)) };
}

/**
 * MUTATION HOOK: toggle save with an OPTIMISTIC update.
 * The bookmark flips instantly (responsive UI), we roll back on error, and we
 * invalidate on settle so the server's authoritative counts/order win. This is
 * the "keep the toggle responsive and the cache consistent after a mutation"
 * requirement.
 */
export function useToggleSave(courseId: string) {
  const qc = useQueryClient();
  const userId = getCurrentUser();

  type Vars = { postId: string; hasSaved: boolean };
  type Ctx = {
    prevFeed: Page | undefined;
    prevSaved: Page | undefined;
    feedKey: readonly unknown[];
    savedKey: readonly unknown[];
  };

  return useMutation<{ hasSaved: boolean }, Error, Vars, Ctx>({
    mutationFn: ({ postId, hasSaved }: Vars): Promise<{ hasSaved: boolean }> =>
      hasSaved ? api.unsave(postId) : api.save(postId),

    onMutate: async ({ postId, hasSaved }): Promise<Ctx> => {
      const feedKey = keys.feed(userId, courseId);
      const savedKey = keys.saved(userId);
      await Promise.all([
        qc.cancelQueries({ queryKey: feedKey }),
        qc.cancelQueries({ queryKey: savedKey }),
      ]);

      const prevFeed = qc.getQueryData<Page>(feedKey);
      const prevSaved = qc.getQueryData<Page>(savedKey);

      // Optimistically flip the flag + nudge the count in the feed.
      const delta = hasSaved ? -1 : 1;
      qc.setQueryData<Page>(feedKey, (old) =>
        patchPostInPage(old, postId, {
          hasSaved: !hasSaved,
          savesCount: Math.max(0, (old?.posts.find((p) => p.id === postId)?.savesCount ?? 0) + delta),
        }),
      );

      return { prevFeed, prevSaved, feedKey, savedKey };
    },

    onError: (_err, _vars, ctx) => {
      // Roll back to the snapshots taken in onMutate.
      if (ctx) {
        qc.setQueryData(ctx.feedKey, ctx.prevFeed);
        qc.setQueryData(ctx.savedKey, ctx.prevSaved);
      }
    },

    onSettled: () => {
      // Re-fetch both lists so server truth (exact counts, saved-list order) wins.
      qc.invalidateQueries({ queryKey: keys.feed(userId, courseId) });
      qc.invalidateQueries({ queryKey: keys.saved(userId) });
    },
  });
}

/** Exposed for tests / debugging: clear all cached forum data. */
export function resetForumCache(qc: QueryClient) {
  qc.removeQueries({ queryKey: ['feed'] });
  qc.removeQueries({ queryKey: ['saved'] });
}
