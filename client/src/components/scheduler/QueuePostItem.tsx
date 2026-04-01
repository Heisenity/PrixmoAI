import {
  CalendarClock,
  Eye,
  EyeOff,
  PenSquare,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatDateTime } from '../../lib/utils';
import type { ScheduledPost, SocialAccount } from '../../types';
import { MediaPreview } from './MediaPreview';
import { MediaThumbnail } from './MediaThumbnail';
import { QueueStatusBadge } from './QueueStatusBadge';

const getPostTitle = (post: ScheduledPost) => {
  const firstLine = post.caption
    ?.split('\n')
    .map((segment) => segment.trim())
    .find(Boolean);

  return firstLine || 'Untitled post';
};

const getPlatformLabel = (platform?: string | null) => {
  if (platform === 'instagram') {
    return 'Instagram Professional Account';
  }

  if (platform === 'facebook') {
    return 'Facebook Page';
  }

  if (platform === 'linkedin') {
    return 'LinkedIn Profile';
  }

  if (platform === 'x') {
    return 'X Profile';
  }

  return 'Connected channel';
};

const getTimeLabel = (post: ScheduledPost) => {
  if (post.status === 'published' && post.publishedAt) {
    return `Published ${formatDateTime(post.publishedAt)}`;
  }

  if (post.status === 'failed' && post.publishAttemptedAt) {
    return `Attempted ${formatDateTime(post.publishAttemptedAt)}`;
  }

  if (post.status === 'cancelled') {
    return `Cancelled ${formatDateTime(post.updatedAt)}`;
  }

  return `Scheduled ${formatDateTime(post.scheduledFor)}`;
};

export const QueuePostItem = ({
  post,
  account,
  canEdit,
  canCancel,
  onEdit,
  onCancel,
}: {
  post: ScheduledPost;
  account?: SocialAccount;
  canEdit: boolean;
  canCancel: boolean;
  onEdit: () => void;
  onCancel: () => void;
}) => {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const title = useMemo(() => getPostTitle(post), [post]);
  const subtitle = account?.accountName?.trim() || getPlatformLabel(account?.platform || post.platform);
  const url = account?.profileUrl || account?.accountId || null;
  const isActionable = post.status === 'pending' || post.status === 'scheduled';
  const tooltip = post.actionBlockedReason || 'Post is being prepared for publishing';

  return (
    <article className="queue-post-item">
      <div className="queue-post-item__row">
        <MediaThumbnail
          src={post.mediaUrl}
          alt={title}
          mediaType={post.mediaType}
          size="sm"
        />

        <div className="queue-post-item__copy">
          <div className="queue-post-item__meta">
            <span>{subtitle}</span>
            <QueueStatusBadge status={post.status} />
          </div>
          <strong>{title}</strong>
          <div className="queue-post-item__submeta">
            <span className="queue-post-item__time">
              <CalendarClock size={14} />
              {getTimeLabel(post)}
            </span>
            {url ? <span>{url}</span> : null}
          </div>
          {post.lastError && post.status === 'failed' ? (
            <p className="queue-post-item__error">{post.lastError}</p>
          ) : null}
        </div>

        <div className="queue-post-item__actions">
          {post.mediaUrl ? (
            <button
              type="button"
              className="queue-post-item__action"
              onClick={() => setIsPreviewOpen((current) => !current)}
              aria-label={isPreviewOpen ? 'Hide preview' : 'Preview media'}
              title={isPreviewOpen ? 'Hide preview' : 'Preview media'}
            >
              {isPreviewOpen ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          ) : null}

          {isActionable ? (
            <>
              <span title={!canEdit ? tooltip : 'Edit scheduled post'}>
                <button
                  type="button"
                  className="queue-post-item__action"
                  onClick={onEdit}
                  aria-label="Edit scheduled post"
                  disabled={!canEdit}
                >
                  <PenSquare size={15} />
                </button>
              </span>
              <span title={!canCancel ? tooltip : 'Cancel scheduled post'}>
                <button
                  type="button"
                  className="queue-post-item__action queue-post-item__action--danger"
                  onClick={onCancel}
                  aria-label="Cancel scheduled post"
                  disabled={!canCancel}
                >
                  <XCircle size={15} />
                </button>
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div
        className={`queue-post-item__preview ${
          isPreviewOpen ? 'queue-post-item__preview--open' : ''
        }`}
      >
        {post.mediaUrl ? (
          <MediaPreview
            src={post.mediaUrl}
            alt={title}
            mediaType={post.mediaType}
          />
        ) : null}
      </div>
    </article>
  );
};
