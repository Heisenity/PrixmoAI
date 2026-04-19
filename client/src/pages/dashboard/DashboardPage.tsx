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
import {
  isBrowserCacheFresh,
  readBrowserCache,
  writeBrowserCache,
} from '../../lib/browserCache';
import { setActiveGenerateConversationId } from '../../lib/generateWorkspace';
import { PLAN_DASHBOARD_DETAILS } from '../../lib/constants';
import { getUsageSnapshot } from '../../lib/usage';
import { formatCompactNumber, formatDateTime } from '../../lib/utils';
import type { GenerateConversation } from '../../types';

const DASHBOARD_CONVERSATIONS_CACHE_KEY_PREFIX =
  'prixmoai.dashboard.conversations';
const DASHBOARD_CONVERSATIONS_CACHE_TTL_MS = 60_000;

const buildDashboardConversationsCacheKey = (userId: string) =>
  `${DASHBOARD_CONVERSATIONS_CACHE_KEY_PREFIX}:${userId}`;

export const DashboardPage = () => {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const { overview, isLoading: isAnalyticsLoading } = useAnalytics();
  const { catalog } = useBilling();
  const { history: contentHistory, refreshHistory } = useContent();
  const { history: imageHistory, refreshHistory: refreshImageHistory } = useImages();
  const { upcomingPosts, refresh: refreshScheduler } = useScheduler({
    pollIntervalMs: 0,
  });
  const [conversations, setConversations] = useState<GenerateConversation[]>([]);

  const subscription = catalog?.currentSubscription;
  const activePlan = subscription?.plan ?? 'free';
  const planDetails = PLAN_DASHBOARD_DETAILS[activePlan];
  const generationOverview = overview?.generation ?? null;
  const hasUsageOverview = Boolean(generationOverview);
  const contentGenerationsToday = generationOverview?.contentGenerationsToday ?? null;
  const imageGenerationsToday = generationOverview?.imageGenerationsToday ?? null;
  const contentUsage = useMemo(
    () =>
      contentGenerationsToday === null
        ? null
        : getUsageSnapshot(contentGenerationsToday, planDetails.contentLimit),
    [contentGenerationsToday, planDetails.contentLimit]
  );
  const imageUsage = useMemo(
    () =>
      imageGenerationsToday === null
        ? null
        : getUsageSnapshot(imageGenerationsToday, planDetails.imageLimit),
    [imageGenerationsToday, planDetails.imageLimit]
  );
  const activeScheduledPostCount = useMemo(
    () => upcomingPosts.length,
    [upcomingPosts]
  );

  useEffect(() => {
    if (!token || !user?.id) {
      setConversations([]);
      return;
    }

    const initialCached = readBrowserCache<GenerateConversation[]>(
      buildDashboardConversationsCacheKey(user.id)
    );

    if (initialCached?.value) {
      setConversations(initialCached.value);
    }

    const refreshRecentData = async () => {
      try {
        const cached = readBrowserCache<GenerateConversation[]>(
          buildDashboardConversationsCacheKey(user.id)
        );

        if (cached?.value) {
          setConversations(cached.value);
        }

        if (
          cached?.cachedAt &&
          isBrowserCacheFresh(cached.cachedAt, DASHBOARD_CONVERSATIONS_CACHE_TTL_MS)
        ) {
          await Promise.all([
            refreshHistory(),
            refreshImageHistory(),
            refreshScheduler({ silent: true }),
          ]);
          return;
        }

        const nextConversations = await apiRequest<GenerateConversation[]>(
          '/api/generate/conversations',
          { token }
        );
        setConversations(nextConversations);
        writeBrowserCache(
          buildDashboardConversationsCacheKey(user.id),
          nextConversations
        );
        await Promise.all([
          refreshHistory(),
          refreshImageHistory(),
          refreshScheduler({ silent: true }),
        ]);
      } catch {
        return;
      }
    };

    void refreshRecentData();

    const handleFocus = () => {
      void refreshRecentData();
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [token, user?.id, refreshHistory, refreshImageHistory, refreshScheduler]);

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

    setActiveGenerateConversationId(conversationId, user?.id);
    navigate('/app/generate');
  };

  return (
    <div className="page-stack">
      <div className="stats-grid">
        <StatsCard
          label="Generated content"
          value={
            generationOverview
              ? formatCompactNumber(generationOverview.totalGeneratedContent)
              : '—'
          }
          hint="All-time content packs"
        />
        <StatsCard
          label="Generated images"
          value={
            generationOverview
              ? formatCompactNumber(generationOverview.totalGeneratedImages)
              : '—'
          }
          hint="All-time image outputs"
        />
        <StatsCard
          label="Scheduled posts"
          value={formatCompactNumber(activeScheduledPostCount)}
          hint="Queued in the scheduler"
        />
        {overview?.weeklyComparison ? (
          <WeeklyScoreCard comparison={overview.weeklyComparison} />
        ) : (
          <StatsCard
            label="Weekly movement"
            value={isAnalyticsLoading ? '—' : '0%'}
            hint={
              isAnalyticsLoading
                ? 'Syncing analytics'
                : 'Waiting for analytics records'
            }
          />
        )}
      </div>

      <div className="dashboard-grid">
        <Card className="dashboard-panel">
          <div className="dashboard-panel__header">
            <div>
              <p className="section-eyebrow">Subscription state</p>
              <h3>Plan and daily allowance</h3>
            </div>
            <CurrentPlanBadge plan={activePlan} />
          </div>
          <div className="dashboard-panel__body">
            <UsageMeter
              label={planDetails.contentMeterLabel}
              value={contentGenerationsToday}
              limit={planDetails.contentLimit}
              limitLabel={planDetails.contentLimitLabel}
            />
            <UsageMeter
              label={planDetails.imageMeterLabel}
              value={imageGenerationsToday}
              limit={planDetails.imageLimit}
              limitLabel={planDetails.imageLimitLabel}
            />
            <div className="dashboard-usage-bubbles" aria-label="Daily allowance remaining">
              <div className="dashboard-usage-bubble">
                <span className="dashboard-usage-bubble__label">Content left</span>
                <div className="dashboard-usage-bubble__value">
                  <strong>
                    {!contentUsage
                      ? 'Syncing'
                      : contentUsage.percentLeft === null
                      ? 'Unlimited'
                      : `${contentUsage.percentLeft}%`}
                  </strong>
                  <small>
                    {!contentUsage
                      ? 'Waiting for usage'
                      : contentUsage.remaining === null
                      ? 'No cap on captions'
                      : `${formatCompactNumber(contentUsage.remaining)} remaining`}
                  </small>
                </div>
              </div>
              <div className="dashboard-usage-bubble dashboard-usage-bubble--delayed">
                <span className="dashboard-usage-bubble__label">Images left</span>
                <div className="dashboard-usage-bubble__value">
                  <strong>
                    {!imageUsage
                      ? 'Syncing'
                      : imageUsage.percentLeft === null
                      ? 'Unlimited'
                      : `${imageUsage.percentLeft}%`}
                  </strong>
                  <small>
                    {!imageUsage
                      ? 'Waiting for usage'
                      : imageUsage.remaining === null
                      ? 'No cap on images'
                      : `${formatCompactNumber(imageUsage.remaining)} remaining`}
                  </small>
                </div>
              </div>
            </div>
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
        {upcomingPosts.length ? (
          <div className="stack-list">
            {upcomingPosts.slice(0, 4).map((post) => (
              <div key={post.id} className="stack-list__item">
                <strong>{post.caption || 'Untitled post'}</strong>
                <span>{post.status}</span>
                <small>{formatDateTime(post.scheduledFor)}</small>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No scheduled posts yet"
            description="Connect a social account and create the first scheduled post."
          />
        )}
      </Card>
    </div>
  );
};
