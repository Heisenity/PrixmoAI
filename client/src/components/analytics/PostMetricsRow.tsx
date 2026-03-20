import type { AnalyticsRecord } from '../../types';

export const PostMetricsRow = ({ post }: { post: AnalyticsRecord }) => (
  <div className="metrics-row">
    <span>Reach {post.reach}</span>
    <span>Impressions {post.impressions}</span>
    <span>Likes {post.likes}</span>
    <span>Comments {post.comments}</span>
    <span>Saves {post.saves}</span>
  </div>
);
