import { Card } from '../ui/card';
import { formatDateTime } from '../../lib/utils';
import type { AnalyticsRecord } from '../../types';
import { PostMetricsRow } from './PostMetricsRow';
import { EmptyState } from '../shared/EmptyState';

export const BestPostWidget = ({
  post,
}: {
  post: AnalyticsRecord | null;
}) =>
  post ? (
    <Card className="best-post">
      <p className="section-eyebrow">Best post this week</p>
      <h3>{post.platform || 'Unspecified platform'}</h3>
      <p>Recorded {formatDateTime(post.recordedAt)}</p>
      <PostMetricsRow post={post} />
    </Card>
  ) : (
    <EmptyState
      title="No best post yet"
      description="Record a few analytics rows and this card will surface the strongest one."
    />
  );
