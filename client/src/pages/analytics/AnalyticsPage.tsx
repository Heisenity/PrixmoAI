import {
  Bookmark,
  Facebook,
  Heart,
  Image as ImageIcon,
  Instagram,
  Linkedin,
  MessageCircle,
  Share2,
  TrendingUp,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '../../components/shared/EmptyState';
import { ErrorMessage } from '../../components/shared/ErrorMessage';
import { LoadingSpinner } from '../../components/shared/LoadingSpinner';
import { Card } from '../../components/ui/card';
import { useAnalytics } from '../../hooks/useAnalytics';
import { formatCompactNumber, formatDateTime } from '../../lib/utils';

const getPlatformIcon = (platform: string) => {
  const normalized = platform.trim().toLowerCase();

  if (normalized === 'instagram') {
    return Instagram;
  }

  if (normalized === 'linkedin') {
    return Linkedin;
  }

  if (normalized === 'facebook') {
    return Facebook;
  }

  return TrendingUp;
};

export const AnalyticsPage = () => {
  const { overview, isLoading, error } = useAnalytics();
  const platformSignals = overview?.generation.platformSignals ?? [];
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);

  useEffect(() => {
    if (!platformSignals.length) {
      setSelectedPlatform(null);
      return;
    }

    if (
      !selectedPlatform ||
      !platformSignals.some((entry) => entry.platform === selectedPlatform)
    ) {
      setSelectedPlatform(platformSignals[0].platform);
    }
  }, [platformSignals, selectedPlatform]);

  const activeSignal = useMemo(
    () =>
      platformSignals.find((entry) => entry.platform === selectedPlatform) ??
      platformSignals[0] ??
      null,
    [platformSignals, selectedPlatform]
  );

  if (isLoading && !overview) {
    return (
      <Card className="dashboard-panel">
        <div className="screen-center">
          <LoadingSpinner label="Loading analytics" />
        </div>
      </Card>
    );
  }

  return (
    <div className="page-stack">
      <ErrorMessage message={error} />

      <Card className="analytics-platform-panel">
        <div className="analytics-platform-panel__header">
          <div>
            <p className="section-eyebrow">Signals</p>
            <h2>See how each platform is performing.</h2>
            <p>
              Choose a channel to read recent post performance in one clean view.
            </p>
          </div>
        </div>

        {platformSignals.length ? (
          <>
            <div className="analytics-platform-tabs" role="tablist" aria-label="Platforms">
              {platformSignals.map((signal) => {
                const Icon = getPlatformIcon(signal.platform);
                const isActive = signal.platform === activeSignal?.platform;

                return (
                  <button
                    key={signal.platform}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`analytics-platform-tab ${
                      isActive ? 'analytics-platform-tab--active' : ''
                    }`}
                    onClick={() => setSelectedPlatform(signal.platform)}
                  >
                    <Icon size={16} />
                    <div className="analytics-platform-tab__copy">
                      <strong>{signal.platform}</strong>
                      <span>{signal.posts} tracked post{signal.posts === 1 ? '' : 's'}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {activeSignal ? (
              <div className="analytics-platform-view">
                <div className="analytics-platform-view__top">
                  <div className="analytics-platform-view__intro">
                    <div className="analytics-platform-view__pill">
                      {(() => {
                        const Icon = getPlatformIcon(activeSignal.platform);
                        return <Icon size={16} />;
                      })()}
                      <span>{activeSignal.platform}</span>
                    </div>
                    <h3>{activeSignal.platform} performance</h3>
                    <p>
                      Last updated {formatDateTime(activeSignal.latestRecordedAt)} with{' '}
                      {activeSignal.posts} tracked post
                      {activeSignal.posts === 1 ? '' : 's'}.
                    </p>
                  </div>

                  <div className="analytics-platform-metrics">
                    <div className="analytics-platform-metric">
                      <span>Reach</span>
                      <strong>{formatCompactNumber(activeSignal.reach)}</strong>
                    </div>
                    <div className="analytics-platform-metric">
                      <span>Impressions</span>
                      <strong>{formatCompactNumber(activeSignal.impressions)}</strong>
                    </div>
                    <div className="analytics-platform-metric">
                      <span>Total engagement</span>
                      <strong>{formatCompactNumber(activeSignal.totalEngagement)}</strong>
                    </div>
                    <div className="analytics-platform-metric">
                      <span>Avg engagement</span>
                      <strong>{activeSignal.averageEngagementRate.toFixed(1)}%</strong>
                    </div>
                  </div>
                </div>

                <div className="analytics-platform-posts">
                  <div className="analytics-platform-posts__header">
                    <div>
                      <p className="section-eyebrow">Tracked posts</p>
                      <h3>Recent post signals</h3>
                    </div>
                  </div>

                  <div className="stack-list">
                    {activeSignal.recentPosts.map((post) => (
                      <div key={post.id} className="analytics-post-row">
                        <div className="analytics-post-row__top">
                          <div>
                            <strong>
                              {post.postExternalId
                                ? `Post ${post.postExternalId}`
                                : `Tracked post · ${formatDateTime(post.recordedAt)}`}
                            </strong>
                            <small>{formatDateTime(post.recordedAt)}</small>
                          </div>
                          <div className="analytics-post-row__score">
                            <TrendingUp size={14} />
                            <span>
                              {(post.engagementRate ?? activeSignal.averageEngagementRate).toFixed(
                                1
                              )}
                              %
                            </span>
                          </div>
                        </div>

                        <div className="analytics-post-row__metrics">
                          <span>
                            <ImageIcon size={14} />
                            Reach {formatCompactNumber(post.reach)}
                          </span>
                          <span>
                            <TrendingUp size={14} />
                            Impressions {formatCompactNumber(post.impressions)}
                          </span>
                          <span>
                            <Heart size={14} />
                            Likes {formatCompactNumber(post.likes)}
                          </span>
                          <span>
                            <MessageCircle size={14} />
                            Comments {formatCompactNumber(post.comments)}
                          </span>
                          <span>
                            <Share2 size={14} />
                            Shares {formatCompactNumber(post.shares)}
                          </span>
                          <span>
                            <Bookmark size={14} />
                            Saves {formatCompactNumber(post.saves)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState
            title="No platform analytics yet"
            description="Once Instagram, LinkedIn, Facebook, and other connected accounts start sending post metrics, this signal view will fill in automatically."
          />
        )}
      </Card>
    </div>
  );
};
