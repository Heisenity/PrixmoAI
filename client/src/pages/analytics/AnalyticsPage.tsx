import { BarChart3, CalendarClock, Sparkles } from 'lucide-react';
import { BestPostWidget } from '../../components/analytics/BestPostWidget';
import { StatsCard } from '../../components/analytics/StatsCard';
import { WeeklyScoreCard } from '../../components/analytics/WeeklyScoreCard';
import { EmptyState } from '../../components/shared/EmptyState';
import { ErrorMessage } from '../../components/shared/ErrorMessage';
import { LoadingSpinner } from '../../components/shared/LoadingSpinner';
import { Card } from '../../components/ui/card';
import { useAnalytics } from '../../hooks/useAnalytics';
import { formatCompactNumber, formatDateTime } from '../../lib/utils';

export const AnalyticsPage = () => {
  const { overview, history, isLoading, error } = useAnalytics();

  if (isLoading && !overview) {
    return (
      <Card className="dashboard-panel">
        <div className="screen-center">
          <LoadingSpinner label="Loading analytics" />
        </div>
      </Card>
    );
  }

  const topPlatforms = overview?.generation.topPlatforms ?? [];
  const topGoals = overview?.generation.topGoals ?? [];
  const topTones = overview?.generation.topTones ?? [];
  const statusBreakdown = overview?.generation.scheduledPostStatusBreakdown;

  return (
    <div className="page-stack">
      <ErrorMessage message={error} />

      <Card className="app-hero-card">
        <div className="app-hero-card__copy">
          <p className="section-eyebrow">Performance layer</p>
          <h2>Read what is working across creation, scheduling, and outcomes.</h2>
          <p>
            The analytics view is designed to connect operational volume with post
            performance so you can see both throughput and signal together.
          </p>
        </div>
        <div className="app-hero-card__stats">
          <div className="app-hero-card__metric">
            <span>Analytics records</span>
            <strong>{history?.total ?? 0}</strong>
            <small>Tracked events so far</small>
          </div>
          <div className="app-hero-card__metric">
            <span>Content this month</span>
            <strong>{overview?.generation.contentGenerationsThisMonth ?? 0}</strong>
            <small>Caption packs created</small>
          </div>
          <div className="app-hero-card__metric">
            <span>Images this month</span>
            <strong>{overview?.generation.imageGenerationsThisMonth ?? 0}</strong>
            <small>Product visuals generated</small>
          </div>
        </div>
      </Card>

      <div className="stats-grid">
        <StatsCard
          label="Reach"
          value={formatCompactNumber(overview?.performance.reach || 0)}
          hint="Across all analytics records"
        />
        <StatsCard
          label="Impressions"
          value={formatCompactNumber(overview?.performance.impressions || 0)}
          hint="Total views logged"
        />
        <StatsCard
          label="Average engagement"
          value={`${(overview?.performance.averageEngagement || 0).toFixed(1)}%`}
          hint="Engagement rate across posts"
        />
        {overview?.weeklyComparison ? (
          <WeeklyScoreCard comparison={overview.weeklyComparison} />
        ) : (
          <StatsCard label="Weekly movement" value="0%" hint="Waiting for enough history" />
        )}
      </div>

      <div className="dashboard-grid">
        <BestPostWidget post={overview?.bestPostThisWeek || null} />
        <Card className="dashboard-panel">
          <div className="dashboard-panel__header">
            <div>
              <p className="section-eyebrow">Generation side</p>
              <h3>What the system is producing</h3>
            </div>
          </div>
          <div className="stack-list">
            <div className="stack-list__item">
              <strong>Content generated</strong>
              <span>{overview?.generation.totalGeneratedContent || 0}</span>
            </div>
            <div className="stack-list__item">
              <strong>Images generated</strong>
              <span>{overview?.generation.totalGeneratedImages || 0}</span>
            </div>
            <div className="stack-list__item">
              <strong>Posts scheduled</strong>
              <span>{overview?.generation.totalScheduledPosts || 0}</span>
            </div>
          </div>
        </Card>
      </div>

      <div className="dashboard-grid">
        <Card className="dashboard-panel">
          <div className="dashboard-panel__header">
            <div>
              <p className="section-eyebrow">Signals</p>
              <h3>Top patterns in your workspace</h3>
            </div>
          </div>
          <div className="chip-section">
            <div className="chip-section__block">
              <div className="chip-section__heading">
                <Sparkles size={16} />
                <strong>Platforms</strong>
              </div>
              <div className="hashtag-cloud">
                {topPlatforms.length ? (
                  topPlatforms.map((item) => (
                    <span key={`${item.value}-${item.count}`}>
                      {item.value} · {item.count}
                    </span>
                  ))
                ) : (
                  <span>No platform trends yet</span>
                )}
              </div>
            </div>
            <div className="chip-section__block">
              <div className="chip-section__heading">
                <BarChart3 size={16} />
                <strong>Goals</strong>
              </div>
              <div className="hashtag-cloud">
                {topGoals.length ? (
                  topGoals.map((item) => (
                    <span key={`${item.value}-${item.count}`}>
                      {item.value} · {item.count}
                    </span>
                  ))
                ) : (
                  <span>No goal data yet</span>
                )}
              </div>
            </div>
            <div className="chip-section__block">
              <div className="chip-section__heading">
                <CalendarClock size={16} />
                <strong>Tones</strong>
              </div>
              <div className="hashtag-cloud">
                {topTones.length ? (
                  topTones.map((item) => (
                    <span key={`${item.value}-${item.count}`}>
                      {item.value} · {item.count}
                    </span>
                  ))
                ) : (
                  <span>No tone data yet</span>
                )}
              </div>
            </div>
          </div>
        </Card>

        <Card className="dashboard-panel">
          <div className="dashboard-panel__header">
            <div>
              <p className="section-eyebrow">Queue health</p>
              <h3>Scheduled post status breakdown</h3>
            </div>
          </div>
          <div className="stack-list">
            {statusBreakdown ? (
              Object.entries(statusBreakdown).map(([status, count]) => (
                <div key={status} className="stack-list__item stack-list__item--inline">
                  <strong>{status}</strong>
                  <span>{count}</span>
                </div>
              ))
            ) : (
              <EmptyState
                title="No queue signals yet"
                description="Once posts start moving through the scheduler, their status mix will surface here."
              />
            )}
          </div>
        </Card>
      </div>

      <Card className="dashboard-panel">
        <div className="dashboard-panel__header">
          <div>
            <p className="section-eyebrow">Analytics history</p>
            <h3>Recent recorded performance events</h3>
          </div>
        </div>
        {history?.items.length ? (
          <div className="stack-list">
            {history.items.map((entry) => (
              <div key={entry.id} className="stack-list__item">
                <strong>{entry.platform || 'Unspecified platform'}</strong>
                <span>
                  Reach {entry.reach} / Likes {entry.likes} / Saves {entry.saves}
                </span>
                <small>{formatDateTime(entry.recordedAt)}</small>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No analytics rows yet"
            description="Record analytics from the API and the dashboard will populate immediately."
          />
        )}
      </Card>
    </div>
  );
};
