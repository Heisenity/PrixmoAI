import {
  ChevronDown,
  Download,
  Facebook,
  Filter,
  Instagram,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AudienceDonutChart,
  DualLineChart,
  EngagementHeatmap,
  FollowerGrowthChart,
  StackedEngagementChart,
} from '../../components/analytics/AnalyticsCharts';
import { AnalyticsKpiCard } from '../../components/analytics/AnalyticsKpiCard';
import { AnalyticsPostDrawer } from '../../components/analytics/AnalyticsPostDrawer';
import { EmptyState } from '../../components/shared/EmptyState';
import { ErrorMessage } from '../../components/shared/ErrorMessage';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { useAnalyticsDashboard } from '../../hooks/useAnalyticsDashboard';
import { formatDateTime, formatPercentage } from '../../lib/utils';
import type {
  AnalyticsDashboard,
  AnalyticsPlatformScope,
  AnalyticsPostInsight,
} from '../../types';

type AnalyticsSelectablePlatform = Exclude<AnalyticsPlatformScope, 'all'>;
type AnalyticsKpiKey = Exclude<keyof AnalyticsDashboard['overview'], 'shares'>;

const DATE_PRESETS = [
  { id: '7d', label: '7d' },
  { id: '14d', label: '14d' },
  { id: '28d', label: '28d' },
  { id: '30d', label: '30d' },
  { id: 'custom', label: 'Custom' },
] as const;

const PLATFORM_OPTIONS: Array<{ id: AnalyticsSelectablePlatform; label: string }> = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook', label: 'Facebook' },
];

const KPI_TITLES: Array<{
  key: AnalyticsKpiKey;
  label: string;
}> = [
  { key: 'impressions', label: 'Total Impressions' },
  { key: 'reach', label: 'Total Reach' },
  { key: 'engagements', label: 'Total Engagements' },
  { key: 'engagementRate', label: 'Engagement Rate' },
  { key: 'likes', label: 'Likes' },
  { key: 'comments', label: 'Comments' },
  { key: 'saves', label: 'Saves' },
  { key: 'newFollowers', label: 'New Followers' },
  { key: 'postsPublished', label: 'Posts Published' },
] as const;

const KPI_TOOLTIPS: Record<AnalyticsKpiKey, string> = {
  impressions:
    'How many total times your posts were shown in this date range. One account can create multiple impressions.',
  reach:
    'How many unique accounts saw your posts at least once in this date range.',
  engagementRate:
    'How efficiently your content performed: total engagements divided by total reach.',
  engagements:
    'The total number of likes, comments, saves, and reactions across your published posts.',
  likes:
    'The total number of likes collected across published posts in this date range.',
  comments:
    'The total number of comments left on your published posts in this date range.',
  saves:
    'The total number of times people saved your posts where the platform provides save data.',
  newFollowers:
    'Net follower growth during this period compared with the previous matching period.',
  postsPublished:
    'How many posts were actually published in this date range, not just scheduled.',
};

const POSTS_PER_PAGE = 10;

const LAST_UPDATED_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const getRelativeLastUpdated = (value: string | null, now = Date.now()) => {
  if (!value) {
    return 'Waiting for data';
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return 'Waiting for data';
  }

  const diffMs = Math.max(0, now - timestamp);
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 60) {
    return 'Updated just now';
  }

  const diffMinutes = Math.floor(diffSeconds / 60);

  if (diffMinutes < 60) {
    return `Updated ${diffMinutes} min ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `Updated ${diffHours} hr ago`;
  }

  return `Updated ${LAST_UPDATED_DATE_FORMATTER.format(new Date(timestamp))}`;
};

const getPlatformIcon = (platform: string | null) =>
  platform === 'instagram' ? <Instagram size={14} /> : <Facebook size={14} />;

const formatPostType = (value: string | null) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Post';

const getSortValue = (post: AnalyticsPostInsight, key: string) => {
  switch (key) {
    case 'impressions':
      return post.impressions;
    case 'reach':
      return post.reach;
    case 'likes':
      return post.likes;
    case 'comments':
      return post.comments;
    case 'saves':
      return post.saves;
    case 'engagementRate':
      return post.engagementRate ?? 0;
    case 'date':
      return new Date(post.publishedTime || 0).getTime();
    default:
      return post.performanceScore;
  }
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

const exportPostsCsv = (posts: AnalyticsPostInsight[]) => {
  const headers = [
    'Platform',
    'Post Type',
    'Published Time',
    'Caption',
    'Impressions',
    'Reach',
    'Likes',
    'Comments',
    'Saves',
    'Reactions',
    'Engagement Rate',
  ];
  const rows = posts.map((post) =>
    [
      post.platformLabel,
      post.postType || '',
      post.publishedTime || '',
      (post.caption || '').replace(/\n/g, ' '),
      post.impressions,
      post.reach,
      post.likes,
      post.comments,
      post.saves,
      post.reactions,
      formatPercentage(post.engagementRate, 1, ''),
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(',')
  );

  downloadBlob(new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' }), 'prixmoai-analytics.csv');
};

const exportPostsPdf = (posts: AnalyticsPostInsight[], dashboard: AnalyticsDashboard | null) => {
  const popup = window.open('', '_blank', 'noopener,noreferrer,width=1280,height=900');

  if (!popup) {
    return;
  }

  const kpiRows = dashboard
    ? KPI_TITLES.map((item) => {
        const metric = dashboard.overview[item.key];
        const value =
          item.key === 'engagementRate'
            ? metric.value !== null
              ? formatPercentage(metric.value)
              : '—'
            : metric.value !== null
              ? Intl.NumberFormat('en-US', {
                  notation: metric.value >= 10000 ? 'compact' : 'standard',
                  maximumFractionDigits: metric.value >= 10000 ? 1 : 0,
                }).format(metric.value)
              : '—';

        return `
          <tr>
            <td>${item.label}</td>
            <td>${value}</td>
            <td>${metric.changePercent !== null ? `${metric.changePercent.toFixed(1)}%` : '—'}</td>
          </tr>
        `;
      }).join('')
    : '';

  const insightRows = dashboard
    ? dashboard.insights
        .map(
          (insight) => `
            <article class="insight">
              <strong>${insight.title}</strong>
              <p>${insight.description}</p>
              <small>${insight.supportingMetric} · ${insight.confidence} confidence</small>
            </article>
          `
        )
        .join('')
    : '';

  const audienceSummary = dashboard
    ? `
      <div class="summary-grid">
        <div class="summary-card">
          <span>Best time to post</span>
          <strong>${dashboard.bestTimeToPost.summary}</strong>
        </div>
        <div class="summary-card">
          <span>Follower growth</span>
          <strong>${
            dashboard.audience.followerGrowthValue !== null
              ? dashboard.audience.followerGrowthValue.toLocaleString()
              : '—'
          }</strong>
        </div>
        <div class="summary-card">
          <span>Top audience</span>
          <strong>${
            dashboard.audience.ageDistribution[0]?.label ||
            dashboard.audience.genderDistribution[0]?.label ||
            dashboard.audience.ageGenderBreakdown[0]?.label ||
            'Unavailable'
          }</strong>
        </div>
        <div class="summary-card">
          <span>Top location</span>
          <strong>${dashboard.audience.topLocations[0]?.label || 'Unavailable'}</strong>
        </div>
      </div>
      <div class="top-slots">
        ${dashboard.bestTimeToPost.topSlots
          .slice(0, 5)
          .map(
            (slot) =>
              `<span>${slot.day} ${String(slot.hour).padStart(2, '0')}:00 · ${formatPercentage(slot.averageEngagementRate)}</span>`
          )
          .join('')}
      </div>
    `
    : '';

  popup.document.write(`
    <html>
      <head>
        <title>PrixmoAI Analytics Report</title>
        <style>
          body { font-family: Inter, Arial, sans-serif; padding: 32px; color: #0f172a; background: #f8fafc; }
          h1, h2 { margin: 0 0 8px; }
          h2 { margin-top: 28px; }
          p { color: #475569; }
          section { margin-top: 28px; }
          .summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
          .summary-card { border: 1px solid #cbd5e1; border-radius: 16px; background: #fff; padding: 14px; }
          .summary-card span { display: block; font-size: 12px; color: #64748b; margin-bottom: 6px; }
          .summary-card strong { font-size: 15px; color: #0f172a; }
          .insights { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
          .insight { border: 1px solid #cbd5e1; border-radius: 16px; background: #fff; padding: 14px; }
          .insight strong { display: block; margin-bottom: 6px; }
          .insight small { color: #64748b; }
          .top-slots { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
          .top-slots span { border-radius: 999px; background: #dbeafe; color: #1d4ed8; padding: 6px 10px; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; margin-top: 24px; }
          th, td { border: 1px solid #cbd5e1; padding: 10px 12px; text-align: left; font-size: 12px; }
          th { background: #e2e8f0; }
        </style>
      </head>
      <body>
        <h1>PrixmoAI Analytics Report</h1>
        <p>${dashboard ? `${dashboard.platformScope.toUpperCase()} scope · ${dashboard.dateRange.start} to ${dashboard.dateRange.end}` : ''}</p>
        ${dashboard ? `
          <section>
            <h2>KPI Summary</h2>
            <table>
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Value</th>
                  <th>Change vs previous</th>
                </tr>
              </thead>
              <tbody>${kpiRows}</tbody>
            </table>
          </section>
          <section>
            <h2>Insights</h2>
            <div class="insights">${insightRows}</div>
          </section>
          <section>
            <h2>Audience & Best Time</h2>
            ${audienceSummary}
          </section>
        ` : ''}
        <section>
          <h2>Post Performance</h2>
        <table>
          <thead>
            <tr>
              <th>Platform</th>
              <th>Post Type</th>
              <th>Published</th>
              <th>Caption</th>
              <th>Impressions</th>
              <th>Reach</th>
              <th>Engagement Rate</th>
            </tr>
          </thead>
          <tbody>
            ${posts
              .map(
                (post) => `
                  <tr>
                    <td>${post.platformLabel}</td>
                    <td>${post.postType || ''}</td>
                    <td>${post.publishedTime ? formatDateTime(post.publishedTime) : ''}</td>
                    <td>${post.caption || ''}</td>
                    <td>${post.impressions}</td>
                    <td>${post.reach}</td>
                    <td>${formatPercentage(post.engagementRate)}</td>
                  </tr>
                `
              )
              .join('')}
          </tbody>
        </table>
        </section>
      </body>
    </html>
  `);
  popup.document.close();
  popup.focus();
  popup.print();
};

const AnalyticsSkeleton = () => (
  <div className="analytics-dashboard">
    <div className="analytics-dashboard__hero analytics-dashboard__hero--skeleton" />
    <div className="analytics-kpi-grid">
      {Array.from({ length: 9 }, (_, index) => (
        <div key={index} className="analytics-skeleton analytics-skeleton--card" />
      ))}
    </div>
    <div className="analytics-chart-grid">
      <div className="analytics-skeleton analytics-skeleton--chart" />
      <div className="analytics-skeleton analytics-skeleton--chart" />
    </div>
    <div className="analytics-skeleton analytics-skeleton--table" />
  </div>
);

export const AnalyticsPage = () => {
  const [preset, setPreset] = useState<'7d' | '14d' | '28d' | '30d' | 'custom'>('30d');
  const [platformScope, setPlatformScope] = useState<AnalyticsSelectablePlatform>('instagram');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [postTypeFilter, setPostTypeFilter] = useState('all');
  const [sortKey, setSortKey] = useState('performanceScore');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedPost, setSelectedPost] = useState<AnalyticsPostInsight | null>(null);
  const [audienceExpanded, setAudienceExpanded] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [postsPage, setPostsPage] = useState(1);
  const [emptyPlatformModal, setEmptyPlatformModal] = useState<AnalyticsSelectablePlatform | null>(null);
  const [platformProbeInFlight, setPlatformProbeInFlight] = useState<AnalyticsSelectablePlatform | null>(null);

  const {
    dashboard,
    isLoading,
    isRefreshing,
    lastUpdatedTime,
    error,
    refresh,
    previewDashboard,
    getCachedDashboard,
  } =
    useAnalyticsDashboard({
    preset,
    platform: platformScope,
    start: customStart,
    end: customEnd,
  });
  const [relativeTimestampNow, setRelativeTimestampNow] = useState(() => Date.now());

  const scopedPosts = useMemo(
    () => dashboard?.posts ?? [],
    [dashboard?.posts]
  );

  const supportedPostTypes = useMemo(
    () =>
      [
        ...new Set(
          scopedPosts
            .map((post) => post.postType)
            .filter((postType): postType is string => Boolean(postType))
        ),
      ].sort(),
    [scopedPosts]
  );

  useEffect(() => {
    if (postTypeFilter !== 'all' && !supportedPostTypes.includes(postTypeFilter)) {
      setPostTypeFilter('all');
    }
  }, [postTypeFilter, supportedPostTypes]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setRelativeTimestampNow(Date.now());
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    setPostsPage(1);
  }, [searchQuery, postTypeFilter, sortKey, sortDirection, dashboard?.platformScope, dashboard?.dateRange.start, dashboard?.dateRange.end]);

  useEffect(() => {
    if (!dashboard?.connectedPlatforms.length) {
      return;
    }

    const availablePlatforms = dashboard.connectedPlatforms.filter(
      (platform): platform is AnalyticsSelectablePlatform =>
        platform === 'instagram' || platform === 'facebook'
    );

    if (!availablePlatforms.includes(platformScope) && availablePlatforms[0]) {
      setPlatformScope(availablePlatforms[0]);
    }
  }, [dashboard?.connectedPlatforms, platformScope]);

  const filteredPosts = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return [...scopedPosts]
      .filter((post) =>
        postTypeFilter === 'all' ? true : (post.postType || 'post') === postTypeFilter
      )
      .filter((post) =>
        normalizedSearch
          ? `${post.caption || ''} ${post.keywords.join(' ')} ${post.platformLabel}`
              .toLowerCase()
              .includes(normalizedSearch)
          : true
      )
      .sort((left, right) => {
        const leftValue = getSortValue(left, sortKey);
        const rightValue = getSortValue(right, sortKey);

        if (leftValue === rightValue) {
          return 0;
        }

        return sortDirection === 'asc' ? leftValue - rightValue : rightValue - leftValue;
      });
  }, [postTypeFilter, scopedPosts, searchQuery, sortDirection, sortKey]);

  const totalPostPages = Math.max(1, Math.ceil(filteredPosts.length / POSTS_PER_PAGE));
  const paginatedPosts = useMemo(
    () =>
      filteredPosts.slice(
        (postsPage - 1) * POSTS_PER_PAGE,
        postsPage * POSTS_PER_PAGE
      ),
    [filteredPosts, postsPage]
  );

  useEffect(() => {
    if (postsPage > totalPostPages) {
      setPostsPage(totalPostPages);
    }
  }, [postsPage, totalPostPages]);

  const availablePlatforms = useMemo(
    () =>
      new Set(
        (dashboard?.connectedPlatforms ?? []).filter(
          (platform): platform is AnalyticsSelectablePlatform =>
            platform === 'instagram' || platform === 'facebook'
        )
      ),
    [dashboard?.connectedPlatforms]
  );
  const activePlatformLabel =
    platformScope === 'instagram' ? 'Instagram' : 'Facebook';
  const visibleInsights = useMemo(
    () => (dashboard?.insights ?? []).filter((insight) => insight.id !== 'best-platform'),
    [dashboard?.insights]
  );
  const selectedPlatformUnavailable =
    dashboard?.connectedPlatforms.length
      ? !availablePlatforms.has(platformScope)
      : false;
  const relativeLastUpdatedLabel = useMemo(
    () => getRelativeLastUpdated(lastUpdatedTime, relativeTimestampNow),
    [lastUpdatedTime, relativeTimestampNow]
  );
  const handlePlatformChange = useCallback(
    async (nextPlatform: AnalyticsSelectablePlatform) => {
      if (nextPlatform === platformScope || platformProbeInFlight) {
        return;
      }

      const cachedDashboard = getCachedDashboard({ platform: nextPlatform });

      if (cachedDashboard) {
        if (!cachedDashboard.posts.length) {
          setEmptyPlatformModal(nextPlatform);
          return;
        }

        setPlatformScope(nextPlatform);
        return;
      }

      setPlatformProbeInFlight(nextPlatform);

      try {
        const nextDashboard = await previewDashboard({ platform: nextPlatform });

        if (!nextDashboard?.posts.length) {
          setEmptyPlatformModal(nextPlatform);
          return;
        }

        setPlatformScope(nextPlatform);
      } catch {
        setEmptyPlatformModal(nextPlatform);
      } finally {
        setPlatformProbeInFlight(null);
      }
    },
    [getCachedDashboard, platformProbeInFlight, platformScope, previewDashboard]
  );

  if (isLoading && !dashboard) {
    return <AnalyticsSkeleton />;
  }

  if (!isLoading && dashboard && selectedPlatformUnavailable) {
    return <AnalyticsSkeleton />;
  }

  if (!isLoading && dashboard && !dashboard.connectedPlatforms.length) {
    return (
      <div className="page-stack">
        <EmptyState
          title="Connect Instagram or Facebook first"
          description="Analytics needs connected publishing accounts before PrixmoAI can summarize what is working."
          action={
            <Link to="/app/scheduler" className="button button--primary button--sm">
              Connect channels
            </Link>
          }
        />
      </div>
    );
  }

  if (!isLoading && dashboard && !dashboard.posts.length) {
    return (
      <div className="page-stack">
        <ErrorMessage message={error} />
        <div className="analytics-dashboard">
          <section className="analytics-dashboard__hero">
            <div>
              <p className="section-eyebrow">Analytics intelligence</p>
              <h2>Understand what is working on {activePlatformLabel}.</h2>
              <p>
                PrixmoAI will fill this dashboard as soon as your published {activePlatformLabel.toLowerCase()} posts start returning performance data.
              </p>
            </div>
          </section>
          <EmptyState
            title={`No ${activePlatformLabel} analytics yet`}
            description={`Published ${activePlatformLabel.toLowerCase()} posts with tracked metrics will appear here with trends, best-time recommendations, and content insights.`}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <ErrorMessage message={error} />

      <div className="analytics-dashboard">
        <section className="analytics-dashboard__hero">
          <div className="analytics-header">
            <p className="section-eyebrow">Analytics</p>
            <div className="analytics-header__copy">
              <h2>Read what is working, not just what was posted.</h2>
              <p className="analytics-header__description">
                Independent {activePlatformLabel} reporting for post performance, audience growth, timing insights, and content recommendations.
              </p>
            </div>

            <div className="analytics-toolbar">
              <div className="analytics-toolbar__filters">
                <div className="analytics-toolbar__group">
                  {DATE_PRESETS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`analytics-pill ${preset === option.id ? 'analytics-pill--active' : ''}`}
                      onClick={() => setPreset(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                  {preset === 'custom' ? (
                    <div className="analytics-dashboard__custom-range">
                      <Input
                        type="date"
                        value={customStart}
                        onChange={(event) => setCustomStart(event.target.value)}
                      />
                      <Input
                        type="date"
                        value={customEnd}
                        onChange={(event) => setCustomEnd(event.target.value)}
                      />
                    </div>
                  ) : null}
                </div>

                <div className="analytics-toolbar__group">
                  {PLATFORM_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`analytics-pill ${platformScope === option.id ? 'analytics-pill--active' : ''}`}
                      disabled={platformProbeInFlight !== null}
                      onClick={() => {
                        void handlePlatformChange(option.id);
                      }}
                    >
                      {platformProbeInFlight === option.id ? 'Checking…' : option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="analytics-toolbar__actions">
                <div className={`analytics-export ${exportOpen ? 'analytics-export--open' : ''}`}>
                  <button
                    type="button"
                    className="analytics-pill analytics-pill--icon"
                    onClick={() => setExportOpen((value) => !value)}
                  >
                    <Download size={14} />
                    Export
                    <ChevronDown size={14} />
                  </button>
                  {exportOpen ? (
                    <div className="analytics-export__menu">
                      <button type="button" onClick={() => {
                        exportPostsCsv(filteredPosts);
                        setExportOpen(false);
                      }}>
                        CSV
                      </button>
                      <button type="button" onClick={() => {
                        exportPostsPdf(filteredPosts, dashboard);
                        setExportOpen(false);
                      }}>
                        PDF
                      </button>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="analytics-pill analytics-pill--icon"
                  disabled={isRefreshing}
                  onClick={() => {
                    setExportOpen(false);
                    void refresh({ sync: true });
                  }}
                >
                  <RefreshCw size={14} className={isRefreshing ? 'analytics-icon-spin' : ''} />
                  {isRefreshing ? 'Refreshing' : 'Refresh'}
                </button>
                <span className="analytics-dashboard__last-updated">
                  {relativeLastUpdatedLabel}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="analytics-kpi-grid">
          {dashboard
            ? KPI_TITLES.map((item) => (
                <AnalyticsKpiCard
                  key={item.key}
                  title={item.label}
                  metric={dashboard.overview[item.key]}
                  tooltip={KPI_TOOLTIPS[item.key]}
                />
              ))
            : null}
        </section>

        {dashboard ? (
          <>
            <section className="analytics-chart-grid">
              <DualLineChart
                title="Impressions and reach over time"
                subtitle={activePlatformLabel}
                points={dashboard.trends.impressionsReachSeries}
              />
              <StackedEngagementChart
                title="Engagement breakdown over time"
                subtitle="Likes, comments, saves, and reactions"
                points={dashboard.trends.engagementSeries}
              />
            </section>

            <section className="analytics-insights-grid">
              <Card className="analytics-panel analytics-panel--compact">
                <div className="analytics-panel__header">
                  <div>
                    <p className="section-eyebrow">Recommendations</p>
                    <h3>What the data suggests next</h3>
                  </div>
                </div>
                <div className="analytics-insights-list">
                  {visibleInsights.map((insight) => (
                    <article
                      key={insight.id}
                      className={`analytics-insight-card analytics-insight-card--${insight.tone}`}
                    >
                      <div className="analytics-insight-card__top">
                        <strong>{insight.title}</strong>
                        <span>{insight.confidence} confidence</span>
                      </div>
                      <p>{insight.description}</p>
                      <small>{insight.supportingMetric}</small>
                    </article>
                  ))}
                </div>
              </Card>
            </section>

            <section className="analytics-content-section">
              <div className="analytics-content-section__header">
                <div>
                  <p className="section-eyebrow">Content performance</p>
                  <h3>Post-level performance and sortable insights</h3>
                </div>
                <div className="analytics-content-section__filters">
                  <label className="analytics-search">
                    <Search size={14} />
                    <input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search caption, hashtag, keyword"
                    />
                  </label>
                  <label className="analytics-select">
                    <Filter size={14} />
                    <select value={postTypeFilter} onChange={(event) => setPostTypeFilter(event.target.value)}>
                      <option value="all">All post types</option>
                      {supportedPostTypes.map((postType) => (
                        <option key={postType} value={postType}>
                          {formatPostType(postType)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <Card className="analytics-table-card">
                <div className="analytics-table-wrap">
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        <th>Thumbnail</th>
                        <th>
                          <button type="button" onClick={() => {
                            setSortKey('date');
                            setSortDirection((current) => (sortKey === 'date' && current === 'desc' ? 'asc' : 'desc'));
                          }}>
                            Date
                          </button>
                        </th>
                        <th>Platform</th>
                        <th>Post type</th>
                        <th>
                          <button type="button" onClick={() => {
                            setSortKey('impressions');
                            setSortDirection((current) => (sortKey === 'impressions' && current === 'desc' ? 'asc' : 'desc'));
                          }}>
                            Impressions
                          </button>
                        </th>
                        <th>
                          <button type="button" onClick={() => {
                            setSortKey('reach');
                            setSortDirection((current) => (sortKey === 'reach' && current === 'desc' ? 'asc' : 'desc'));
                          }}>
                            Reach
                          </button>
                        </th>
                        <th>
                          <button type="button" onClick={() => {
                            setSortKey('likes');
                            setSortDirection((current) => (sortKey === 'likes' && current === 'desc' ? 'asc' : 'desc'));
                          }}>
                            Likes
                          </button>
                        </th>
                        <th>
                          <button type="button" onClick={() => {
                            setSortKey('comments');
                            setSortDirection((current) => (sortKey === 'comments' && current === 'desc' ? 'asc' : 'desc'));
                          }}>
                            Comments
                          </button>
                        </th>
                        <th>
                          <button type="button" onClick={() => {
                            setSortKey('saves');
                            setSortDirection((current) => (sortKey === 'saves' && current === 'desc' ? 'asc' : 'desc'));
                          }}>
                            Saves
                          </button>
                        </th>
                        <th>
                          <button type="button" onClick={() => {
                            setSortKey('engagementRate');
                            setSortDirection((current) => (sortKey === 'engagementRate' && current === 'desc' ? 'asc' : 'desc'));
                          }}>
                            Engagement %
                          </button>
                        </th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedPosts.length ? (
                        paginatedPosts.map((post, index) => (
                          <tr key={post.id} className={index % 2 === 0 ? 'is-even' : ''}>
                            <td>
                              <button type="button" className="analytics-table__thumb" onClick={() => setSelectedPost(post)}>
                                {post.thumbnailUrl ? (
                                  <>
                                    <img src={post.thumbnailUrl} alt={post.caption || post.id} />
                                    {(post.postType === 'video' || post.postType === 'reel') ? (
                                      <span className="analytics-table__thumb-badge">
                                        <Play size={11} />
                                      </span>
                                    ) : null}
                                  </>
                                ) : (
                                  <span className="analytics-table__thumb-placeholder">PX</span>
                                )}
                              </button>
                            </td>
                            <td>
                              <div className="analytics-table__date">
                                <strong>{post.publishedTime ? formatDateTime(post.publishedTime) : '—'}</strong>
                                <span>{post.socialAccountName || 'Connected account'}</span>
                              </div>
                            </td>
                            <td>
                              <span className="analytics-table__platform">
                                {getPlatformIcon(post.platform)}
                                {post.platformLabel}
                              </span>
                            </td>
                            <td>{formatPostType(post.postType)}</td>
                            <td>{post.impressions.toLocaleString()}</td>
                            <td>{post.reach.toLocaleString()}</td>
                            <td>{post.likes.toLocaleString()}</td>
                            <td>{post.comments.toLocaleString()}</td>
                            <td>{post.saves.toLocaleString()}</td>
                            <td>{formatPercentage(post.engagementRate)}</td>
                            <td>
                              <button type="button" className="analytics-table__action" onClick={() => setSelectedPost(post)}>
                                View
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={11} className="analytics-table__empty">
                            No posts match the current analytics filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {filteredPosts.length ? (
                  <div className="analytics-table__pagination">
                    <span>
                      Showing {(postsPage - 1) * POSTS_PER_PAGE + 1}-
                      {Math.min(postsPage * POSTS_PER_PAGE, filteredPosts.length)} of{' '}
                      {filteredPosts.length}
                    </span>
                    <div className="analytics-table__pagination-controls">
                      <button
                        type="button"
                        className="analytics-pill analytics-pill--icon"
                        disabled={postsPage <= 1}
                        onClick={() => setPostsPage((page) => Math.max(1, page - 1))}
                      >
                        Previous
                      </button>
                      <span>
                        Page {postsPage} of {totalPostPages}
                      </span>
                      <button
                        type="button"
                        className="analytics-pill analytics-pill--icon"
                        disabled={postsPage >= totalPostPages}
                        onClick={() =>
                          setPostsPage((page) => Math.min(totalPostPages, page + 1))
                        }
                      >
                        Next
                      </button>
                    </div>
                  </div>
                ) : null}
              </Card>
            </section>

            <section className="analytics-audience-section">
              <button
                type="button"
                className="analytics-audience-section__toggle"
                onClick={() => setAudienceExpanded((value) => !value)}
              >
                <div>
                  <p className="section-eyebrow">Audience insights</p>
                  <h3>Best time, activity heatmap, and growth clues</h3>
                </div>
                <ChevronDown size={18} className={audienceExpanded ? 'is-open' : ''} />
              </button>
              {audienceExpanded ? (
                <div className="analytics-audience-grid">
                  <Card className="analytics-panel analytics-panel--wide">
                    <div className="analytics-panel__header">
                      <div>
                        <p className="section-eyebrow">Best time to post</p>
                        <h3>{dashboard.bestTimeToPost.summary}</h3>
                      </div>
                    </div>
                    <EngagementHeatmap cells={dashboard.bestTimeToPost.heatmap} />
                    <div className="analytics-top-slots">
                      {dashboard.bestTimeToPost.topSlots.length ? (
                        dashboard.bestTimeToPost.topSlots.map((slot) => (
                          <article key={`${slot.day}-${slot.hour}`} className="analytics-top-slot">
                            <strong>{slot.day}</strong>
                            <span>
                              {String(slot.hour).padStart(2, '0')}:00 · {formatPercentage(slot.averageEngagementRate)}
                            </span>
                          </article>
                        ))
                      ) : (
                        <div className="analytics-blank-state analytics-blank-state--inline">
                          Not enough published posts yet to surface strong time windows.
                        </div>
                      )}
                    </div>
                  </Card>

                  <Card className="analytics-panel">
                    <div className="analytics-panel__header">
                      <div>
                        <p className="section-eyebrow">Follower growth</p>
                        <h3>Growth trend across the selected range</h3>
                      </div>
                    </div>
                    <FollowerGrowthChart points={dashboard.audience.followerGrowthSeries} />
                  </Card>

                  <Card className="analytics-panel">
                    <div className="analytics-panel__header">
                      <div>
                        <p className="section-eyebrow">Age distribution</p>
                        <h3>Which age groups are growing fastest</h3>
                      </div>
                    </div>
                    <AudienceDonutChart
                      items={
                        dashboard.audience.ageDistribution.length
                          ? dashboard.audience.ageDistribution
                          : dashboard.audience.ageGenderBreakdown
                      }
                    />
                  </Card>

                  <Card className="analytics-panel">
                    <div className="analytics-panel__header">
                      <div>
                        <p className="section-eyebrow">Gender distribution</p>
                        <h3>Who is responding most right now</h3>
                      </div>
                    </div>
                    <AudienceDonutChart
                      items={
                        dashboard.audience.genderDistribution.length
                          ? dashboard.audience.genderDistribution
                          : dashboard.audience.ageGenderBreakdown
                      }
                    />
                  </Card>

                  <Card className="analytics-panel analytics-panel--wide">
                    <div className="analytics-panel__header">
                      <div>
                        <p className="section-eyebrow">Active hours</p>
                        <h3>When your audience is most active</h3>
                      </div>
                    </div>
                    <EngagementHeatmap
                      cells={dashboard.audience.activeHoursHeatmap}
                      valueLabel="activity blocks"
                    />
                  </Card>

                  <Card className="analytics-panel">
                    <div className="analytics-panel__header">
                      <div>
                        <p className="section-eyebrow">Top locations</p>
                        <h3>Where your audience is strongest</h3>
                      </div>
                    </div>
                    {dashboard.audience.topLocations.length ? (
                      <div className="analytics-location-list">
                        {dashboard.audience.topLocations.map((location) => {
                          const maxLocationValue = dashboard.audience.topLocations[0]?.value || 1;
                          const width = Math.max(8, (location.value / maxLocationValue) * 100);

                          return (
                            <article key={location.label} className="analytics-location-row">
                              <div className="analytics-location-row__top">
                                <span>{location.label}</span>
                                <strong>{location.value.toLocaleString()}</strong>
                              </div>
                              <div className="analytics-location-row__bar">
                                <span style={{ width: `${width}%` }} />
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="analytics-blank-state">Location insights will appear once platform audience data is available.</div>
                    )}
                  </Card>

                  <Card className="analytics-panel analytics-panel--compact">
                    <div className="analytics-panel__header">
                      <div>
                        <p className="section-eyebrow">Audience summary</p>
                        <h3>Compact growth summary</h3>
                      </div>
                    </div>
                    <div className="analytics-summary-stack">
                      <div className="analytics-summary-stat">
                        <span>Follower growth</span>
                        <strong>
                          {dashboard.audience.followerGrowthValue !== null
                            ? dashboard.audience.followerGrowthValue.toLocaleString()
                            : '—'}
                        </strong>
                      </div>
                      <div className="analytics-summary-stat">
                        <span>Top audience</span>
                        <strong>
                          {dashboard.audience.ageDistribution[0]?.label ||
                            dashboard.audience.genderDistribution[0]?.label ||
                            dashboard.audience.ageGenderBreakdown[0]?.label ||
                            'Unavailable'}
                        </strong>
                      </div>
                      <div className="analytics-summary-stat">
                        <span>Profile visits</span>
                        <strong>{dashboard.audience.profileVisits.toLocaleString()}</strong>
                      </div>
                      <div className="analytics-summary-stat">
                        <span>Page likes</span>
                        <strong>{dashboard.audience.pageLikes.toLocaleString()}</strong>
                      </div>
                      <div className="analytics-summary-stat">
                        <span>Top location</span>
                        <strong>
                          {dashboard.audience.topLocations[0]?.label || 'Unavailable'}
                        </strong>
                      </div>
                    </div>
                    <div className="analytics-summary-notes">
                      {dashboard.audience.summaryNotes.map((note) => (
                        <article key={note} className="analytics-summary-note">
                          <Sparkles size={14} />
                          <span>{note}</span>
                        </article>
                      ))}
                    </div>
                  </Card>
                </div>
              ) : null}
            </section>
          </>
        ) : null}
      </div>

      {emptyPlatformModal ? (
        <div className="generated-image-lightbox analytics-empty-modal" role="dialog" aria-modal="true">
          <button
            type="button"
            className="generated-image-lightbox__backdrop"
            aria-label="Close empty platform analytics dialog"
            onClick={() => setEmptyPlatformModal(null)}
          />
          <aside className="generated-image-lightbox__panel analytics-empty-modal__panel">
            <div className="analytics-empty-modal__header">
              <div>
                <p className="section-eyebrow">No analytics yet</p>
                <h3>No posts yet on {emptyPlatformModal === 'instagram' ? 'Instagram' : 'Facebook'}</h3>
              </div>
              <button
                type="button"
                className="generated-image-card__action"
                onClick={() => setEmptyPlatformModal(null)}
                aria-label="Close empty platform analytics dialog"
              >
                <X size={16} />
              </button>
            </div>
            <div className="analytics-empty-modal__body">
              <p>
                You haven&apos;t published any posts on{' '}
                {emptyPlatformModal === 'instagram' ? 'Instagram' : 'Facebook'} yet.
                Publish a post or connect your {emptyPlatformModal === 'instagram' ? 'Instagram' : 'Facebook'} account to see analytics.
              </p>
            </div>
            <div className="analytics-empty-modal__actions">
              <Link
                to="/app/scheduler"
                className="button button--secondary button--sm"
                onClick={() => setEmptyPlatformModal(null)}
              >
                Connect Account
              </Link>
              <Link
                to="/app/generate"
                className="button button--primary button--sm"
                onClick={() => setEmptyPlatformModal(null)}
              >
                Create Post
              </Link>
              <button
                type="button"
                className="button button--ghost button--sm"
                onClick={() => setEmptyPlatformModal(null)}
              >
                Close
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      <AnalyticsPostDrawer
        post={selectedPost}
        isOpen={Boolean(selectedPost)}
        onClose={() => setSelectedPost(null)}
      />
    </div>
  );
};
