import { useState } from 'react';
import { setCurrentUser, type Post } from './api';
import { makeT, type Locale } from './i18n';
import { useFeed, useSaved, useToggleSave } from './hooks';
import { EmptyState, Feedback, PostCard } from './components';
import { useQueryClient } from '@tanstack/react-query';
import { resetForumCache } from './hooks';

/**
 * APP SHELL
 * ---------
 * Wires the data hooks to the presentational components and hosts two views:
 * Feed and Saved. Also provides a stubbed user switcher (to demonstrate the
 * per-user access rules) and a locale switcher (to demonstrate i18n).
 *
 * The demo users mirror the seed data:
 *   alice  -> course-ts only
 *   bob    -> course-db only
 *   carol  -> both courses
 *   mod    -> moderator (sees any course)
 */

type Tab = 'feed' | 'saved';

const DEMO_USERS = [
  { id: 'alice', label: 'Alice (course-ts)' },
  { id: 'bob', label: 'Bob (course-db)' },
  { id: 'carol', label: 'Carol (both)' },
  { id: 'mod', label: 'Morgan (moderator)' },
];
const COURSES = [
  { id: 'course-ts', label: 'TypeScript Fundamentals' },
  { id: 'course-db', label: 'Database Design' },
];

export default function App() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('feed');
  const [locale, setLocale] = useState<Locale>('en');
  const [userId, setUserId] = useState('alice');
  const [courseId, setCourseId] = useState('course-ts');
  const t = makeT(locale);

  function switchUser(id: string) {
    setCurrentUser(id);
    setUserId(id);
    resetForumCache(qc); // don't leak one user's cache to the next
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Community Forum</div>
        <div className="controls">
          <label>
            <span className="sr-only">User</span>
            <select value={userId} onChange={(e) => switchUser(e.target.value)}>
              {DEMO_USERS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Locale</span>
            <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
              <option value="en">EN</option>
              <option value="es">ES</option>
            </select>
          </label>
        </div>
      </header>

      <nav className="tabs">
        <button className={tab === 'feed' ? 'active' : ''} onClick={() => setTab('feed')}>
          {t.t('feed')}
        </button>
        <button className={tab === 'saved' ? 'active' : ''} onClick={() => setTab('saved')}>
          {t.t('saved')}
        </button>
      </nav>

      {tab === 'feed' && (
        <div className="view">
          <div className="course-picker">
            {COURSES.map((c) => (
              <button
                key={c.id}
                className={courseId === c.id ? 'chip active' : 'chip'}
                onClick={() => setCourseId(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <FeedView courseId={courseId} t={t} />
        </div>
      )}

      {tab === 'saved' && (
        <div className="view">
          <SavedView t={t} courseId={courseId} />
        </div>
      )}
    </div>
  );
}

function FeedView({ courseId, t }: { courseId: string; t: ReturnType<typeof makeT> }) {
  const feed = useFeed(courseId);
  const toggle = useToggleSave(courseId);

  if (feed.isLoading) return <Feedback kind="loading" message={t.t('loading')} />;
  if (feed.isError) {
    // 403 for a non-enrolled course is an expected outcome, not a crash.
    return <Feedback kind="error" message={t.t('error')} />;
  }
  const posts = feed.data?.posts ?? [];
  if (posts.length === 0) return <EmptyState message={t.t('emptyFeed')} />;

  const onToggle = (p: Post) => toggle.mutate({ postId: p.id, hasSaved: p.hasSaved });
  return (
    <div className="list">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} onToggle={onToggle} t={t} />
      ))}
    </div>
  );
}

function SavedView({ t, courseId }: { t: ReturnType<typeof makeT>; courseId: string }) {
  const saved = useSaved();
  // Un-saving from the saved list still needs a course context for cache keys;
  // the toggle invalidates both lists regardless of which course the post is in.
  const toggle = useToggleSave(courseId);

  if (saved.isLoading) return <Feedback kind="loading" message={t.t('loading')} />;
  if (saved.isError) return <Feedback kind="error" message={t.t('error')} />;
  const posts = saved.data?.posts ?? [];
  if (posts.length === 0) return <EmptyState message={t.t('emptySaved')} />;

  const onToggle = (p: Post) => toggle.mutate({ postId: p.id, hasSaved: p.hasSaved });
  return (
    <div className="list">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} onToggle={onToggle} t={t} />
      ))}
    </div>
  );
}
