import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BestPostWidget } from '../../components/analytics/BestPostWidget';
import { StatsCard } from '../../components/analytics/StatsCard';
import { WeeklyScoreCard } from '../../components/analytics/WeeklyScoreCard';
import { CurrentPlanBadge } from '../../components/billing/CurrentPlanBadge';
import { EmptyState } from '../../components/shared/EmptyState';
import { UsageMeter } from '../../components/shared/UsageMeter';
import { Card } from '../../components/ui/card';
import { useAnalytics } from '../../hooks/useAnalytics';
import { useAuth } from '../../hooks/useAuth';
import { useBilling } from '../../hooks/useBilling';
import { useContent } from '../../hooks/useContent';
import { useImages } from '../../hooks/useImages';
import { useScheduler } from '../../hooks/useScheduler';
import { apiRequest } from '../../lib/axios';
import { setActiveGenerateConversationId } from '../../lib/generateWorkspace';
import { formatCompactNumber, formatDateTime } from '../../lib/utils';
import type { GenerateConversation } from '../../types';

export const DashboardPage = () => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { overview } = useAnalytics();
  const { catalog } = useBilling();
  const { history: contentHistory, refreshHistory } = useContent();
  const { history: imageHistory, refreshHistory: refreshImageHistory } = useImages();
  const { posts } = useScheduler();
  const [conversations, setConversations] = useState<GenerateConversation[]>([]);

  const subscription = catalog?.currentSubscription;
  const monthlyLimit = subscription?.monthlyLimit ?? null;

  useEffect(() => {
    if (!token) {
      setConversations([]);
      return;
    }

    const refreshRecentData = async () => {
      try {
        const nextConversations = await apiRequest<GenerateConversation[]>(
          '/api/generate/conversations',
          { token }
        );
        setConversations(nextConversations);
        await Promise.all([refreshHistory(), refreshImageHistory()]);
      } catch {
        return;
      }
    };

    void refreshRecentData();

    const intervalId = window.setInterval(() => {
      void refreshRecentData();
    }, 30000);

    const handleFocus = () => {
      void refreshRecentData();
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [token, refreshHistory, refreshImageHistory]);

  const liveConversationMap = useMemo(
    () => new Map(conversations.map((conversation) => [conversation.id, conversation])),
    [conversations]
  );

  const recentThreadContent = useMemo(
    () =>
      (contentHistory?.items ?? [])
        .filter(
          (item) => item.conversationId && liveConversationMap.has(item.conversationId)
        )
        .slice(0, 3),
    [contentHistory?.items, liveConversationMap]
  );

  const recentThreadImages = useMemo(
    () =>
      (imageHistory?.items ?? [])
        .filter(
          (item) => item.conversationId && liveConversationMap.has(item.conversationId)
        )
        .slice(0, 3),
    [imageHistory?.items, liveConversationMap]
  );

  const openRecentConversation = (conversationId: string | null) => {
    if (!conversationId) {
      return;
    }

    setActiveGenerateConversationId(conversationId);
    navigate('/app/generate');
  };

  return (
    <div className="page-stack">
      <div className="stats-grid">
        <StatsCard
          label="Generated content"
          value={formatCompactNumber(overview?.generation.totalGeneratedContent || 0)}
          hint="All-time content packs"
        />
        <StatsCard
          label="Generated images"
          value={formatCompactNumber(overview?.generation.totalGeneratedImages || 0)}
          hint="All-time image outputs"
        />
        <StatsCard
          label="Scheduled posts"
          value={formatCompactNumber(overview?.generation.totalScheduledPosts || 0)}
          hint="Queued in the scheduler"
        />
        {overview?.weeklyComparison ? (
          <WeeklyScoreCard comparison={overview.weeklyComparison} />
        ) : (
          <StatsCard label="Weekly movement" value="0%" hint="Waiting for analytics records" />
        )}
      </div>

      <div className="dashboard-grid">
        <Card className="dashboard-panel">
          <div className="dashboard-panel__header">
            <div>
              <p className="section-eyebrow">Subscription state</p>
              <h3>Plan and monthly allowance</h3>
            </div>
            {subscription ? <CurrentPlanBadge plan={subscription.plan} /> : null}
          </div>
          <div className="dashboard-panel__body">
            <UsageMeter
              label="Content generations this month"
              value={overview?.generation.contentGenerationsThisMonth || 0}
              limit={monthlyLimit}
            />
            <UsageMeter
              label="Image generations this month"
              value={overview?.generation.imageGenerationsThisMonth || 0}
              limit={monthlyLimit}
            />
          </div>
        </Card>

        <BestPostWidget post={overview?.bestPostThisWeek || null} />
      </div>

      <div className="dashboard-grid">
        <Card className="dashboard-panel">
          <div className="dashboard-panel__header">
            <div>
              <p className="section-eyebrow">Recent content</p>
              <h3>Latest generated copy packs</h3>
            </div>
            <Link to="/app/generate">Open lab</Link>
          </div>
          {recentThreadContent.length ? (
            <div className="stack-list">
              {recentThreadContent.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="stack-list__item stack-list__item--interactive"
                  onClick={() => openRecentConversation(item.conversationId)}
                >
                  <strong>{item.productName}</strong>
                  <span>{item.platform || 'Platform not set'}</span>
                  <small>{formatDateTime(item.createdAt)}</small>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No content yet"
              description="Generate your first conversation-backed copy pack and it will appear here."
            />
          )}
        </Card>

        <Card className="dashboard-panel">
          <div className="dashboard-panel__header">
            <div>
              <p className="section-eyebrow">Recent images</p>
              <h3>Latest visual outputs</h3>
            </div>
            <Link to="/app/generate">Generate</Link>
          </div>
          {recentThreadImages.length ? (
            <div className="image-strip">
              {recentThreadImages.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="image-strip__item"
                  onClick={() => openRecentConversation(item.conversationId)}
                >
                  <img
                    src={item.generatedImageUrl}
                    alt={item.prompt || item.id}
                  />
                  <span>{formatDateTime(item.createdAt)}</span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No images yet"
              description="Once the first conversation-linked image lands, the gallery will populate here."
            />
          )}
        </Card>
      </div>

      <Card className="dashboard-panel">
        <div className="dashboard-panel__header">
          <div>
            <p className="section-eyebrow">Scheduler queue</p>
            <h3>Upcoming posts</h3>
          </div>
          <Link to="/app/scheduler">Manage queue</Link>
        </div>
        {posts?.items.length ? (
          <div className="stack-list">
            {posts.items.slice(0, 4).map((post) => (
              <div key={post.id} className="stack-list__item">
                <strong>{post.caption || 'Untitled post'}</strong>
                <span>{post.status}</span>
                <small>{formatDateTime(post.scheduledFor)}</small>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No posts queued"
            description="Connect a social account and create the first scheduled post."
          />
        )}
      </Card>
    </div>
  );
};
