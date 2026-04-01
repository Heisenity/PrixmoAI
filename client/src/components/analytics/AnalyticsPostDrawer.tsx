import {
  CalendarClock,
  Image as ImageIcon,
  MessageCircle,
  Play,
  Share2,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { MediaPreview } from '../scheduler/MediaPreview';
import type { AnalyticsPostInsight } from '../../types';
import { formatDateTime } from '../../lib/utils';

export const AnalyticsPostDrawer = ({
  post,
  isOpen,
  onClose,
}: {
  post: AnalyticsPostInsight | null;
  isOpen: boolean;
  onClose: () => void;
}) => {
  if (!post || !isOpen) {
    return null;
  }

  return (
    <div className="generated-image-lightbox analytics-post-drawer" role="dialog" aria-modal="true">
      <button
        type="button"
        className="generated-image-lightbox__backdrop"
        aria-label="Close analytics post details"
        onClick={onClose}
      />
      <aside className="generated-image-lightbox__panel analytics-post-drawer__panel">
        <div className="analytics-post-drawer__header">
          <div>
            <p className="section-eyebrow">{post.platformLabel}</p>
            <h3>{post.postType ? `${post.postType} performance` : 'Post performance'}</h3>
          </div>
          <button
            type="button"
            className="generated-image-card__action"
            onClick={onClose}
            aria-label="Close analytics post details"
          >
            <X size={16} />
          </button>
        </div>

        <div className="analytics-post-drawer__body">
          <div className="analytics-post-drawer__preview">
            <MediaPreview
              src={post.mediaUrl}
              mediaType={post.postType === 'video' || post.postType === 'reel' ? 'video' : 'image'}
              alt={post.caption || post.id}
            />
          </div>

          <div className="analytics-post-drawer__meta">
            <div className="analytics-post-drawer__pill-row">
              <span>{post.platformLabel}</span>
              <span>{post.postType || 'Post'}</span>
              <span>{post.socialAccountName || 'Connected account'}</span>
            </div>
            <p>{post.caption || 'No caption captured for this post.'}</p>
            <div className="analytics-post-drawer__timeline">
              <span><CalendarClock size={14} />{post.publishedTime ? formatDateTime(post.publishedTime) : 'Publish time unavailable'}</span>
              <span><Users size={14} />Reach {post.reach.toLocaleString()}</span>
              <span><TrendingUp size={14} />{post.engagementRate?.toFixed(1) || '0.0'}% engagement</span>
            </div>
          </div>

          <div className="analytics-post-drawer__metrics">
            <div><span>Impressions</span><strong>{post.impressions.toLocaleString()}</strong></div>
            <div><span>Reach</span><strong>{post.reach.toLocaleString()}</strong></div>
            <div><span>Likes</span><strong>{post.likes.toLocaleString()}</strong></div>
            <div><span>Comments</span><strong>{post.comments.toLocaleString()}</strong></div>
            <div><span>Saves</span><strong>{post.saves.toLocaleString()}</strong></div>
            <div><span>Shares / Reactions</span><strong>{(post.shares + post.reactions).toLocaleString()}</strong></div>
            <div><span>Video plays</span><strong>{post.videoPlays ? post.videoPlays.toLocaleString() : '—'}</strong></div>
            <div><span>Replays</span><strong>{post.replays ? post.replays.toLocaleString() : '—'}</strong></div>
            <div><span>Exits</span><strong>{post.exits ? post.exits.toLocaleString() : '—'}</strong></div>
            <div><span>Profile visits</span><strong>{post.profileVisits ? post.profileVisits.toLocaleString() : '—'}</strong></div>
            <div><span>Post clicks</span><strong>{post.postClicks ? post.postClicks.toLocaleString() : '—'}</strong></div>
            <div><span>Page likes</span><strong>{post.pageLikes ? post.pageLikes.toLocaleString() : '—'}</strong></div>
            <div><span>Completion rate</span><strong>{post.completionRate !== null ? `${post.completionRate.toFixed(1)}%` : '—'}</strong></div>
            <div><span>Followers at post time</span><strong>{post.followersAtPostTime !== null ? post.followersAtPostTime.toLocaleString() : '—'}</strong></div>
            <div><span>Performance score</span><strong>{post.performanceScore.toFixed(1)}</strong></div>
          </div>

          <div className="analytics-post-drawer__subsections">
            <section className="analytics-post-drawer__section">
              <h4>Reach breakdown</h4>
              <div className="analytics-post-drawer__breakdown">
                <span><Users size={14} />Reach {post.reach.toLocaleString()}</span>
                <span><ImageIcon size={14} />Impressions {post.impressions.toLocaleString()}</span>
                <span><TrendingUp size={14} />Engagements {post.engagements.toLocaleString()}</span>
                <span><Play size={14} />Performance score {post.performanceScore.toFixed(1)}</span>
              </div>
            </section>

            <section className="analytics-post-drawer__section">
              <h4>Engagement breakdown</h4>
              <div className="analytics-post-drawer__breakdown">
                <span><ImageIcon size={14} />Impressions {post.impressions.toLocaleString()}</span>
                <span><MessageCircle size={14} />Comments {post.comments.toLocaleString()}</span>
                <span><Share2 size={14} />Shares {post.shares.toLocaleString()}</span>
                <span><Share2 size={14} />Reactions {post.reactions.toLocaleString()}</span>
                <span><Play size={14} />Video plays {post.videoPlays.toLocaleString()}</span>
                <span><Play size={14} />Replays {post.replays.toLocaleString()}</span>
                <span><Users size={14} />Post clicks {post.postClicks.toLocaleString()}</span>
                <span><Users size={14} />Profile visits {post.profileVisits.toLocaleString()}</span>
              </div>
            </section>

            <section className="analytics-post-drawer__section">
              <h4>Trend snippet</h4>
              <div className="analytics-post-drawer__trend">
                {post.trend.length ? (
                  post.trend.map((point) => (
                    <div key={point.date} className="analytics-post-drawer__trend-row">
                      <span>{point.label}</span>
                      <span>{point.impressions.toLocaleString()} impressions</span>
                      <span>{point.engagements.toLocaleString()} engagements</span>
                    </div>
                  ))
                ) : (
                  <p>No per-post time series available yet.</p>
                )}
              </div>
            </section>

            <section className="analytics-post-drawer__section">
              <h4>Top comments</h4>
              {post.topComments.length ? (
                <div className="analytics-post-drawer__comments">
                  {post.topComments.map((comment) => (
                    <p key={comment}>{comment}</p>
                  ))}
                </div>
              ) : (
                <p>No comments were captured for this post.</p>
              )}
            </section>
          </div>
        </div>
      </aside>
    </div>
  );
};
