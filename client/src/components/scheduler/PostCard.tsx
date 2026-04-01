import { Card } from '../ui/card';
import { Button } from '../ui/button';
import type { ScheduledPost, ScheduledPostStatus } from '../../types';
import { formatDateTime } from '../../lib/utils';
import { MediaPreview } from './MediaPreview';

const nextStatuses: ScheduledPostStatus[] = [
  'pending',
  'scheduled',
  'published',
  'failed',
  'cancelled',
];

export const PostCard = ({
  post,
  onStatusChange,
}: {
  post: ScheduledPost;
  onStatusChange: (status: ScheduledPostStatus) => void;
}) => (
  <Card className="post-card">
    <div className="post-card__header">
      <div>
        <p className="section-eyebrow">{post.platform || 'Platform pending'}</p>
        <h3>{post.caption || 'Untitled scheduled post'}</h3>
      </div>
      <span className={`status-pill status-pill--${post.status}`}>{post.status}</span>
    </div>
    <p className="post-card__date">Scheduled for {formatDateTime(post.scheduledFor)}</p>
    {post.lastError ? <p className="post-card__date">{post.lastError}</p> : null}
    {post.mediaUrl ? (
      <a className="post-card__media" href={post.mediaUrl} target="_blank" rel="noreferrer">
        <MediaPreview
          src={post.mediaUrl}
          alt={post.caption || post.id}
          mediaType={post.mediaType}
        />
        <span>{post.mediaUrl}</span>
      </a>
    ) : null}
    <div className="post-card__actions">
      {nextStatuses.map((status) => (
        <Button
          key={status}
          variant={post.status === status ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => onStatusChange(status)}
        >
          {status}
        </Button>
      ))}
    </div>
  </Card>
);
