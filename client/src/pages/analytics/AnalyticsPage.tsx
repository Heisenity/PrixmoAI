import { BestPostWidget } from '../../components/analytics/BestPostWidget';
import { StatsCard } from '../../components/analytics/StatsCard';
import { WeeklyScoreCard } from '../../components/analytics/WeeklyScoreCard';
import { EmptyState } from '../../components/shared/EmptyState';
import { LoadingSpinner } from '../../components/shared/LoadingSpinner';
import { Card } from '../../components/ui/card';
import { useAnalytics } from '../../hooks/useAnalytics';
import { formatCompactNumber, formatDateTime } from '../../lib/utils';

export const AnalyticsPage = () => {
  const { overview, history, isLoading } = useAnalytics();

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
