import type { Post } from './api';
import type { Translator } from './i18n';

/**
 * PRESENTATIONAL COMPONENTS
 * -------------------------
 * These take data + callbacks as props and render. They do no fetching and hold
 * no server state — that separation is what the brief asks for. All text comes
 * from the translator `t`, never hard-coded.
 */

export function BookmarkToggle({
  post,
  onToggle,
  t,
  disabled,
}: {
  post: Post;
  onToggle: (post: Post) => void;
  t: Translator;
  disabled?: boolean;
}) {
  const label = post.hasSaved ? t.t('unsave') : t.t('save');
  return (
    <button
      className={`bookmark ${post.hasSaved ? 'is-saved' : ''}`}
      aria-pressed={post.hasSaved}
      aria-label={label}
      disabled={disabled}
      onClick={() => onToggle(post)}
    >
      <span aria-hidden="true">{post.hasSaved ? '★' : '☆'}</span>
      <span>{label}</span>
    </button>
  );
}

export function PostCard({
  post,
  onToggle,
  t,
}: {
  post: Post;
  onToggle: (post: Post) => void;
  t: Translator;
}) {
  return (
    <article className="card">
      <header className="card-head">
        <h3>{post.title}</h3>
        <BookmarkToggle post={post} onToggle={onToggle} t={t} />
      </header>
      <p className="card-body">{post.body}</p>
      <footer className="card-foot">
        <span className="muted">
          {t.t('by')} {post.authorName}
        </span>
        <span className="count">{t.savesLabel(post.savesCount)}</span>
      </footer>
    </article>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="empty" role="status">
      <p>{message}</p>
    </div>
  );
}

export function Feedback({ kind, message }: { kind: 'loading' | 'error'; message: string }) {
  return (
    <div className={`feedback ${kind}`} role="status">
      {message}
    </div>
  );
}
